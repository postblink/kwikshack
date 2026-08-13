<script lang="ts">
	import CommunityFindCard from '$lib/components/CommunityFindCard.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Community Finds — KwikShack</title>
	<meta name="description" content="Curated WoW housing discoveries with clear creator attribution and links to their original community sources." />
</svelte:head>

<div class="wrap">
	<header class="intro">
		<p class="eyebrow">Around the housing community</p>
		<h1>Community Finds</h1>
		<p>
			Builds worth seeing from creators across the WoW housing community. These are curated links to original work—not
			KwikShack submissions unless clearly marked otherwise.
		</p>
	</header>

	<section class="policy" aria-labelledby="finds-policy-title">
		<h2 id="finds-policy-title">Credit travels with the build</h2>
		<p>Every find names its creator and source. KwikShack does not rehost external media or offer a blueprint unless the creator has provided permission and the build has become a native listing.</p>
	</section>

	{#if data.finds.length}
		<div class="grid">
			{#each data.finds as find (find.id)}
				<CommunityFindCard {find} />
			{/each}
		</div>
	{:else}
		<div class="empty">
			<strong>Curation is underway.</strong>
			<p>The first Community Finds will appear after source, attribution, and sharing boundaries have been reviewed.</p>
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
</style>
