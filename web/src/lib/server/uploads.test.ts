import { describe, expect, it } from 'vitest';
import { inspectUploadedImage, isLocalUploadUrl } from './uploads';

function png(width: number, height: number): Uint8Array {
	const bytes = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNgYGAAAAAEAAEnNCcKAAAAAElFTkSuQmCC', 'base64'));
	const view = new DataView(bytes.buffer);
	view.setUint32(16, width);
	view.setUint32(20, height);
	return bytes;
}

function jpeg(width: number, height: number): Uint8Array {
	return new Uint8Array([
		0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02,
		0xff, 0xc0, 0x00, 0x07, 0x08,
		(height >> 8) & 0xff, height & 0xff,
		(width >> 8) & 0xff, width & 0xff,
		0xff, 0xd9
	]);
}

describe('uploaded image inspection', () => {
	it('derives type and dimensions from PNG and JPEG bytes', () => {
		expect(inspectUploadedImage(png(1920, 1080))).toMatchObject({ extension: 'png', width: 1920, height: 1080 });
		expect(inspectUploadedImage(jpeg(1200, 800))).toMatchObject({ extension: 'jpg', width: 1200, height: 800 });
	});

	it('rejects spoofed and oversized images', () => {
		expect(inspectUploadedImage(new TextEncoder().encode('<svg><script>alert(1)</script></svg>'))).toBeNull();
		expect(inspectUploadedImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull();
		expect(inspectUploadedImage(png(5000, 100))).toBeNull();
		expect(inspectUploadedImage(jpeg(0, 800))).toBeNull();
	});

	it('recognizes only generated local screenshot URLs', () => {
		expect(isLocalUploadUrl('/uploads/7b3c8d04-f64d-40ca-a82e-6131e2c01481.png')).toBe(true);
		expect(isLocalUploadUrl('https://tracker.example/image.png')).toBe(false);
		expect(isLocalUploadUrl('/uploads/../../secret.png')).toBe(false);
	});
});
