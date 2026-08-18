# Battle.net identity

What KwikShack can and cannot learn from Blizzard, and how sign-in is wired.

Everything in the "API findings" section was verified against Blizzard's current
official documentation and live discovery documents on **2026-08-17**. Where a
Blizzard document contradicts itself, that is called out rather than smoothed
over.

## API findings

### OAuth endpoints

| Purpose | US / EU / APAC | CN |
|---|---|---|
| Authorize | `https://oauth.battle.net/authorize` | `https://oauth.battlenet.com.cn/authorize` |
| Token | `https://oauth.battle.net/token` | `https://oauth.battlenet.com.cn/token` |
| User info | `https://oauth.battle.net/userinfo` | (same CN host) |
| Token check | `/check_token?token={token}` | same |

`https://oauth.battle.net/.well-known/openid-configuration` confirms the issuer,
`/authorize`, `/token`, `/userinfo`, and `/jwks/certs`. Regional discovery
documents (e.g. `https://us.battle.net/oauth/.well-known/openid-configuration`)
additionally advertise `revocation_endpoint`, `end_session_endpoint`, and
`introspection_endpoint`.

**OAuth regions are `us | eu | apac | cn`.** Blizzard folded the former `kr` and
`tw` OAuth regions into `apac`. **API host regions are still
`us | eu | kr | tw`** (`{region}.api.blizzard.com`), plus
`gateway.battlenet.com.cn` for China. These are two different sets, which is why
KwikShack configures `BNET_OAUTH_REGION` and `BNET_API_REGION` separately.

### Flow

Authorization-code, confidential client:

1. Redirect to `/authorize` with `response_type=code`, `client_id`, `scope`,
   `state`, `redirect_uri`.
2. Blizzard redirects back with `code` and the same `state`.
3. `POST /token` with **HTTP Basic** `client_id:client_secret` and form fields
   `grant_type=authorization_code`, `code`, `redirect_uri`.
4. Response: `{ access_token, token_type: "bearer", expires_in: ~86399, scope }`.

**PKCE is not used.** Blizzard's discovery document advertises no
`code_challenge_methods_supported`, and the OAuth guide documents no PKCE
parameters. A server-issued, single-use `state` is therefore the CSRF defence.
If Blizzard adds PKCE, adopting it is a strict improvement and should be done.

**No refresh token.** `grant_types_supported` lists `refresh_token`, but the
documented authorization-code token response contains no `refresh_token` field.
KwikShack does not attempt refresh; it re-authenticates. See "What we store".

**Access tokens last 24 hours** and are invalidated early by a password change,
an account lock, or the user revoking the application's authorization.

**Redirect URI must be HTTPS.** Blizzard notes that the Developer Portal does
*not* validate the redirect URIs a developer enters, so a typo fails at runtime
rather than at registration.

### Scopes

| Scope | Grants |
|---|---|
| *(none)* | Battle.net login — account id and BattleTag |
| `openid` | OIDC details via `/userinfo` |
| `wow.profile` | The user's World of Warcraft characters |

KwikShack requests `openid wow.profile`.

**Users can approve a subset.** Blizzard's guide is explicit that the returned
scope list may be narrower than the request. KwikShack honours the granted list:
a user who allows only `openid` gets a working account with no characters
attached, rather than a failed sign-in.

### What identity can actually be verified

| Claim | Verifiable? | How |
|---|---|---|
| This KwikShack user controls this Battle.net account | **Yes** | Authorization-code flow + `/userinfo` |
| This Battle.net account controls `Character-Realm` | **Yes**, with `wow.profile` | `GET /profile/user/wow` |
| This Battle.net account owns specific housing decor | **Yes**, with `wow.profile` | `GET /profile/user/wow/collections/decor` |
| This person created this blueprint | **No** | No API exposes it |

That last row is the one that matters for claiming, and there is no endpoint for
it. Blizzard exposes no mapping from a blueprint share code to the account that
created it, and no blueprint endpoint of any kind. Claim approval is therefore a
human decision.

