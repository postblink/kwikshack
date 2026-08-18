# Community curation

KwikShack now curates external work in two distinct ways. Keeping them apart is the whole point: they carry different promises to visitors and different obligations to creators.

- **Indexed public blueprint** — a blueprint code the creator publicly and intentionally shared for other players to import. KwikShack indexes the code itself, with attribution and source provenance. Visitors can copy it. See [Indexing public blueprints](#indexing-public-blueprints).
- **Community Find** — an external build worth seeing for which KwikShack has no usable blueprint. A curated, attributed link to the creator's original post, nothing more.
- **Native build** — the creator submitted it here, with a resolved manifest and a tested copy action.

An external record never receives KwikShack's blueprint or validation language merely because it appears on the site.

---

# Indexing public blueprints

## The policy

**If a blueprint code is publicly and intentionally shared for use by other players, KwikShack may treat the blueprint code itself as an indexable, shareable resource** — subject to the source platform's rules and to the creator's removal requests.

That permission is narrow, and it is the only thing it covers. A shared code is not permission to republish the post around it. The creative work — screenshots, written descriptions, video, artwork, the social post itself — remains the creator's and stays under normal copyright and platform restrictions.

The test is intent. A creator posting "here's my code, go build it" in a blueprint-sharing thread has shared it for use. A code visible in a video frame, or in a private server, has not.

## What KwikShack may store and display

- the public blueprint code
- the source platform and canonical source URL
- the attributed creator name, and realm/character where the source states one
- the discovery date
- KwikShack-generated technical metadata derived from resolving the blueprint
- blueprint availability and resolution state
- claim state
- an optional link to a related native build

## What KwikShack does not copy

Never, unless we have permission, an appropriate licence, or a legitimate official embed mechanism:

- screenshots or any other image
- prose descriptions
- video
- artwork
- any other presentation content from the source

No hotlinking, no proxying, no rehosting, no "just caching it". A listing with no creator-uploaded image uses KwikShack's branded placeholder, and says plainly that we do not copy images from the original post. That empty frame is the policy working, not a gap to fill.

## Revocation

Blueprint sharing is revocable in practice — a creator can delete a blueprint, and a code stops resolving.

When an indexed code stops resolving or becomes unavailable:

- the Copy Blueprint action is removed, not left to fail
- the listing shows a clear visitor-facing unavailable or revoked state
- the blueprint is never presented as usable when it is not
- provenance and history are preserved
- a claimed creator can replace the code later

The listing is stable; the share token attached to it is replaceable. `resolution_state` carries `unresolved | resolved | unavailable | revoked`, and only the first two offer a copy action.

## Takedown and removal

A creator does not have to prove ownership to be removed. Ask, and:

1. The listing is archived immediately — off the public site, provenance retained internally.
2. We confirm what was removed.
3. If they would rather correct it than remove it, claiming gets them the listing instead.

Disputed attribution is handled the same way: archive first, resolve after. There is no version of this where a creator has to argue with us while their work stays up.

## Deduplication and precedence

- A **native build** with the same code always wins. An indexed record is refused rather than created, and can never shadow a creator's own submission.
- One blueprint found in five places is **one listing with five source rows**, not five listings. Extra sources add provenance.
- A **claimed** listing presents as creator-managed, above the observed source attribution.

## Source policy

Three separate questions, three separate answers, per platform:

1. May a person manually discover content there?
2. May KwikShack automate access to that source?
3. May KwikShack reproduce its media or prose?

The registry in `web/src/lib/server/sources.ts` records all three. Today **every platform is manual-only and no-reproduction, and no adapters are registered.** That is a deliberate default.

Candidate discovery sources include the WoW forums' Housing Blueprints category (the strongest signal of intentional sharing, since players post codes there specifically for others to import), Reddit's housing communities, Wowhead and WoWDB galleries, YouTube and Twitch, Pinterest, Bluesky, and public Discords.

### Before enabling any automated adapter

All of these, in order, before a single automated request:

1. Read that platform's **current** terms of service and developer/API terms.
2. Identify the **specific permitted access method** — an official API, an official embed, a documented feed. "The page is public" is not an access method.
3. Record that method in the platform's registry entry and flip `automation` to `'adapter'`.
4. Leave `media` untouched. API access to metadata is not permission to reproduce media.
5. Confirm the adapter returns **candidates for review**, never published listings, and never media.

If a platform forbids automated collection, ingestion stays manual. There is no general-purpose scraper, and there should not be one.

## Indexing workflow

1. Find a publicly shared code at a canonical original source — not a repost, not a search result.
2. Confirm the sharing was intentional and the attribution is unambiguous.
3. Use `/admin/blueprints` to check the code for a native or indexed conflict.
4. Index it as a **draft** with the source URL, attributed creator, discovery date, and internal review notes. Write your own curation title; do not copy or lightly rewrite the creator's.
5. Where practical, resolve the code through the addon and attach the manifest, so the listing's decor data is KwikShack's own reading rather than a claim from the source.
6. Publish. Recheck link health and attribution before each batch.
7. If the source disappears, the code stops resolving, or permission is withdrawn, change the state immediately. Do not silently substitute a mirror.

## Claim workflow

```
Indexed public blueprint
        ↓
Creator signs in with Battle.net
        ↓
Creator requests a claim, optionally citing a character they own
        ↓
KwikShack records the request and which evidence signals were present
        ↓
A person reviews it
        ↓
Listing becomes creator-managed — provenance intact
```

Battle.net proves the claimant controls a Battle.net account, and with the profile permission, which characters it controls. **It does not prove they built anything** — no Blizzard API exposes who created a blueprint. Approve on evidence that actually connects the account to the original share. A name that resembles the attribution is not that evidence.

Once approved, the creator can set the title, description, tags, their own uploaded screenshots, how they want to be credited, their own links, and a replacement blueprint code. They cannot alter the discovery record, the observed source attribution, the audit history, or KwikShack-derived decor data — that is regenerated from the blueprint, never hand-edited.

The listing's framing changes from *indexed from a public community share* to *managed by the claimed creator*, without ever implying KwikShack was where it was first published.

## Founding Builder conversion

Claiming is the on-ramp, not the destination. A claimed creator has already proven a Battle.net identity and shown they want their work represented well here — which is exactly the profile of a founding builder.

The path:

1. **Indexed** — we found their public code and credited them.
2. **Claimed** — they signed in, claimed it, and now manage the listing.
3. **Invited** — offer them a submit key so they can submit builds natively, with their own resolved manifests and screenshots from the start.
4. **Native** — their new work arrives as native builds. The indexed listing stays, linked, with its original discovery record intact.

Do not auto-convert an indexed listing into a native build. The two mean different things, and rewriting history to look like KwikShack was the original venue is the exact dishonesty this whole model exists to avoid.

---

# Community Finds

Community Finds remain the right shape for external work KwikShack cannot offer a blueprint for.

## Current publishing model

The initial registry is `web/src/lib/server/community-finds.data.ts`. It is server-only and reviewed through Git. This is intentionally smaller and safer than adding an unauthenticated moderation API before KwikShack has administrator identities and a stable migration workflow.

Each record has:

- `id`: stable lowercase URL slug.
- `title`, `creatorName`, `sourcePlatform`, `sourceUrl`: visitor-facing provenance. `sourceUrl` must be the canonical original post, not a search result or repost.
- `curationBlurb`: original KwikShack editorial copy. Do not copy or lightly rewrite the creator's description.
- `tags`: a short, reviewed set of discovery labels for the Find. These do not enter the native-build tag taxonomy.
- `attribution`: optional context supplied by or appropriate to the creator. Do not put internal permission evidence here.
- `permission`: internal review state. Use `external-link-only` when KwikShack is only linking to a public original; use `granted` only when the relevant permission has actually been recorded.
- `publication`: `draft`, `published`, or `archived`. Only `granted` and `external-link-only` records can be published.
- `discoveredAt`, `addedAt`: ISO dates (`YYYY-MM-DD`).
- `featured`: optional homepage priority. Only published records can be featured.
- `claimUrl`: optional real intake URL or monitored email address. The pilot may use the existing `/submit` route, which remains invitation-gated and does not transfer ownership automatically.
- `nativeBuildId`: optional link to a native KwikShack listing after that listing exists. This does not turn the Community Find itself into a native build.
- `curationNotes`: internal evidence and review notes. This is stripped before data reaches visitors.

Run `pnpm community:validate` from `web/` before publishing a registry change. The application also refuses to start with an invalid registry.

## Review workflow

1. Add a candidate as `draft` with its canonical original URL, visible creator name, discovery date, and concise internal notes.
2. Confirm the page is publicly accessible, the creator attribution is unambiguous, and the source is the original rather than a repost.
3. Decide the narrow sharing boundary. A plain external link can use `external-link-only`; do not copy images, video, or text into KwikShack on that basis. If the creator *did* publicly share a blueprint code for others to import, that belongs in the blueprint index above, as an indexed listing — not smuggled into a Find.
4. Use `granted` only when the creator has clearly granted the specific use being made. Record where that permission can be audited in `curationNotes`.
5. Change the record to `published`, run validation and the normal project checks, then visually review the list and detail pages.
6. If the source disappears, ownership is disputed, or permission is withdrawn, archive the record immediately. Do not silently replace it with a mirror.

No external media is rehosted or embedded. A public blueprint code is permission to index the code — it is never permission to republish the post around it, and attribution is never proof of ownership.

## Seeding the first 50–100 finds

Seed quality matters more than speed. A practical first cohort would be:

1. Identify 5–8 active, creator-oriented community sources and document their linking and embedding constraints.
2. Build a private draft queue of roughly 100 candidates, recording the canonical post, visible creator identity, build type/style signals, source health, and any outreach status.
3. Invite 10–20 established creators to become founding contributors. Prefer converting their work into native listings when they want to supply a resolved blueprint and screenshots themselves.
4. Publish externally linked finds in small batches of 10–15. Balance interiors, exteriors, rooms, houses, factions, decor densities, and visual styles using observed evidence rather than invented taxonomy.
5. Recheck source links and attribution before each batch. Keep only one canonical find for duplicated cross-posts.
6. Review click-through and native-submission conversion before expanding volume. Do not use copied media as a shortcut to stronger-looking cards.

## Before moving this into the database

The two preconditions recorded here have now been met: [migrations.md](migrations.md) gives a reliable deployment path, and Battle.net identity plus `KWIKSHACK_ADMIN_BNET_SUBS` gives a real staff authorization boundary. `indexed_blueprints` is the worked example of what a database-backed external record should look like — a separate table from `builds`, with append-only provenance in `indexed_blueprint_sources` and history in `blueprint_audit_events`.

Community Finds have deliberately **not** been migrated in this phase. The Git-reviewed registry is still the right size for the number of records involved, and moving it would spend the migration budget without changing anything a visitor sees. Move it when the volume makes Git review the bottleneck, and when it does, reuse the `indexed_blueprints` shape rather than inventing a third one.

Whatever moves it should track who changed publication and permission state, when, the evidence behind the decision, link-health state, and claim resolution. Public creator profiles should use claimed identities — never display-name text matching.

---

# Seeding the first indexed cohort

## Cohort 01 — seeded 2026-08-17

**14 listings, 11 creators, 2 platforms.** The reviewed records live in
`web/scripts/seed/blueprint-cohort-01.json` and are loaded with
`pnpm seed:blueprints`, which POSTs them through the real operator form so a
seeding run exercises the same auth, validation, dedup, and audit path a curator
using the admin UI does.

**Import is draft-first.** The intended lifecycle is
`ingest → draft → resolve/verify → review → publish`, and the importer creates
drafts unless `--publish` is passed. Drafts are invisible in the public gallery,
so an unreviewed batch cannot reach visitors by running the obvious command.

The cohort file is the reviewable artefact: it carries the internal notes, the
curation reason for every pick, **and the reasons for every rejection**. Read it
before adding a second batch — the rejections are the more useful half.

What the batch is made of:

| | |
|---|---|
| Whole houses | 6 |
| Interiors | 2 |
| Rooms | 5 |
| Exterior | 1 |
| Creators | 11 (max 2 listings each) |
| Sources | WoW Forums ×12, YouTube ×2 |
| Resolution state | all `unresolved` — KwikShack cannot resolve a code from the web |
| Claim state | all `unclaimed` |

Deliberate gaps, recorded rather than filled with weak entries: **no dedicated
library, gothic/spooky, workshop, or garden build.** The Housing Blueprints forum
category was six days old at curation time and simply did not contain one. Two
candidates would have filled the gothic gap and were rejected because their
creators called them unfinished.

### What this batch established as practice

1. **Attribute to the person who posted the code**, at the most specific URL
   available — a post permalink (`…/2335562/36`), not a thread top, when the code
   was shared inside someone else's thread.
2. **Canonical source is where the creator published the code**, not where we
   happened to find it. Deo posted codes in a YouTube description and announced it
   on the forums; the video is canonical and the forum thread is a second source
   on the same listing.
3. **Fill a field only if the creator stated it.** An orc-themed interior is not
   evidence of a Horde faction requirement. `faction` was set on 2 of 14 listings;
   the other 12 are honestly null.
4. **Alternate scopes of one build are not separate listings.** Several creators
   posted full/interior/exterior codes for the same house; only one was indexed,
   with the others recorded in internal notes. A genuinely standalone component
   (Krawwly's portal room) is the exception, and only because the creator framed
   it as reusable on its own.
5. **A code with no describable build is not a listing.** Four bare codes were
   rejected — presenting them would have meant inventing a title on the creator's
   behalf.

### Running an import

Preview first — this contacts no server and writes nothing:

```bash
cd web && pnpm seed:blueprints:check
```

Locally, against a dev server on localhost (creates a throwaway operator and
removes it afterwards):

```bash
cd web && pnpm seed:blueprints:local --base http://127.0.0.1:3000 --database ./data/kwikshack.db
```

Against a real deployment, as drafts:

```bash
printf '%s' "$KWIKSHACK_OPERATOR_COOKIE" | node scripts/seed-blueprints.mjs --base https://kwikshack.com --session-stdin
```

**The operator session is never passed as a command-line argument.** It is a
bearer credential — anything holding it can act as an administrator — and argv is
visible to every process on the host and saved in shell history. The importer
refuses `--session <value>` outright. Accepted sources, in order of preference:
`--session-stdin`, the `KWIKSHACK_IMPORT_SESSION` environment variable, or
`--session-file <path>` (refused unless the file is `chmod 600`). The value is
never logged and is redacted from error output.

`--bootstrap-session` writes an administrator directly into the database and is
therefore **refused for any non-localhost target**. The account it creates has a
per-run random id and is removed on every exit path, including failures and
Ctrl-C; an operator's own account is never touched by an import.

Re-running is safe: a listing whose code and source URL are both already present
comes back `duplicate` and nothing is written twice.

After importing, review the drafts at `/admin/blueprints` and publish
individually with the *Change state* form.

---

Target roughly **25–50 indexed public blueprints** before attempting any wider automation. Quality and provenance matter more than volume, and a small honest index is more useful than a large uncertain one.

## Where to start

Prioritise sources where sharing intent is unambiguous:

1. **WoW Forums → Housing Blueprints** — players post codes there specifically so others can import them. Highest signal, clearest intent, easiest attribution. Expect the bulk of a first cohort here.
2. **Reddit housing communities** — good volume, but check each post is the original and the code is in the author's own text.
3. **YouTube and Twitch** — often the creator's canonical home. Codes appear in creator-written descriptions. Link out; never pull the video or thumbnail.
4. **Galleries (Wowhead, WoWDB)** — useful for discovery, weaker for code sharing.

Pinterest last, and carefully — a pin is usually a repost. Find the original.

## Aim for range, not just count

Balance the cohort across interiors, exteriors, whole houses, and single rooms; small and large builds; Alliance and Horde aesthetics; nature/Night Elf, gothic, and cosy registers; and by function — taverns, libraries and studies, workshops, gardens, and novelty builds. Reserve a few slots for builds that use a decor item in a way nobody expects; those are the ones people share.

Use observed evidence for these labels. Do not invent a taxonomy the builds do not support, and do not fabricate a seed record to fill a gap in the spread — an honest thin category is fine.

## Process

1. Index in batches of 10–15 as drafts, then review the batch together before publishing.
2. Resolve codes through the addon where practical, so listings carry KwikShack's own decor data rather than a claim from the source.
3. Recheck link health and attribution before each batch goes live.
4. Reach out to the creators of the strongest listings and invite them to claim. Claims are the point — an indexed listing is a placeholder for a creator relationship, not a substitute for one.
5. Review claim rate and native-submission conversion before growing the index. Do not use copied media as a shortcut to stronger-looking cards.
