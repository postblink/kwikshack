import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth/guards';
import { approveClaim, listPendingClaims, rejectClaim } from '$lib/server/claims';
import type { Actions, PageServerLoad } from './$types';

/**
 * Manual claim review. Small on purpose: a queue and two buttons.
 *
 * The evidence signals shown here are inputs to a human decision. Nothing in
 * this route approves a claim automatically, and a display-name resemblance is
 * explicitly labelled as weak so it is not mistaken for proof.
 */
export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	return {
		claims: listPendingClaims().map((claim) => ({ ...claim, createdAt: claim.createdAt.toISOString().slice(0, 10) }))
	};
};

export const actions: Actions = {
	approve: async (event) => {
		const admin = requireAdmin(event);
		const form = await event.request.formData();
		const result = approveClaim(String(form.get('claimId') ?? ''), admin.id, String(form.get('reviewerNote') ?? ''));
		if (!result.ok) return fail(result.status, { error: result.error });
		return { done: 'approved' };
	},
	reject: async (event) => {
		const admin = requireAdmin(event);
		const form = await event.request.formData();
		const result = rejectClaim(String(form.get('claimId') ?? ''), admin.id, String(form.get('reviewerNote') ?? ''));
		if (!result.ok) return fail(result.status, { error: result.error });
		return { done: 'rejected' };
	}
};
