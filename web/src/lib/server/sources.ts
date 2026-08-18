/**
 * Source platform registry.
 *
 * Three questions are kept separate on purpose, because they have different
 * answers on every platform:
 *
 *   1. May a person manually inspect and discover content there?   `discovery`
 *   2. May KwikShack automate access to that source?                `automation`
 *   3. May KwikShack reproduce its media or prose?                  `media`
 *
 * Every platform below is `automation: 'manual'` today. That is a deliberate
 * default, not an oversight: an adapter may only be switched on after the
 * platform's *current* terms have been read and the specific access method
 * (official API, official embed, documented feed) has been confirmed to permit
 * it. The checklist for doing that lives in docs/community-curation.md.
 *
 * `media: 'no-reproduction'` everywhere reflects the product rule: a publicly
 * shared blueprint code may be indexed; the screenshots, prose, video, and
 * artwork around it may not be copied.
 */

export type SourceAutomation =
	/** A person adds the record through the admin import form. */
	| 'manual'
	/** An approved adapter may fetch, within the constraints recorded below. */
	| 'adapter';

export type SourceMediaPolicy =
	/** Link out only. No copying, proxying, rehosting, or hotlinking. */
	| 'no-reproduction'
	/** An official embed exists and may be used where appropriate. */
	| 'official-embed';

export interface SourcePlatform {
	id: string;
	label: string;
	/** Hostnames (and subdomain suffixes) that identify a canonical source URL. */
	hosts: string[];
	automation: SourceAutomation;
	media: SourceMediaPolicy;
	/** What an adapter would be permitted to collect, if one is ever enabled. */
	permittedFields: string[];
	notes: string;
}

export const SOURCE_PLATFORMS: SourcePlatform[] = [
	{
		id: 'blizzard-forums',
		label: 'World of Warcraft Forums',
		hosts: ['forums.blizzard.com'],
		automation: 'manual',
		media: 'no-reproduction',
		permittedFields: ['post url', 'poster name', 'thread title', 'creator-posted blueprint code', 'post date'],
		notes:
			'The Housing Blueprints category is where players post codes explicitly for others to import. Strongest signal of intentional sharing. Automation not enabled: Blizzard forum terms and any feed access have not been reviewed.'
	},
	{
		id: 'reddit',
		label: 'Reddit',
		hosts: ['reddit.com', 'redd.it'],
		automation: 'manual',
		media: 'no-reproduction',
		permittedFields: ['post url', 'author handle', 'post title', 'blueprint code in author-written text', 'post timestamp'],
		notes:
			'r/WoWHousing and similar. Reddit has an official API with its own registration and rate terms; those terms have NOT been reviewed for this use, so ingestion stays manual. Never scrape the HTML site.'
	},
	{
		id: 'wowhead',
		label: 'Wowhead',
		hosts: ['wowhead.com'],
		automation: 'manual',
		media: 'no-reproduction',
		permittedFields: ['gallery url', 'creator name shown on the entry'],
		notes: 'Manual discovery only. No permitted automated access has been confirmed.'
	},
	{
		id: 'wowdb',
		label: 'WoWDB Housing Hub',
		hosts: ['wowdb.com', 'housing.wowdb.com'],
		automation: 'manual',
		media: 'no-reproduction',
		permittedFields: ['listing url', 'creator name shown on the entry'],
		notes: 'Manual discovery only. No permitted automated access has been confirmed.'
	},
	{
		id: 'youtube',
		label: 'YouTube',
		hosts: ['youtube.com', 'youtu.be'],
		automation: 'manual',
		media: 'official-embed',
		permittedFields: ['video url', 'channel name', 'video title', 'blueprint code in the creator-written description'],
		notes:
			'YouTube provides an official embed player and a Data API. Neither is wired up. If an adapter is added, use the Data API for metadata and the official iframe for playback — never download or rehost the video or thumbnails.'
	},
	{
		id: 'twitch',
		label: 'Twitch',
		hosts: ['twitch.tv'],
		automation: 'manual',
		media: 'official-embed',
		permittedFields: ['channel/clip url', 'channel name'],
		notes: 'Official embed exists. No adapter enabled.'
	},
	{
		id: 'pinterest',
		label: 'Pinterest',
		hosts: ['pinterest.com', 'pin.it'],
		automation: 'manual',
		media: 'no-reproduction',
		permittedFields: ['pin url', 'pinner name'],
		notes:
			'A pin is frequently a repost rather than the original. Prefer the original creator source. Manual only — Pinterest terms restrict automated collection.'
	},
	{
		id: 'bluesky',
		label: 'Bluesky',
		hosts: ['bsky.app'],
		automation: 'manual',
		media: 'no-reproduction',
		permittedFields: ['post url', 'handle', 'blueprint code in author-written text'],
		notes: 'Manual only.'
	},
	{
		id: 'discord',
		label: 'Discord',
		hosts: ['discord.com', 'discord.gg'],
		automation: 'manual',
		media: 'no-reproduction',
		permittedFields: ['permalink to a public message', 'author handle'],
		notes:
			'Only public, linkable servers, and only where the creator clearly intended the code for wider use. Never index from a private or invite-gated channel.'
	},
	{
		id: 'other',
		label: 'Other community source',
		hosts: [],
		automation: 'manual',
		media: 'no-reproduction',
		permittedFields: ['canonical url', 'creator name'],
		notes: 'Catch-all for a reviewed source with no dedicated entry yet. Record the reasoning in the internal notes.'
	}
];

