import { describe, expect, it } from 'vitest';
import { pluralize } from './pluralize';

describe('pluralize', () => {
	it('uses the singular form only for one', () => {
		expect(pluralize(1, 'room')).toBe('room');
		expect(pluralize(0, 'room')).toBe('rooms');
		expect(pluralize(2, 'room')).toBe('rooms');
	});

	it('supports irregular plural forms', () => {
		expect(pluralize(1, 'decor item', 'decor items')).toBe('decor item');
		expect(pluralize(3, 'decor item', 'decor items')).toBe('decor items');
	});
});
