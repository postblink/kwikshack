# Research Notes — WoW 12.1 Housing Blueprints

*Compiled 2026-08-11. Sources: Blizzard news, Wowhead PTR report, Housing Decor
Guide addon source code, Zillow/Warcraft Wiki, game forums.*

## Key Finding

**Blueprint share codes are server-side reference links, not self-contained
layout data.** A code is a short alphanumeric key that resolves to layout data
living on Blizzard's servers, tied to the author's account. No layout data is
encoded in the string itself.

## Verified API Surface (C_HousingBlueprint, WoW 12.1)

Source: Vamoose's Housing Decor Guide addon (MIT, PTR-hardened).

### Resolution
- `C_HousingBlueprint.IsShareCodeValid(code)` — validate format
- `C_HousingBlueprint.GetBlueprintTypeForCode(code)` — Room/Interior/Exterior/House
- `C_HousingBlueprint.RequestBlueprintContents(shareCode)` — resolve manifest
- `C_HousingBlueprint.RequestBlueprintContentsForContext(shareCode, houseGUID)`
- `C_HousingBlueprint.GetBlueprintHyperlink(shareCode)` — chat link

### Events
- `HOUSING_BLUEPRINT_CONTENTS_RECEIVED` — payload: shareCode, contentGroups,
  budgetInfo, blockingRequirementFlags
- `HOUSING_BLUEPRINT_CONTENTS_FAILURE` — shareCode, reasonCode
- `HOUSING_BLUEPRINT_EXPORT_SUCCESS` / `_FAILURE`
- `HOUSING_BLUEPRINT_COLLECTION_RECEIVED` / `_FAILURE`
- `HOUSING_BLUEPRINT_RENAME_SUCCESS` / `_FAILURE`
- `HOUSING_BLUEPRINT_DELETE_SUCCESS` / `_FAILURE`

### Utilities
- `HousingFramesUtil.ShowBlueprintImport(shareCode)` — open import dialog

## What the Server Returns (Manifest Structure)

From HDGR PTR testing (verified 2026-07-12/15 on builds 68629, 68675):

- **contentGroups**: arrays keyed by type (3=Decor, 4=Dye, Room/Fixture/HouseType).
  Each Decor entry carries itemID, count, dyeVariant info.
- **budgetInfo**: interiorBudgets and exteriorBudgets, each an array:
  [0]=Rooms, [1]=Decor, [2]=PetDecor. Each has { cost, max, current }.
  cost=-1 means "not used by this blueprint."
- **blockingRequirementFlags**: bitmask. bit 1=budgets, bit 2=rooms, bit 8=decor
  missing, bit 32=faction mismatch.
- **numMissing** fields per content group (acquirable types only).

**NOT present (as consumed by HDGR):** item positions, rotations, or any
spatial placement data. Whether the raw payload carries transforms silently is
the open question the BlueprintProbe addon tests.

## PTR Caveats (from HDGR hardening)

- Server can silently drop requests for "certain foreign codes" — no
  RECEIVED or FAILURE event fires. Addon handles with a timeout sweep.
- Large manifests take 5-10 seconds.
- The share code itself contains NO faction info. Faction is derived from
  the manifest + the target house's faction, checked via
  blockingRequirementFlags bit 32.
- Blueprint codes are NOT permanent — delete the blueprint, code dies.
- No update path: any edit creates a new blueprint + new code.

## 12.1 Housing Feature Summary

- **Blueprints**: import/export whole house, interior, exterior, or single
  room. 50 saved blueprint slots per account. Auto-backup on import.
- **House level cap**: raised to 12.
- **Decor storage**: increased ~50%.
- **Pets**: pet beds, wandering pets via nav tech. 100 pet bed indoor limit.
- **Artisanal Room Plans**: themed rooms with structure (PTR datamined).
- **New Endeavors**: Amani trolls, kobolds, Ohn'ahran centaur, Tortollan.
- **Visitor Codes** (announced, future): time-limited in-game visit codes,
  snapshot-based instances.
- **Showcases** (announced, future): themed in-game showcases with voting
  and decor trophy.

## Blueprint Contents — VERIFIED LIVE PAYLOAD (2026-08-11)

The BlueprintProbe addon captured a real payload from a live 12.1 import
(share code `AgEKQrFXbkpJV5snBnjUGnTF`). This is the authoritative shape:

