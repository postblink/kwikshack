<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const overdue = $derived(
		data.retention.oldestBlizzardRecordAgeDays !== null &&
			data.retention.oldestBlizzardRecordAgeDays >= data.retention.ttlDays
	);
</script>

<svelte:head>
	<title>Decor catalog — KwikShack</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="wrap">
	<h1>Decor catalog</h1>
	<p class="lede">
		Canonical decor comes from Blizzard's Housing Decor Game Data API and wins over KwikShack's legacy catalog wherever it
		exists. Missing canonical data is normal — builds fall back rather than breaking.
	</p>

	{#if overdue}
		<p class="alert" role="alert">
			Blizzard-derived data is {data.retention.oldestBlizzardRecordAgeDays} days old, at or past the
			{data.retention.ttlDays}-day retention limit. Check that the maintenance job is running.
		</p>
	{/if}

	<section class="panel">
		<h2>Coverage</h2>
		<dl>
			<div><dt>Canonical decor records</dt><dd>{data.coverage.canonicalRecords}</dd></div>
			<div><dt>Legacy catalog records</dt><dd>{data.coverage.legacyCatalogRecords}</dd></div>
			<div>
				<dt>Mapped identifiers</dt>
				<dd>{data.coverage.mappedIdentifiers} ({data.coverage.strongLinks} strong, {data.coverage.weakLinks} weak)</dd>
			</div>
			<div><dt>Oldest canonical row</dt><dd>{data.coverage.oldestSyncedAt ?? '—'}</dd></div>
		</dl>
		<p class="fine">
			A <strong>strong</strong> link is Blizzard naming the item itself, or a decor id and name that both agree. A
			<strong>weak</strong> link is an exact name match against the legacy catalog. Nothing here is learned from user
			submissions.
		</p>
	</section>

	<section class="panel">
		<h2>Last sync</h2>
		{#if data.sync}
			<dl>
				<div><dt>Status</dt><dd class:bad={data.sync.status === 'failed'}>{data.sync.status}</dd></div>
				<div><dt>Started</dt><dd>{data.sync.startedAt ?? '—'}</dd></div>
				<div><dt>Completed</dt><dd>{data.sync.completedAt ?? '—'}</dd></div>
				<div><dt>Seen / written</dt><dd>{data.sync.entriesSeen} / {data.sync.entriesWritten}</dd></div>
				{#if data.sync.error}<div><dt>Error</dt><dd class="bad">{data.sync.error}</dd></div>{/if}
			</dl>
		{:else}
			<p class="fine">Never synced. The site is running entirely on the legacy catalog, which is a supported state.</p>
		{/if}

		<h3>Running a sync</h3>
		<p class="fine">
			Syncing is a CLI job — a full import makes thousands of API calls and must not run inside a web request. Confirm the
			response shape first with a probe, since Blizzard does not publish the decor payload schema:
		</p>
		<pre><code>pnpm decor:probe
pnpm decor:sync</code></pre>
		<p class="fine">
			Run it at least every {data.retention.recommendedSyncDays} days. Canonical rows are deleted once they pass the
			{data.retention.ttlDays}-day Blizzard retention limit, and the site returns to the legacy catalog until the next
			successful sync.
		</p>
	</section>
</div>

<style>
	.wrap {
		width: min(100% - 2rem, 48rem);
		margin: 0 auto;
		padding: clamp(1.2rem, 3vw, 2.2rem) 0 clamp(3rem, 7vw, 5rem);
	}
	h1 {
		margin: 0 0 0.5rem;
		color: var(--gold-bright);
		font-size: clamp(1.8rem, 5vw, 2.6rem);
		font-weight: 600;
		letter-spacing: -0.03em;
	}
	.lede {
		max-width: 68ch;
		margin: 0 0 1.2rem;
		color: var(--text-muted);
		font-size: 0.9rem;
		line-height: 1.6;
	}
	.alert {
		margin: 0 0 1rem;
		padding: 0.7rem 0.9rem;
		border: 1px solid var(--border);
		border-left: 3px solid var(--bad);
		border-radius: 0.4rem;
		background: rgb(29 25 20 / 0.62);
		color: var(--text);
		font-size: 0.86rem;
	}
	.panel {
		margin-bottom: 1.1rem;
		padding: 1.1rem 1.2rem;
		border: 1px solid var(--border);
		border-radius: 0.55rem;
		background: rgb(29 25 20 / 0.62);
	}
	h2 {
		margin: 0 0 0.7rem;
		color: var(--gold);
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 700;
	}
	h3 {
		margin: 1.2rem 0 0.4rem;
		color: var(--text);
		font-size: 0.9rem;
		font-weight: 700;
	}
	dl {
		display: grid;
		gap: 0.32rem;
		margin: 0 0 0.7rem;
	}
	dl div {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		font-size: 0.86rem;
	}
	dt {
		min-width: 12rem;
		color: var(--text-muted);
	}
	dd {
		margin: 0;
		color: var(--text);
		overflow-wrap: anywhere;
	}
	.bad {
		color: var(--bad);
	}
	.fine {
		max-width: 68ch;
		margin: 0 0 0.6rem;
		color: var(--text-muted);
		font-size: 0.82rem;
		line-height: 1.6;
	}
	strong {
		color: var(--text);
	}
	pre {
		overflow-x: auto;
		margin: 0 0 0.7rem;
		padding: 0.7rem 0.9rem;
		border: 1px solid var(--border);
		border-radius: 0.4rem;
		background: rgb(20 17 13 / 0.7);
	}
	code {
		color: var(--gold);
		font-family: ui-monospace, monospace;
		font-size: 0.8rem;
		line-height: 1.6;
	}
</style>
