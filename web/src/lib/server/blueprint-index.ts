import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import {
	accounts,
	blueprintAuditEvents,
	builds,
	indexedBlueprintScreenshots,
	indexedBlueprintSources,
	indexedBlueprints
} from './db/schema';
import { buildSummary, distinctDecorItemCount, getBuildByCode } from './builds';
import { sourcePlatformLabel, validateSourceUrl } from './sources';
import { isBuildManifest, type BlueprintScope, type BuildManifest } from '$lib/types/manifest';
import { isCopyable, type IndexedBlueprintPublic } from '$lib/types/indexed-blueprint';

const MAX_SHARE_CODE_LENGTH = 256;
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2_000;
const MAX_CREATOR_LENGTH = 80;
const MAX_TAGS = 12;
const MAX_TAG_LENGTH = 32;
const MAX_LINKS = 4;
const MAX_NOTE_LENGTH = 4_000;

/**
 * Blueprint share codes are opaque, printable, and — as far as we know —
 * case-sensitive. Normalisation is therefore whitespace-trimming ONLY.
 * Case-folding here would silently merge two distinct blueprints.
 */
export function normalizeShareCode(value: string): string {
	return value.trim();
}

export function isValidShareCode(value: string): boolean {
	return /^[\x21-\x7e]+$/.test(value) && value.length <= MAX_SHARE_CODE_LENGTH;
}

export interface IndexBlueprintInput {
	shareCode: string;
	/** KwikShack's own curation title. Never copied from the source page. */
	title: string;
	attributedCreator: string;
	attributedRealm?: string | null;
	attributedCharacter?: string | null;
	platform: string;
	sourceUrl: string;
	discoveredAt?: Date;
	/** Internal review evidence. Stored, never served. */
	internalNotes?: string;
	ingestionMethod?: string;
	blueprintType?: string;
	blueprintScope?: BlueprintScope | null;
	faction?: string | null;
	publication?: 'draft' | 'published';
}

export type IndexBlueprintResult =
	| { status: 'created'; id: string }
	/** The code was already indexed; this source was added as extra provenance. */
	| { status: 'source_added'; id: string }
	/** The code was already indexed from this exact URL. Nothing changed. */
	| { status: 'duplicate'; id: string }
	/** A native creator submission owns this code. Indexing is refused. */
	| { status: 'native_conflict'; nativeBuildId: string }
	| { status: 'invalid'; errors: string[] };

/**
 * Fields every call needs, whether it creates a listing or only adds a source.
 *
 * Split from the listing fields because recording a second place a blueprint was
 * found is a first-class action — one blueprint, many sources is the designed
 * behaviour — and it should not require restating a title and type that already
 * exist and would be ignored anyway.
 */
function validateSourceFields(input: IndexBlueprintInput): string[] {
	const errors: string[] = [];
	const shareCode = normalizeShareCode(input.shareCode ?? '');
	if (!shareCode) errors.push('shareCode is required');
	else if (!isValidShareCode(shareCode)) errors.push('shareCode must be 1–256 printable non-space characters');

	if (!input.attributedCreator?.trim()) errors.push('attributedCreator is required');
	else if (input.attributedCreator.trim().length > MAX_CREATOR_LENGTH) {
		errors.push(`attributedCreator must be at most ${MAX_CREATOR_LENGTH} characters`);
	}

	const urlCheck = validateSourceUrl(input.sourceUrl ?? '', input.platform ?? '');
	if (!urlCheck.ok) errors.push(urlCheck.error ?? 'sourceUrl is invalid');

	if (input.internalNotes && input.internalNotes.length > MAX_NOTE_LENGTH) {
		errors.push(`internalNotes must be at most ${MAX_NOTE_LENGTH} characters`);
	}
	return errors;
}

/** Fields only a NEW listing needs. */
function validateListingFields(input: IndexBlueprintInput): string[] {
	const errors: string[] = [];
	if (!input.title?.trim()) errors.push('title is required');
	else if (input.title.trim().length > MAX_TITLE_LENGTH) errors.push(`title must be at most ${MAX_TITLE_LENGTH} characters`);

	if (input.blueprintType && !['House', 'Interior', 'Exterior', 'Room'].includes(input.blueprintType)) {
		errors.push('blueprintType must be House, Interior, Exterior, or Room');
	}
	if (input.faction && !['Alliance', 'Horde'].includes(input.faction)) {
		errors.push('faction must be Alliance, Horde, or null');
	}
	return errors;
}