### Character House API — documented, but disabled

**Status: treat as unavailable. KwikShack does not use it and must not be built
around it.**

The evidence, in order:

- **2025-12-19** — Blizzard developer *Korakk* announced the housing APIs on the
  official API Discussion forum, including
  `Character House API: /profile/wow/character/{realmSlug}/{characterName}/house/{houseId}`.
- **2025-12-24 onward** — the same thread filled with privacy objections: the
  endpoint let anyone view the inside of any player's house, and community
  members argued it should respect in-game house privacy controls.
- **2026-02-11** — *Marlamin* posted that "the character house API was disabled
  for aforementioned privacy concerns a few weeks ago" and asked for a timetable
  for a version "that respects the users in-game house privacy controls". This is
  a community report, not a Blizzard statement.
- **No Blizzard reply.** That post is the last in the thread, and no restoration
  has been announced there since.
- The Developer Portal **still documents** the endpoint, as
  `Character House Summary` at `/profile/wow/character/{realmSlug}/{characterName}/house/house-{houseNumber}`
  — note that the documented path differs from the announced `house/{houseId}`.
  Documentation listing it is therefore not evidence that it works.

**Live probe (2026-08-17): inconclusive, and honestly so.** An unauthenticated
request to the endpoint returns 404 — but so does an unauthenticated request to
`/profile/wow/character/{realm}/{name}` and `/data/wow/decor/index`, both of
which are known-good. Blizzard answers 404 for unauthenticated callers
regardless, so the probe cannot distinguish "disabled" from "needs a token". A
conclusive probe needs client credentials and has not been run.

Conclusion: Blizzard documented a Character House Profile API, but it was
subsequently disabled over privacy concerns. KwikShack does not rely on this
endpoint and treats it as unavailable unless current Blizzard documentation *and*
live behaviour confirm restoration. Nothing in the codebase references it. A 404
from it is the expected result, not a failure to investigate.

### Housing endpoints that DO exist (2026-08-17)

