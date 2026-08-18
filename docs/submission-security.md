# Submission security boundary

KwikShack's founding-builder submission surface uses one existing shared secret, `KWIKSHACK_SUBMIT_KEY`. It is an invitation gate, not user authentication or proof of creator ownership.

Battle.net sign-in now exists alongside it and does not replace it. The two gates cover different things and both are still needed — see "Two gates, deliberately" below.

## Production requirements

- Set a long, randomly generated `KWIKSHACK_SUBMIT_KEY`. Production build and screenshot POSTs fail closed when it is absent.
- Give the key only to invited builders through a private channel. Rotate it if it is posted publicly or a builder should lose access.
- Keep adapter-node's `BODY_SIZE_LIMIT` at least `6M`. The endpoints apply narrower limits: 1MB build JSON and 5MB screenshot files.
- Keep `UPLOADS_DIR` on the persistent mounted volume and monitor its size.

The browser form holds the key only in component memory and sends it in `x-kwikshack-key` to both POST endpoints. The companion already supports the same header.

## Enforced boundaries

- Production POSTs fail closed without the configured key.
- Build submissions and uploads have bounded, process-local IP rate limits.
- Build metadata, manifest size/counts, placement arrays, and screenshot counts are bounded.
- Manifest and top-level blueprint codes must match.
- Public submissions are create-once by share code and cannot overwrite an existing build.
- Build records can reference only generated local screenshot URLs.
- Uploads accept only signature-checked JPEG/PNG raster files up to 5MB, 4096px per edge, and 20 megapixels.
- The browser form redraws screenshots to JPEG before upload, reducing dimensions and removing ordinary image metadata.
- Uploaded files are served with `nosniff`, a sandboxed content security policy, and immutable UUID names.

## Two gates, deliberately

| | `KWIKSHACK_SUBMIT_KEY` | Battle.net session |
|---|---|---|
| Answers | "Were you invited to submit?" | "Which account are you?" |
| Covers | `POST /api/builds`, `POST /api/uploads` | claims, creator editing, admin surfaces |
| Identifies the actor | No | Yes |
| Supports per-creator revocation | No | Yes |

The key stays. It gates the addon and companion, which post from outside a browser session, and removing it would reopen native submission to anyone. It should be retired only once native submission itself moves behind authenticated accounts — that is a later step, not a side effect of this one. Until then a leaked key still costs nothing in creator identity, because the key grants no ownership over anything.

## OAuth secret handling

- `BNET_CLIENT_SECRET` is read only through `$env/dynamic/private` and used only in the server-side `Authorization: Basic` header on the token request. It is never in a URL, a page, a log line, or a client bundle.
- The authorization code is never echoed back to the browser, and Blizzard's error text is never reflected into a page — callback failures render KwikShack's own copy from a fixed map keyed by an internal code.
- No access token, refresh token, or ID token is persisted. Tokens live for the duration of the callback request. A database compromise therefore yields no ability to act against Blizzard on a user's behalf.
- Session cookie tokens are stored as SHA-256 digests, so the same is true of sessions: reading the table does not let you log in as anyone.
- `state` is server-issued, stored hashed, single-use, and consumed before any token exchange is attempted.
- Rotating the client secret invalidates nothing stored locally, because nothing derived from it is stored. Rotate freely.

## Authorization boundaries

Every mutation is authorized against `authenticated account → relationship → target`. Nothing is authorized by a display name, an attributed creator string, a form field, or a URL parameter.

- `requireAccount` — a signed-in session. Browsers are redirected to sign in; API callers get 401.
- `requireAdmin` — `accounts.role = 'admin'`, which is derived from `KWIKSHACK_ADMIN_BNET_SUBS` on every sign-in. Removing an operator from that variable demotes them at their next sign-in with no database edit. Unauthorized requests get **404, not 403**, so the existence of admin surfaces is not disclosed.
- Creator editing requires `claim_state = 'claimed'` **and** `claimed_by_account_id = session account`. This is enforced inside `applyCreatorEdit`/`replaceCreatorScreenshots`, not only in the route, so it holds no matter what calls it. Tested for: another authenticated user, an unclaimed listing, and a merely-pending claim.
- A claim may cite only a character belonging to the claimant's own account, and only one that has not passed its 30-day expiry.
- `KWIKSHACK_ADMIN_BNET_SUBS` empty means nobody is an operator. There is intentionally no "first account to sign in becomes admin".

## What creator editing can and cannot reach

Writable through an approved claim: `creator_title`, `creator_description`, `creator_tags`, `creator_links` (https only), `preferred_attribution`, `share_code`, and screenshots the creator uploaded to KwikShack.

Unreachable from the creator edit path by construction — these columns and tables are never in its update set: `attributed_creator`, `attributed_realm`, `attributed_character`, the curation `title`, `indexed_at`, `publication`, `claim_state`, `indexed_blueprint_sources` (including `internal_notes`), `blueprint_claims`, and `blueprint_audit_events`.

System-derived data is regenerated, never hand-edited: `manifest` is written only by `attachResolvedManifest`, which requires the manifest's own share code to match the listing. Replacing the share code clears the manifest and returns the listing to `unresolved` rather than carrying old contents onto a new blueprint.

