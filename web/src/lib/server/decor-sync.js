// Canonical decor parsing and persistence.
//
// Plain JavaScript, taking a raw better-sqlite3 handle, so the sync CLI and the
// application share one implementation of the identifier-mapping rules. Those
// rules are the whole point of this work; having two copies of them would
// reintroduce exactly the "unverified pairs become truth" problem being fixed.
//
// The read side lives in `decor-canonical.ts` and uses Drizzle.
//
// ---------------------------------------------------------------------------
// THE IDENTIFIER PROBLEM
//
// Blizzard's `{decorId}`, a manifest `recordID`, and an `itemID` are three
// different identifier spaces. Nothing here assumes any two are equal. The
// portal's own example decorId is 80 while KwikShack manifests carry recordIDs
// in the thousands — suggestive, not evidence.
//
// Every link is stored with the evidence that produced it:
//
//   blizzard_item_reference (100)  the canonical payload named this itemID
//   blizzard_decor_id        (90)  observed id == canonical decor_id AND the
//                                  names agree (a coincidence guard)
//   name_exact               (50)  exact name match against KwikShack's catalog
//   manual                   (40)  an operator asserted it
//
// Stronger evidence overwrites weaker; the reverse never happens. Nothing is
// learned from user submissions.
// ---------------------------------------------------------------------------

export const DECOR_MAP_CONFIDENCE = {
	blizzardItemReference: 100,
	blizzardDecorId: 90,
	nameExact: 50,
	manual: 40
};

/**
 * Blizzard localized strings arrive either as a plain string or a locale map.
 *
 * @param {unknown} value
 * @param {string} locale
 * @returns {string | null}
 */
