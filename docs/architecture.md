# KwikShack Architecture

## Overview

**KwikShack** is a WoW housing companion split across two artifacts that share a
data format:

1. **KwikShack addon** (in-game): resolves blueprint share codes into
   structured manifests, captures spatial placement data from the player's
   house editor, and exports everything to the website API.

2. **KwikShack website** (kwikshack.com): accepts manifest + placement data,
   enriches it with item metadata (icons, names, sources from the game data
   catalog), and renders 2D floor plans, item-list previews, budget
   visualisations, and a community gallery.

## The Core Problem

Blueprint share codes in WoW 12.1 are **server-side reference links**. They do
NOT contain self-contained layout data. Resolving a code requires calling
`C_HousingBlueprint.RequestContents(shareCode)` inside the game client, which
triggers an authenticated server call. A website alone cannot resolve codes.

The addon bridges this gap. It does the "ask Blizzard" part inside the game on
the user's behalf and forwards the result.

## Data Pipeline

```
Player pastes code in-game
        │
        ▼
KwikShack addon calls C_HousingBlueprint.RequestContents(shareCode)
        │
        ▼ (5-10s for large builds)
Server returns HOUSING_BLUEPRINT_CONTENTS_RECEIVED payload
        │
        ▼
Addon normalises the raw payload into a stable JSON shape
        │
        ▼
HTTP POST to kwikshack.com/api/builds
        │
        ▼
Website enriches with item metadata (icons, names, categories, sources)
        │
        ▼
Rendered: item-list preview, budget report, 2D floor plan (if spatial data exists)
```

## Manifest Shape (what Blueprint Contents returns)

From verified addon source (Housing Decor Guide PTR testing, 2026-07):

```
{
  shareCode: string,           -- the importable code itself
  contentGroups: [
    {
      groupType: number,       -- 3=Decor, 4=Dye, Room/Fixture/HouseType
      entries: [
        { itemID, count, dyeVariant?, ... }  -- Decor
        { roomID/type, ... }                 -- Structural
      ]
    }
  ],
  budgetInfo: {
    interiorBudgets: [
      { cost, max, current },  -- [0]=Rooms, [1]=Decor, [2]=PetDecor
    ],
    exteriorBudgets: [
      { cost, max, current },  -- [1]=Decor, [2]=PetDecor
    ]
  },
  blockingRequirementFlags: number  -- bitmask:
    -- bit 1  = budget insufficient
    -- bit 2  = rooms not unlocked
    -- bit 8  = missing decor
    -- bit 32 = faction mismatch
}
```

**What it does NOT include (as currently observed):** item positions,
rotations, or any spatial placement data. The manifest is a "shopping list +
budget report", not a floor plan. The BlueprintProbe addon
(`probes/BlueprintProbe/`) will confirm whether transforms are silently present
in the raw payload and simply ignored by existing addons.

## Spatial Data Path (separate from codes)

**Status: researched — item transforms are NOT currently accessible via addon
APIs (as of 12.1 PTR/live).**

Findings from analysing the Housing Decor Guide addon's `HousingObserver`
module (2026-08-11):

- `C_HousingDecor.GetAllPlacedDecor` (direct enumeration of placed decor) is
  **policy-gated** by Blizzard: declared `HasRestrictions = true`, an addon call
  returns `ADDON_ACTION_FORBIDDEN`. Blizzard's own documentation says it's
  "potentially very expensive" and "may be reworked & opened up in the future".
  The addon re-tests each patch.