```
{
  shareCode = "AgEKQrFXbkpJV5snBnjUGnTF",     -- ~24-char opaque reference token
  targetHouseGUID = "Opaque-1",                -- opaque house reference
  blockingRequirementFlags = 0,                -- 0 = importable
  unmetRequirementFlags = 0,
  contentGroups = {
    { contentType = 1, entries = { { recordID=55, total=1, name="Night Elf House Small",
                                     invalid=false, contentType=1, numMissing=0 } } },  -- house type
    { contentType = 2, entries = { { recordID=1,  total=1, name="Square Room (Small)", ... } } },  -- rooms
    { contentType = 5, entries = { { recordID=601, total=4, name="Relic Dormer", ... },
                                   { recordID=606, total=3, name="Embellished Window", ... } } },  -- fixtures
    { contentType = 3, entries = { { recordID=726, total=1, name="Wrought Iron Chandelier", ... },
                                   { recordID=9144,total=1, name="Founder's Point Front Door", ... },
                                   { recordID=1435,total=1, name="Sturdy Fireplace", ... },
                                   { recordID=1994,total=2, name="Carved Wooden Crate", ... },
                                   { recordID=389, total=2, name="Goldshire Window", ... } } },  -- decor
  },
  budgetInfo = {
    interiorBudgets = { { budgetType=0, max=36,  cost=5,  current=16 },  -- rooms
                        { budgetType=1, max=1745, cost=17, current=16 },  -- decor
                        { budgetType=2, max=100, cost=0,  current=0  } }, -- pet decor
    exteriorBudgets = { { budgetType=1, max=250, cost=0 },
                        { budgetType=2, max=25,  cost=0 } },
  },
}
```

### Differences from HDG's documented shape (verified live)
- Group field is `contentType` (HDG called it `groupType`): 1=house type,
  2=room, 3=decor, 5=fixture (no dye group observed — likely 4).
- Entries carry `recordID` (decor catalog ID) + display `name` — NOT `itemID`.
  Mapping decorID → itemID requires an in-game C_HousingCatalog lookup.
- `total` is the count (not `count`).
- `targetHouseGUID` is an opaque reference ("Opaque-1").
- `budgetType`: 0=rooms, 1=decor, 2=pet decor. `cost` = blueprint contribution,
  `current` = target house's existing spend, `max` = cap.

### Spatial verdict — CONFIRMED ABSENT
The live payload contains **no positions, rotations, or transforms**. Entries
are recordID + name + total + contentType + numMissing + invalid. Blueprint
codes cannot provide spatial previews. Manifest-first scope is locked.

## Existing Tools (Competition)

| Tool | Type | Code Import? | Automatic Data? | Notes |
|---|---|---|---|---|
| housing.wowdb.com | Gallery + floorplan tool | No | No | 3,541 builds, screenshots + manual item lists + manual floorplans |
| Wowhead housing gallery | Gallery | No | No | Screenshots only, community submitted |
| worldofhousing.io | Gallery + catalog | No | No | Screenshots, item catalog browsing |
| Zillow for Warcraft | Official marketing | No | Curated only | Blizzard×Zillow collab (zillow.com/warcraft), Feb 2026 |
| Housing Decor Guide | In-game addon | Own format | Yes (in-game) | Architect planner, own share codes, MIT license |
| wow-housing-planner (GitHub) | Web planner | Own JSON | No | Community-made web planner, open source |

**Gap identified:** No tool accepts actual game blueprint codes and
auto-populates structured build data. The community relies entirely on manual
screenshot + item-list entry.

## The Addon Bridge Pattern

The viable architecture:
1. **In-game addon** calls `C_HousingBlueprint.RequestContents(shareCode)`
2. Addon receives manifest (item list + budgets + requirements)
3. Addon POSTs normalised manifest to website API
4. **Website** enriches with item metadata and renders previews

This requires the user to have the addon installed and to paste the code
in-game. The website alone cannot resolve codes — there is no public API.

For spatial data (positions/rotations), the addon may additionally capture the
player's OWN house layout via C_HousingLayout / C_HouseEditor. Unverified.

## Technical Gaps to Probe

- **Probe 1**: Does the raw `HOUSING_BLUEPRINT_CONTENTS_RECEIVED` payload
  carry placement transforms that HDGR ignores? → BlueprintProbe addon answer.
- **Probe 2**: Can C_HousingLayout enumerate placed decor items with
  transforms in the house editor? Used for author's own house export.
- **Probe 3**: What does `RequestBlueprintContentsForContext` require for
  non-owners browsing codes? Presumably a target houseGUID.

## Sources

- [Blizzard: A Look Ahead at Housing in Midnight](https://worldofwarcraft.blizzard.com/en-us/news/24244406) — Feb 2026
- [Wowhead: Using Blueprints to Save and Share Housing Layouts in Patch 12.1](https://www.wowhead.com/news/using-blueprints-to-save-and-share-housing-layouts-in-patch-12-1-382303) — Jul 31 2026
- [Icy Veins: WoW 12.1 Player Housing Update](https://www.icy-veins.com/wow/news/wow-12-1-player-housing-update-blueprints-pets-and-new-endeavors/) — Jun 18 2026
- [Blizzard: Curse of Ula'tek Housing Updates](https://news.blizzard.com/en-us/article/24295382) — Aug 10 2026
- [VamooseAddons/housing-decor-guide](https://github.com/VamooseAddons/housing-decor-guide) — MIT, PTR-hardened C_HousingBlueprint usage
- [Zillow for Warcraft](https://zillowforwarcraft.com/) — official marketing site
- [vicentegaspar/wow-housing-planner](https://github.com/vicentegaspar/wow-housing-planner) — community web planner
