#!/usr/bin/env node
/**
 * KwikShack icon enricher
 * Fetches icon FileDataIDs from Wowhead's tooltip endpoint for every catalog
 * item, then writes scripts/seed/catalog.enriched.json.
 *
 * Resumable: items that already have an icon are skipped (run again to retry
 * failures). Polite: small concurrency, exponential backoff on errors.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED = join(__dirname, 'seed');
const IN = join(SEED, 'catalog.json');
const OUT = join(SEED, 'catalog.enriched.json');

const CONCURRENCY = 6;
const RETRIES = 3;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) KwikShackCatalog/0.1 (research)';

let rows = JSON.parse(readFileSync(IN, 'utf8'));

// Resume from previous enriched file if present
try {
	const prev = JSON.parse(readFileSync(OUT, 'utf8'));
	const byID = new Map(prev.map((r) => [r.itemID, r]));
	rows = rows.map((r) => byID.get(r.itemID) ?? r);
} catch {
	/* first run */
}

const queue = rows.filter((r) => !r.icon).map((r) => r.itemID);
console.log(`Items total: ${rows.length} | need icon: ${queue.length}`);

let done = 0;
let failed = 0;
const failures = [];

async function fetchIcon(itemID) {
	for (let attempt = 1; attempt <= RETRIES; attempt++) {
		try {
			const res = await fetch(`https://nether.wowhead.com/tooltip/item/${itemID}`, {
				headers: { 'user-agent': UA, accept: 'application/json' }
			});
			if (res.status === 404) return null; // not a real/retrievable item
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			return typeof data.icon === 'string' ? data.icon : null;
		} catch (err) {
			if (attempt === RETRIES) throw err;
			await new Promise((r) => setTimeout(r, 500 * attempt));
		}
	}
	return null;
}

async function worker() {
	while (queue.length) {
		const itemID = queue.shift();
		try {
			const icon = await fetchIcon(itemID);
			const row = rows.find((r) => r.itemID === itemID);
			if (row) row.icon = icon;
			if (icon) done++;
			else {
				failed++;
				failures.push(itemID);
			}
		} catch {
			failed++;
			failures.push(itemID);
		}
		// Progress checkpoint every 100 items so a crash loses little
		if ((done + failed) % 100 === 0) {
			writeFileSync(OUT, JSON.stringify(rows, null, 1));
			console.log(`  progress: ${done} icons, ${failed} failed (${done + failed}/${queue.length + done + failed})`);
		}
	}
}

const started = Date.now();
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
writeFileSync(OUT, JSON.stringify(rows, null, 1));

const secs = ((Date.now() - started) / 1000).toFixed(0);
console.log(`Done in ${secs}s — icons: ${done}, missing: ${failed}`);
if (failures.length) {
	console.log('Missing (sample):', failures.slice(0, 20).join(', '));
}
