# KwikShack Web

KwikShack is the web companion for the World of Warcraft housing addon. It is a gallery and
reference point for player housing blueprints: browse builds, inspect their requirements, copy a
share code, and submit a blueprint resolved by the addon.

Blueprint share codes are server-side references, not self-contained layouts. A website cannot
resolve one on its own. KwikShack does that work in the game client, then sends a stable manifest
to the site.

## What the site stores

- **Native builds** are submitted through KwikShack with a resolved blueprint manifest. They can
  include creator-supplied screenshots and a copyable code.
- **Indexed public blueprints** are shared third-party codes with source attribution and
  provenance. A creator can later claim and manage one without rewriting its discovery history.
- **Community Finds** are curated links to original work elsewhere when there is no usable code.
  They link out; they do not copy the creator's images, video, or prose.

A public code does not grant permission to republish the post around it. External images and
descriptions are not hotlinked, mirrored, or rehosted.

## What a blueprint can tell us

A resolved manifest can provide the share code, blueprint scope, decor and structural entries,
budget information, and missing decor, room, faction, or budget requirements.

It does not currently provide placed-item coordinates or rotations through supported addon APIs.
KwikShack can show a build's requirements and item list, but it cannot derive an accurate floor
plan from a share code alone.

## Local development

Prerequisites: Node.js, pnpm, and the checked-in SQLite dependency.

```bash
cd web
pnpm install
pnpm dev
```

The default local database is `./data/kwikshack.db`. Run the web checks with:

```bash
pnpm run check
pnpm run test
```

From the repository root, the full verification gate also checks the addon and companion decoder:

```bash
make verify
```

## Configuration

Copy the example environment file before configuring a deployed instance:

```bash
cd web
cp .env.example .env
```

The default setting is:

```dotenv
DATABASE_URL=./data/kwikshack.db
```

Production build and image submissions require `KWIKSHACK_SUBMIT_KEY`. Local `vite dev` stays open
when it is unset. Treat the key as an invitation credential and share it only with builders who
may submit native builds.

Battle.net sign-in is optional. When its configuration is absent, public browsing and the
invitation-key submission path remain available. See
[`../docs/battlenet-identity.md`](../docs/battlenet-identity.md) for the account model and limits.

## Maintenance

Use numbered SQL migrations for schema changes:

```bash
pnpm run db:migrate:check
pnpm run db:migrate:run
```

The application runs retention work in-process. Operators can run it directly:

```bash
pnpm run maintenance
pnpm run maintenance:check
```

`maintenance:check` is a dry run. The Blizzard decor catalog has its own probe and refresh path:

```bash
pnpm run decor:probe
pnpm run decor:sync
```

Read the repository documentation before adding or reviewing external content:

- [`../docs/architecture.md`](../docs/architecture.md) — data flow and trust boundaries
- [`../docs/community-curation.md`](../docs/community-curation.md) — attribution, claims, and removal
- [`../docs/migrations.md`](../docs/migrations.md) — migration workflow
