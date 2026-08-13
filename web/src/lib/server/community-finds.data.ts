import type { CommunityFindInput } from './community-finds';

/**
 * Manually curated external discoveries.
 *
 * Keep this server-only: permission state and curation notes are operational
 * metadata, not visitor-facing content. See docs/community-curation.md before
 * adding an entry.
 */
export const communityFindData: CommunityFindInput[] = [];