Screenshots must be local KwikShack upload URLs, the same rule native submissions already enforce — so creator editing inherits the existing hardened upload path rather than opening a second one.

## Claim review assumptions

Approval is a human decision, and the reason is structural: **no Blizzard API establishes who created a blueprint.** There is no endpoint mapping a share code to an account. Battle.net proves account control and, with `wow.profile`, character control — neither of which is authorship.

`evidence_kinds` records which signals were present at request time, ordered by how much weight they deserve:

| Signal | Weight |
|---|---|
| `battlenet_character_ownership` | Strong — Blizzard's authorized API confirms it |
| `character_matches_source_attribution` | Strong — that character is the one credited at the source |
| `claimant_supplied_evidence_url` | Only as good as the reviewer's own check of the link |
| `display_name_similarity` | **Weak. Never sufficient alone** — anyone can pick a name |

These are inputs to review, not rules. Nothing approves a claim automatically, and the review UI labels the display-name signal as insufficient so it is not mistaken for proof. An approved claim transfers management only; it rewrites no provenance, and a competing pending claim is closed out rather than left dangling.

## Source ingestion trust boundaries

- Source URLs must be `https`, must carry no credentials, must be under 2048 characters, and must match the declared platform's host list. A Reddit link cannot be filed under Wowhead to inherit a different policy.
- No automated ingestion runs. Every platform in the registry is `automation: 'manual'`; `SOURCE_ADAPTERS` is empty. An adapter may be enabled only after that platform's current terms have been read and the specific permitted access method recorded.
- Source-site media is never fetched, copied, proxied, or hotlinked. Listings without creator-uploaded images use a branded placeholder.
- Attribution recorded from a source is treated as a citation, never as evidence of ownership.
- Third-party manifests do **not** feed the self-learning `recordID`↔`itemID` map. Native submissions still do; that trust gap is unchanged for native builds and is now bounded so it cannot widen through indexed content.
- **Both directions of the native/indexed collision are now closed.** `indexBlueprint` refuses a code a native build owns, and a native submission for a code that is *already indexed* is reconciled rather than duplicated: the records are linked via `native_build_id`, a published listing is archived so native takes precedence in presentation, a curated draft is preserved, an audit event is written, and — the part that matters — **catalog learning is skipped for that submission**. A code we already know came from someone else's public share must not become authoritative catalog knowledge just because somebody POSTed it to `/api/builds`; submission is not proof of authorship, which is what claiming exists to establish.

## Blizzard-derived data boundary

Blizzard API data is deleted within 30 days. What counts as Blizzard data, and what deliberately does not, is set out in [retention.md](retention.md); the short version is that `wow_character_identities` and `canonical_decor` expire, while KwikShack's own catalog, identifier mappings, accounts, builds, listings, claims, and provenance do not.

Security properties of the maintenance job:

- It only ever deletes rows whose own stored deadline has already passed, so it is idempotent and cannot be induced to remove live data by re-running it.
- It is narrow by construction: accounts, identities, claims, audit events, builds, indexed blueprints, provenance, screenshots, the legacy catalog, and the identifier map are outside its reach. Expiring a character association must never cascade into a creator losing a listing.
- **Its logs carry counts only.** No character name, realm, BattleTag, account id, or token value is written to a log line, and there is a test asserting that.
- It runs in-process on a timer and is also a standalone CLI. Neither path opens a network listener, accepts input, or requires a credential — a maintenance job is the last thing that should have an attack surface.
- Canonical decor sync runs with **client credentials only**. It cannot reach any profile endpoint, so a bug in catalog syncing cannot touch authenticated player data. The two clients are separate modules for exactly this reason.
- The sync carries a hard request budget and an inter-request delay, so a loop bug cannot turn into a rate-limit ban or a Terms violation.

## Known limits requiring an operational or architectural decision
- Blizzard issues no refresh token for this flow, so character associations go stale until the user signs in again. That is a deliberate trade for not storing tokens, but it means a claim citing a character can hit "sign in again to refresh it".
- Sessions are 7-day absolute with no sliding renewal and no per-device listing or remote revocation beyond deleting all of an account's sessions.
- Admin identity rests on a comma-separated environment variable. Adequate for one or two operators; it is not a role system.
- Claim review has no notification path. A claimant sees status only on `/account`.
- The shared key does not identify which builder acted and cannot support ownership, revocation per creator, or secure edits. Creator identity/authentication is required for that.
- Rate limits are in one server process and reset on restart. They do not coordinate across replicas.
- Correct per-client limiting behind Railway depends on a trustworthy client-address header/proxy configuration. Do not trust a caller-controlled forwarding header without confirming the proxy overwrites it.
- Uploads happen before the build POST, so abandoned form sessions leave orphan files. Add a referenced-file cleanup job or upload-finalization model before volume grows materially.
- Direct API uploads are validated but not re-encoded server-side, so an invited key holder can upload a valid raster that retains EXIF metadata. Server-side decoding/re-encoding would require an image-processing dependency or service.
- Submitted manifests are structurally validated, not independently resolved by the server. In particular, the current self-learning decor record mapping still trusts submitted `recordID`/`itemID` pairs.
- There is intentionally no public update/delete path. Corrections remain an operator task until authenticated ownership exists.
