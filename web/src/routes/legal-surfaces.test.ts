import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guard on legally-required copy.
 *
 * Blizzard's Developer API Terms of Use require attribution and a privacy
 * policy. Both are ordinary Svelte pages, so nothing else would notice if the
 * text were reworded away or a route deleted during a redesign. These assertions
 * are deliberately about *obligations*, not wording — they check the required
 * facts are stated, not that a particular sentence survives.
 */
const routes = resolve(dirname(fileURLToPath(import.meta.url)));

function source(path: string): string {
	return readFileSync(resolve(routes, path), 'utf8');
}

describe('Blizzard attribution', () => {
	const layout = source('+layout.svelte');

	it('names Blizzard as the source of the data site-wide', () => {
		// "You shall clearly and conspicuously identify Blizzard in Your
		// Application as the source of the Data."
		expect(layout).toMatch(/Blizzard/);
		expect(layout).toMatch(/provided by Blizzard's APIs/i);
	});

	it('disclaims endorsement and affiliation', () => {
		// "...in such a way which makes it not appear that Blizzard is endorsing
		// or affiliated with Your Application."
		expect(layout).toMatch(/not affiliated with or endorsed by Blizzard/i);
	});

	it('carries the trademark notice', () => {
		expect(layout).toMatch(/trademarks of Blizzard Entertainment/i);
	});

	it('reaches the legal and privacy pages from every page', () => {
		expect(layout).toContain('href="/privacy"');
		expect(layout).toContain('href="/legal"');
	});

	it('keeps the notice in the footer, not inside content cards', () => {
		const footerIndex = layout.indexOf('<footer');
		const attributionIndex = layout.indexOf('not affiliated with or endorsed by Blizzard');
		expect(footerIndex).toBeGreaterThan(-1);
		expect(attributionIndex).toBeGreaterThan(footerIndex);
	});
});

describe('privacy page', () => {
	const privacy = source('privacy/+page.svelte');

	it('exists and is titled', () => {
		expect(privacy).toMatch(/<title>Privacy/);
	});

	it('states the 30-day Blizzard retention rule', () => {
		expect(privacy).toMatch(/30 days/);
	});

	it('states that no Blizzard password is collected', () => {
		// "You shall not collect, store or otherwise intercept a player's
		// Blizzard password."
		expect(privacy).toMatch(/password/i);
		expect(privacy).toMatch(/never see or store your Battle\.net password|do not see your password/i);
	});

	it('explains that tokens are not stored, and the re-auth consequence', () => {
		expect(privacy).toMatch(/do not keep the access token|don't store Battle\.net access tokens/i);
		expect(privacy).toMatch(/signing in again|sign in again/i);
	});

	it('covers each thing the application actually stores', () => {
		for (const topic of [
			/BattleTag/i,
			/character/i,
			/session cookie/i,
			/claim/i,
			/screenshot/i,
			/blueprint code/i,
			/rate/i
		]) {
			expect(privacy).toMatch(topic);
		}
	});

	it('gives a real removal route and a contact address', () => {
		expect(privacy).toMatch(/Delete my account/i);
		expect(privacy).toMatch(/mailto:/);
	});

	it("points at Blizzard's own privacy control", () => {
		expect(privacy).toMatch(/Game Data and Profile Privacy/i);
	});
});

describe('legal page', () => {
	const legal = source('legal/+page.svelte');

	it('repeats the attribution and non-affiliation in full', () => {
		expect(legal).toMatch(/trademarks or registered trademarks of Blizzard Entertainment/i);
		expect(legal).toMatch(/not affiliated with, endorsed by, or sponsored by Blizzard/i);
	});

	it('states the "as is" basis the Terms require', () => {
		expect(legal).toMatch(/as is/i);
	});

	it('states the monetization and scraping positions accurately', () => {
		expect(legal).toMatch(/do not sell, license, or pass Blizzard's data/i);
		expect(legal).toMatch(/advertising/i);
		expect(legal).toMatch(/do not scrape or data-mine/i);
	});
});
