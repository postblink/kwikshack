import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE, destroySession, safeRedirect } from '$lib/server/auth/session';
import type { RequestHandler } from './$types';

// POST /auth/logout — invalidates the server-side session row and clears the
// cookie. POST-only so a third-party <img> or link cannot log a visitor out;
// SvelteKit's origin check covers the CSRF case for form posts.
export const POST: RequestHandler = async (event) => {
	destroySession(event.cookies.get(SESSION_COOKIE), event.cookies);
	const form = await event.request.formData().catch(() => null);
	redirect(303, safeRedirect(typeof form?.get('redirectTo') === 'string' ? String(form.get('redirectTo')) : '/'));
};