function recordAudit(
	tx: typeof db,
	blueprintId: string,
	event: string,
	actorAccountId: string | null,
	detail: Record<string, unknown> = {}
): void {
	tx.insert(blueprintAuditEvents)
		.values({ id: crypto.randomUUID(), blueprintId, event, actorAccountId, detail, createdAt: new Date() })
		.run();
}

/**
 * Index a publicly shared blueprint code, or attach a new source to one that is
 * already indexed.
 *
 * Deduplication order matters:
 *   1. A native build with this code wins outright. An external record must
 *      never overwrite or shadow a creator's own submission.
 *   2. An existing indexed listing absorbs the new source as provenance rather
 *      than forking into a second public entry.
 *   3. Otherwise a new listing is created, in `draft` unless told otherwise.
 */
export function indexBlueprint(input: IndexBlueprintInput, actorAccountId: string | null = null): IndexBlueprintResult {
	// Source fields are checked first because they are needed either way; the
	// listing fields are checked only once we know this call creates a listing.
	const errors = validateSourceFields(input);
	if (errors.length) return { status: 'invalid', errors };

	const shareCode = normalizeShareCode(input.shareCode);

	const nativeBuild = getBuildByCode(shareCode);
	if (nativeBuild) return { status: 'native_conflict', nativeBuildId: nativeBuild.id };

	const now = new Date();
	const discoveredAt = input.discoveredAt ?? now;

	return db.transaction((tx) => {
		const existing = tx.select().from(indexedBlueprints).where(eq(indexedBlueprints.shareCode, shareCode)).get();

		if (existing) {
			const duplicateSource = tx
				.select({ id: indexedBlueprintSources.id })
				.from(indexedBlueprintSources)
				.where(
					and(
						eq(indexedBlueprintSources.blueprintId, existing.id),
						eq(indexedBlueprintSources.sourceUrl, input.sourceUrl)
					)
				)
				.get();
			if (duplicateSource) return { status: 'duplicate', id: existing.id } as const;

			tx.insert(indexedBlueprintSources)
				.values({
					id: crypto.randomUUID(),
					blueprintId: existing.id,
					platform: input.platform,
					sourceUrl: input.sourceUrl,
					attributedCreator: input.attributedCreator.trim(),
					discoveredAt,
					ingestionMethod: input.ingestionMethod ?? 'manual',
					internalNotes: input.internalNotes ?? '',
					createdAt: now
				})
				.run();
			recordAudit(tx as unknown as typeof db, existing.id, 'source_added', actorAccountId, {
				platform: input.platform
			});
			return { status: 'source_added', id: existing.id } as const;
		}

		// Only now is this definitely a new listing, so the listing-only fields
		// become required.
		const listingErrors = validateListingFields(input);
		if (listingErrors.length) return { status: 'invalid', errors: listingErrors } as const;

		const id = crypto.randomUUID();
		tx.insert(indexedBlueprints)
			.values({
				id,
				shareCode,
				resolutionState: 'unresolved',
				blueprintType: input.blueprintType ?? 'House',
				blueprintScope: input.blueprintScope ?? null,
				faction: input.faction ?? null,
				attributedCreator: input.attributedCreator.trim(),
				attributedRealm: input.attributedRealm?.trim() || null,
				attributedCharacter: input.attributedCharacter?.trim() || null,
				title: input.title.trim(),
				claimState: 'unclaimed',
				publication: input.publication ?? 'draft',
				indexedAt: now,
				updatedAt: now
			})
			.run();
		tx.insert(indexedBlueprintSources)
			.values({
				id: crypto.randomUUID(),
				blueprintId: id,
				platform: input.platform,
				sourceUrl: input.sourceUrl,
				attributedCreator: input.attributedCreator.trim(),
				discoveredAt,
				ingestionMethod: input.ingestionMethod ?? 'manual',
				internalNotes: input.internalNotes ?? '',
				createdAt: now
			})
			.run();
		recordAudit(tx as unknown as typeof db, id, 'indexed', actorAccountId, {
			platform: input.platform,
			publication: input.publication ?? 'draft'
		});
		return { status: 'created', id } as const;
	});
}

