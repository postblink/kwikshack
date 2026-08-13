import { communityFindData } from './community-finds.data';
import type { CommunityFind } from '$lib/types/community-find';

export type { CommunityFind } from '$lib/types/community-find';

export type CommunityFindPermission = 'unknown' | 'pending' | 'granted' | 'denied' | 'external-link-only';
export type CommunityFindPublication = 'draft' | 'published' | 'archived';

export interface CommunityFindInput {
	id: string;
	title: string;
	creatorName: string;
	sourcePlatform: string;
	sourceUrl: string;
	attribution?: string;
	permission: CommunityFindPermission;
	publication: CommunityFindPublication;
	discoveredAt: string;
	addedAt: string;
	featured?: boolean;
	claimUrl?: string;
	nativeBuildId?: string;
	curationNotes?: string;
}

function isWebUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === 'https:' || url.protocol === 'http:';
	} catch {
		return false;
	}
}

function isClaimUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:';
	} catch {
		return false;
	}
}

function isDate(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateCommunityFind(input: CommunityFindInput): string[] {
	const errors: string[] = [];
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.id)) errors.push('id must be a lowercase URL slug');
	if (!input.title.trim()) errors.push('title is required');
	if (!input.creatorName.trim()) errors.push('creatorName is required');
	if (!input.sourcePlatform.trim()) errors.push('sourcePlatform is required');
	if (!isWebUrl(input.sourceUrl)) errors.push('sourceUrl must be an absolute HTTP(S) URL');
	if (!isDate(input.discoveredAt)) errors.push('discoveredAt must be YYYY-MM-DD');
	if (!isDate(input.addedAt)) errors.push('addedAt must be YYYY-MM-DD');
	if (input.claimUrl && !isClaimUrl(input.claimUrl)) errors.push('claimUrl must be HTTP(S) or mailto');
	if (input.publication === 'published' && !['granted', 'external-link-only'].includes(input.permission)) {
		errors.push('published finds require granted or external-link-only permission');
	}
	if (input.permission === 'denied' && input.publication === 'published') errors.push('denied finds cannot be published');
	if (input.featured && input.publication !== 'published') errors.push('only published finds can be featured');
	return errors;
}

export function validateCommunityFindRegistry(inputs: CommunityFindInput[]): string[] {
	const seen = new Set<string>();
	const errors: string[] = [];
	for (const input of inputs) {
		if (seen.has(input.id)) errors.push(`${input.id}: duplicate id`);
		seen.add(input.id);
		for (const error of validateCommunityFind(input)) errors.push(`${input.id || '(missing id)'}: ${error}`);
	}
	return errors;
}

export function toPublicCommunityFind(input: CommunityFindInput): CommunityFind {
	return {
		id: input.id,
		title: input.title.trim(),
		creatorName: input.creatorName.trim(),
		sourcePlatform: input.sourcePlatform.trim(),
		sourceUrl: input.sourceUrl,
		attribution: input.attribution?.trim() || null,
		discoveredAt: input.discoveredAt,
		addedAt: input.addedAt,
		featured: input.featured === true,
		claimUrl: input.claimUrl ?? null,
		nativeBuildId: input.nativeBuildId ?? null
	};
}

const registryErrors = validateCommunityFindRegistry(communityFindData);
if (registryErrors.length) throw new Error(`Invalid Community Find registry:\n${registryErrors.join('\n')}`);

const publishedFinds = communityFindData
	.filter((find) => find.publication === 'published')
	.map(toPublicCommunityFind)
	.sort((a, b) => Number(b.featured) - Number(a.featured) || b.addedAt.localeCompare(a.addedAt));

export function listCommunityFinds(options: { limit?: number } = {}): CommunityFind[] {
	const limit = Math.max(0, options.limit ?? publishedFinds.length);
	return publishedFinds.slice(0, limit);
}

export function getCommunityFind(id: string): CommunityFind | null {
	return publishedFinds.find((find) => find.id === id) ?? null;
}
