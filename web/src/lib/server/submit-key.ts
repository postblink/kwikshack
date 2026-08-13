import { timingSafeEqual } from 'node:crypto';

export type SubmitAccess = 'allowed' | 'invalid' | 'unavailable';

/**
 * Shared submit-key gate for build and screenshot POSTs.
 * Kept OUT of +server.ts because SvelteKit only permits handler exports
 * (GET/POST/...) in route modules — a named export there breaks the route
 * at runtime ("Invalid export").
 */
export function getSubmitAccess(
	submitKey: string | undefined,
	providedKey: string | null,
	allowOpen: boolean
): SubmitAccess {
	if (!submitKey) return allowOpen ? 'allowed' : 'unavailable';
	if (!providedKey) return 'invalid';

	const expected = Buffer.from(submitKey);
	const provided = Buffer.from(providedKey);
	return expected.length === provided.length && timingSafeEqual(expected, provided) ? 'allowed' : 'invalid';
}
