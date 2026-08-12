# Seed Refresh Path

The decor catalog (`decor_items` table) is seeded from the Housing Decor Guide
(HDGR) addon's Lua data — it is NOT fetched live from Blizzard. New game patches
add decor, so the catalog drifts from reality until someone re-runs this path.

## Pipeline (all in `web/scripts/`)

1. **Extract** — `extract_catalog.mjs` reads the HDGR Lua files (FacetDB + item
   DB) and emits `scripts/seed/catalog.json` (itemID → name/category/expansion/
   source/icon + style-facet tags: mood/culture/size/palette/inout).

2. **Enrich** — `enrich_icons.mjs` attaches real icon IDs → `scripts/seed/catalog.enriched.json`.

3. **Seed** — `seed_db.mjs` UPSERTs `catalog.enriched.json` into `decor_items`.
   It does **not** create the schema or the demo builds.

4. **Schema** — `drizzle-kit push` (see below) applies `schema.ts` to a SQLite
   DB. A fresh DB needs `db:push` first, then `seed_db.mjs`.

5. **Bake + deploy** — the Docker image copies `deploy/kwikshack.db` to
   `/app/seed/kwikshack.db`; `deploy/entrypoint.sh` copies it to the `/data`
   volume **on first boot only** (empty volume).

## Schema + catalog migration (live volume)

The entrypoint only seeds an **empty** volume, and there is no runtime
migration. When `schema.ts` or the catalog changes, migrate the live volume in
place so user-submitted builds survive:

```bash
export PATH="$HOME/.railway/bin:$PATH"
V=kwikshack-volume

# 1. download the live DB
railway volume files --volume $V download /data/kwikshack.db /tmp/live.db

# 2. migrate schema in place (preserves rows)
cd web && DATABASE_URL=/tmp/live.db npx drizzle-kit push --force && cd ..

# 3. refresh the catalog (idempotent UPSERT, fills decor_items.tags too)
DB_PATH=/tmp/live.db node web/scripts/seed_db.mjs

# 4. sanity-check, then upload back
sqlite3 /tmp/live.db "PRAGMA integrity_check;"
railway volume files --volume $V upload /tmp/live.db /data/kwikshack.db --overwrite

# 5. keep deploy/kwikshack.db in sync so the NEXT clean deploy is correct
cp /tmp/live.db deploy/kwikshack.db

# 6. redeploy so the new code (schema reads, tag queries) is live
railway up -d -y
```

`drizzle-kit push --force` auto-approves schema diffs; it is safe for additive
changes (new tables/columns). Review its printed statements before relying on it
for anything destructive. `seed_db.mjs` is idempotent and must not delete builds
or overwrite user data.

## Checklist when a new patch ships decor

- [ ] Re-pull the latest HDGR data (it updates per patch).
- [ ] `node web/scripts/extract_catalog.mjs` → inspect item count + tag coverage.
- [ ] `node web/scripts/enrich_icons.mjs`
- [ ] Regenerate `deploy/kwikshack.db` (fresh `db:push` + `seed_db.mjs`) for next clean deploy.
- [ ] `make verify` (luac/luacheck + svelte-check + vitest + companion decode still green).
- [ ] Run the live-volume migration above if the catalog should update the running site now.
- [ ] Redeploy.
