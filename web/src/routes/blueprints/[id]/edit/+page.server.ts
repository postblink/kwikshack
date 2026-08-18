import { error, fail } from '@sveltejs/kit';
import {
	applyCreatorEdit,
	getIndexedBlueprintForManagement,
	getIndexedBlueprintRow,
	replaceCreatorScreenshots
} from '$lib/server/blueprint-index';
import { requireAccount } from '$lib/server/auth/guards';
import { isLocalUploadUrl } from '$lib/upload-path';
import type { Actions, PageServerLoad } from './$types';

const MAX_SCREENSHOTS = 8;

/**
 * Creator editing.
 *
 * Authorization is checked twice on purpose: once here so the page 404s for
 * anyone who does not manage the listing, and again inside applyCreatorEdit so
 * the data layer is safe regardless of which route calls it.
 */
export const load: PageServerLoad = async (event) => {
	const account = requireAccount(event, { html: true });
	const row = getIndexedBlueprintRow(event.params.id);
	// 404 rather than 403: a non-manager learns nothing about the listing's
	// management state from probing this URL.
	if (!row || row.claimState !== 'claimed' || row.claimedByAccountId !== account.id) error(404, 'Not found');

	const blueprint = getIndexedBlueprintForManagement(event.params.id)!;
	return {
		blueprint,
		current: {
			title: row.creatorTitle ?? row.title,
			description: row.creatorDescription ?? '',
			tags: (row.creatorTags ?? []).join(', '),
			links: (row.creatorLinks ?? []).join('\n'),
			preferredAttribution: row.preferredAttribution ?? '',
			shareCode: row.shareCode
		},
		// The curation title and every provenance field are shown read-only so the
		// creator can see the record without being able to rewrite it.
		readOnly: {
			curationTitle: row.title,
			attributedCreator: row.attributedCreator,
			indexedAt: row.indexedAt.toISOString().slice(0, 10),
			sources: blueprint.sources
		}
	};
};

export const actions: Actions = {
	save: async (event) => {
		const account = requireAccount(event);
		const form = await event.request.formData();

		const tags = String(form.get('tags') ?? '')
			.split(',')
			.map((tag) => tag.trim())
			.filter(Boolean);
		const links = String(form.get('links') ?? '')
			.split(/\r?\n/)
			.map((link) => link.trim())
			.filter(Boolean);

		const result = applyCreatorEdit(event.params.id, account.id, {
			title: String(form.get('title') ?? ''),
			description: String(form.get('description') ?? ''),
			tags,
			links,
			preferredAttribution: String(form.get('preferredAttribution') ?? ''),
			shareCode: String(form.get('shareCode') ?? '')
		});
		if (!result.ok) return fail(result.status, { error: result.error, errors: result.errors });
		return { saved: true };
	},

	screenshots: async (event) => {
		const account = requireAccount(event);
		const form = await event.request.formData();
		const urls = form
			.getAll('screenshotUrls')
			.map((value) => String(value).trim())
			.filter(Boolean);

		if (urls.length > MAX_SCREENSHOTS) return fail(400, { error: `At most ${MAX_SCREENSHOTS} screenshots are allowed` });
		// Same rule as native submissions: a listing may reference only images
		// that were uploaded to KwikShack through the validated upload endpoint.
		if (!urls.every((url) => isLocalUploadUrl(url))) {
			return fail(400, { error: 'Screenshots must be KwikShack upload URLs' });
		}

		const result = replaceCreatorScreenshots(event.params.id, account.id, urls);
		if (!result.ok) return fail(result.status, { error: result.error });
		return { saved: true };
	}
};
