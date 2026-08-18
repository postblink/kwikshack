import { error, fail } from '@sveltejs/kit';
import { getIndexedBlueprint } from '$lib/server/blueprint-index';
import { requestClaim } from '$lib/server/claims';
import { listAccountCharacters } from '$lib/server/auth/session';
import { enrichItems } from '$lib/server/builds';
import { getIndexedBlueprintRow } from '$lib/server/blueprint-index';
import type { BuildManifest } from '$lib/types/manifest';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const blueprint = getIndexedBlueprint(params.id);
	if (!blueprint) error(404, 'Blueprint not found');

	// The item grid is only shown for a manifest KwikShack actually resolved.
	// An unresolved listing shows provenance and nothing pretending to be data.
	let items: ReturnType<typeof enrichItems> = [];
	if (blueprint.resolutionState === 'resolved') {
		const row = getIndexedBlueprintRow(params.id);
		if (row?.manifest) items = enrichItems(row.manifest as unknown as BuildManifest);
	}

	return {
		blueprint,
		items: items.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 200),
		signedIn: Boolean(locals.account),
		isManager: Boolean(locals.account && blueprint.claimState === 'claimed' && locals.account.role),
		characters: locals.account
			? listAccountCharacters(locals.account.id).map((character) => ({
					id: character.id,
					label: `${character.name}-${character.realmName || character.realmSlug}`
				}))
			: []
	};
};

export const actions: Actions = {
	// Claiming requires an authenticated account. Nothing about the request body
	// can grant it — the account comes from the session only.
	claim: async ({ request, params, locals }) => {
		if (!locals.account) return fail(401, { claimError: 'Sign in with Battle.net to request a claim.' });

		const form = await request.formData();
		const characterIdentityId = String(form.get('characterIdentityId') ?? '').trim() || null;
		const evidenceUrl = String(form.get('evidenceUrl') ?? '').trim() || null;
		const claimantNote = String(form.get('claimantNote') ?? '').trim();

		const result = requestClaim({
			blueprintId: params.id,
			accountId: locals.account.id,
			characterIdentityId,
			evidenceUrl,
			claimantNote
		});
		if (!result.ok) return fail(result.status, { claimError: result.error });
		return { claimSubmitted: true };
	}
};
