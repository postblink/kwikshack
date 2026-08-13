const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const RASTER_EXTENSION = '(?:jpe?g|png)';

const uploadFileNamePattern = new RegExp(`^${UUID}\\.${RASTER_EXTENSION}$`, 'i');
const localUploadUrlPattern = new RegExp(`^/uploads/${UUID}\\.${RASTER_EXTENSION}$`, 'i');

export function isUploadFileName(value: string): boolean {
	return uploadFileNamePattern.test(value);
}

export function isLocalUploadUrl(value: string): boolean {
	return localUploadUrlPattern.test(value);
}
