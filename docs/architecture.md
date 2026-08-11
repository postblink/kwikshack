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

For the player's OWN house, spatial placement data may be accessible through
`C_HousingLayout` and `C_HouseEditor` APIs. The Housing Decor Guide addon has a
"Snapshots" feature that captures everything placed in a house, suggesting
enumeration of placed decor is possible. This path is NOT yet verified in code
— it's the next research priority after the probe.

If transforms are readable in the editor:
- Author-exported builds include full placement data → website renders 2D plan.
- Blueprint-resolved builds (third-party codes) remain manifest-only.

If transforms are NOT readable:
- All builds are manifest-only; the website is a "building plan" platform.
- 2D plans are drawn by the author in the website's floorplan tool.

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
