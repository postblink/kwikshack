import { json, error } from '@sveltejs/kit';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_REQUEST_BYTES, UPLOADS_DIR, inspectUploadedImage } from '$lib/server/uploads';
import { getSubmitAccess } from '$lib/server/submit-key';
import { FixedWindowRateLimiter } from '$lib/server/rate-limit';

const uploadLimiter = new FixedWindowRateLimiter({ windowMs: 60 * 60_000, maxRequests: 20 });

// POST /api/uploads — accept an image file, store in UPLOADS_DIR, return URL
export const POST: RequestHandler = async (event) => {
	if (!uploadLimiter.allow(event.getClientAddress())) error(429, 'Upload rate limit exceeded');

	const access = getSubmitAccess(
		env.KWIKSHACK_SUBMIT_KEY,
		event.request.headers.get('x-kwikshack-key'),
		dev
	);
	if (access === 'unavailable') error(503, 'Screenshot uploads are not configured');
	if (access === 'invalid') error(401, 'Invalid submit key');

	const contentLength = Number(event.request.headers.get('content-length') ?? '0');
	if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_REQUEST_BYTES) error(413, 'Upload request too large');

	let data: FormData;
	try {
		data = await event.request.formData();
	} catch {
		error(400, 'Body must be multipart form data');
	}
	const file = data.get('file');

	if (!(file instanceof File)) error(400, 'No file provided');
	if (file.size === 0) error(400, 'Image is empty');
	if (file.size > MAX_UPLOAD_BYTES) error(413, 'File too large (max 5MB)');

	const buf = await file.arrayBuffer();
	const bytes = new Uint8Array(buf);
	const inspected = inspectUploadedImage(bytes);
	if (!inspected) error(400, 'Only valid JPEG or PNG images up to 4096×4096 are accepted');

	const name = `${crypto.randomUUID()}.${inspected.extension}`;
	await mkdir(UPLOADS_DIR, { recursive: true });
	await writeFile(join(UPLOADS_DIR, name), bytes, { flag: 'wx' });

	return json({ url: `/uploads/${name}`, width: inspected.width, height: inspected.height }, { status: 201 });
};
