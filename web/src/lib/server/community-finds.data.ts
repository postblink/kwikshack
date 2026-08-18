import type { CommunityFindInput } from './community-finds';

/**
 * Manually curated external discoveries.
 *
 * Keep this server-only: permission state and curation notes are operational
 * metadata, not visitor-facing content. See docs/community-curation.md before
 * adding an entry.
 */
export const communityFindData: CommunityFindInput[] = [
	{
		id: 'tiny-kitchen',
		title: 'Tiny Kitchen',
		creatorName: 'ThalesKen',
		curationBlurb: 'A remarkably complete kitchen packed into a tiny space, with clever custom-built appliances, storage, and detailing.',
		tags: ['Room', 'Kitchen', 'Earthen', 'Compact', 'Custom Decor'],
		sourcePlatform: 'Wowhead',
		sourceUrl: 'https://www.wowhead.com/housing-builds/tiny-kitchen-197',
		permission: 'external-link-only',
		publication: 'published',
		discoveredAt: '2026-08-14',
		addedAt: '2026-08-14',
		featured: true,
		claimUrl: '/submit?from=community-find&find=tiny-kitchen',
		curationNotes: 'Creator verified from rendered Wowhead build metadata on 2026-08-14. External link only; no media or blueprint copied.'
	},
	{
		id: 'a-blood-elf-mansion',
		title: 'A Blood Elf mansion',
		creatorName: 'GreatAndPowerful',
		curationBlurb: 'A grand Blood Elf mansion built around dramatic vertical spaces, sweeping stairs, rich interiors, and an especially impressive library.',
		tags: ['Full House', 'Blood Elf', 'Elven', 'Elegant', 'Horde', 'Lavish'],
		sourcePlatform: 'Wowhead',
		sourceUrl: 'https://www.wowhead.com/housing-builds/a-blood-elf-mansion-144',
		permission: 'external-link-only',
		publication: 'published',
		discoveredAt: '2026-08-14',
		addedAt: '2026-08-14',
		claimUrl: '/submit?from=community-find&find=a-blood-elf-mansion',
		curationNotes: 'Creator GreatAndPowerful independently verified from rendered Wowhead build metadata on 2026-08-14. External link only; no media or blueprint copied.'
	},
	{
		id: 'witchy-cottage',
		title: '☾ Witchy Cottage ⋆',
		creatorName: 'aneyiah',
		curationBlurb: 'A tiny Night Elf cottage overflowing with cozy, witchy character and storybook atmosphere.',
		tags: ['Cottage', 'Night Elf', 'Nature', 'Cozy', 'Magical', 'Spooky'],
		sourcePlatform: 'Wowhead',
		sourceUrl: 'https://www.wowhead.com/housing-builds/witchy-cottage-403',
		permission: 'external-link-only',
		publication: 'published',
		discoveredAt: '2026-08-14',
		addedAt: '2026-08-14',
		claimUrl: '/submit?from=community-find&find=witchy-cottage',
		curationNotes: 'Creator verified from rendered Wowhead build metadata on 2026-08-14. External link only; no media or blueprint copied.'
	},
	{
		id: 'the-peon-pub',
		title: 'The Peon Pub',
		creatorName: 'Tyrathor',
		curationBlurb: 'An Orc-inspired kitchen that grew into a full pub, complete with bar spaces, games, and plenty of Horde personality.',
		tags: ['Full House', 'Orcish', 'Horde', 'Tavern', 'Rustic', 'Cozy'],
		sourcePlatform: 'Wowhead',
		sourceUrl: 'https://www.wowhead.com/housing-builds/the-peon-pub-182',
		permission: 'external-link-only',
		publication: 'published',
		discoveredAt: '2026-08-14',
		addedAt: '2026-08-14',
		claimUrl: '/submit?from=community-find&find=the-peon-pub',
		curationNotes: 'Creator verified from rendered Wowhead build metadata on 2026-08-14. External link only; no media or blueprint copied.'
	},
	{
		id: 'cozy-bedroom-with-reading-nook',
		title: 'Cozy Bedroom with Reading Nook',
		creatorName: 'Tripts',
		curationBlurb: 'A warm bedroom and reading retreat with particularly clever custom windows and an inviting use of space.',
		tags: ['Room', 'Bedroom', 'Reading Nook', 'Cozy', 'Custom Decor'],
		sourcePlatform: 'Wowhead',
		sourceUrl: 'https://www.wowhead.com/housing-builds/cozy-bedroom-with-reading-nook-280',
		attribution: 'Original concept credited by Tripts to Triceraflops8.',
		permission: 'external-link-only',
		publication: 'published',
		discoveredAt: '2026-08-14',
		addedAt: '2026-08-14',
		claimUrl: '/submit?from=community-find&find=cozy-bedroom-with-reading-nook',
		curationNotes: 'Uploader Tripts and the concept credit to Triceraflops8 were verified from rendered Wowhead build metadata on 2026-08-14. External link only; no media or blueprint copied.'
	}
];
