# Community Find curation

Community Finds let KwikShack point players toward excellent WoW housing work that was published elsewhere without pretending it is a native KwikShack submission.

They are deliberately separate from native builds:

- A native build has a resolved blueprint manifest and can offer a tested copy action.
- A Community Find is a curated, attributed link to the creator's original post.
- An external find never receives KwikShack's blueprint or validation language merely because it appears on the site.

## Current publishing model

The initial registry is `web/src/lib/server/community-finds.data.ts`. It is server-only and reviewed through Git. This is intentionally smaller and safer than adding an unauthenticated moderation API before KwikShack has administrator identities and a stable migration workflow.

Each record has:

- `id`: stable lowercase URL slug.
- `title`, `creatorName`, `sourcePlatform`, `sourceUrl`: visitor-facing provenance. `sourceUrl` must be the canonical original post, not a search result or repost.
- `attribution`: optional context supplied by or appropriate to the creator. Do not put internal permission evidence here.
- `permission`: internal review state. Use `external-link-only` when KwikShack is only linking to a public original; use `granted` only when the relevant permission has actually been recorded.
- `publication`: `draft`, `published`, or `archived`. Only `granted` and `external-link-only` records can be published.
- `discoveredAt`, `addedAt`: ISO dates (`YYYY-MM-DD`).
- `featured`: optional homepage priority. Only published records can be featured.
- `claimUrl`: optional real intake URL or monitored email address. Omit it when no claim workflow exists.
- `nativeBuildId`: optional link to a native KwikShack listing after that listing exists. This does not turn the Community Find itself into a native build.
- `curationNotes`: internal evidence and review notes. This is stripped before data reaches visitors.

Run `pnpm community:validate` from `web/` before publishing a registry change. The application also refuses to start with an invalid registry.

## Review workflow

1. Add a candidate as `draft` with its canonical original URL, visible creator name, discovery date, and concise internal notes.
2. Confirm the page is publicly accessible, the creator attribution is unambiguous, and the source is the original rather than a repost.
3. Decide the narrow sharing boundary. A plain external link can use `external-link-only`; do not copy images, video, text, or blueprint strings into KwikShack on that basis.
4. Use `granted` only when the creator has clearly granted the specific use being made. Record where that permission can be audited in `curationNotes`.
5. Change the record to `published`, run validation and the normal project checks, then visually review the list and detail pages.
6. If the source disappears, ownership is disputed, or permission is withdrawn, archive the record immediately. Do not silently replace it with a mirror.

No external media is rehosted or embedded in this first slice. A public blueprint string is not treated as permission to republish it, and attribution is not treated as proof of ownership.

## Seeding the first 50–100 finds

Seed quality matters more than speed. A practical first cohort would be:

1. Identify 5–8 active, creator-oriented community sources and document their linking and embedding constraints.
2. Build a private draft queue of roughly 100 candidates, recording the canonical post, visible creator identity, build type/style signals, source health, and any outreach status.
3. Invite 10–20 established creators to become founding contributors. Prefer converting their work into native listings when they want to supply a resolved blueprint and screenshots themselves.
4. Publish externally linked finds in small batches of 10–15. Balance interiors, exteriors, rooms, houses, factions, decor densities, and visual styles using observed evidence rather than invented taxonomy.
5. Recheck source links and attribution before each batch. Keep only one canonical find for duplicated cross-posts.
6. Review click-through and native-submission conversion before expanding volume. Do not use copied media as a shortcut to stronger-looking cards.

## Before moving this into the database

Do not add a Community Find table until the deployment migration path is reliable and the product has a real staff identity/authorization boundary. At that point, preserve the same conceptual split and add an auditable moderation history rather than merging external records into `builds`.

A future administrative model should track who changed publication and permission states, when they changed, the evidence supporting the decision, link-health state, and creator claim resolution. Public creator profiles should also use claimed identities rather than matching on display-name text.
