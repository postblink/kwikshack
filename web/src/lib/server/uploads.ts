import { join } from 'node:path';
import { env } from '$env/dynamic/private';

export { isLocalUploadUrl } from '$lib/upload-path';

/**
 * Where uploaded screenshots live. Runtime-configurable (UPLOADS_DIR env) so
 * hosted deploys can point it at a mounted volume. Kept out of +server.ts —
 * SvelteKit only permits handler exports in route modules.
 */
export const UPLOADS_DIR = env.UPLOADS_DIR ?? join(process.cwd(), 'static', 'uploads');

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_UPLOAD_REQUEST_BYTES = MAX_UPLOAD_BYTES + 256 * 1024;
const MAX_IMAGE_EDGE = 4096;
const MAX_IMAGE_PIXELS = 20_000_000;

export interface InspectedImage {
	extension: 'jpg' | 'png';
	contentType: 'image/jpeg' | 'image/png';
	width: number;
	height: number;
}

function dimensionsAllowed(width: number, height: number): boolean {
	return width > 0 && height > 0 && width <= MAX_IMAGE_EDGE && height <= MAX_IMAGE_EDGE && width * height <= MAX_IMAGE_PIXELS;
}

function hasCompletePngStructure(bytes: Uint8Array): boolean {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let offset = 8;
	let sawHeader = false;
	let sawImageData = false;
	while (offset + 12 <= bytes.length) {
		const length = view.getUint32(offset);
		const end = offset + 12 + length;
		if (end > bytes.length) return false;
		const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
		if (!sawHeader) {
			if (type !== 'IHDR' || length !== 13) return false;
			sawHeader = true;
		}
		if (type === 'IDAT') sawImageData = true;
		offset = end;
		if (type === 'IEND') return length === 0 && sawImageData && offset === bytes.length;
	}
	return false;
}

/** Inspect signatures and dimensions instead of trusting multipart MIME/name. */
export function inspectUploadedImage(bytes: Uint8Array): InspectedImage | null {
	if (
		bytes.length >= 24 &&
		bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
		bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a &&
		String.fromCharCode(...bytes.slice(12, 16)) === 'IHDR' &&
		hasCompletePngStructure(bytes)
	) {
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		const width = view.getUint32(16);
		const height = view.getUint32(20);
		return dimensionsAllowed(width, height) ? { extension: 'png', contentType: 'image/png', width, height } : null;
	}

	if (
		bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff &&
		bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9
	) {
		const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
		for (let offset = 2; offset + 8 < bytes.length; ) {
			if (bytes[offset] !== 0xff) {
				offset += 1;
				continue;
			}
			while (bytes[offset] === 0xff) offset += 1;
			const marker = bytes[offset++];
			if (marker === 0xd8 || marker === 0xd9) continue;
			if (marker === 0xda) break;
			if (offset + 1 >= bytes.length) break;
			const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
			if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
			if (sofMarkers.has(marker) && segmentLength >= 7) {
				const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
				const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
				return dimensionsAllowed(width, height) ? { extension: 'jpg', contentType: 'image/jpeg', width, height } : null;
			}
			offset += segmentLength;
		}
	}

	return null;
}

/** Content-type for a given upload filename (by extension). */
export function contentTypeFor(name: string): string {
	const ext = name.split('.').pop()?.toLowerCase() ?? '';
	switch (ext) {
		case 'png':
			return 'image/png';
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg';
		default:
			return 'application/octet-stream';
	}
}
