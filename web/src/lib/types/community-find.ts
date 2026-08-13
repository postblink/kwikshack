/** Public, provenance-only Community Find data safe to send to visitors. */
export interface CommunityFind {
	id: string;
	title: string;
	creatorName: string;
	sourcePlatform: string;
	sourceUrl: string;
	attribution: string | null;
	discoveredAt: string;
	addedAt: string;
	featured: boolean;
	claimUrl: string | null;
	nativeBuildId: string | null;
}
