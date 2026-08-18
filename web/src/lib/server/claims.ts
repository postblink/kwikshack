import { and, desc, eq } from 'drizzle-orm';
import { db } from './db';
import {
	accounts,
	battleNetIdentities,
	blueprintAuditEvents,
	blueprintClaims,
	indexedBlueprintSources,
	indexedBlueprints,
	wowCharacterIdentities
} from './db/schema';
import { EVIDENCE_KINDS as EVIDENCE } from '$lib/types/evidence';

/**
 * Claiming an indexed blueprint.
 *
 * What Battle.net authentication actually establishes, in descending strength:
 *
 *   1. This KwikShack account controls this Battle.net account.       (proven)
 *   2. This Battle.net account controls Character-Realm.              (proven,
 *      when the user granted `wow.profile`)
 *   3. This person published the blueprint at the source URL.         (NOT proven)
 *
 * (3) is the claim that matters, and no currently available Blizzard API
 * establishes it — there is no endpoint that maps a blueprint share code to the
 * account that created it. So approval is a human decision, and the evidence
 * that decision rests on is recorded rather than inferred.
 *
 * `evidenceKinds` is a machine-readable record of which supporting signals were
 * present at request time. It is advisory input to a reviewer, never an
 * automatic approval rule — in particular, a display-name match is recorded but
 * must never be sufficient on its own.
 */
export { EVIDENCE_KINDS } from '$lib/types/evidence';

const MAX_NOTE_LENGTH = 1_000;

export interface ClaimRequestInput {
	blueprintId: string;
	accountId: string;
	characterIdentityId?: string | null;
	evidenceUrl?: string | null;
	claimantNote?: string;
}

export type ClaimRequestResult =
	| { ok: true; claimId: string }
	| { ok: false; status: number; error: string };

