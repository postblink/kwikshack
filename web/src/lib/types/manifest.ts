// Manifest types — the shared contract between the addon export and the web API.
// Mirrors docs/architecture.md and addon/BlueprintManifest.lua normaliser output.

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

// Minimal validation — enough to reject garbage without being pedantic about
// a shape Blizzard may still reshape on the client.
export function isBuildManifest(v: unknown): v is BuildManifest {
	if (typeof v !== 'object' || v === null) return false;
	const m = v as Record<string, unknown>;
	if (typeof m.shareCode !== 'string' || m.shareCode.length === 0) return false;
	if (!Array.isArray(m.contentGroups)) return false;
	return true;
}

export function isSubmitPayload(v: unknown): v is SubmitBuildPayload {
	if (typeof v !== 'object' || v === null) return false;
	const p = v as Record<string, unknown>;
	return typeof p.shareCode === 'string' && isBuildManifest(p.manifest);
}
