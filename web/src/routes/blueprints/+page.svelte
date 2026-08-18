<script lang="ts">
	import BlueprintPlaceholder from '$lib/components/BlueprintPlaceholder.svelte';
	import BlueprintResolutionStatus from '$lib/components/BlueprintResolutionStatus.svelte';
	import CopyBlueprintButton from '$lib/components/CopyBlueprintButton.svelte';
	import { blueprintScopeLabel } from '$lib/types/manifest';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const nextOffset = $derived(data.offset + data.limit);
	const previousOffset = $derived(Math.max(data.offset - data.limit, 0));
</script>

<svelte:head>
	<title>Indexed blueprints — KwikShack</title>
	<meta
		name="description"
		content="Publicly shared WoW housing blueprint codes indexed by KwikShack, each with its original source and creator attribution."
	/>
</svelte:head>

<div class="wrap">
	<header class="intro">
		<p class="eyebrow">Publicly shared codes</p>
		<h1>Indexed blueprints</h1>
		<p>
			Blueprint codes that creators shared publicly for other players to import. KwikShack indexes the code, credits the
			creator, and links to where we found it — nothing else travels across.
		</p>
	</header>

	<section class="policy" aria-labelledby="index-policy-title">
		<h2 id="index-policy-title">The code is shared; the rest is not</h2>
		<p>
			A creator can put a blueprint code into the world for others to use while their screenshots, writing, and video stay
			theirs. KwikShack indexes only the code and its provenance. Any creator can claim a listing, correct it, or ask us to
			take it down.
		</p>
	</section>

	{#if data.blueprints.length}
		<div class="grid">
			{#each data.blueprints as blueprint (blueprint.id)}
				<article class="card">
					<a class="card-link" href="/blueprints/{blueprint.id}">
						<div class="thumb">
							{#if blueprint.screenshots.length}
								<img src={blueprint.screenshots[0].url} alt="" loading="lazy" />
							{:else}
								<!-- Branded placeholder, varied by blueprint type. Source-site
								     images are never copied, proxied, or hotlinked. -->
								<BlueprintPlaceholder blueprintType={blueprint.blueprintType} seed={blueprint.id} />
							{/if}
						</div>
						<h3>{blueprint.title}</h3>
					</a>
					<p class="attribution">
						{blueprint.claimState === 'claimed' && blueprint.claimedCreatorName
							? `Managed by ${blueprint.preferredAttribution ?? blueprint.claimedCreatorName}`
							: `Attributed to ${blueprint.attributedCreator}`}
					</p>
					<div class="meta">
						<span class="chip type">{blueprintScopeLabel(blueprint.blueprintScope) ?? blueprint.blueprintType}</span>
						{#if blueprint.faction}<span class="chip">{blueprint.faction}</span>{/if}
						{#if blueprint.derived}
							<span class="chip">{blueprint.derived.distinctDecorItems} decor types</span>
						{/if}
						<!-- Only worth a visitor's attention when it changes what they can do.
						     "Not yet checked" on all fourteen cards was noise; the detail page
						     still states it plainly. -->
						{#if blueprint.resolutionState !== 'unresolved'}
							<BlueprintResolutionStatus state={blueprint.resolutionState} />
						{/if}
					</div>
					<div class="actions">
						{#if blueprint.copyable}
							<CopyBlueprintButton shareCode={blueprint.shareCode} buildTitle={blueprint.title} compact />
						{:else}
							<span class="unavailable">Blueprint unavailable</span>
						{/if}
						{#if blueprint.sources[0]}
							<a class="source" href={blueprint.sources[0].sourceUrl} rel="noopener noreferrer nofollow ugc" target="_blank">
								{blueprint.sources[0].platformLabel} ↗
							</a>
						{/if}
					</div>
				</article>
			{/each}
		</div>

		{#if data.total > data.limit}
			<nav class="pager" aria-label="Pagination">
				{#if data.offset > 0}<a href="?offset={previousOffset}">← Newer</a>{/if}
				{#if nextOffset < data.total}<a href="?offset={nextOffset}">Older →</a>{/if}
			</nav>
		{/if}
	{:else}
		<div class="empty">
			<strong>Indexing is underway.</strong>
			<p>The first indexed blueprints appear once their source, attribution, and sharing boundaries have been reviewed.</p>
			<a href="/">Browse native KwikShack builds</a>
		</div>
	{/if}
</div>

<style>
	.wrap {
		width: min(100% - 2rem, var(--content-width));
		margin: 0 auto;
		padding: clamp(1.5rem, 4vw, 3rem) 0 clamp(3rem, 7vw, 5rem);
	}
	.intro {
		max-width: 50rem;
	}
	.eyebrow,
	.policy h2 {
		margin: 0;
		color: var(--gold-dim);
		font-family: var(--font-display);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	h1 {
		margin: 0.45rem 0 0;
		color: var(--gold-bright);
		font-size: clamp(2.35rem, 7vw, 4.6rem);
		font-weight: 600;
		line-height: 1.04;
		letter-spacing: -0.03em;
	}
	.intro > p:last-child {
		max-width: 62ch;
		margin: 0.9rem 0 0;
		color: var(--text-muted);
		font-size: 1rem;
		line-height: 1.65;
	}
	.policy {
		margin: clamp(1.5rem, 4vw, 2.5rem) 0;
		padding: 1rem 1.1rem;
		border: 1px solid var(--border);
		border-left: 3px solid var(--gold-dim);
		border-radius: 0.45rem;
		background: rgb(29 25 20 / 0.62);
	}
	.policy p {
		max-width: 72ch;
		margin: 0.45rem 0 0;
		color: var(--text-muted);
		font-size: 0.82rem;
		line-height: 1.55;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1rem;
	}
	.card {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: 0.55rem;
		background: rgb(29 25 20 / 0.62);
	}
	.card-link {
		color: inherit;
		text-decoration: none;
	}
	.thumb {
		display: grid;
		aspect-ratio: 16 / 10;
		place-items: center;
		background: linear-gradient(160deg, rgb(46 38 28 / 0.9), rgb(20 17 13 / 0.95));
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	h3 {
		margin: 0.75rem 0.9rem 0;
		color: var(--text);
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 700;
		line-height: 1.3;
	}
	.attribution {
		margin: 0.3rem 0.9rem 0;
		color: var(--text-muted);
		font-size: 0.78rem;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin: 0.55rem 0.9rem 0;
	}
	.chip {
		padding: 0.12rem 0.42rem;
		border: 1px solid var(--border);
		border-radius: 0.3rem;
		color: var(--text-muted);
		font-size: 0.7rem;
	}
	/* The scope chip is the one piece of metadata every listing has, so it does
	   the work of telling a grid of cards apart. */
	.chip.type {
		border-color: rgb(200 161 68 / 0.3);
		color: var(--gold-dim);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: auto;
		padding: 0.8rem 0.9rem 0.9rem;
	}
	.unavailable {
		color: var(--bad);
		font-size: 0.76rem;
		font-weight: 700;
	}
	.source {
		color: var(--text-muted);
		font-size: 0.74rem;
	}
	.pager {
		display: flex;
		justify-content: space-between;
		margin-top: 1.5rem;
	}
	.pager a {
		color: var(--gold);
		font-size: 0.85rem;
	}
	.empty {
		padding: clamp(2rem, 6vw, 3.5rem);
		border: 1px dashed var(--gold-dim);
		border-radius: 0.65rem;
		background: rgb(29 25 20 / 0.56);
		color: var(--text-muted);
		text-align: center;
	}
	.empty strong {
		color: var(--text);
		font-family: var(--font-display);
		font-size: 1.15rem;
	}
	.empty p {
		margin: 0.55rem auto 1rem;
	}

	/* Seeding the first cohort showed the preamble pushed the first build to
	   549px on a phone — a gallery where you scroll past half a screen of policy
	   before seeing anything. The copy still matters, so it shrinks rather than
	   disappears. */
	@media (max-width: 620px) {
		.intro > p:last-child {
			margin-top: 0.6rem;
			font-size: 0.88rem;
			line-height: 1.55;
		}
		.policy {
			margin: 1rem 0 1.1rem;
			padding: 0.75rem 0.85rem;
		}
		.policy p {
			margin-top: 0.35rem;
			font-size: 0.78rem;
			line-height: 1.5;
		}
		.grid {
			gap: 0.75rem;
		}
		/* A 16:10 frame is generous for artwork; for a placeholder it is just tall.
		   Shorter cards mean more than one build fits on a phone screen. */
		.thumb {
			aspect-ratio: 2 / 1;
		}
	}
</style>
