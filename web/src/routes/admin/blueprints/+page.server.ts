import { fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { indexedBlueprints } from '$lib/server/db/schema';
import { requireAdmin } from '$lib/server/auth/guards';
import {
	attachResolvedManifest,
	findNativeBuildForCode,
	indexBlueprint,
	setPublication,
	setResolutionState
} from '$lib/server/blueprint-index';
import { SOURCE_PLATFORMS } from '$lib/server/sources';
import type { BlueprintScope } from '$lib/types/manifest';
import { isBlueprintScope } from '$lib/types/manifest';
import type { Actions, PageServerLoad } from './$types';

/**
 * Small operator surface for the manual/import-assisted indexing pipeline.
 * Deliberately not a moderation dashboard — one form, one list, three actions.
 */
export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	return {
		platforms: SOURCE_PLATFORMS.map((platform) => ({
			id: platform.id,
			label: platform.label,
			automation: platform.automation,
			notes: platform.notes
		})),
		blueprints: db
			.select({
				id: indexedBlueprints.id,
				title: indexedBlueprints.title,
				shareCode: indexedBlueprints.shareCode,
				attributedCreator: indexedBlueprints.attributedCreator,
				resolutionState: indexedBlueprints.resolutionState,
				claimState: indexedBlueprints.claimState,
				publication: indexedBlueprints.publication,
				indexedAt: indexedBlueprints.indexedAt
			})
			.from(indexedBlueprints)
			.orderBy(desc(indexedBlueprints.indexedAt))
			.limit(200)
			.all()
			.map((row) => ({ ...row, indexedAt: row.indexedAt.toISOString().slice(0, 10) }))
	};
};

function parseDate(value: string): Date | undefined {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
	const parsed = new Date(`${value}T00:00:00Z`);
	return Number.isNaN(parsed.valueOf()) ? undefined : parsed;
}

export const actions: Actions = {
	index: async (event) => {
		const admin = requireAdmin(event);
		const form = await event.request.formData();

		const scopeRaw = String(form.get('blueprintScope') ?? '');
		const scope: BlueprintScope | null = isBlueprintScope(scopeRaw) ? scopeRaw : null;
		const factionRaw = String(form.get('faction') ?? '');

		const result = indexBlueprint(
			{
				shareCode: String(form.get('shareCode') ?? ''),
				title: String(form.get('title') ?? ''),
				attributedCreator: String(form.get('attributedCreator') ?? ''),
				attributedRealm: String(form.get('attributedRealm') ?? '') || null,
				attributedCharacter: String(form.get('attributedCharacter') ?? '') || null,
				platform: String(form.get('platform') ?? ''),
				sourceUrl: String(form.get('sourceUrl') ?? ''),
				discoveredAt: parseDate(String(form.get('discoveredAt') ?? '')),
				internalNotes: String(form.get('internalNotes') ?? ''),
				blueprintType: String(form.get('blueprintType') ?? 'House'),
				blueprintScope: scope,
				faction: factionRaw === 'Alliance' || factionRaw === 'Horde' ? factionRaw : null,
				publication: form.get('publication') === 'published' ? 'published' : 'draft'
			},
			admin.id
		);

		if (result.status === 'invalid') return fail(400, { error: 'Invalid record', errors: result.errors });
		if (result.status === 'native_conflict') {
			return fail(409, {
				error: `A native KwikShack build already owns that code. Indexed records never shadow a creator's own submission.`,
				nativeBuildId: result.nativeBuildId
			});
		}
		return { indexed: result.status, id: result.id };
	},

	resolve: async (event) => {
		const admin = requireAdmin(event);
		const form = await event.request.formData();
		let manifest: unknown;
		try {
			manifest = JSON.parse(String(form.get('manifest') ?? ''));
		} catch {
			return fail(400, { error: 'Manifest must be valid JSON exported by the KwikShack addon' });
		}
		const result = attachResolvedManifest(String(form.get('blueprintId') ?? ''), manifest, admin.id);
		if (!result.ok) return fail(400, { error: result.error });
		return { resolved: true };
	},

	state: async (event) => {
		const admin = requireAdmin(event);
		const form = await event.request.formData();
		const blueprintId = String(form.get('blueprintId') ?? '');
		const publication = String(form.get('publication') ?? '');
		const resolution = String(form.get('resolutionState') ?? '');

		if (publication === 'draft' || publication === 'published' || publication === 'archived') {
			const result = setPublication(blueprintId, publication, admin.id);
			if (!result.ok) return fail(400, { error: result.error });
		}
		if (resolution === 'unresolved' || resolution === 'unavailable' || resolution === 'revoked') {
			const result = setResolutionState(blueprintId, resolution, String(form.get('note') ?? ''), admin.id);
			if (!result.ok) return fail(400, { error: result.error });
		}
		return { updated: true };
	},

	// Pre-flight check so a curator sees a native conflict before submitting.
	check: async (event) => {
		requireAdmin(event);
		const form = await event.request.formData();
		const code = String(form.get('shareCode') ?? '');
		const native = findNativeBuildForCode(code);
		const indexed = db
			.select({ id: indexedBlueprints.id, title: indexedBlueprints.title })
			.from(indexedBlueprints)
			.where(eq(indexedBlueprints.shareCode, code.trim()))
			.get();
		return { check: { native: native ?? null, indexed: indexed ?? null } };
	}
};
