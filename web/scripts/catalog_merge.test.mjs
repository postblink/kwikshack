import { describe, expect, it } from 'vitest';
import { isInternalDecorName, mergeHouseDecor, parseCsv } from './catalog_merge.mjs';

const header =
	'Name_lang,ID,ItemID,ThumbnailFileDataID\n';

describe('HouseDecor catalog merge', () => {
	it('parses quoted DB2 names', () => {
		expect(parseCsv(`${header}"Shelf, Wide",10,100,900\n`)[1]).toEqual(['Shelf, Wide', '10', '100', '900']);
	});

	it.each([
		'[DNT] Test Chair',
		'{DNT] Test Chair',
		'Chair - DO NOT USE',
		'Chair DEPRECATED DONT USE',
		'[DNT] [AUTOGEN] chair.m2',
		'Test Decor'
	])('recognizes internal marker: %s', (name) => {
		expect(isInternalDecorName(name)).toBe(true);
	});

	it('updates live metadata, adds new rows, removes explicit internals, and retains absent rows as uncertain', () => {
		const existing = [
			{ itemID: 100, recordID: 1, name: 'Old Name', icon: '800', category: 'table', source: null, expansion: null, tags: [] },
			{ itemID: 200, recordID: 2, name: 'Old Internal', icon: '801', category: null, source: null, expansion: null, tags: [] },
			{ itemID: 300, recordID: null, name: 'Seed Only', icon: null, category: null, source: null, expansion: null, tags: [] }
		];
		const csv = `${header}"New Name",1,100,900\n"[DNT] Old Internal - DO NOT USE",2,200,901\n"Brand New",4,400,902\n`;
		const result = mergeHouseDecor(existing, csv);

		expect(result.rows.map((row) => row.itemID)).toEqual([100, 300, 400]);
		expect(result.rows[0]).toMatchObject({ recordID: 1, name: 'New Name', icon: '900', category: 'table' });
		expect(result.stats).toMatchObject({
			liveRows: 2,
			internalRows: 1,
			added: 1,
			updated: 1,
			unchanged: 0,
			excludedExisting: 1,
			retainedUnverified: [{ itemID: 300, recordID: null, name: 'Seed Only' }]
		});
	});
});
