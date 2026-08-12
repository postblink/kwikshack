/**
 * Submit-key gate for POST /api/builds.
 * Kept OUT of +server.ts because SvelteKit only permits handler exports
 * (GET/POST/...) in route modules — a named export there breaks the route
 * at runtime ("Invalid export").
 */
export function isSubmitKeyAllowed(submitKey: string | undefined, providedKey: string | null): boolean {
	return !submitKey || providedKey === submitKey;
}
