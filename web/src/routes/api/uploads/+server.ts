import { json, error } from '@sveltejs/kit';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { RequestHandler } from './$types';
import { UPLOADS_DIR } from '$lib/server/uploads';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

// POST /api/uploads — accept an image file, store in UPLOADS_DIR, return URL
export const POST: RequestHandler = async ({ request }) => {
	const data = await request.formData();
	const file = data.get('file');

	if (!(file instanceof File)) error(400, 'No file provided');
	if (!file.type.startsWith('image/')) error(400, 'Only images accepted');
	if (file.size > MAX_SIZE) error(400, 'File too large (max 10MB)');

	const ext = file.name.split('.').pop() ?? 'jpg';
	const name = `${crypto.randomUUID()}.${ext}`;
	await mkdir(UPLOADS_DIR, { recursive: true });

	const buf = await file.arrayBuffer();
	await writeFile(join(UPLOADS_DIR, name), new Uint8Array(buf));

	return json({ url: `/uploads/${name}` });
};