/**
 * Attach a manifest that was resolved through KwikShack's supported flow (the
 * in-game addon). This is the ONLY way `manifest` is ever written.
 *
 * Note what this deliberately does NOT do: it does not feed the manifest into
 * `ingestRecordPairs`. That self-learning recordID↔itemID map trusts its input,
 * and a third-party code's contents are not evidence we should promote into the
 * authoritative decor catalog. Indexed builds read the catalog; they never
 * teach it.
 */
export function attachResolvedManifest(
	blueprintId: string,
	manifest: unknown,
	actorAccountId: string | null = null
): { ok: true } | { ok: false; error: string } {
	const row = db.select().from(indexedBlueprints).where(eq(indexedBlueprints.id, blueprintId)).get();
	if (!row) return { ok: false, error: 'Unknown blueprint' };
	if (!isBuildManifest(manifest)) return { ok: false, error: 'manifest must contain at least one content entry' };
	if (normalizeShareCode(manifest.shareCode) !== row.shareCode) {
		return { ok: false, error: 'manifest shareCode does not match the indexed share code' };
	}

	const now = new Date();
	db.transaction((tx) => {
		tx.update(indexedBlueprints)
			.set({
				manifest,
				resolutionState: 'resolved',
				resolutionCheckedAt: now,
				resolutionNote: '',
				blueprintType: typeof manifest.blueprintType === 'string' ? manifest.blueprintType : row.blueprintType,
				updatedAt: now
			})
			.where(eq(indexedBlueprints.id, blueprintId))
			.run();
		recordAudit(tx as unknown as typeof db, blueprintId, 'resolved', actorAccountId, {});
	});
	return { ok: true };
}

/**
 * Record that a code stopped resolving or was withdrawn. The listing survives —
 * provenance is the point — but the copy action does not.
 */
export function setResolutionState(
	blueprintId: string,
	state: 'unresolved' | 'unavailable' | 'revoked',
	note: string,
	actorAccountId: string | null = null
): { ok: true } | { ok: false; error: string } {
	const row = db.select({ id: indexedBlueprints.id }).from(indexedBlueprints).where(eq(indexedBlueprints.id, blueprintId)).get();
	if (!row) return { ok: false, error: 'Unknown blueprint' };

	const now = new Date();
	db.transaction((tx) => {
		tx.update(indexedBlueprints)
			.set({
				resolutionState: state,
				resolutionCheckedAt: now,
				resolutionNote: note.slice(0, MAX_NOTE_LENGTH),
				updatedAt: now
			})
			.where(eq(indexedBlueprints.id, blueprintId))
			.run();
		recordAudit(tx as unknown as typeof db, blueprintId, `resolution_${state}`, actorAccountId, {});
	});
	return { ok: true };
}

export function setPublication(
	blueprintId: string,
	publication: 'draft' | 'published' | 'archived',
	actorAccountId: string | null = null
): { ok: true } | { ok: false; error: string } {
	const row = db.select().from(indexedBlueprints).where(eq(indexedBlueprints.id, blueprintId)).get();
	if (!row) return { ok: false, error: 'Unknown blueprint' };
	const now = new Date();
	db.transaction((tx) => {
		tx.update(indexedBlueprints).set({ publication, updatedAt: now }).where(eq(indexedBlueprints.id, blueprintId)).run();
		recordAudit(tx as unknown as typeof db, blueprintId, `publication_${publication}`, actorAccountId, {});
	});
	return { ok: true };
}

// -----------------------------------------------------------------------------
// Creator-authored overlay
// -----------------------------------------------------------------------------

export interface CreatorEditInput {
	title?: string;
	description?: string;
	tags?: string[];
	links?: string[];
	preferredAttribution?: string | null;
	shareCode?: string;
}

