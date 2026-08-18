import { dev } from '$app/environment';
import { authConfig } from '$lib/server/auth/config';
import { listAccountCharacters, safeRedirect } from '$lib/server/auth/session';
import { listBlueprintsManagedBy } from '$lib/server/blueprint-index';
import { listClaimsForAccount } from '$lib/server/claims';
import type { PageServerLoad } from './$types';

const ERROR_MESSAGES: Record<string, string> = {
	state_mismatch: 'That sign-in link had expired or had already been used. Please try again.',
	denied: 'Sign-in was cancelled at Battle.net.',
	missing_code: 'Battle.net did not return an authorization code.',
	exchange_failed: 'KwikShack could not complete the exchange with Battle.net. Please try again.',
	network: 'KwikShack could not reach Battle.net. Please try again shortly.',
	rate_limited: 'Too many sign-in attempts. Please wait a minute and try again.',
	unconfigured: 'Battle.net sign-in is not configured on this deployment.'
};

export const load: PageServerLoad = async ({ locals, url }) => {
	const auth = authConfig(dev);
	const errorCode = url.searchParams.get('error');
	const redirectTo = safeRedirect(url.searchParams.get('redirectTo'));

	if (!locals.account) {
		return {
			account: null,
			authEnabled: auth.enabled,
			authDisabledReason: auth.enabled ? null : auth.reason,
			signInError: errorCode ? (ERROR_MESSAGES[errorCode] ?? 'Sign-in did not complete.') : null,
			redirectTo,
			characters: [],
			claims: [],
			managed: []
		};
	}

	const characters = listAccountCharacters(locals.account.id);
	return {
		account: {
			displayName: locals.account.displayName,
			battletag: locals.account.battletag,
			region: locals.account.region,
			role: locals.account.role
		},
		authEnabled: auth.enabled,
		authDisabledReason: null,
		signInError: errorCode ? (ERROR_MESSAGES[errorCode] ?? 'Sign-in did not complete.') : null,
		redirectTo,
		characters: characters.map((character) => ({
			id: character.id,
			name: character.name,
			realm: character.realmName || character.realmSlug,
			faction: character.faction,
			level: character.level,
			// Surfaced so the 30-day Blizzard data TTL is visible, not hidden.
			expiresAt: character.expiresAt.toISOString().slice(0, 10)
		})),
		claims: listClaimsForAccount(locals.account.id).map((claim) => ({
			id: claim.id,
			blueprintId: claim.blueprintId,
			blueprintTitle: claim.blueprintTitle,
			status: claim.status,
			createdAt: claim.createdAt.toISOString().slice(0, 10)
		})),
		managed: listBlueprintsManagedBy(locals.account.id).map((blueprint) => ({
			id: blueprint.id,
			title: blueprint.title,
			resolutionState: blueprint.resolutionState
		}))
	};
};