- Workaround in use: observing `HOUSING_DECOR_CUSTOMIZATION_CHANGED` /
  `HOUSING_DECOR_REMOVED` events builds a **complete placed-decor inventory**
  (verified 21/21 against Blizzard's own panel) — but entries only carry
  `decorGUID, decorID, areaID, itemID, name`. **No positions, no rotations.**
- Area is indoors-vs-outdoors only, NOT rooms ("every interior room shares one
  area"). Room association is unavailable from the observed data.
- Layout-mode pin frames expose only screen-space geometry (`GetRect`,
  `GetCenter` etc.), gated behind a debug flag and "not yet driving layout" —
  not world coordinates, not item placements.
- `C_HousingLayout.GetRoomPlayerIsIn` gives the current room GUID (used for
  room blueprint export) — no transform data.

Conclusion: spatial transforms exist only server-side (during import) and in
the game's render state. Addons cannot currently read them. If the
BlueprintProbe confirms transforms are absent from the blueprint contents
payload, KwikShack v0 is a **manifest-first** platform: item lists, budgets,
requirements — with screenshots for visuals and an optional in-site floorplan
tool for authors. Re-check the policy gate each patch; Blizzard has flagged it
as temporary.

## Website Architecture

### Tech Stack (proposed)
- **Framework**: SvelteKit (Svelte 5) — team familiarity (Catwalk), SSR/SSG
  hybrid, excellent DX for data-heavy UIs
- **Database**: SQLite via Drizzle or better-sqlite3 — simple, local-first,
  grows into Litestream for replication
- **Rendering**: Canvas-based 2D floor plan + SVG for item icons and budget
  charts
- **Item catalog**: Populated from wow.tools client DB2 files or Wowhead API
  (decor items, icons, categories, sources)
- **Deployment**: Self-hosted on haxtop initially; Tailscale Funnel or a
  lightweight reverse proxy when ready to share

### Data Model

```
Build
├── id: UUID
├── shareCode: string (the importable code — canonical identifier, subject to rot)
├── codeStatus: "active" | "expired" | "unverified"
├── blueprintType: "House" | "Interior" | "Exterior" | "Room"
├── faction: "Alliance" | "Horde" | null (neutral/room)
├── createdAt: datetime
├── updatedAt: datetime
├── authorId: FK → User
│
├── ManifestData (1:1)
│   ├── contentGroups: JSON
│   ├── budgetInfo: JSON
│   └── blockingRequirements: JSON
│
├── PlacementData (0:1 — only if author submitted spatial data)
│   ├── items: [{ itemID, x, y, z, rotation, scale, dye?, roomGUID }]
│   └── rooms: [{ guid, type, floor }]
│
├── Screenshots (0:N)
│   └── [{ url, caption, isPrimary }]
│
└── Tags (0:N)
    └── [{ name, category }]  -- e.g. "cozy", "gothic", "kitchen", "holiday"
```

### Content classes

KwikShack recognises three kinds of content and deliberately keeps them apart.
Collapsing them would make ordinary fields lie — `builds.author_id` would stop
meaning "the person who submitted this", and a single `verified` badge would
overstate two different things at once.

| | **Native build** | **Indexed public blueprint** | **Community Find** |
|---|---|---|---|
| Table | `builds` | `indexed_blueprints` | `community-finds.data.ts` (in-repo) |
| Origin | Creator submitted it here | We found a public code elsewhere | We found a build worth seeing elsewhere |
| Blueprint code | Yes, resolved | Yes, publicly shared | No usable code |
| Manifest | Always | Only once resolved | Never |
| Copy Blueprint | Yes | Yes, unless unavailable/revoked | No |
| Images | Creator's own uploads | Only after a claim, creator's own uploads | None — link out |
| Attribution | `users.name` (a label) | Observed at the source | Observed at the source |
| Becomes creator-managed by | Being submitted | An approved claim | Converting to a native build |

An indexed blueprint that gets claimed stays an indexed blueprint. It becomes
creator-managed without pretending KwikShack was the original publishing venue.

### Verification vocabulary

Three separate claims, three separate states. None of them implies another.

- **Battle.net Verified** — `battle_net_identities` exists for the account.
  Blizzard authenticated this person's Battle.net account. Optionally extended by
  `wow_character_identities`: Blizzard confirms the account controls these
  characters.
- **Claimed Build** — `indexed_blueprints.claim_state = 'claimed'`. A human
  reviewer accepted that this authenticated creator controls this listing.
- **Blueprint Verified** — `indexed_blueprints.resolution_state = 'resolved'`.
  KwikShack resolved the code through its own supported flow and derived the
  decor data itself.

A creator can be Battle.net Verified with an unresolved blueprint. A blueprint
can be resolved and unclaimed. The UI states these separately —
`BlueprintResolutionStatus` is intentionally a different component from
`BuildStatus`, because a native build's `code_status` answers a different
question.

Native builds keep their existing, accurate visitor-facing language:
"Community submission" until a code is confirmed importable.

### Identity model

Full detail, including the Blizzard API findings and their limits, is in
[battlenet-identity.md](battlenet-identity.md). In outline:

```
accounts                    stable KwikShack identity (never a display name)
  └── battle_net_identities Blizzard authenticated this account   (1:1)
  └── wow_character_identities  which characters it controls      (1:N, 30-day TTL)
  └── sessions              hashed cookie tokens                  (1:N)
oauth_states                single-use, server-issued CSRF state
```

The pre-existing `users` table is untouched and keeps its old meaning: a
display-name label attached to native submissions, not an identity. Authorization
never consults it.

What Battle.net establishes, and what it does not:

- ✅ This KwikShack user controls this Battle.net account.
- ✅ (with `wow.profile`) This Battle.net account controls `Character-Realm`.
- ❌ This person created this blueprint. **No Blizzard API exposes this.** There
  is no endpoint mapping a share code to its author. This is why claims are
  reviewed by a person.

### Public blueprint indexing

```
Public blueprint discovered (manually, from a permitted source)
        │
        ▼  provenance captured: platform, canonical URL, attributed creator,
        │  discovery date, internal review notes
indexed_blueprints (draft) + indexed_blueprint_sources
        │
        ▼  optional: an operator resolves the code through the addon and
        │  attaches the manifest — the ONLY way KwikShack-derived data appears
resolution_state = 'resolved'
        │
        ▼
published listing
        │
        ▼  creator signs in with Battle.net, requests a claim, a person reviews
claim_state = 'claimed' → creator-managed overlay (title, description, tags,
                          their own screenshots, replacement code)
```

**Deduplication**, in order:

1. A native build with the same code wins outright. Indexing is refused; an
   external record never shadows a creator's own submission.
2. An existing indexed listing absorbs the new source as extra provenance. One
   blueprint found in five places is one listing with five source rows.
3. Otherwise a new draft listing is created.

**Resolution and revocation.** Sharing is revocable in practice, so
`resolution_state` carries `unresolved | resolved | unavailable | revoked`. The
last two withdraw the Copy Blueprint action and show a clear visitor-facing
state; the listing and its provenance survive, and a claimed creator can replace
the code later. Replacing a code discards the derived manifest rather than
carrying it onto a different blueprint.

**Provenance is append-only.** `indexed_blueprint_sources` and
`blueprint_audit_events` are never rewritten by a claim or a creator edit.
`internal_notes`, `reviewer_note`, and `evidence_kinds` have no public
counterpart and are not read on any path that ends in a response body.

**Media.** A publicly shared code is not permission to republish the post around
it. Source screenshots, prose, video, and artwork are never copied, proxied, or
hotlinked. Unillustrated listings use KwikShack's branded placeholder until the
claimed creator uploads their own images. Policy detail lives in
[community-curation.md](community-curation.md).

**Catalog trust.** Native submissions self-learn `recordID`↔`itemID` pairs into
`decor_items`. Indexed third-party blueprints deliberately do **not** — an
unvetted external code must not become authoritative catalog knowledge. This is
tested.

### Decor: canonical vs observed

Three tiers of decor knowledge, and which one wins:

| Tier | Source | Table | Authority |
|---|---|---|---|
| **Canonical** | Blizzard Housing Decor Game Data API | `canonical_decor` | Wins whenever present |
| **Legacy** | MIT-licensed Housing Decor Guide files + Wowhead enrichment | `decor_items` | Fallback |
| **Observed** | What a blueprint manifest contains | build `manifest` JSON | Renders a build; never catalog truth |

Blizzard's `{decorId}`, a manifest `recordID`, and an `itemID` are **three
different identifier spaces**, and nothing assumes any two are equal. Links live
in `decor_identifier_map` with the evidence that produced them:

| Evidence | Confidence | Meaning |
|---|---|---|
| `blizzard_item_reference` | 100 | The canonical payload named this itemID |
| `blizzard_decor_id` | 90 | Observed id equals a canonical decor id **and** the names agree |
| `name_exact` | 50 | Exact name match against the legacy catalog |
| `manual` | 40 | An operator asserted it |

Stronger evidence overwrites weaker; the reverse never happens. **Nothing here is
learned from user submissions** — replacing that is the point of the work.
`ingestRecordPairs` still self-learns from *native* submissions into the legacy
catalog; indexed third-party blueprints never did and still never do.

Fallback is the normal case, not an error path:

```
observed identifier
      ↓  canonical link known?
      ↓  yes → official name, category, decor id
      ↓  no  → legacy catalog row
      ↓  no  → the name the submitter supplied
```

A decor entry never disappears from a build because a lookup came up empty, and a
canonical read failure is caught and degraded rather than propagated. Canonical
rows are Blizzard API data and are deleted at the 30-day retention deadline; when
that happens the site simply returns to the legacy tier.

**Synchronisation** is a CLI job (`pnpm decor:sync`), never a page request: it
walks `/data/wow/decor/index` then fetches each `/data/wow/decor/{decorId}`,
carrying a hard request budget and an inter-request delay so the 36,000/hour
ceiling is never approached. `decor_sync_state` records the last run. Because
Blizzard does not publish the decor response schema, `pnpm decor:probe` prints
the field names actually returned without writing anything — confirm the mapping
before the first real import.

### Retention and maintenance

Blizzard-derived data is deleted within 30 days by `server/retention.ts`, run on
an in-process six-hourly timer and available as `pnpm maintenance`. Full detail,
including what counts as Blizzard data and what deliberately does not, is in
[retention.md](retention.md).

### Source ingestion

`web/src/lib/server/sources.ts` is a registry, not a scraper. Each platform
records three separate answers: may we discover here, may we automate, may we
reproduce media. Every platform is currently `automation: 'manual'` and
`media: 'no-reproduction'`, and no adapters are registered. The `SourceAdapter`
contract exists so a permitted adapter can be added later without threading
platform-specific logic through the application; enabling one requires reading
that platform's current terms first.

### API Endpoints (v0)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/builds` | Submit a build (manifest + optional placement) |
| GET | `/api/builds/:id` | Fetch a build with enriched item data |
| GET | `/api/builds?tag=&faction=&type=` | Browse/list builds |
| GET | `/api/builds/by-code/:code` | Look up by share code |
| POST | `/api/builds/by-code/:code/verify` | Verify code still resolves |
| GET | `/api/decor/:itemID` | Get item metadata (name, icon, source) |

### Routes added for identity and indexing

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/auth/battlenet` | none | Start the authorization-code flow |
| GET | `/auth/battlenet/callback` | state | Complete sign-in, create a session |
| POST | `/auth/logout` | session | Invalidate the session server-side |
| GET | `/account` | optional | Sign in; identity, characters, claims, managed listings |
| GET | `/blueprints` | none | Published indexed blueprints |
| GET | `/blueprints/:id` | none | Listing detail, provenance, claim request |
| GET/POST | `/blueprints/:id/edit` | claimed owner | Creator overlay editing |
| GET/POST | `/admin/blueprints` | operator | Manual indexing, resolution, state changes |
| GET/POST | `/admin/claims` | operator | Manual claim review |

Mutations use SvelteKit form actions rather than JSON endpoints, so the built-in
same-origin CSRF check applies and there is one fewer surface to secure.
Authorization lives in the server modules (`applyCreatorEdit`, `requestClaim`,
`approveClaim`), not only in the route, so it holds regardless of the caller.

### Schema management

Schema changes go through numbered SQL migrations, not `drizzle-kit push` — see
[migrations.md](migrations.md). `db/schema.test.ts` fails the suite if `schema.ts`
and the migrations disagree.

### Rendering Tiers

**Tier 1 — Manifest preview** (always available)
- Item grid: icon + name + count, grouped by type (furniture, lighting, etc.)
- Budget bars: visual gauge for each budget category with cost/max indicators
- Requirement list: rooms required, level required, faction, gaps ("you need X
  to import this")
- Missing-item tally per visitor

**Tier 2 — 2D floor plan** (spatial data available)
- Top-down view per room/floor
- Items rendered as coloured shapes or icons at (x, y) with rotation arrow
- Room boundaries from room data
- Exterior plot layout with coordinate grid

**Tier 3 — 3D model viewer** (stretch goal, legal gray area)
- Would require extracting and hosting Blizzard's M2 model assets + textures
- Precedent: Wowhead model viewer, Wago dressing room operate in this space
- Not v1

## Companion App (optional)

`scripts/watchdog.py` auto-submits builds from the addon to the website API.
By design it is:

- **Optional** — the addon works without it. Manual path: `/kshack copy`
  in-game, press Ctrl+C in the export window, then paste the JSON at
  `kwikshack.com/submit`. Auto-submission is a convenience, never a requirement.
- **Lean** — Python stdlib only, zero dependencies, ~150 lines. It watches one
  SavedVariables file and POSTs one manifest per new build.
- **Open source** — MIT-licensed in this repo, no telemetry, no binaries.
- **Privacy** — reads only the local KwikShack SavedVariables and posts the
  decoded manifest to the configured API endpoint.

## Competition / Existing Landscape

| Site | Type | Code Import? | Auto Data? |
|---|---|---|---|
| housing.wowdb.com | Gallery + floorplan tool | No | No (manual item entry) |
| Wowhead housing gallery | Gallery | No | No (screenshots only) |
| worldofhousing.io | Gallery + catalog | No | No |
| Zillow for Warcraft | Official marketing | No | Curated only |
| Housing Decor Guide addon | In-game catalog/planner | Own format | Yes (in-game only) |

**KwikShack's gap:** the first tool that resolves actual game blueprint codes,
auto-populates structured build data, and provides a web-based gallery with
real item lists and budget analysis.

## Decor Catalog (seeded 2026-08-11)

`decor_items` is seeded from the Housing Decor Guide addon's data files
(MIT-licensed, generated from the in-game housing catalog) + Wowhead tooltip
enrichment. Pipeline in `web/scripts/`:

1. `extract_catalog.mjs` — parses HDGR_FacetDB.lua (1906 items, names,
   categories, expansions) + HDGR_DecorDB.lua (430 crafted, adds profession
   source) into `scripts/seed/catalog.json`
2. `enrich_icons.mjs` — fetches icon FileDataIDs from
   `nether.wowhead.com/tooltip/item/{id}` (throttled, resumable) →
   `catalog.enriched.json` (1796/1906 icons)
3. `seed_db.mjs` — idempotent upsert into `decor_items`

Icons render via `wow.zamimg.com/images/wow/icons/large/{FileDataID}.jpg`
(verified working for both FileDataIDs and icon names).

Refresh when the housing catalog grows: re-run against an updated HDGR checkout,
or pull from wow.tools DB2 (`ItemSparse` / `HousingCatalog`) directly — wow.tools
is back up (verified 2026-08-11).

## Roadmap

Where the product is going, and why in this order. Each step is only worth doing
once the one above it exists.

```
 ✅ Invitation-only submissions        KWIKSHACK_SUBMIT_KEY — still the pilot gate
 ✅ Migration workflow                 must precede any persistent schema change
 ✅ Battle.net identity                real accounts, not display names
 ✅ Public blueprint indexing          makes the site useful before it is popular
 ✅ Manual authenticated claiming      turns indexed content into creator content
 ✅ Creator editing                    the payoff that makes claiming worth doing
 ─────────────────────────────────────────────────────────────────────────────
 ✅ Compliance surfaces                /privacy, /legal, footer attribution
 ✅ Explicit retention                 scheduled deletion, not opportunistic cleanup
 ✅ Canonical decor foundation         /data/wow/decor/* — canonical wins, legacy falls back
 ─────────────────────────────────────────────────────────────────────────────
 ⬜ First canonical sync in production run the probe, confirm the mapping, import
 ⬜ Public creator profiles            /creators/:handle, backed by claimed identity
 ⬜ Saves / Collections                needs accounts; now possible
 ⬜ Decor-centric discovery            "builds using this item" — now has a trustworthy catalog
 ⬜ Permitted source adapters          only where a platform's terms clearly allow it
```

Deviations from the originally sketched order, all deliberate:

- **Migrations moved to the front.** Authentication and claims need persistent
  tables, and adding them to a database that already had known drift would have
  compounded the problem.
- **The first-party decor catalog was promoted** above creator profiles. Blizzard
  now ships Housing Decor Game Data endpoints that were not available when the
  catalog pipeline was built. They resolve a standing correctness risk rather
  than adding a feature, and decor-centric discovery depends on them being right.
- **Removed: server-side house layout via the Character House API.** That
  endpoint was documented and then disabled over privacy concerns, and there is
  no announced restoration — see [battlenet-identity.md](battlenet-identity.md).
  Nothing on this roadmap assumes it will return. The addon remains the only way
  to resolve a blueprint.

## Risks and Caveats

- **Code rot**: blueprint codes die when the author deletes the blueprint.
  KwikShack should mark builds as "code expired" and preserve the manifest as
  a historical record.
- **Server drops**: some foreign codes are silently dropped by Blizzard's
  service (verified by HDGR on PTR). The addon should handle timeouts
  gracefully.
- **Addon API restrictions**: Blizzard is actively adjusting addon APIs in
  12.1. C_HousingBlueprint may change or tighten. The probe addon is our
  canary.
- **Legal**: hosting rendered 3D models of Blizzard assets is a gray area; 2D
  icon-based rendering avoids this entirely.