export function validateCreatorEdit(input: CreatorEditInput): string[] {
	const errors: string[] = [];
	if (input.title !== undefined) {
		if (!input.title.trim()) errors.push('title cannot be empty');
		else if (input.title.trim().length > MAX_TITLE_LENGTH) errors.push(`title must be at most ${MAX_TITLE_LENGTH} characters`);
	}
	if (input.description !== undefined && input.description.length > MAX_DESCRIPTION_LENGTH) {
		errors.push(`description must be at most ${MAX_DESCRIPTION_LENGTH} characters`);
	}
	if (input.tags !== undefined) {
		if (!Array.isArray(input.tags)) errors.push('tags must be an array');
		else if (input.tags.length > MAX_TAGS) errors.push(`at most ${MAX_TAGS} tags are allowed`);
		else if (input.tags.some((tag) => typeof tag !== 'string' || !tag.trim() || tag.length > MAX_TAG_LENGTH)) {
			errors.push(`tags must be non-empty strings of at most ${MAX_TAG_LENGTH} characters`);
		}
	}
	if (input.links !== undefined) {
		if (!Array.isArray(input.links)) errors.push('links must be an array');
		else if (input.links.length > MAX_LINKS) errors.push(`at most ${MAX_LINKS} links are allowed`);
		else if (
			input.links.some((link) => {
				if (typeof link !== 'string' || link.length > 512) return true;
				try {
					return new URL(link).protocol !== 'https:';
				} catch {
					return true;
				}
			})
		) {
			errors.push('links must be https URLs');
		}
	}
	if (input.preferredAttribution !== undefined && input.preferredAttribution !== null) {
		if (input.preferredAttribution.length > MAX_CREATOR_LENGTH) {
			errors.push(`preferredAttribution must be at most ${MAX_CREATOR_LENGTH} characters`);
		}
	}
	if (input.shareCode !== undefined) {
		const code = normalizeShareCode(input.shareCode);
		if (!code || !isValidShareCode(code)) errors.push('shareCode must be 1–256 printable non-space characters');
	}
	return errors;
}

/**
 * Apply a claimed creator's edit.
 *
 * Authorization is the caller's job and is checked again here: the listing must
 * be claimed BY THIS ACCOUNT. Provenance columns, source rows, audit events,
 * publication state, and system-derived manifest data are unreachable from this
 * function by construction — it can only write the creator overlay.
 *
 * Replacing the share code discards the derived manifest rather than carrying
 * it over, because that manifest described the previous blueprint.
 */
export function applyCreatorEdit(
	blueprintId: string,
	accountId: string,
	input: CreatorEditInput
): { ok: true } | { ok: false; status: number; error: string; errors?: string[] } {
	const row = db.select().from(indexedBlueprints).where(eq(indexedBlueprints.id, blueprintId)).get();
	if (!row) return { ok: false, status: 404, error: 'Unknown blueprint' };
	if (row.claimState !== 'claimed' || row.claimedByAccountId !== accountId) {
		return { ok: false, status: 403, error: 'This listing is not managed by your account' };
	}

	const errors = validateCreatorEdit(input);
	if (errors.length) return { ok: false, status: 400, error: 'Invalid edit', errors };

	const now = new Date();
	const update: Record<string, unknown> = { updatedAt: now };
	if (input.title !== undefined) update.creatorTitle = input.title.trim();
	if (input.description !== undefined) update.creatorDescription = input.description.trim() || null;
	if (input.tags !== undefined) update.creatorTags = input.tags.map((tag) => tag.trim().toLowerCase());
	if (input.links !== undefined) update.creatorLinks = input.links;
	if (input.preferredAttribution !== undefined) {
		update.preferredAttribution = input.preferredAttribution?.trim() || null;
	}

	if (input.shareCode !== undefined) {
		const nextCode = normalizeShareCode(input.shareCode);
		if (nextCode !== row.shareCode) {
			const nativeBuild = getBuildByCode(nextCode);
			if (nativeBuild) return { ok: false, status: 409, error: 'That code already belongs to a native KwikShack build' };
			const clash = db.select({ id: indexedBlueprints.id }).from(indexedBlueprints).where(eq(indexedBlueprints.shareCode, nextCode)).get();
			if (clash && clash.id !== blueprintId) {
				return { ok: false, status: 409, error: 'That code is already indexed on another listing' };
			}
			update.shareCode = nextCode;
			// The old manifest described the old blueprint. Never carry it over.
			update.manifest = null;
			update.resolutionState = 'unresolved';
			update.resolutionCheckedAt = null;
			update.resolutionNote = '';
		}
	}

	db.transaction((tx) => {
		tx.update(indexedBlueprints).set(update).where(eq(indexedBlueprints.id, blueprintId)).run();
		recordAudit(tx as unknown as typeof db, blueprintId, 'creator_edit', accountId, {
			fields: Object.keys(update).filter((key) => key !== 'updatedAt')
		});
	});
	return { ok: true };
}