**Profile APIs** (require the user's `wow.profile` token):

- `GET /profile/user/wow` — account summary, including characters. **Used.**
- `GET /profile/user/wow/collections/decor` — housing decor the account has
  collected. Not used.
- `GET /profile/user/wow/protected-character/{realmId}-{characterId}` — not used.
- `GET /profile/wow/character/{realmSlug}/{characterName}/collections/decor`

**Game Data APIs** (client-credentials, no user involved) — see
[architecture.md](architecture.md) for how these are now used:

- `/data/wow/decor/index`, `/data/wow/decor/{decorId}`, `/data/wow/search/decor`
  — **used**, as the canonical decor catalog.
- `/data/wow/fixture/*`, `/data/wow/fixture-hook/*`, `/data/wow/room/*` — not used.
- `/data/wow/neighborhood-map/*` — not used.

**Game Data APIs** (client-credentials, no user involved):

- `GET /data/wow/decor/index`, `/data/wow/decor/{decorId}`, `/data/wow/search/decor`
- `GET /data/wow/fixture/index`, `/data/wow/fixture-hook/index`, `/data/wow/room/index`
  (each with `/{id}` and `/search/` variants)
- `GET /data/wow/neighborhood-map/index` and neighborhood lookups

This is a **first-party decor catalog**. KwikShack's catalog is currently seeded
from the Housing Decor Guide addon's data files plus Wowhead tooltip enrichment,
and its `recordID`↔`itemID` map partly self-learns from submitted manifests —
the known weakness recorded in `submission-security.md`. An authoritative
Blizzard source for that mapping would retire the weakness. It is not wired up
in this phase; see the roadmap in `architecture.md`.

### Documentation inconsistency worth knowing

The "Using OAuth" guide lists the authorization-code-only endpoints as
`/userinfo`, `/profile/user/wow`, `protected-character`, `/collections`,
`/collections/pets`, `/collections/mounts`. The WoW Profile API reference
separately documents `/collections/decor`, `/collections/heirlooms`,
`/collections/toys`, and `/collections/transmogs` as also requiring
`wow.profile`. **The guide's list is stale.** Treat the per-endpoint reference as
authoritative and expect any `/profile/user/...` endpoint to need the user token.

### Blizzard Developer API Terms of Use obligations

Quoted from the Terms of Use (last updated by Blizzard 1 October 2019) and
Blizzard's Data Protection Notice & FAQ, both re-read 2026-08-17.

**Retention and refresh.** "You must implement a maximum 30-day TTL
(time-to-live) policy for all Data obtained through our APIs. This means You will
retain data pulled from Blizzard Developer APIs for no longer than 30 days." And:
"You must refresh your data no less frequently than every thirty (30) days."

The FAQ gives the reason — retained data "could belong to a user who has asked
for their data to be made private or erased" — and the rule for disappearance:
"developers should delete the data if you receive a 404 – Not Found error."
A player's Right of Erasure applies across all Blizzard games, and Battle.net
account settings include a Game Data and Profile Privacy option that removes a
player from third-party API visibility entirely.

**Attribution.** "You shall clearly and conspicuously identify Blizzard in Your
Application as the source of the Data, and You shall do it in such a way which
makes it not appear that Blizzard is endorsing or affiliated with Your
Application. Additionally, Your Application shall not contain any of Blizzard's
trademarks as a part of its title or URL." (The name "KwikShack" contains none.)

**Privacy policy.** Required, "consistent with Blizzard's privacy policy",
stating that the Data is provided "as is", never collecting or intercepting a
player's Blizzard password, and actually adhered to.

**Monetization — the precise restrictions.** The earlier summary of "no
monetization use" was too blunt. What the Terms actually prohibit:

1. *Marketing/advertising:* "You may not use the Blizzard Developer APIs or Data
   to market or promote Your or a third party's products or services", may not
   display or disclose the Data in any advertising or promotion, and may not use
   it to target advertising.
2. *Selling the Data:* "You may not sell, license or otherwise transfer any Data
   (including anonymous, aggregate or derived data) to any ad network, data
   broker or other advertising or monetization-related service", and separately
   "You May Not Sell Or License The Data To Any Party."
3. *Paywalling — broader than expected:* "Applications May Not Charge Premiums To
   Use The APIs. 'Premium' versions of Applications offering additional for-pay
   features are not permitted, nor can players be charged money to download an
   Application, charged for services related to the Application, or otherwise be
   required to offer some form of monetary compensation to download or access an
   Application when those features use the Blizzard Developer APIs. Likewise,
   Applications may not include interstitials soliciting donations before
   features or functionality becomes available to the player. Also, players may
   not be required to watch a video advertisement before accessing a feature."
4. *Physical products:* the Data may not be integrated into one.

Working statement for KwikShack: **Blizzard API Data and API-backed functionality
must not be sold, licensed, paywalled, gated behind donations or ads, or used for
advertising or marketing.** The prohibitions are framed around *required* payment
and *gating*; a passive donation link that gates nothing is a different thing
from a paywall, but it sits close enough to clause 3 that any revenue model —
including the existing Patreon link in the footer — should be reviewed against
the then-current Terms before it is relied on. This is a flag for review, not a
legal opinion.

**Other obligations.** 36,000 API calls per hour. Breach notification within 24
hours. The API key must not be shared or transferred. No data-mining, scraping,
or crawling of Blizzard products outside authorized API use — which is also why
KwikShack's source-ingestion registry has no scraper in it.

**How KwikShack satisfies these:**

| Obligation | Where |
|---|---|
| 30-day TTL | `server/retention.ts` + `scripts/maintenance.mjs`, on a timer. See [retention.md](retention.md) |
| Refresh ≤ 30 days | Characters: re-auth. Decor: `pnpm decor:sync`, weekly |
| 404 → delete | Expiry deletes; no stale row is ever displayed |
| Attribution | Site-wide footer + `/legal` |
| Privacy policy | `/privacy` |
| No scraping | `server/sources.ts` — every platform manual, no adapters |
| Rate limit | Sync carries a hard request budget and inter-request delay |

## Implementation

### Manual Blizzard Developer Portal setup

Nothing below works until an operator does this by hand:

1. Sign in at <https://develop.battle.net/> and create a client.
2. Set the redirect URI to exactly `https://<host>/auth/battlenet/callback`.
   The portal does not validate it. It must match `BNET_REDIRECT_URI` byte for
   byte — Blizzard compares it again at token exchange.
3. Record the client id and secret into `BNET_CLIENT_ID` / `BNET_CLIENT_SECRET`.
4. Sign in once, read the Battle.net account id from the `battle_net_identities`
   row, and put it in `KWIKSHACK_ADMIN_BNET_SUBS` to become an operator. There is
   deliberately no "first user becomes admin" shortcut.

Local development can use `http://localhost:5173/auth/battlenet/callback`; that
is accepted only when the dev flag is set, so a misconfigured production deploy
cannot downgrade to plain HTTP.

### Feature flag

`resolveAuthConfig()` returns `{ enabled: false, reason }` whenever the client id,
secret, or redirect URI is missing or unusable. The auth routes answer 503 and
`/account` explains itself. **The invitation-key submission pilot is untouched
by any of this** — `KWIKSHACK_SUBMIT_KEY` remains the gate for native builds.

### What we store

| Stored | Not stored |
|---|---|
| Battle.net account id (`sub`) and region | Battle.net password (never seen) |
| BattleTag | Access tokens |
| Granted scope list | Refresh tokens |
| Character name, realm, faction, level, with a 30-day `expires_at` | ID tokens |

Discarding the access token after the callback is a deliberate trade: KwikShack
cannot silently re-read a user's profile later, so character data is refreshed by
the user signing in again. Given Blizzard issues no refresh token and caps
retention at 30 days anyway, holding the token would add risk without adding
capability.

**The consequence, stated plainly:** because no long-lived token is stored,
KwikShack cannot refresh character data unattended. Character records are
therefore *deleted* at the 30-day deadline rather than refreshed, and a user who
wants their characters back signs in with Battle.net again. Blizzard's Terms
accept deletion as compliance — the requirement is that data does not outlive the
window, not that it must be kept current forever. `/account` shows each
character's deletion date so this is visible rather than surprising, and a claim
that cites an expired character asks the user to sign in again.

The one thing this deliberately does not do is extend the deadline by
re-validating a character against the public character endpoint. The Terms permit
that check, but the privacy-sensitive fact KwikShack holds is the *account ↔
character association*, and a public existence check does not refresh consent for
that. Expiring is the conservative reading.

### Sessions

- Cookie `kwikshack_session`, `HttpOnly`, `Secure` in production, `SameSite=Lax`,
  `Path=/`, 7-day lifetime.
- `SameSite=Lax` rather than `Strict`: the Battle.net callback is a cross-site
  top-level navigation, and `Strict` would drop the cookie on arrival.
- The cookie holds a 32-byte random token. Only its SHA-256 is stored, so a
  database read cannot be replayed as a login.
- Logout deletes the server-side row, not just the cookie.
- Expired sessions, states, and character rows are pruned on the auth paths;
  there is no scheduler in this deployment.

### OAuth `state`

Server-issued, stored hashed in `oauth_states`, single-use, 10-minute expiry, and
consumed unconditionally before anything else in the callback. A replayed,
forged, or expired state is rejected with no token exchange attempted. The
post-login redirect target is carried in that row and passed through
`safeRedirect()`, so a crafted authorize link cannot bounce a signed-in user
off-site.

### Failure handling

Every callback failure lands on `/account?error=<code>` with KwikShack's own copy.
Blizzard's error text is never reflected into the page, the authorization code is
never echoed back, and nothing token-shaped is logged. A profile-API failure
after a successful token exchange is logged as a warning and the user is still
signed in — a Blizzard hiccup should not cost someone their session.
