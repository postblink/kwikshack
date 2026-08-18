# Cohort 01 resolution worklist

Turning 14 opaque blueprint codes into KwikShack-resolved records.

Status at the top, because it determines everything below: **none of the 14 have
been resolved.** Resolution cannot be automated or performed off-machine — it
requires a logged-in WoW client. This document is the procedure and the
scoreboard.

## Why this is manual

A blueprint share code is a server-side reference, not a payload. Resolving one
means calling `C_HousingBlueprint.RequestBlueprintContents(shareCode)` **inside
the game client**, which triggers an authenticated Blizzard request. No web
service — KwikShack's included — can do it. See
[architecture.md](architecture.md).

So the chain has one irreducible human step:

```
addon resolves in-game  →  operator copies the manifest  →  admin ?/resolve form
```

## ⚠️ Use the admin form, not the companion

`scripts/watchdog.py` POSTs to `/api/builds`, which creates a **native build**.
That is correct for a creator submitting their own work and **wrong for resolving
a third-party indexed code**.

Pointing it at one of these codes used to corrupt three things silently. That is
now fixed — the collision is linked, audited, and cannot teach the decor catalog
— but the outcome is still not what you want:

| | Before the fix | Now |
|---|---|---|
| Records for one blueprint | 2, **unlinked** | 2, **linked** via `native_build_id` |
| Published listing | both public | indexed one archived; native takes precedence |
| Curated draft | untouched, still duplicated | preserved, linked, not archived |
| Attribution | companion operator | still the companion operator — **unchanged** |
| Decor catalog | **learned from a third-party manifest** | **never learns from an indexed code** |

The attribution row is why this is still the wrong tool: nothing at
`/api/builds` can tell "the creator submitting their own build" from "an operator
resolving somebody else's code", so a build submitted this way is credited to
whoever ran the companion. Resolving through the admin form avoids the question
entirely — it attaches a manifest to the existing listing and leaves the
creator's attribution alone.

**Use `/admin/blueprints` → Attach a resolved manifest.**

## Procedure per blueprint

1. In-game, with the KwikShack addon loaded, resolve the code. The addon stores
   the normalised manifest in `KwikShackDB.resolvedManifests[shareCode]` and sets
   `_lastResolved`; `/kshack copy` opens the export dialog.
2. Copy the manifest JSON.
3. On the site as an operator: `/admin/blueprints` → **Attach a resolved
   manifest** → paste the listing id and the JSON → Attach.
4. The form refuses a manifest whose `shareCode` does not match the listing, so a
   mispaste fails loudly rather than attaching the wrong build's contents.
5. Record the outcome in the table below.

A failure to resolve is **not** evidence the code is bad. `UNAVAILABLE` requires
an actual failed lookup; anything else is `NOT YET TESTED`.

## What resolution may and may not change

Two evidence domains, kept apart:

| Domain | Source | May be changed by resolution |
|---|---|---|
| Editorial / provenance | manual curation | **No.** Title, attributed creator, source URLs, discovery date, internal notes are never touched by a manifest |
| Structured / derived | the blueprint itself | Yes. `manifest`, `resolution_state`, decor counts, room counts |

`attachResolvedManifest` writes `manifest`, `resolutionState`, `resolutionCheckedAt`
and `blueprintType`. It does **not** write `faction`, `blueprintScope`,
`attributedCreator`, or `title`.

**One thing to watch:** it *does* overwrite `blueprintType` from the manifest.
Where the curated type came from the creator's own words ("Full Layout",
"Interior Only"), a disagreement is a fact worth reviewing, not an error to
silently accept. Note it in the Discrepancy column rather than assuming the
manifest is right — the creator knew which code they were posting.

## Scoreboard

Statuses: `RESOLVED` · `FAILED / INVALID` · `UNAVAILABLE` · `NOT YET TESTED` · `NEEDS MANUAL REVIEW`

| # | Listing | Creator | Curated type/scope | Curated faction | Status | Decor | Rooms | Discrepancy |
|---|---|---|---|---|---|---|---|---|
| 1 | The Magician's Inn | Krawwly-2524994 | House / full_house | Horde | NOT YET TESTED | — | — | — |
| 2 | Octagonal Portal Room | Krawwly-2524994 | Room / room | — | NOT YET TESTED | — | — | — |
| 3 | Pirate theme house | Tink-45690 | House / full_house | — | NOT YET TESTED | — | — | — |
| 4 | Dalaran Sewers Theme | Krispy-3270454 | Interior / interior | — | NOT YET TESTED | — | — | — |
| 5 | My Spaceport | Slith-2207681 | Interior / interior | Horde | NOT YET TESTED | — | — | — |
| 6 | Large Night Elf Exterior | Tharna-2680702 | Exterior / exterior | — | NOT YET TESTED | — | — | — |
| 7 | Pink Treehouse for Whales | Tharna-2680702 | House / — | — | NOT YET TESTED | — | — | — |
| 8 | Season 1 Trophy Hall | mastergib-1215205 | Room / room | — | NOT YET TESTED | — | — | — |
| 9 | Stone wall great hall | backspace-3310469 | Room / room | — | NOT YET TESTED | — | — | — |
| 10 | Orcish collector of collections | Lyoo-45842 | House / full_house | — | NOT YET TESTED | — | — | — |
| 11 | Cozy small packed house | Orilas-2654652 | House / full_house | — | NOT YET TESTED | — | — | — |
| 12 | Just a Jar on a table | ABunchOf-612452 | Room / room | — | NOT YET TESTED | — | — | — |
| 13 | Rainbow Room Night Club | Deo | Room / room | — | NOT YET TESTED | — | — | — |
| 14 | Pool Party | Deo | House / — | — | NOT YET TESTED | — | — | — |

Share codes are in `web/scripts/seed/blueprint-cohort-01.json`; they are not
duplicated here so there is one place to correct them.

## Known risks going in

- **Decor requirements gate resolution.** #4 (Dalaran Sewers) needs housing rank
  9 and ~4,297 decor by the creator's own account, and #5 (My Spaceport) is
  similarly large. A resolving character short of those may get partial or failed
  contents. That is a property of the *account doing the resolving*, not the code
  — record `NEEDS MANUAL REVIEW`, not `UNAVAILABLE`.
- **#4 is flagged by its own creator** as unfinished, last updated in 12.0.7, with
  doubt about whether multi-floor stairwell rooms export. Highest chance of a
  genuine failure in the cohort.
- **Alternate scopes exist for #1 and #5.** Their creators also posted
  interior-only and exterior-only codes that were deliberately not indexed. If a
  full-layout code resolves to something that looks interior-only, check the
  cohort file's internal notes before concluding the listing is wrong.
- **#2 and #1 come from one post**, as do #6 and #7, and #13 and #14. Resolving
  them together makes cross-checking easier.
- **Codes are revocable.** A code that resolved during curation may not resolve
  later. Re-check before publishing, not only at resolution time.