/** Replace the creator-uploaded screenshots for a claimed listing. */
export function replaceCreatorScreenshots(
	blueprintId: string,
	accountId: string,
	urls: string[]
): { ok: true } | { ok: false; status: number; error: string } {
	const row = db.select().from(indexedBlueprints).where(eq(indexedBlueprints.id, blueprintId)).get();
	if (!row) return { ok: false, status: 404, error: 'Unknown blueprint' };
	if (row.claimState !== 'claimed' || row.claimedByAccountId !== accountId) {
		return { ok: false, status: 403, error: 'This listing is not managed by your account' };
	}

	const now = new Date();
	db.transaction((tx) => {
		tx.delete(indexedBlueprintScreenshots).where(eq(indexedBlueprintScreenshots.blueprintId, blueprintId)).run();
		urls.forEach((url, position) => {
			tx.insert(indexedBlueprintScreenshots)
				.values({
					id: crypto.randomUUID(),
					blueprintId,
					url,
					caption: '',
					isPrimary: position === 0,
					sortOrder: position,
					uploadedByAccountId: accountId,
					createdAt: now
				})
				.run();
		});
		tx.update(indexedBlueprints).set({ updatedAt: now }).where(eq(indexedBlueprints.id, blueprintId)).run();
		recordAudit(tx as unknown as typeof db, blueprintId, 'creator_screenshots', accountId, { count: urls.length });
	});
	return { ok: true };
}

// -----------------------------------------------------------------------------
// Reading
// -----------------------------------------------------------------------------

type BlueprintRow = typeof indexedBlueprints.$inferSelect;

function derivedFor(row: BlueprintRow): IndexedBlueprintPublic['derived'] {
	// Derived numbers are only honest when they came from a resolved manifest.
	if (row.resolutionState !== 'resolved' || !row.manifest) return null;
	const manifest = row.manifest as unknown as BuildManifest;
	const summary = buildSummary(manifest);
	return {
		decorCount: summary.decorCount,
		roomCount: summary.roomCount,
		distinctDecorItems: distinctDecorItemCount(manifest)
	};
}

/**
 * Serialise for visitors. Internal notes, reviewer notes, and evidence never
 * appear here — they are not read from the database in the first place.
 */
export function toPublicIndexedBlueprint(
	row: BlueprintRow,
	sources: (typeof indexedBlueprintSources.$inferSelect)[],
	screenshots: (typeof indexedBlueprintScreenshots.$inferSelect)[],
	claimedCreatorName: string | null
): IndexedBlueprintPublic {
	const claimed = row.claimState === 'claimed';
	return {
		id: row.id,
		shareCode: row.shareCode,
		title: (claimed ? row.creatorTitle : null) ?? row.title,
		description: claimed ? (row.creatorDescription ?? null) : null,
		blueprintType: row.blueprintType,
		blueprintScope: row.blueprintScope ?? null,
		faction: row.faction,
		resolutionState: row.resolutionState,
		resolutionCheckedAt: row.resolutionCheckedAt?.toISOString() ?? null,
		copyable: isCopyable(row.resolutionState),
		derived: derivedFor(row),
		attributedCreator: row.attributedCreator,
		attributedRealm: row.attributedRealm,
		attributedCharacter: row.attributedCharacter,
		preferredAttribution: claimed ? row.preferredAttribution : null,
		claimState: row.claimState,
		claimedCreatorName: claimed ? claimedCreatorName : null,
		tags: claimed ? (row.creatorTags ?? []) : [],
		creatorLinks: claimed ? (row.creatorLinks ?? []) : [],
		screenshots: screenshots.map((shot) => ({ url: shot.url, caption: shot.caption })),
		sources: sources.map((source) => ({
			platform: source.platform,
			platformLabel: sourcePlatformLabel(source.platform),
			sourceUrl: source.sourceUrl,
			attributedCreator: source.attributedCreator,
			discoveredAt: source.discoveredAt.toISOString().slice(0, 10)
		})),
		indexedAt: row.indexedAt.toISOString().slice(0, 10),
		nativeBuildId: row.nativeBuildId
	};
}

