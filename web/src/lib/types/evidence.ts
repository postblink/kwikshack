/**
 * Supporting signals recorded on a claim request.
 *
 * These are inputs to a human review decision. None of them approves anything,
 * and they are deliberately ordered by how much weight they deserve:
 *
 *   characterOwnership / characterMatchesAttribution
 *       Backed by Blizzard's authorized profile API — the account really does
 *       control that character.
 *   claimantEvidenceUrl
 *       Whatever the claimant supplied. Worth exactly as much as a reviewer's
 *       own check of that link.
 *   displayNameSimilarity
 *       Two strings look alike. Anyone can pick a name. Never sufficient alone.
 *
 * Shared between the server (which records them) and the review UI (which
 * labels them), so the two cannot describe the same signal differently.
 */
export const EVIDENCE_KINDS = {
	characterOwnership: 'battlenet_character_ownership',
	characterMatchesAttribution: 'character_matches_source_attribution',
	displayNameSimilarity: 'display_name_similarity',
	claimantEvidenceUrl: 'claimant_supplied_evidence_url'
} as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[keyof typeof EVIDENCE_KINDS];
