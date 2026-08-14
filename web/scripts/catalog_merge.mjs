/** Parse the small RFC-4180 subset used by wago.tools DB2 exports. */
export function parseCsv(text) {
	const rows = [];
	let row = [];
	let field = '';
	let inQuotes = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQuotes) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += c;
			}
		} else if (c === '"') {
			inQuotes = true;
		} else if (c === ',') {
			row.push(field);
			field = '';
		} else if (c === '\n') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else if (c !== '\r') {
			field += c;
		}
	}
	if (field.length || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

/** Blizzard uses several inconsistent markers for internal decor rows. */
export function isInternalDecorName(name) {
	return (
		/[\[{]\s*DNT\s*[\]}]/i.test(name) ||
		/\bDO\s+NOT\s+USE\b/i.test(name) ||
		/\bDONT\s+USE\b/i.test(name) ||
		/\bDEPR[EI]CATED\b/i.test(name) ||
		/\[AUTOGEN\]/i.test(name) ||
		/^\s*TEST DECOR\s*$/i.test(name)
	);
}

function differs(row, info) {
	return (
		row.recordID !== info.recordID ||
		row.name !== info.name ||
		(info.icon !== null && String(row.icon ?? '') !== info.icon)
	);
}

/**
 * Merge current HouseDecor rows by stable itemID, preferring the live DB2 for
 * recordID, display name, and thumbnail. Explicit internal rows are removed;
 * seed-only rows are retained and reported instead of silently deleted.
 */
export function mergeHouseDecor(existingRows, csv) {
	const parsed = parseCsv(csv);
	const header = parsed[0] ?? [];
	const col = Object.fromEntries(header.map((name, index) => [name, index]));
	for (const required of ['Name_lang', 'ID', 'ItemID', 'ThumbnailFileDataID']) {
		if (col[required] === undefined) throw new Error(`HouseDecor CSV is missing ${required}`);
	}

	const liveByItemID = new Map();
	const internalItemIDs = new Set();
	let internalRows = 0;
	for (const row of parsed.slice(1)) {
		const name = (row[col.Name_lang] ?? '').trim();
		const itemID = Number.parseInt(row[col.ItemID], 10);
		if (!name || !Number.isSafeInteger(itemID) || itemID <= 0) continue;
		if (isInternalDecorName(name)) {
			internalRows++;
			internalItemIDs.add(itemID);
			continue;
		}
		internalItemIDs.delete(itemID);
		const recordID = Number.parseInt(row[col.ID], 10);
		if (!Number.isSafeInteger(recordID) || recordID <= 0) continue;
		const thumbnail = (row[col.ThumbnailFileDataID] ?? '').trim();
		liveByItemID.set(itemID, {
			recordID,
			name,
			icon: thumbnail && thumbnail !== '0' ? thumbnail : null
		});
	}

	const byItemID = new Map(existingRows.map((row) => [row.itemID, { ...row }]));
	let excludedExisting = 0;
	for (const itemID of internalItemIDs) {
		if (byItemID.delete(itemID)) excludedExisting++;
	}

	let added = 0;
	let updated = 0;
	let unchanged = 0;
	for (const [itemID, info] of liveByItemID) {
		const row = byItemID.get(itemID);
		if (!row) {
			byItemID.set(itemID, {
				itemID,
				recordID: info.recordID,
				name: info.name,
				icon: info.icon,
				category: null,
				source: null,
				expansion: null,
				tags: []
			});
			added++;
			continue;
		}
		if (differs(row, info)) updated++;
		else unchanged++;
		row.recordID = info.recordID;
		row.name = info.name;
		if (info.icon !== null) row.icon = info.icon;
	}

	const retainedUnverified = [...byItemID.values()]
		.filter((row) => !liveByItemID.has(row.itemID))
		.map((row) => ({ itemID: row.itemID, recordID: row.recordID ?? null, name: row.name }));

	return {
		rows: [...byItemID.values()].sort((a, b) => a.itemID - b.itemID),
		stats: {
			sourceRows: parsed.slice(1).filter((row) => row.length > 1).length,
			liveRows: liveByItemID.size,
			internalRows,
			added,
			updated,
			unchanged,
			excludedExisting,
			retainedUnverified
		}
	};
}