const BY_ID = new Map(SOURCE_PLATFORMS.map((platform) => [platform.id, platform]));

export function getSourcePlatform(id: string): SourcePlatform | null {
	return BY_ID.get(id) ?? null;
}

export function sourcePlatformLabel(id: string): string {
	return BY_ID.get(id)?.label ?? id;
}

/** True when the platform currently permits any automated ingestion at all. */
export function automationPermitted(id: string): boolean {
	return BY_ID.get(id)?.automation === 'adapter';
}

export interface SourceUrlCheck {
	ok: boolean;
	error?: string;
	/** The platform whose host list matched, when the URL is not 'other'. */
	matchedPlatform?: string;
}

function hostMatches(hostname: string, host: string): boolean {
	return hostname === host || hostname.endsWith(`.${host}`);
}

/**
 * Validate a canonical source URL and confirm it belongs to the declared
 * platform. HTTPS only — an http:// citation is not a durable canonical link,
 * and accepting arbitrary schemes here would be an open redirect surface on the
 * listing page.
 */
export function validateSourceUrl(rawUrl: string, platformId: string): SourceUrlCheck {
	const platform = getSourcePlatform(platformId);
	if (!platform) return { ok: false, error: `Unknown source platform "${platformId}"` };

	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return { ok: false, error: 'sourceUrl must be an absolute URL' };
	}
	if (url.protocol !== 'https:') return { ok: false, error: 'sourceUrl must use https' };
	if (url.username || url.password) return { ok: false, error: 'sourceUrl must not contain credentials' };
	if (rawUrl.length > 2048) return { ok: false, error: 'sourceUrl is too long' };

	// 'other' has no host list by design; every named platform must match, so a
	// Reddit link cannot be filed under Wowhead and inherit its policy.
	if (platform.hosts.length > 0) {
		const hostname = url.hostname.toLowerCase();
		if (!platform.hosts.some((host) => hostMatches(hostname, host))) {
			return { ok: false, error: `sourceUrl host "${url.hostname}" does not belong to ${platform.label}` };
		}
		return { ok: true, matchedPlatform: platform.id };
	}
	return { ok: true };
}

/**
 * The contract an ingestion adapter must satisfy before it can be enabled.
 * Intentionally narrow: an adapter returns *candidates for review*, never
 * published listings, and never media.
 */
export interface SourceAdapterCandidate {
	platform: string;
	sourceUrl: string;
	attributedCreator: string;
	/** Title as written by the creator — used as a review hint, not as listing copy. */
	sourceTitle: string | null;
	/** Codes found in creator-authored text only. */
	shareCodes: string[];
	sourceTimestamp: string | null;
}

export interface SourceAdapter {
	platform: string;
	/** Must name the specific permitted access method (e.g. "official Data API v3"). */
	accessMethod: string;
	discover(options: { limit: number }): Promise<SourceAdapterCandidate[]>;
}

/**
 * No adapters are registered. Enabling one requires: reading the platform's
 * current terms, recording the permitted access method here, flipping that
 * platform's `automation` to 'adapter', and keeping media policy untouched.
 */
export const SOURCE_ADAPTERS: SourceAdapter[] = [];
