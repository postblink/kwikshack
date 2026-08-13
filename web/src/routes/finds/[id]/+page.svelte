<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const find = $derived(data.find);
</script>

<svelte:head>
	<title>{find.title} — Community Find — KwikShack</title>
	<meta name="description" content={`${find.title} by ${find.creatorName}, curated from ${find.sourcePlatform} with a link to the original source.`} />
</svelte:head>

<div class="wrap">
	<a class="back" href="/finds">← All Community Finds</a>

	<header>
		<span class="badge">Community Find</span>
		<h1>{find.title}</h1>
		<p class="creator">by <strong>{find.creatorName}</strong></p>
		{#if find.attribution}<p class="attribution">{find.attribution}</p>{/if}
	</header>

	<section class="source-box" aria-labelledby="source-title">
		<div>
			<span class="source-label" id="source-title">Original community source</span>
			<strong>{find.sourcePlatform}</strong>
		</div>
		<a class="gold-button" href={find.sourceUrl} target="_blank" rel="noopener noreferrer">View original <span aria-hidden="true">↗</span></a>
	</section>

	<section class="provenance" aria-labelledby="provenance-title">
		<h2 id="provenance-title">About this listing</h2>
		<p>
			KwikShack curated this external discovery so housing players can find the creator's original work. It is not presented as a creator submission, and KwikShack does not host its media or provide a blueprint from this listing.
		</p>
		<dl>
			<div><dt>Creator</dt><dd>{find.creatorName}</dd></div>
			<div><dt>Source</dt><dd>{find.sourcePlatform}</dd></div>
			<div><dt>Discovered</dt><dd>{find.discoveredAt}</dd></div>
		</dl>
	</section>

	{#if data.linkedBuild}
		<section class="native-link">
			<div><span>Now on KwikShack</span><strong>{data.linkedBuild.title}</strong></div>
			<a href={`/builds/${data.linkedBuild.id}`}>View native build →</a>
		</section>
	{/if}

	{#if find.claimUrl}
		<section class="claim">
			<div>
				<h2>Are you the creator?</h2>
				<p>Use the claim intake to verify ownership, clarify media permission, and provide a blueprint if you want a native KwikShack listing.</p>
			</div>
			<a href={find.claimUrl}>Claim this find →</a>
		</section>
	{/if}
</div>

<style>
	.wrap {
		max-width: 860px;
		margin: 0 auto;
		padding: clamp(1.5rem, 4vw, 3rem) 1rem clamp(3rem, 7vw, 5rem);
	}
	.back {
		font-size: 0.85rem;
		text-decoration: none;
	}
	header {
		margin-top: 1.25rem;
	}
	.badge,
	.source-label,
	.provenance h2,
	.claim h2 {
		color: var(--gold-dim);
		font-family: var(--font-display);
		font-size: 0.69rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.badge {
		display: inline-flex;
		padding: 0.25rem 0.55rem;
		border: 1px solid var(--gold-dim);
		border-radius: 999px;
		background: rgb(200 161 68 / 0.08);
	}
	h1 {
		margin: 0.65rem 0 0.2rem;
		color: var(--text);
		font-size: clamp(2.2rem, 7vw, 4.2rem);
		font-weight: 600;
		line-height: 1.06;
	}
	.creator,
	.attribution {
		margin: 0;
		color: var(--text-muted);
	}
	.creator strong {
		color: var(--text);
	}
	.attribution {
		margin-top: 0.7rem;
		line-height: 1.6;
	}
	.source-box,
	.native-link,
	.claim {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 1.75rem;
		padding: 1rem;
		border: 1px solid var(--gold-dim);
		border-radius: 0.55rem;
		background: var(--surface-2);
	}
	.source-box > div,
	.native-link > div {
		display: grid;
		gap: 0.2rem;
	}
	.source-box strong,
	.native-link strong {
		color: var(--text);
	}
	.provenance {
		margin-top: 2rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--border);
	}
	.provenance h2,
	.claim h2 {
		margin: 0;
	}
	.provenance > p,
	.claim p {
		color: var(--text-muted);
		line-height: 1.65;
	}
	dl {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.65rem;
		margin-top: 1rem;
	}
	dl div {
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 0.42rem;
		background: var(--surface);
	}
	dt {
		color: var(--text-muted);
		font-size: 0.67rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	dd {
		margin: 0.25rem 0 0;
		color: var(--text);
		font-size: 0.84rem;
	}
	.native-link span {
		color: var(--ok);
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
	}
	.native-link a,
	.claim > a {
		min-height: 2.75rem;
		align-content: center;
		font-size: 0.82rem;
		font-weight: 750;
		text-decoration: none;
	}
	.claim {
		border-color: var(--border);
	}
	.claim p {
		margin: 0.35rem 0 0;
		font-size: 0.82rem;
	}
	@media (max-width: 600px) {
		.source-box,
		.native-link,
		.claim {
			align-items: stretch;
			flex-direction: column;
		}
		.source-box :global(.gold-button),
		.native-link a,
		.claim > a {
			width: 100%;
			justify-content: center;
			text-align: center;
		}
		dl {
			grid-template-columns: 1fr;
		}
	}
</style>
