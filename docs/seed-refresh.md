# Seed Refresh Path

The decor catalog (`decor_items` table) is seeded from the Housing Decor Guide
(HDGR) addon's Lua data — it is NOT fetched live from Blizzard. New game patches
add decor, so the catalog drifts from reality until someone re-runs this path.

## Pipeline (all in `web/scripts/`)

1. **Extract** — `extract_catalog.mjs` reads the HDGR Lua files (FacetDB +
   item DB) and emits `scripts/seed/catalog.json` (itemID → name/category/
   expansion/source/icon + style-facet tags).

2. **Enrich** — `enrich_icons.mjs` attaches real icon IDs from HDGR's icon
   table → `scripts/seed/catalog.enriched.json`.

3. **Seed** — `seed_db.mjs` writes the catalog (plus the three demo builds)
   into a fresh SQLite DB, produced as `deploy/kwikshack.db`.

4. **Bake + deploy** — the Docker image copies `deploy/kwikshack.db` to
   `/app/seed/kwikshack.db`; `deploy/entrypoint.sh` copies it to the `/data`
   volume **on first boot only** (empty volume).

## The live-refresh gap (known)

The entrypoint only seeds an **empty** volume. Redeploying with a fresh
`deploy/kwikshack.db` therefore does NOT update the catalog on an
already-deployed volume — the live DB keeps its old `decor_items` rows so that
user-submitted builds are not clobbered.

To refresh the catalog on the live volume without touching user builds:

```bash
# download the live DB, merge the new catalog in, upload it back
railway volume files --volume kwikshack-volume download /data/kwikshack.db /tmp/live.db
# (run a merge script that UPSERTs decor_items from the fresh seed into /tmp/live.db)
railway volume files --volume kwikshack-volume upload /tmp/live.db /data/kwikshack.db --overwrite
```

A `merge_catalog.mjs` helper is the intended home for that UPSERT logic; if it
is missing, write it before relying on this flow. It must be idempotent (safe to
re-run) and must not delete builds or overwrite user data.

## Checklist when a new patch ships decor

- [ ] Re-pull the latest HDGR data (it updates per patch).
- [ ] `node web/scripts/extract_catalog.mjs` → inspect `catalog.json` item count + tag coverage.
- [ ] `node web/scripts/enrich_icons.mjs`
- [ ] `node web/scripts/seed_db.mjs` → regenerate `deploy/kwikshack.db`.
- [ ] `make verify` (svelte-check + vitest still green).
- [ ] Merge the fresh catalog into the LIVE volume (see above) — or accept the
      new catalog applies only to the next clean deploy.
- [ ] Redeploy so any new code (tag columns, queries) is live.
