# Database migrations

KwikShack's schema is now evolved by numbered SQL files, applied once and
recorded. This replaces `drizzle-kit push`, which is what let the deployed
database drift from `schema.ts` in the first place.

The system is deliberately boring. It is about 100 lines and does four things:
apply pending files in order, inside a transaction, record what it applied, and
refuse to guess.

## Layout

```
web/migrations/0001_baseline.sql          the pre-migration schema, IF NOT EXISTS
web/migrations/0002_identity.sql          accounts, Battle.net, characters, sessions
web/migrations/0003_blueprint_index.sql   indexed blueprints, sources, claims, audit
web/migrations/0004_canonical_decor.sql   canonical decor, identifier map, sync state
web/src/lib/server/db/apply-migrations.js the runner (plain JS — see below)
web/src/lib/server/db/migrate.ts          server-side loader (import.meta.glob)
web/scripts/migrate.mjs                   CLI, used by the deploy entrypoint
```

`0004` is additive only — three new tables, no change to any existing one — so an
older application version runs unchanged against it. Verified against a copy of
the deployed database: 3 builds and 2,267 decor rows preserved.

The runner is plain JavaScript on purpose: the SvelteKit server bundle and the
standalone Node CLI import the *same* function. Two implementations of "apply
migrations" is how drift starts.

The server loads the `.sql` files through `import.meta.glob(..., '?raw')` so they
are bundled into `build/`. Reading them from disk at runtime would break the
Docker image, which ships only `build/` and `node_modules/`.

## Rules

- **Never edit an applied migration.** The runner records a checksum. Editing one
  produces a loud warning and does not re-run the file — because silently
  rewriting a live database is worse than noticing the problem.
- **Add a new numbered file** for every schema change, including columns.
- **Update `schema.ts` in the same change.** `db/schema.test.ts` compares every
  declared table against the migrated database and fails the suite if they
  disagree. That test is the drift guard; do not skip it.
- Each file runs in a transaction. A failure rolls that file back and leaves it
  unrecorded, so a fixed migration can simply be re-run.
- Nothing in a migration should drop or rewrite data without a deliberate,
  reviewed decision.

## The baseline column repair

`0001_baseline.sql` is all `CREATE TABLE IF NOT EXISTS`, so on the already-deployed
database it is a no-op. But that database had four columns added by hand before
migrations existed (`builds.blueprint_scope`, `builds.last_verified_at`,
`decor_items.record_id`, `decor_items.tags`), and a database that missed one of
those hand edits would silently lack it.

So the runner carries one explicit, hard-coded list of those four columns and
adds any that are missing, before the numbered migrations run. It is a one-time
reconciliation of the pre-migration era.

**Do not add to that list.** New columns belong in a numbered migration. The
whole point is that this class of drift cannot recur, because from here the
runner knows what has been applied.

## Running them

Migrations run automatically when the server opens the database, so `vite dev`,
`vitest`, and production all boot on the migrated schema. The deploy entrypoint
*also* runs them explicitly before starting the app, so a failure stops the
deploy instead of half-starting it.

```bash
cd web && pnpm db:migrate:run
```

```bash
cd web && pnpm db:migrate:check
```

`db:migrate:check` is a dry run: it prints the target database and the files it
would consider, and writes nothing.

Against a specific file:

```bash
cd web && node scripts/migrate.mjs --database /data/kwikshack.db
```

## Backups and rollback

The CLI takes a timestamped copy of an existing database before it applies
anything, after checkpointing the WAL so the copy is complete:

```
/data/kwikshack.db.bak-2026-08-17T22-15-10-303Z
```

Set `KWIKSHACK_MIGRATE_BACKUP=0` to skip it (CI and ephemeral databases only).

To roll back, stop the app, move the backup over the live file, and deploy the
previous image. There is no `down` migration and there should not be: a
hand-written reverse of a schema change is another thing that can be wrong, and
a file copy of a single-file database is both simpler and more trustworthy.

Because every migration to date is additive, an older application version runs
fine against a newer schema. That is worth preserving — prefer additive changes,
and split a rename into "add, backfill, switch reads, drop later" across
releases.

## Deployment procedure

1. Merge the migration and the matching `schema.ts` change together.
2. Build the image. The Dockerfile copies `migrations/`, `scripts/migrate.mjs`,
   and `apply-migrations.js` into the runtime layer.
3. On boot, `deploy/entrypoint.sh` seeds the database on first run, then runs
   `node /app/scripts/migrate.mjs --database "$DATABASE_URL"`.
4. A failed migration exits non-zero with the rolled-back file named, and the
   backup path printed. The container does not start with a half-migrated
   database.
5. Confirm afterwards with `pnpm db:migrate:check` or by reading
   `schema_migrations`.

## Verified behaviour

`db/apply-migrations.test.ts` covers, against real SQLite:

- a fresh database gets the full schema
- a second run applies nothing
- the currently-deployed pre-migration shape upgrades without losing rows, with
  the four hand-added columns reconciled
- a failing migration rolls back and stays unrecorded
- an edited applied migration warns instead of silently re-running

The upgrade path was also exercised directly against a copy of
`deploy/kwikshack.db`: 3 builds and 2,267 decor rows survived, and the four new
identity/indexing tables were created.
