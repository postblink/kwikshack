/**
 * Public shape of an indexed public blueprint.
 *
 * KwikShack recognises three content classes and keeps them apart:
 *
 *  1. Native build          — submitted directly by a creator, resolved manifest,
 *                             lives in `builds`.
 *  2. Indexed public blueprint — a blueprint code publicly and intentionally
 *                             shared elsewhere, indexed here with attribution
 *                             and source provenance. This type.
 *  3. Community Find        — an external build worth highlighting for which
 *                             KwikShack has no usable blueprint. Link only.
 *
 * Nothing on this type may carry internal review evidence. `internalNotes`,
 * `reviewerNote`, and `evidenceKinds` deliberately have no public counterpart.
 */

export type BlueprintResolutionState = 'unresolved' | 'resolved' | 'unavailable' | 'revoked';
export type BlueprintClaimState = 'unclaimed' | 'pending' | 'claimed';

/** One discovery source. A blueprint may have several; they never fork the listing. */
export interface IndexedBlueprintSourcePublic {
	platform: string;
	platformLabel: string;
	sourceUrl: string;
	attributedCreator: string;
	discoveredAt: string;
}

export interface IndexedBlueprintPublic {
	id: string;
	shareCode: string;
	/** Creator-authored title once claimed, otherwise KwikShack's curation title. */
	title: string;
	/** Present only when a claimed creator wrote one. Never source-site prose. */
	description: string | null;
	blueprintType: string;
	blueprintScope: string | null;
	faction: string | null;

	resolutionState: BlueprintResolutionState;
	resolutionCheckedAt: string | null;
	/** False whenever presenting the code as usable would be a lie. */
	copyable: boolean;

	/** Derived from a resolved manifest only — null while unresolved. */
	derived: { decorCount: number; roomCount: number; distinctDecorItems: number } | null;

	attributedCreator: string;
	attributedRealm: string | null;
	attributedCharacter: string | null;
	/** What the claimed creator asked to be called, when they set it. */
	preferredAttribution: string | null;

	claimState: BlueprintClaimState;
	/** Set only once a claim is approved. */
	claimedCreatorName: string | null;

	tags: string[];
	creatorLinks: string[];
	/** Only images the claimed creator uploaded here. Never source media. */
	screenshots: { url: string; caption: string }[];

	sources: IndexedBlueprintSourcePublic[];
	indexedAt: string;
	nativeBuildId: string | null;
}

export const RESOLUTION_LABELS: Record<BlueprintResolutionState, string> = {
	unresolved: 'Not yet checked by KwikShack',
	resolved: 'Blueprint verified by KwikShack',
	unavailable: 'Blueprint did not resolve',
	revoked: 'Sharing withdrawn'
};

export const RESOLUTION_BLURBS: Record<BlueprintResolutionState, string> = {
	unresolved:
		'This code was indexed from a public community share. KwikShack has not resolved it in-game yet, so the contents below come from the source, not from us.',
	resolved: 'KwikShack resolved this code through the in-game addon. The decor list below is our own reading of the blueprint.',
	unavailable: 'The last time KwikShack checked, this code did not resolve. Copying it would not work right now.',
	revoked: 'The creator or a takedown request withdrew this share. The listing stays for provenance; the code is no longer offered.'
};

/** Copying is only ever offered when it would not be a false promise. */
export function isCopyable(state: BlueprintResolutionState): boolean {
	return state === 'resolved' || state === 'unresolved';
}