export function readLocalizedName(value, locale) {
	if (typeof value === 'string') return value || null;
	if (typeof value === 'object' && value !== null) {
		const record = /** @type {Record<string, unknown>} */ (value);
		// Only locale-shaped keys count. Scavenging any string here would happily
		// read `{ type: "CRAFTED", name: {...} }` as the name "CRAFTED".
		const fallback = Object.entries(record).find(
			([key, entry]) => /^[a-z]{2}_[A-Z]{2}$/.test(key) && typeof entry === 'string' && entry
		);
		const candidate = record[locale] ?? record.en_US ?? (fallback ? fallback[1] : undefined);
		return typeof candidate === 'string' && candidate ? candidate : null;
	}
	return null;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function readNumber(value) {
	return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown> | null}
 */
function asRecord(value) {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? /** @type {Record<string, unknown>} */ (value)
		: null;
}

/**
 * @typedef {{
 *   decorId: number,
 *   name: string,
 *   category: string | null,
 *   source: string | null,
 *   itemId: number | null,
 *   mediaId: number | null,
 *   mediaUrl: string | null,
 *   raw: Record<string, unknown>
 * }} CanonicalDecorRecord
 */

/**
 * Parse a decor detail payload defensively.
 *
 * The response shape is not published on the Developer Portal and could not be
 * observed without API credentials, so this reads the field names Blizzard's
 * game-data documents use conventionally and preserves anything else in `raw`.
 * An unrecognised field is never a reason to drop a record.
 *
 * @param {unknown} payload
 * @param {string} [locale]
 * @returns {CanonicalDecorRecord | null}
 */
export function parseDecorDetail(payload, locale = 'en_US') {
	const record = asRecord(payload);
	if (!record) return null;

	const decorId = readNumber(record.id);
	if (decorId === null) return null;

	const name = readLocalizedName(record.name, locale);
	if (!name) return null;

	const categoryRecord = asRecord(record.category);
	const category =
		readLocalizedName(record.category, locale) ??
		(categoryRecord ? readLocalizedName(categoryRecord.name, locale) : null) ??
		readLocalizedName(record.type, locale);

	const sourceRecord = asRecord(record.source);
	const source =
		readLocalizedName(record.source, locale) ?? (sourceRecord ? readLocalizedName(sourceRecord.name, locale) : null);

	// The item reference is the valuable field: Blizzard stating the itemID for
	// this decor is the authoritative bridge KwikShack has been inferring.
	const itemRecord = asRecord(record.item);
	const itemId = readNumber(record.item) ?? (itemRecord ? readNumber(itemRecord.id) : null);

	const mediaRecord = asRecord(record.media);
	const mediaId = readNumber(record.media) ?? (mediaRecord ? readNumber(mediaRecord.id) : null);
	const mediaKey = mediaRecord ? asRecord(mediaRecord.key) : null;
	const mediaHref = mediaKey && typeof mediaKey.href === 'string' ? mediaKey.href : null;

	// Keep only scalar leftovers — a full nested dump would bloat every row.
	const known = new Set(['id', 'name', 'category', 'source', 'item', 'media', 'type', '_links']);
	/** @type {Record<string, unknown>} */
	const raw = {};
	for (const [key, value] of Object.entries(record)) {
		if (known.has(key)) continue;
		if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') raw[key] = value;
	}

	return { decorId, name, category, source, itemId, mediaId, mediaUrl: mediaHref, raw };
}

/**
 * Read an index or search response into `{ id, name }` entries.
 * Index documents list entries directly; search documents wrap them in `data`.
 *
 * @param {unknown} payload
 * @returns {{ id: number, name: string | null }[]}
 */
export function parseDecorIndex(payload) {
	const record = asRecord(payload);
	if (!record) return [];

	const entries = record.decor ?? record.decors ?? record.entries ?? record.results;
	if (!Array.isArray(entries)) return [];

	/** @type {{ id: number, name: string | null }[]} */
	const out = [];
	const seen = new Set();
	for (const entry of entries) {
		const item = asRecord(entry);
		if (!item) continue;
		const inner = asRecord(item.data) ?? item;
		const id = readNumber(inner.id);
		if (id === null || seen.has(id)) continue;
		seen.add(id);
		out.push({ id, name: readLocalizedName(inner.name, 'en_US') });
	}
	return out;
}

/**
 * Record an identifier link, but only when it is at least as strong as what is
 * already stored.
 *
 * @param {import('better-sqlite3').Database} sqlite
 * @param {{ region: string, observedKind: 'item' | 'record', observedId: number,
 *           decorId: number, evidence: string, confidence: number, nowSeconds: number }} options
 * @returns {boolean} true when the map changed
 */
export function linkIdentifier(sqlite, options) {
	const id = `${options.region}:${options.observedKind}:${options.observedId}`;
	const existing = /** @type {{ decor_id: number, confidence: number } | undefined} */ (
		sqlite.prepare('SELECT decor_id, confidence FROM decor_identifier_map WHERE id = ?').get(id)
	);

	if (existing) {
		// Weaker evidence must never overwrite stronger evidence.
		if (existing.confidence > options.confidence) return false;
		if (existing.confidence === options.confidence && existing.decor_id === options.decorId) return false;
		sqlite
			.prepare('UPDATE decor_identifier_map SET decor_id = ?, evidence = ?, confidence = ?, updated_at = ? WHERE id = ?')
			.run(options.decorId, options.evidence, options.confidence, options.nowSeconds, id);
		return true;
	}

	sqlite
		.prepare(
			`INSERT INTO decor_identifier_map
			 (id, observed_kind, observed_id, decor_id, region, evidence, confidence, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			id,
			options.observedKind,
			options.observedId,
			options.decorId,
			options.region,
			options.evidence,
			options.confidence,
			options.nowSeconds,
			options.nowSeconds
		);
	return true;
}

/**
 * Persist canonical rows and derive the identifier links they justify.
 *
 * Idempotent: re-running with the same payload rewrites identical values and
 * changes no mapping, because an equal-confidence link to the same decor is
 * skipped.
 *
 * @param {import('better-sqlite3').Database} sqlite
 * @param {CanonicalDecorRecord[]} records
 * @param {{ region: string, locale: string, nowSeconds?: number }} options
 * @returns {{ written: number, mapped: number }}
 */
export function upsertCanonicalDecor(sqlite, records, options) {
	const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);

	// Name lookup for the weakest evidence tier, taken from KwikShack's own
	// catalog — never from anything a user submitted.
	/** @type {Map<string, { itemID: number, recordID: number | null }>} */
	const legacyByName = new Map();
	const legacyRows = /** @type {{ item_id: number, record_id: number | null, name: string }[]} */ (
		sqlite.prepare('SELECT item_id, record_id, name FROM decor_items').all()
	);
	for (const row of legacyRows) {
		const key = String(row.name || '').trim().toLowerCase();
		if (key && !legacyByName.has(key)) legacyByName.set(key, { itemID: row.item_id, recordID: row.record_id });
	}

	const insert = sqlite.prepare(
		`INSERT INTO canonical_decor
		 (decor_id, region, locale, name, category, source, item_id, media_id, media_url, raw, synced_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT (region, locale, decor_id) DO UPDATE SET
		   name = excluded.name, category = excluded.category, source = excluded.source,
		   item_id = excluded.item_id, media_id = excluded.media_id, media_url = excluded.media_url,
		   raw = excluded.raw, synced_at = excluded.synced_at`
	);

	let written = 0;
	let mapped = 0;

	sqlite.transaction(() => {
		for (const record of records) {
			insert.run(
				record.decorId,
				options.region,
				options.locale,
				record.name,
				record.category,
				record.source,
				record.itemId,
				record.mediaId,
				record.mediaUrl,
				JSON.stringify(record.raw ?? {}),
				nowSeconds
			);
			written += 1;
		}

		for (const record of records) {
			if (record.itemId !== null && record.itemId !== undefined) {
				// Blizzard named the itemID for this decor. Strongest possible link.
				const changed = linkIdentifier(sqlite, {
					region: options.region,
					observedKind: 'item',
					observedId: record.itemId,
					decorId: record.decorId,
					evidence: 'blizzard_item_reference',
					confidence: DECOR_MAP_CONFIDENCE.blizzardItemReference,
					nowSeconds
				});
				if (changed) mapped += 1;
			}

			const legacy = legacyByName.get(record.name.trim().toLowerCase());
			if (!legacy) continue;

			if (legacy.recordID !== null && legacy.recordID !== undefined) {
				// An equal id AND an equal name is decent evidence the identifier
				// spaces coincide for this row. Either signal alone would not be.
				const sameId = legacy.recordID === record.decorId;
				const changed = linkIdentifier(sqlite, {
					region: options.region,
					observedKind: 'record',
					observedId: legacy.recordID,
					decorId: record.decorId,
					evidence: sameId ? 'blizzard_decor_id' : 'name_exact',
					confidence: sameId ? DECOR_MAP_CONFIDENCE.blizzardDecorId : DECOR_MAP_CONFIDENCE.nameExact,
					nowSeconds
				});
				if (changed) mapped += 1;
			}

			if (record.itemId === null || record.itemId === undefined) {
				const changed = linkIdentifier(sqlite, {
					region: options.region,
					observedKind: 'item',
					observedId: legacy.itemID,
					decorId: record.decorId,
					evidence: 'name_exact',
					confidence: DECOR_MAP_CONFIDENCE.nameExact,
					nowSeconds
				});
				if (changed) mapped += 1;
			}
		}
	})();

	return { written, mapped };
}

/**
 * @param {import('better-sqlite3').Database} sqlite
 * @param {{ region: string, locale: string, status: string, error?: string,
 *           seen: number, written: number, startedAtSeconds: number, completedAtSeconds?: number | null }} options
 */
export function recordSyncState(sqlite, options) {
	const id = `decor:${options.region}:${options.locale}`;
	sqlite
		.prepare(
			`INSERT INTO decor_sync_state
			 (id, region, locale, last_started_at, last_completed_at, last_status, last_error, entries_seen, entries_written)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT (id) DO UPDATE SET
			   last_started_at = excluded.last_started_at, last_completed_at = excluded.last_completed_at,
			   last_status = excluded.last_status, last_error = excluded.last_error,
			   entries_seen = excluded.entries_seen, entries_written = excluded.entries_written`
		)
		.run(
			id,
			options.region,
			options.locale,
			options.startedAtSeconds,
			options.completedAtSeconds ?? null,
			options.status,
			(options.error ?? '').slice(0, 500),
			options.seen,
			options.written
		);
}
