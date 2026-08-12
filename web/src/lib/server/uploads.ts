import { join } from 'node:path';
import { env } from '$env/dynamic/private';

/**
 * Where uploaded screenshots live. Runtime-configurable (UPLOADS_DIR env) so
 * hosted deploys can point it at a mounted volume. Kept out of +server.ts —
 * SvelteKit only permits handler exports in route modules.
 */
export const UPLOADS_DIR = env.UPLOADS_DIR ?? join(process.cwd(), 'static', 'uploads');

/** Content-type for a given upload filename (by extension). */
export function contentTypeFor(name: string): string {
	const ext = name.split('.').pop()?.toLowerCase() ?? '';
	switch (ext) {
		case 'png':
			return 'image/png';
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg';
		case 'webp':
			return 'image/webp';
		case 'gif':
			return 'image/gif';
		default:
			return 'application/octet-stream';
	}
}
