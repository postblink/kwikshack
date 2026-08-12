import { error, json } from '@sveltejs/kit';
import { getBuild, getBuildLikeState, toggleBuildLike } from '$lib/server/builds';
import type { RequestHandler } from './$types';

function readClientId(value: unknown): string {
	if (typeof value !== 'string') error(400, 'clientId is required');
	const clientId = value.trim();
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientId)) {
		error(400, 'clientId must be a UUID');
	}
	return clientId;
}

export const GET: RequestHandler = async ({ params, url }) => {
	if (!getBuild(params.id)) error(404, 'Build not found');
	const clientId = readClientId(url.searchParams.get('clientId'));
	return json(getBuildLikeState(params.id, clientId));
};

export const POST: RequestHandler = async ({ params, request }) => {
	if (!getBuild(params.id)) error(404, 'Build not found');
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Body must be JSON');
	}
	const clientId = readClientId((body as { clientId?: unknown })?.clientId);
	return json(toggleBuildLike(params.id, clientId));
};
