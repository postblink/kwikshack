# Blizzard data retention

Blizzard's Developer API Terms of Use cap how long KwikShack may keep anything it
pulls from a Blizzard API:

> You must implement a maximum 30-day TTL (time-to-live) policy for all Data
> obtained through our APIs.

> You must refresh your data no less frequently than every thirty (30) days.

Blizzard's Data Protection Notice & FAQ gives the reason — retained data "could
belong to a user who has asked for their data to be made private or erased" — and
adds: "developers should delete the data if you receive a 404 – Not Found error."

This document is how KwikShack satisfies that. Verified against both sources on
2026-08-17.

## What is and is not Blizzard data

This distinction decides what expires, so it is worth being exact.

| Data | Blizzard API? | Expires |
|---|---|---|
| `wow_character_identities` — name, realm, faction, level | **Yes** (`/profile/user/wow`) | **30 days** |
| `canonical_decor` — official decor names and metadata | **Yes** (`/data/wow/decor/*`) | **30 days** |
| `decor_items` — the legacy catalog | No — MIT-licensed Housing Decor Guide data + Wowhead enrichment | Never |
| `decor_identifier_map` — KwikShack's own mapping conclusions | No — derived by us, from evidence we recorded | Never |
| `accounts`, `battle_net_identities` — the account and its Battle.net id | No — the identifier is our join key, supplied at sign-in | Until deletion is requested |
| `builds`, `indexed_blueprints`, claims, provenance, audit | No — KwikShack's own records | Until removal is requested |
| `sessions`, `oauth_states` | No | Own short lifetimes |

**On canonical decor:** the Terms say "all Data", while the FAQ frames the rule
entirely around *player* data. This is genuinely ambiguous. KwikShack applies the
strict reading and expires static game data on the same clock, because losing it
degrades gracefully to the legacy catalog and costs nothing. If Blizzard ever
clarifies that static game data is exempt, this can be relaxed.

## What the maintenance job does

`web/src/lib/server/retention.ts` and `web/scripts/maintenance.mjs`, sharing one
rule set:

1. Delete `wow_character_identities` rows past their own `expires_at`.
2. Delete `canonical_decor` rows synced more than 30 days ago.
3. Delete expired `sessions` and `oauth_states` (housekeeping, not an obligation).
4. Re-check that nothing Blizzard-derived remains older than the TTL, and fail
   loudly if it does.

It is idempotent — it only deletes rows whose own stored deadline has passed, so
running it twice in a second is a no-op.

It is deliberately narrow. It does **not** touch accounts, Battle.net identities,
claims, audit events, builds, indexed blueprints, provenance, screenshots, the
legacy catalog, or the identifier map. Losing a character association must never
cascade into losing a creator their listing.

Logging is counts only. No character name, realm, BattleTag, account id, or
anything token-shaped is ever written to a log line, and there is a test for it.

## How it is scheduled

**Primary: in-process, every six hours.** `retention-scheduler.ts` starts a timer
when the server boots.

The deployment is a single Railway service with a mounted volume and no cloud
scheduler. The one existing cron (`scripts/backup_volume.sh`) runs from a
workstation via the Railway CLI, which is fine for backups and not fine for a
compliance obligation. The application server is the only process guaranteed to
be running wherever the database is — and if it is not running, nobody can read
the data either. Six hours rather than twenty-four means a missed tick never puts
the deadline at risk.

**Secondary: the CLI**, for operators, verification, and any platform cron that
gets added later:

```bash
cd web && pnpm maintenance
```

```bash
cd web && pnpm maintenance:check
```

`maintenance:check` is a dry run: it reports what it would delete and writes
nothing.

Exit codes: `0` clean, `1` ran but over-TTL data still exists (investigate), `2`
failed to run. That makes it usable as a monitored cron directly.

If a platform cron is added later, `node /app/scripts/maintenance.mjs
--database "$DATABASE_URL"` daily is the whole configuration. The in-process
timer can stay; running both is harmless.

## Refresh, and why deletion is the answer here

Blizzard expects data to be refreshed within the window. KwikShack stores no
access or refresh token by design (see
[battlenet-identity.md](battlenet-identity.md)), so it cannot refresh profile
data unattended. Deletion at the deadline is the compliant outcome — the
requirement is that data does not outlive the window.

**The user-visible consequence: character and account data may require signing in
again to refresh it.** `/account` shows each character's deletion date, and a
claim citing an expired character asks the user to re-authenticate rather than
failing obscurely.

Canonical decor is different: it involves no user, so it *can* be refreshed
unattended.

```bash
cd web && pnpm decor:sync
```

Run it at least every 7 days. Waiting until day 30 leaves no room for a failed
run. If a sync fails for a month, canonical rows expire and the site returns to
the legacy catalog — degraded, not broken.

## Verifying it

`retention.test.ts` covers, against real SQLite:

- the TTL constant matches Blizzard's documented 30 days
- expired character data is deleted; in-window data is kept
- the boundary holds — one second past the deadline goes, one second before stays
- expired canonical decor is deleted; recent rows are kept
- a second run changes nothing
- nothing Blizzard-derived survives older than the TTL
- accounts, identities, builds, indexed listings, claims, the legacy catalog, and
  the identifier map all survive
- log output contains counts and no identifying detail

Operationally, `/admin/decor` shows the age of the oldest Blizzard-derived record
and warns when it reaches the limit.
