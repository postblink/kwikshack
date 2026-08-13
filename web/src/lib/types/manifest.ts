// Manifest types — the shared contract between the addon export and the web API.
// Mirrors docs/architecture.md and addon/BlueprintManifest.lua normaliser output.

import { isLocalUploadUrl } from '$lib/upload-path';

export interface BudgetEntry {
	cost: number;
	max: number;
	current?: number;
	budgetType?: number; // 0=rooms, 1=decor, 2=pet decor
}

export interface ManifestContentGroupEntry {
	// Live payload (verified 2026-08-11): recordID + name + total.
	// itemID is optional — the addon may enrich recordID→itemID in-game; the
	// site falls back to name + recordID when absent.
	itemID?: number;
	recordID?: number;
	name?: string;
	total?: number;
	invalid?: boolean;
	numMissing?: number;
	contentType?: number;
	// Legacy/HDG-documented fields kept for compat
	count?: number;
	decorID?: number;
	dyeVariant?: number;
	roomGUID?: string;
	[key: string]: unknown;
}

export interface ManifestContentGroup {
	// Live payload uses contentType: 1=house type, 2=room, 3=decor, 5=fixture
	contentType?: number;
	// Legacy field from HDG documentation
	groupType?: number;
	entries: ManifestContentGroupEntry[];
}

export interface BlockingRequirements {
	missingBudgets: boolean;
	missingRooms: boolean;
	missingDecor: boolean;
	factionMismatch: boolean;
	rawFlags: number;
}

export interface BudgetInfo {
	interiorBudgets: BudgetEntry[]; // [0]=Rooms, [1]=Decor, [2]=PetDecor
	exteriorBudgets: BudgetEntry[]; // [1]=Decor, [2]=PetDecor
}

export interface BuildManifest {
	shareCode: string;
	blueprintType: 'House' | 'Interior' | 'Exterior' | 'Room' | string;
	contentGroups: ManifestContentGroup[];
	budgetInfo: BudgetInfo | null;
	blockingRequirements: BlockingRequirements | null;
}

export interface PlacementItem {
	itemID: number;
	x: number;
	y: number;
	z?: number;
	rotation?: number;
	scale?: number;
	dye?: number;
	roomGUID?: string;
	floor?: number;
}

export interface PlacementData {
	items: PlacementItem[];
	rooms?: { guid: string; type: string; floor: number; x: number; y: number; w: number; h: number }[];
}

export interface SubmitBuildPayload {
	shareCode: string;
	title?: string;
	description?: string;
	blueprintType?: string;
	faction?: string | null;
	authorName?: string;
	manifest: BuildManifest;
	placementData?: PlacementData | null;
	screenshotUrls?: string[];
}

const MAX_SHARE_CODE_LENGTH = 256;
const MAX_CONTENT_GROUPS = 64;
const MAX_MANIFEST_ENTRIES = 5_000;
const MAX_SCREENSHOTS = 8;

function optionalString(value: unknown, maxLength: number): boolean {
	return value === undefined || (typeof value === 'string' && value.length <= maxLength);
}

function optionalPositiveInteger(value: unknown): boolean {
	return value === undefined || (Number.isSafeInteger(value) && Number(value) > 0);
}

function optionalCount(value: unknown): boolean {
	return value === undefined || (Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 100_000);
}