function normalizeName(value: string): string {
	return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Collect the supporting signals present for this request. Pure inspection —
 * it grants nothing.
 */
export function collectEvidenceKinds(options: {
	attributedCreator: string;
	attributedCharacter: string | null;
	characterName: string | null;
	battletag: string | null;
	evidenceUrl: string | null;
}): string[] {
	const kinds: string[] = [];
	if (options.characterName) kinds.push(EVIDENCE.characterOwnership);

	const attributionTargets = [options.attributedCreator, options.attributedCharacter ?? '']
		.map(normalizeName)
		.filter(Boolean);
	const character = options.characterName ? normalizeName(options.characterName) : '';
	if (character && attributionTargets.includes(character)) {
		kinds.push(EVIDENCE.characterMatchesAttribution);
	}

	const battletagName = options.battletag ? normalizeName(options.battletag.split('#')[0]) : '';
	if (battletagName && attributionTargets.includes(battletagName)) {
		kinds.push(EVIDENCE.displayNameSimilarity);
	}

	if (options.evidenceUrl) kinds.push(EVIDENCE.claimantEvidenceUrl);
	return kinds;
}

export function requestClaim(input: ClaimRequestInput): ClaimRequestResult {
	const blueprint = db.select().from(indexedBlueprints).where(eq(indexedBlueprints.id, input.blueprintId)).get();
	if (!blueprint) return { ok: false, status: 404, error: 'Unknown blueprint' };
	if (blueprint.publication === 'archived') return { ok: false, status: 409, error: 'This listing is archived' };
	if (blueprint.claimState === 'claimed') {
		return { ok: false, status: 409, error: 'This listing has already been claimed' };
	}

	const existing = db
		.select({ id: blueprintClaims.id })
		.from(blueprintClaims)
		.where(
			and(
				eq(blueprintClaims.blueprintId, input.blueprintId),
				eq(blueprintClaims.accountId, input.accountId),
				eq(blueprintClaims.status, 'pending')
			)
		)
		.get();
	if (existing) return { ok: false, status: 409, error: 'You already have a claim pending on this listing' };

	// A character may only be cited by the account that actually owns it.
	let characterName: string | null = null;
	if (input.characterIdentityId) {
		const character = db
			.select()
			.from(wowCharacterIdentities)
			.where(
				and(
					eq(wowCharacterIdentities.id, input.characterIdentityId),
					eq(wowCharacterIdentities.accountId, input.accountId)
				)
			)
			.get();
		if (!character) return { ok: false, status: 403, error: 'That character is not associated with your account' };
		if (character.expiresAt.getTime() <= Date.now()) {
			return { ok: false, status: 409, error: 'That character record has expired — sign in again to refresh it' };
		}
		characterName = character.name;
	}

	let evidenceUrl: string | null = null;
	if (input.evidenceUrl?.trim()) {
		try {
			const parsed = new URL(input.evidenceUrl.trim());
			if (parsed.protocol !== 'https:') return { ok: false, status: 400, error: 'evidenceUrl must be an https URL' };
			if (input.evidenceUrl.length > 2048) return { ok: false, status: 400, error: 'evidenceUrl is too long' };
			evidenceUrl = parsed.toString();
		} catch {
			return { ok: false, status: 400, error: 'evidenceUrl must be a valid URL' };
		}
	}

	const note = (input.claimantNote ?? '').slice(0, MAX_NOTE_LENGTH);
	const identity = db
		.select({ battletag: battleNetIdentities.battletag })
		.from(battleNetIdentities)
		.where(eq(battleNetIdentities.accountId, input.accountId))
		.get();

	const evidenceKinds = collectEvidenceKinds({
		attributedCreator: blueprint.attributedCreator,
		attributedCharacter: blueprint.attributedCharacter,
		characterName,
		battletag: identity?.battletag ?? null,
		evidenceUrl
	});

	const now = new Date();
	const claimId = crypto.randomUUID();
	db.transaction((tx) => {
		tx.insert(blueprintClaims)
			.values({
				id: claimId,
				blueprintId: input.blueprintId,
				accountId: input.accountId,
				status: 'pending',
				characterIdentityId: input.characterIdentityId ?? null,
				evidenceUrl,
				claimantNote: note,
				reviewerNote: '',
				evidenceKinds,
				createdAt: now
			})
			.run();
		// The listing shows "claim under review" without transferring anything.
		if (blueprint.claimState === 'unclaimed') {
			tx.update(indexedBlueprints)
				.set({ claimState: 'pending', updatedAt: now })
				.where(eq(indexedBlueprints.id, input.blueprintId))
				.run();
		}
		tx.insert(blueprintAuditEvents)
			.values({
				id: crypto.randomUUID(),
				blueprintId: input.blueprintId,
				event: 'claim_requested',
				actorAccountId: input.accountId,
				detail: { claimId, evidenceKinds },
				createdAt: now
			})
			.run();
	});

	return { ok: true, claimId };
}

export type ClaimReviewResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Approve a claim. Manual, deliberate, and the only path to creator management.
 *
 * Approval sets `claimedByAccountId` and leaves every provenance column exactly
 * as it was. The listing becomes creator-managed; it does not become a native
 * KwikShack submission, and it does not stop being something we found elsewhere.
 */
export function approveClaim(claimId: string, reviewerAccountId: string, reviewerNote = ''): ClaimReviewResult {
	const claim = db.select().from(blueprintClaims).where(eq(blueprintClaims.id, claimId)).get();
	if (!claim) return { ok: false, status: 404, error: 'Unknown claim' };
	if (claim.status !== 'pending') return { ok: false, status: 409, error: 'This claim is no longer pending' };

	const blueprint = db.select().from(indexedBlueprints).where(eq(indexedBlueprints.id, claim.blueprintId)).get();
	if (!blueprint) return { ok: false, status: 404, error: 'Unknown blueprint' };
	if (blueprint.claimState === 'claimed') return { ok: false, status: 409, error: 'This listing has already been claimed' };

	const now = new Date();
	db.transaction((tx) => {
		tx.update(blueprintClaims)
			.set({
				status: 'approved',
				reviewedAt: now,
				reviewedByAccountId: reviewerAccountId,
				reviewerNote: reviewerNote.slice(0, MAX_NOTE_LENGTH)
			})
			.where(eq(blueprintClaims.id, claimId))
			.run();
		tx.update(indexedBlueprints)
			.set({ claimState: 'claimed', claimedByAccountId: claim.accountId, claimedAt: now, updatedAt: now })
			.where(eq(indexedBlueprints.id, claim.blueprintId))
			.run();
		// Any competing request is closed out rather than left dangling.
		tx.update(blueprintClaims)
			.set({ status: 'rejected', reviewedAt: now, reviewedByAccountId: reviewerAccountId, reviewerNote: 'Superseded by an approved claim' })
			.where(and(eq(blueprintClaims.blueprintId, claim.blueprintId), eq(blueprintClaims.status, 'pending')))
			.run();
		tx.insert(blueprintAuditEvents)
			.values({
				id: crypto.randomUUID(),
				blueprintId: claim.blueprintId,
				event: 'claim_approved',
				actorAccountId: reviewerAccountId,
				detail: { claimId, claimantAccountId: claim.accountId },
				createdAt: now
			})
			.run();
	});
	return { ok: true };
}

export function rejectClaim(claimId: string, reviewerAccountId: string, reviewerNote = ''): ClaimReviewResult {
	const claim = db.select().from(blueprintClaims).where(eq(blueprintClaims.id, claimId)).get();
	if (!claim) return { ok: false, status: 404, error: 'Unknown claim' };
	if (claim.status !== 'pending') return { ok: false, status: 409, error: 'This claim is no longer pending' };

	const now = new Date();
	db.transaction((tx) => {
		tx.update(blueprintClaims)
			.set({
				status: 'rejected',
				reviewedAt: now,
				reviewedByAccountId: reviewerAccountId,
				reviewerNote: reviewerNote.slice(0, MAX_NOTE_LENGTH)
			})
			.where(eq(blueprintClaims.id, claimId))
			.run();
		const stillPending = tx
			.select({ id: blueprintClaims.id })
			.from(blueprintClaims)
			.where(and(eq(blueprintClaims.blueprintId, claim.blueprintId), eq(blueprintClaims.status, 'pending')))
			.get();
		if (!stillPending) {
			tx.update(indexedBlueprints)
				.set({ claimState: 'unclaimed', updatedAt: now })
				.where(and(eq(indexedBlueprints.id, claim.blueprintId), eq(indexedBlueprints.claimState, 'pending')))
				.run();
		}
		tx.insert(blueprintAuditEvents)
			.values({
				id: crypto.randomUUID(),
				blueprintId: claim.blueprintId,
				event: 'claim_rejected',
				actorAccountId: reviewerAccountId,
				detail: { claimId },
				createdAt: now
			})
			.run();
	});
	return { ok: true };
}

export interface PendingClaimView {
	claimId: string;
	blueprintId: string;
	blueprintTitle: string;
	shareCode: string;
	attributedCreator: string;
	claimantAccountId: string;
	claimantDisplayName: string;
	claimantBattletag: string | null;
	claimedCharacter: string | null;
	evidenceUrl: string | null;
	claimantNote: string;
	evidenceKinds: string[];
	sourceUrls: string[];
	createdAt: Date;
}

/** Reviewer-facing view. Admin routes only — this exposes claimant identity. */
export function listPendingClaims(): PendingClaimView[] {
	const rows = db
		.select({
			claim: blueprintClaims,
			blueprint: indexedBlueprints,
			account: accounts,
			identity: battleNetIdentities,
			character: wowCharacterIdentities
		})
		.from(blueprintClaims)
		.innerJoin(indexedBlueprints, eq(blueprintClaims.blueprintId, indexedBlueprints.id))
		.innerJoin(accounts, eq(blueprintClaims.accountId, accounts.id))
		.leftJoin(battleNetIdentities, eq(battleNetIdentities.accountId, accounts.id))
		.leftJoin(wowCharacterIdentities, eq(blueprintClaims.characterIdentityId, wowCharacterIdentities.id))
		.where(eq(blueprintClaims.status, 'pending'))
		.orderBy(desc(blueprintClaims.createdAt))
		.all();

	return rows.map((row) => ({
		claimId: row.claim.id,
		blueprintId: row.blueprint.id,
		blueprintTitle: row.blueprint.title,
		shareCode: row.blueprint.shareCode,
		attributedCreator: row.blueprint.attributedCreator,
		claimantAccountId: row.account.id,
		claimantDisplayName: row.account.displayName,
		claimantBattletag: row.identity?.battletag ?? null,
		claimedCharacter: row.character ? `${row.character.name}-${row.character.realmName || row.character.realmSlug}` : null,
		evidenceUrl: row.claim.evidenceUrl,
		claimantNote: row.claim.claimantNote,
		evidenceKinds: row.claim.evidenceKinds ?? [],
		sourceUrls: db
			.select({ sourceUrl: indexedBlueprintSources.sourceUrl })
			.from(indexedBlueprintSources)
			.where(eq(indexedBlueprintSources.blueprintId, row.blueprint.id))
			.all()
			.map((source) => source.sourceUrl),
		createdAt: row.claim.createdAt
	}));
}

export function listClaimsForAccount(accountId: string) {
	return db
		.select({
			id: blueprintClaims.id,
			blueprintId: blueprintClaims.blueprintId,
			blueprintTitle: indexedBlueprints.title,
			status: blueprintClaims.status,
			createdAt: blueprintClaims.createdAt
		})
		.from(blueprintClaims)
		.innerJoin(indexedBlueprints, eq(blueprintClaims.blueprintId, indexedBlueprints.id))
		.where(eq(blueprintClaims.accountId, accountId))
		.orderBy(desc(blueprintClaims.createdAt))
		.all();
}
