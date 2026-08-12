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

### API Endpoints (v0)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/builds` | Submit a build (manifest + optional placement) |
| GET | `/api/builds/:id` | Fetch a build with enriched item data |
| GET | `/api/builds?tag=&faction=&type=` | Browse/list builds |
| GET | `/api/builds/by-code/:code` | Look up by share code |
| POST | `/api/builds/by-code/:code/verify` | Verify code still resolves |
| GET | `/api/decor/:itemID` | Get item metadata (name, icon, source) |

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
  in-game, then paste the JSON at `kwikshack.com/submit`. Auto-submission is a
  convenience, never a requirement.
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
