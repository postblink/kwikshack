import type { LayoutServerLoad } from './$types';

// Only the label the header needs. Roles, Battle.net identifiers, and character
// data stay server-side unless a page asks for them explicitly.
export const load: LayoutServerLoad = async ({ locals }) => ({
	account: locals.account ? { displayName: locals.account.displayName, isAdmin: locals.account.role === 'admin' } : null
});
