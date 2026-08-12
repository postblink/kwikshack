/**
 * Compact code decoder — parses the KwikShack addon's binary base64url format.
 * Format (v1): version(1) + numEntries(2LE) + [itemID(4LE) + count(2LE)]*N + shareCode(rest)
 */

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function base64urlDecode(s: string): Uint8Array {
	const out = new Uint8Array(Math.floor(s.length * 0.75));
	let j = 0;
	for (let i = 0; i < s.length; i += 4) {
		const a = B64_CHARS.indexOf(s[i]) ?? -1;
		const b = i + 1 < s.length ? B64_CHARS.indexOf(s[i + 1]) ?? -1 : -1;
		const c = i + 2 < s.length ? B64_CHARS.indexOf(s[i + 2]) ?? -1 : -1;
		const d = i + 3 < s.length ? B64_CHARS.indexOf(s[i + 3]) ?? -1 : -1;
		if (a < 0) throw new Error('Invalid base64url character at position ' + i);
		const v = a * 262144 + (b >= 0 ? b : 0) * 4096 + (c >= 0 ? c : 0) * 64 + (d >= 0 ? d : 0);
		out[j++] = (v >> 16) & 0xff;
		if (b >= 0) out[j++] = (v >> 8) & 0xff;
		if (c >= 0) out[j++] = v & 0xff;
	}
	return out.slice(0, j);
}

function readU16(bytes: Uint8Array, off: number): number {
	return bytes[off] | (bytes[off + 1] << 8);
}

function readU32(bytes: Uint8Array, off: number): number {
	return (
		bytes[off] + (bytes[off + 1] << 8) + (bytes[off + 2] << 16) + (bytes[off + 3] * 16777216)
	);
}

export interface CompactDecode {
	shareCode: string;
	items: { itemID: number; total: number }[];
}

export function decodeCompact(s: string): CompactDecode {
	const bytes = base64urlDecode(s.trim());
	if (bytes.length < 4) throw new Error('Code too short');

	const version = bytes[0];
	if (version !== 1) throw new Error(`Unknown compact code version: ${version}`);

	const numEntries = readU16(bytes, 1);
	const items: { itemID: number; total: number }[] = [];
	let off = 3;
	for (let i = 0; i < numEntries; i++) {
		if (off + 6 > bytes.length - 1) throw new Error('Truncated entry at position ' + i);
		const itemID = readU32(bytes, off);
		const count = readU16(bytes, off + 4);
		items.push({ itemID, total: count });
		off += 6;
	}
	// Remaining bytes = shareCode (may be shorter than 32)
	const shareCode = new TextDecoder().decode(bytes.slice(off)).trimEnd();
	if (!shareCode) throw new Error('No share code in compact data');

	return { shareCode, items };
}

/**
 * Build a submission payload from a decoded compact code.
 * Enough to populate the submit form and POST to the API.
 */
export function compactToPayload(decoded: CompactDecode) {
	return {
		shareCode: decoded.shareCode,
		title: decoded.shareCode,
		blueprintType: 'House' as const,
		faction: null,
		manifest: {
			shareCode: decoded.shareCode,
			blueprintType: 'House',
			contentGroups: [
				{
					contentType: 3,
					entries: decoded.items.map((it) => ({
						itemID: it.itemID,
						total: it.total,
						name: `Item ${it.itemID}`
					}))
				}
			],
			budgetInfo: { interiorBudgets: [], exteriorBudgets: [] },
			blockingRequirements: {
				missingBudgets: false,
				missingRooms: false,
				missingDecor: false,
				factionMismatch: false,
				rawFlags: 0
			}
		}
	};
}
