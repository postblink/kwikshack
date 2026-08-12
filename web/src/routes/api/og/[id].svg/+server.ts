import { error } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { buildSummary, getBuild } from '$lib/server/builds';
import { db } from '$lib/server/db';
import { screenshots } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;
const MAX_TITLE_CHARACTERS = 27;
const MAX_TITLE_LINES = 2;

function escapeXml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function titleLines(title: string): string[] {
	const words = title.trim().split(/\s+/).filter(Boolean);
	const lines: string[] = [];

	for (const word of words) {
		const current = lines.at(-1);
		if (!current) {
			lines.push(word);
		} else if (`${current} ${word}`.length <= MAX_TITLE_CHARACTERS) {
			lines[lines.length - 1] = `${current} ${word}`;
		} else if (lines.length < MAX_TITLE_LINES) {
			lines.push(word);
		} else {
			lines[lines.length - 1] = `${current} ${word}`;
		}
	}

	if (lines.length === 0) return ['Untitled build'];
	return lines.map((line) =>
		line.length > MAX_TITLE_CHARACTERS
			? `${line.slice(0, MAX_TITLE_CHARACTERS - 1).trimEnd()}…`
			: line
	);
}

function absoluteImageUrl(value: string | undefined, origin: string): string | null {
	if (!value) return null;
	try {
		const imageUrl = new URL(value, origin);
		return imageUrl.protocol === 'http:' || imageUrl.protocol === 'https:' ? imageUrl.href : null;
	} catch {
		return null;
	}
}

export const GET: RequestHandler = async ({ params, url }) => {
	const build = getBuild(params.id);
	if (!build) error(404, 'Build not found');

	const primaryScreenshot = db
		.select({ url: screenshots.url })
		.from(screenshots)
		.where(and(eq(screenshots.buildId, build.id), eq(screenshots.isPrimary, true)))
		.orderBy(asc(screenshots.sortOrder))
		.get();
	const backgroundUrl = absoluteImageUrl(primaryScreenshot?.url, url.origin);
	const { decorCount, roomCount } = buildSummary(build.manifest);
	const likeCount = 0;
	const lines = titleLines(build.title);
	const title = lines
		.map((line, index) => `<tspan x="76" dy="${index === 0 ? 0 : 82}">${escapeXml(line)}</tspan>`)
		.join('');
	const author = escapeXml(build.authorName ? `BY ${build.authorName}` : 'COMMUNITY BUILD');
	const blueprintType = escapeXml(`${build.blueprintType} blueprint`.toUpperCase());
	const background = backgroundUrl
		? `<image href="${escapeXml(backgroundUrl)}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" preserveAspectRatio="xMidYMid slice" />`
		: '';

	const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" role="img" aria-labelledby="title description">
	<title id="title">${escapeXml(build.title)} — KwikShack</title>
	<desc id="description">${blueprintType} with ${decorCount} decor, ${roomCount} rooms, and ${likeCount} likes.</desc>
	<defs>
		<linearGradient id="backdrop" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#26211a" />
			<stop offset="0.5" stop-color="#14110d" />
			<stop offset="1" stop-color="#0b0907" />
		</linearGradient>
		<linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
			<stop offset="0" stop-color="#14110d" stop-opacity="0.98" />
			<stop offset="0.62" stop-color="#14110d" stop-opacity="0.84" />
			<stop offset="1" stop-color="#14110d" stop-opacity="0.48" />
		</linearGradient>
		<linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
			<stop offset="0" stop-color="#c8a144" />
			<stop offset="0.5" stop-color="#e8c873" />
			<stop offset="1" stop-color="#8a743f" />
		</linearGradient>
		<radialGradient id="glow" cx="0.15" cy="0.1" r="0.82">
			<stop offset="0" stop-color="#c8a144" stop-opacity="0.2" />
			<stop offset="1" stop-color="#c8a144" stop-opacity="0" />
		</radialGradient>
		<pattern id="grain" width="28" height="28" patternUnits="userSpaceOnUse">
			<path d="M0 28L28 0M-7 7L7-7M21 35L35 21" stroke="#e8c873" stroke-opacity="0.025" stroke-width="1" />
		</pattern>
	</defs>
	<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#backdrop)" />
	${background}
	<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#shade)" />
	<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#glow)" />
	<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#grain)" />
	<rect x="24" y="24" width="1152" height="582" rx="10" fill="none" stroke="#8a743f" stroke-width="2" />
	<rect x="34" y="34" width="1132" height="562" rx="7" fill="none" stroke="#c8a144" stroke-opacity="0.22" />
	<g font-family="Cinzel, Georgia, serif">
		<text x="76" y="100" fill="#e8c873" font-size="34" font-weight="700" letter-spacing="2">KWIKSHACK</text>
		<path d="M77 120H298" stroke="url(#gold)" stroke-width="3" />
		<text x="76" y="196" fill="#c8a144" font-size="21" font-weight="700" letter-spacing="4">${blueprintType}</text>
		<text x="76" y="286" fill="#efe6d2" font-size="68" font-weight="600">${title}</text>
	</g>
	<text x="78" y="474" fill="#a89d88" font-family="system-ui, sans-serif" font-size="20" font-weight="700" letter-spacing="2">${author}</text>
	<g transform="translate(76 520)" font-family="system-ui, sans-serif" font-size="22" font-weight="700">
		<rect width="250" height="58" rx="8" fill="#1d1914" fill-opacity="0.92" stroke="#3b3327" />
		<text x="24" y="37" fill="#e8c873">${decorCount}</text>
		<text x="70" y="37" fill="#efe6d2">DECOR</text>
		<rect x="268" width="250" height="58" rx="8" fill="#1d1914" fill-opacity="0.92" stroke="#3b3327" />
		<text x="292" y="37" fill="#e8c873">${roomCount}</text>
		<text x="338" y="37" fill="#efe6d2">ROOMS</text>
		<rect x="536" width="250" height="58" rx="8" fill="#1d1914" fill-opacity="0.92" stroke="#3b3327" />
		<text x="560" y="37" fill="#e8c873">${likeCount}</text>
		<text x="606" y="37" fill="#efe6d2">LIKES</text>
	</g>
</svg>`;

	return new Response(svg, {
		headers: {
			'content-type': 'image/svg+xml; charset=utf-8',
			'cache-control': 'public, max-age=300, s-maxage=3600',
			'x-content-type-options': 'nosniff'
		}
	});
};
