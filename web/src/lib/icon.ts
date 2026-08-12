/**
 * Icon URL helper — decor catalog icons are stored as FileDataIDs (numeric
 * strings). Blizzard's render CDN serves them by fileDataID:
 *   https://render.worldofwarcraft.com/icons/{size}/{fileDataID}.jpg
 * (plural "icons" — the singular "icon" path 403s). Verified live 2026-08-12.
 *
 * The catalog may occasionally carry legacy icon *names*; those use Wowhead's
 * CDN instead. Both paths are handled here.
 */
export function iconUrl(icon: string | number | null | undefined): string | null {
	if (icon === null || icon === undefined || icon === '') return null;
	const s = String(icon);
	if (/^\d+$/.test(s)) {
		return `https://render.worldofwarcraft.com/icons/56/${s}.jpg`;
	}
	return `https://wow.zamimg.com/images/wow/icons/large/${s}.jpg`;
}
