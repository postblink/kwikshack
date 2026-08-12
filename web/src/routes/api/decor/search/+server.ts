import { json } from '@sveltejs/kit';
import { searchDecorItems } from '$lib/server/decor';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('q') ?? '';
	const requestedLimit = Number(url.searchParams.get('limit') ?? '10');
	const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 50) : 10;

	return json({ items: searchDecorItems(query, limit) });
};