function hydrate(rows: BlueprintRow[]): IndexedBlueprintPublic[] {
	if (rows.length === 0) return [];
	const ids = rows.map((row) => row.id);

	// Select explicit columns: `internal_notes` must not be pulled into memory on
	// a read path that ends in a response body.
	const sources = db
		.select({
			id: indexedBlueprintSources.id,
			blueprintId: indexedBlueprintSources.blueprintId,
			platform: indexedBlueprintSources.platform,
			sourceUrl: indexedBlueprintSources.sourceUrl,
			attributedCreator: indexedBlueprintSources.attributedCreator,
			discoveredAt: indexedBlueprintSources.discoveredAt,
			ingestionMethod: indexedBlueprintSources.ingestionMethod,
			createdAt: indexedBlueprintSources.createdAt
		})
		.from(indexedBlueprintSources)
		.where(inArray(indexedBlueprintSources.blueprintId, ids))
		.all()
		.map((source) => ({ ...source, internalNotes: '' }));

	const screenshots = db
		.select()
		.from(indexedBlueprintScreenshots)
		.where(inArray(indexedBlueprintScreenshots.blueprintId, ids))
		.orderBy(desc(indexedBlueprintScreenshots.isPrimary), indexedBlueprintScreenshots.sortOrder)
		.all();

	const claimantIds = [...new Set(rows.flatMap((row) => (row.claimedByAccountId ? [row.claimedByAccountId] : [])))];
	const claimants = new Map(
		claimantIds.length
			? db
					.select({ id: accounts.id, displayName: accounts.displayName })
					.from(accounts)
					.where(inArray(accounts.id, claimantIds))
					.all()
					.map((account) => [account.id, account.displayName])
			: []
	);

	return rows.map((row) =>
		toPublicIndexedBlueprint(
			row,
			sources.filter((source) => source.blueprintId === row.id),
			screenshots.filter((shot) => shot.blueprintId === row.id),
			row.claimedByAccountId ? (claimants.get(row.claimedByAccountId) ?? null) : null
		)
	);
}

export function listIndexedBlueprints(options: { limit?: number; offset?: number } = {}): IndexedBlueprintPublic[] {
	const limit = Math.min(Math.max(options.limit ?? 24, 0), 100);
	const offset = Math.max(options.offset ?? 0, 0);
	const rows = db
		.select()
		.from(indexedBlueprints)
		.where(eq(indexedBlueprints.publication, 'published'))
		.orderBy(desc(indexedBlueprints.indexedAt))
		.limit(limit)
		.offset(offset)
		.all();
	return hydrate(rows);
}

export function countIndexedBlueprints(): number {
	return db.select().from(indexedBlueprints).where(eq(indexedBlueprints.publication, 'published')).all().length;
}

export function getIndexedBlueprint(id: string): IndexedBlueprintPublic | null {
	const row = db
		.select()
		.from(indexedBlueprints)
		.where(and(eq(indexedBlueprints.id, id), eq(indexedBlueprints.publication, 'published')))
		.get();
	return row ? hydrate([row])[0] : null;
}

/** Includes drafts and archives. Admin and owning-creator surfaces only. */
export function getIndexedBlueprintForManagement(id: string): IndexedBlueprintPublic | null {
	const row = db.select().from(indexedBlueprints).where(eq(indexedBlueprints.id, id)).get();
	return row ? hydrate([row])[0] : null;
}

export function getIndexedBlueprintRow(id: string): BlueprintRow | null {
	return db.select().from(indexedBlueprints).where(eq(indexedBlueprints.id, id)).get() ?? null;
}

/** Listings a creator manages, for their account page. */
export function listBlueprintsManagedBy(accountId: string): IndexedBlueprintPublic[] {
	const rows = db
		.select()
		.from(indexedBlueprints)
		.where(and(eq(indexedBlueprints.claimedByAccountId, accountId), eq(indexedBlueprints.claimState, 'claimed')))
		.orderBy(desc(indexedBlueprints.updatedAt))
		.all();
	return hydrate(rows);
}

/**
 * Cross-check for the dedup story: does a native build already carry this code?
 * Used by the admin form so a curator sees the conflict before submitting.
 */
export function findNativeBuildForCode(shareCode: string): { id: string; title: string } | null {
	const build = db
		.select({ id: builds.id, title: builds.title })
		.from(builds)
		.where(eq(builds.shareCode, normalizeShareCode(shareCode)))
		.get();
	return build ?? null;
}
