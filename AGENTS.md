# KwikShack

## Project Overview
WoW housing companion — an addon + website duo for sharing, inspecting, and
previewing housing layouts. The addon resolves blueprint share codes into
structured manifests (item lists, budgets, room requirements) and captures
spatial placement data from the player's own house. The website (kwikshack.com)
is a community hub that renders build previews and serves as a structured
housing database.

## Key Insight
Blueprint share codes in WoW 12.1 are **server-side reference links**, not
self-contained data. They must be resolved inside the game via
`C_HousingBlueprint.RequestContents(shareCode)`. The addon bridges this gap —
it asks Blizzard on the user's behalf and forwards the resolved data to the
website. No other community tool does this (wowdb/wowhead/worldofhousing are all
manual screenshot galleries).

## Architecture
Two components sharing a data format:
- **Addon** (KwikShack in-game): resolves codes via C_HousingBlueprint, captures
  placement data via C_HousingLayout, exports structured JSON to the website API
- **Website** (SvelteKit + SQLite): accepts manifest + spatial data, enriches
  with item metadata (icons, names, sources), renders 2D floor plans and
  item-list previews

## File Structure
| Directory | Purpose |
|---|---|
| `addon/` | WoW addon — interface 120100 (Midnight) |
| `web/` | SvelteKit website — kwikshack.com |
| `docs/` | Architecture, research, probes |
| `probes/` | One-off test addons (BlueprintProbe, etc.) |

## Addon Conventions (follow KwikTip)
- **Namespace**: every file opens with `local ADDON_NAME, KwikShack = ...`
- **Saved variables**: `KwikShackDB`, initialised from `KwikShack.DEFAULTS`
- **Public API**: methods on the `KwikShack` table
- **Private helpers**: `local function` at file scope; `_` prefix when attached
  to namespace
- **Lazy initialization**: defer UI until explicitly triggered

## Reference
- `docs/research.md` — full research dump (blueprint API surface, existing
  tools, technical constraints)
- `docs/architecture.md` — detailed architecture and data model