export function validateSubmitPayload(v: unknown): string | null {
	if (typeof v !== 'object' || v === null || Array.isArray(v)) return 'payload must be an object';
	const p = v as Record<string, unknown>;
	if (typeof p.shareCode !== 'string' || !/^[\x21-\x7e]+$/.test(p.shareCode) || p.shareCode.length > MAX_SHARE_CODE_LENGTH) {
		return 'shareCode must be 1–256 printable non-space characters';
	}
	if (!optionalString(p.title, 120)) return 'title must be at most 120 characters';
	if (!optionalString(p.description, 2_000)) return 'description must be at most 2000 characters';
	if (!optionalString(p.authorName, 80)) return 'authorName must be at most 80 characters';
	if (p.blueprintType !== undefined && !['House', 'Interior', 'Exterior', 'Room'].includes(String(p.blueprintType))) {
		return 'blueprintType must be House, Interior, Exterior, or Room';
	}
	if (p.faction !== undefined && p.faction !== null && !['Alliance', 'Horde'].includes(String(p.faction))) {
		return 'faction must be Alliance, Horde, or null';
	}
	if (!isBuildManifest(p.manifest)) return 'manifest must contain at least one content entry';
	if (p.manifest.shareCode !== p.shareCode) return 'manifest shareCode must match shareCode';
	if (p.manifest.contentGroups.length > MAX_CONTENT_GROUPS) return `manifest may contain at most ${MAX_CONTENT_GROUPS} groups`;

	let entryCount = 0;
	for (const group of p.manifest.contentGroups) {
		entryCount += group.entries.length;
		if (entryCount > MAX_MANIFEST_ENTRIES) return `manifest may contain at most ${MAX_MANIFEST_ENTRIES} entries`;
		if (!optionalPositiveInteger(group.contentType) || !optionalPositiveInteger(group.groupType)) return 'content group types must be positive integers';
		for (const entry of group.entries) {
			if (!optionalPositiveInteger(entry.itemID) || !optionalPositiveInteger(entry.recordID) || !optionalPositiveInteger(entry.decorID)) {
				return 'manifest item identifiers must be positive integers';
			}
			if (!optionalCount(entry.total) || !optionalCount(entry.count) || !optionalCount(entry.numMissing)) {
				return 'manifest counts must be safe non-negative integers';
			}
			if (!optionalString(entry.name, 200) || !optionalString(entry.roomGUID, 200)) return 'manifest text fields are too long';
		}
	}

	if (p.screenshotUrls !== undefined) {
		if (!Array.isArray(p.screenshotUrls) || p.screenshotUrls.length > MAX_SCREENSHOTS) return `at most ${MAX_SCREENSHOTS} screenshots are allowed`;
		if (!p.screenshotUrls.every((url) => typeof url === 'string' && isLocalUploadUrl(url))) {
			return 'screenshots must be local KwikShack upload URLs';
		}
	}

	if (p.placementData !== undefined && p.placementData !== null) {
		if (typeof p.placementData !== 'object' || Array.isArray(p.placementData)) return 'placementData must be an object or null';
		const placement = p.placementData as Record<string, unknown>;
		if (!Array.isArray(placement.items) || placement.items.length > MAX_MANIFEST_ENTRIES) return 'placementData.items is invalid or too large';
		if (!placement.items.every((item) => typeof item === 'object' && item !== null && !Array.isArray(item))) return 'placement items must be objects';
		if (placement.rooms !== undefined && (!Array.isArray(placement.rooms) || placement.rooms.length > 100)) return 'placementData.rooms is invalid or too large';
	}

	return null;
}

// Minimal validation — enough to reject garbage without being pedantic about
// a shape Blizzard may still reshape on the client.
export function isBuildManifest(v: unknown): v is BuildManifest {
	if (typeof v !== 'object' || v === null) return false;
	const m = v as Record<string, unknown>;
	if (typeof m.shareCode !== 'string' || m.shareCode.length === 0) return false;
	if (!Array.isArray(m.contentGroups) || m.contentGroups.length === 0) return false;
	return m.contentGroups.every((group) => {
		if (typeof group !== 'object' || group === null || Array.isArray(group)) return false;
		const entries = (group as Record<string, unknown>).entries;
		return Array.isArray(entries) && entries.every((entry) => typeof entry === 'object' && entry !== null && !Array.isArray(entry));
	}) && m.contentGroups.some((group) => {
		const entries = (group as Record<string, unknown>).entries;
		return Array.isArray(entries) && entries.length > 0;
	});
}

export function isSubmitPayload(v: unknown): v is SubmitBuildPayload {
	return validateSubmitPayload(v) === null;
}
