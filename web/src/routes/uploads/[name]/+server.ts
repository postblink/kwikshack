import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RequestHandler } from './$types';
import { UPLOADS_DIR, contentTypeFor } from '$lib/server/uploads';
import { isUploadFileName } from '$lib/upload-path';

// GET /uploads/:name — serve uploaded screenshots from UPLOADS_DIR.
// Production (adapter-node) does NOT serve files written to static/ at
// runtime, so uploads are stored out-of-tree and served here.
export const GET: RequestHandler = async ({ params }) => {
	const name = params.name;
	// Only accept the UUID-style names the upload route generates — this also
	// blocks path traversal (.., /, etc.).
	if (!isUploadFileName(name)) {
		error(400, 'Invalid filename');
	}

	try {
		const buf = await readFile(join(UPLOADS_DIR, name));
		return new Response(new Uint8Array(buf), {
			headers: {
				'content-type': contentTypeFor(name),
				'cache-control': 'public, max-age=31536000, immutable',
				'content-security-policy': "default-src 'none'; sandbox",
				'x-content-type-options': 'nosniff'
			}
		});
	} catch {
		error(404, 'Not found');
	}
};
