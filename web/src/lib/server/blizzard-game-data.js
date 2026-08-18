// Blizzard Game Data API client (client-credentials flow).
//
// Plain JavaScript so the SvelteKit server bundle and the standalone sync CLI
// (`scripts/sync-decor.mjs`) run the SAME code — the pattern already used by the
// migration runner. Two implementations is how drift starts.
//
// Static game data ONLY. No user is involved, no profile endpoint is reachable
// from here, and no user token is ever accepted. Keeping this separate from
// auth/bnet.ts makes "canonical catalog data" and "authenticated player data"
// two code paths that cannot be confused for each other.
//
// Verified against Blizzard's documentation 2026-08-17:
//   POST https://oauth.battle.net/token          grant_type=client_credentials
//   GET  https://{region}.api.blizzard.com/data/wow/...?namespace=static-{region}
//
// Terms constraints respected here:
//   * 36,000 calls/hour ceiling — every run carries a hard request budget.
//   * "You May Not Data Mine Blizzard Products Or Services" — only documented
//     API endpoints are called; nothing scrapes a page.

/**
 * Host resolution. Mirrors `auth/bnet.ts`; `blizzard-game-data.test.ts` asserts
 * the two agree, so this duplication cannot silently drift.
 *
 * @param {string} region
 * @returns {string}
 */
export function gameDataOAuthHost(region) {
	return region === 'cn' ? 'https://oauth.battlenet.com.cn' : 'https://oauth.battle.net';
}

/**
 * @param {string} region
 * @returns {string}
 */
export function gameDataApiHost(region) {
	return region === 'cn' ? 'https://gateway.battlenet.com.cn' : `https://${region}.api.blizzard.com`;
}

export class GameDataError extends Error {
	/**
	 * @param {string} message
	 * @param {number} [status]
	 */
	constructor(message, status) {
		super(message);
		this.name = 'GameDataError';
		this.status = status;
	}
}

const DEFAULT_MAX_REQUESTS = 5000;
const DEFAULT_DELAY_MS = 60;

/** @param {number} ms */
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @typedef {{
 *   clientId: string,
 *   clientSecret: string,
 *   oauthRegion: string,
 *   apiRegion: string,
 *   locale?: string,
 *   fetchImpl?: typeof fetch,
 *   maxRequests?: number,
 *   delayMs?: number
 * }} GameDataClientOptions
 */

/**
 * Minimal client-credentials Game Data client.
 *
 * The token is held in memory for the life of the run and is never persisted or
 * logged. It is an application credential rather than user data, but the same
 * handling rule applies.
 */
export class GameDataClient {
	/** @param {GameDataClientOptions} options */
	constructor(options) {
		this.options = options;
		/** @type {string | null} */
		this.token = null;
		this.requests = 0;
		this.fetchImpl = options.fetchImpl ?? fetch;
		this.locale = options.locale ?? 'en_US';
		this.maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
		this.delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
	}

	/** @returns {Promise<string>} */
	async authorize() {
		if (this.token) return this.token;

		const body = new URLSearchParams({ grant_type: 'client_credentials' });
		const credentials = `${this.options.clientId}:${this.options.clientSecret}`;
		const authorization = `Basic ${Buffer.from(credentials).toString('base64')}`;

		let response;
		try {
			response = await this.fetchImpl(new URL('/token', gameDataOAuthHost(this.options.oauthRegion)).toString(), {
				method: 'POST',
				headers: { authorization, 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
				body
			});
		} catch {
			throw new GameDataError('Could not reach the Battle.net token endpoint');
		}
		if (!response.ok) throw new GameDataError('Client-credentials token request failed', response.status);

		const payload = await response.json().catch(() => null);
		const token = payload && payload.access_token;
		if (typeof token !== 'string' || !token) throw new GameDataError('Token response contained no access_token');
		this.token = token;
		return token;
	}

	/**
	 * GET a game-data path. Returns null on 404 — a missing document is a normal
	 * outcome, not a failure.
	 *
	 * @param {string} path
	 * @param {Record<string, string>} [params]
	 * @returns {Promise<unknown | null>}
	 */
	async get(path, params = {}) {
		if (this.requests >= this.maxRequests) {
			throw new GameDataError(`Request budget of ${this.maxRequests} exhausted`);
		}

		const token = await this.authorize();
		const url = new URL(path, gameDataApiHost(this.options.apiRegion));
		url.searchParams.set('namespace', `static-${this.options.apiRegion}`);
		url.searchParams.set('locale', this.locale);
		for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

		if (this.requests > 0 && this.delayMs > 0) await sleep(this.delayMs);
		this.requests += 1;

		const headers = { authorization: `Bearer ${token}`, accept: 'application/json' };
		let response;
		try {
			response = await this.fetchImpl(url.toString(), { headers });
		} catch {
			throw new GameDataError(`Could not reach ${path}`);
		}

		if (response.status === 404) return null;

		// A 401 mid-run means the token aged out. Re-authorize once, then give up.
		if (response.status === 401) {
			this.token = null;
			const retryToken = await this.authorize();
			const retry = await this.fetchImpl(url.toString(), {
				headers: { authorization: `Bearer ${retryToken}`, accept: 'application/json' }
			});
			if (retry.status === 404) return null;
			if (!retry.ok) throw new GameDataError(`Request to ${path} failed after re-authorizing`, retry.status);
			return retry.json();
		}

		if (!response.ok) throw new GameDataError(`Request to ${path} failed`, response.status);

		return response.json().catch(() => {
			throw new GameDataError(`Response from ${path} was not JSON`);
		});
	}
}
