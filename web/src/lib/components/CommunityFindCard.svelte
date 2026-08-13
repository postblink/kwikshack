<script lang="ts">
	import type { CommunityFind } from '$lib/types/community-find';

	let { find }: { find: CommunityFind } = $props();
</script>

<article class="community-card">
	<a class="community-visual" href={`/finds/${find.id}`} aria-label={`Read the curated details for ${find.title}`}>
		<span class="source-mark" aria-hidden="true">↗</span>
		<span>Community find</span>
		<small>From {find.sourcePlatform}</small>
	</a>
	<div class="community-body">
		<div class="community-label">Curated external discovery</div>
		<h3><a href={`/finds/${find.id}`}>{find.title}</a></h3>
		<p class="creator">by <strong>{find.creatorName}</strong></p>
		{#if find.attribution}<p class="attribution">{find.attribution}</p>{/if}
		<div class="community-actions">
			<a class="source-link" href={find.sourceUrl} target="_blank" rel="noopener noreferrer">
				View original <span aria-hidden="true">↗</span>
			</a>
			<a class="detail-link" href={`/finds/${find.id}`}>Details</a>
		</div>
	</div>
</article>

<style>
	.community-card {
		display: grid;
		grid-template-rows: auto 1fr;
		overflow: hidden;
		min-height: 22rem;
		border: 1px solid color-mix(in srgb, var(--gold-dim) 48%, var(--border));
		border-radius: 0.62rem;
		background: linear-gradient(150deg, var(--surface-2), var(--surface));
		box-shadow: var(--shadow-low);
	}
	.community-visual {
		display: grid;
		min-height: 10.5rem;
		place-content: center;
		gap: 0.25rem;
		border-bottom: 1px solid color-mix(in srgb, var(--gold-dim) 42%, var(--border));
		background:
			radial-gradient(circle at 50% 20%, rgb(232 200 115 / 0.14), transparent 8rem),
			repeating-linear-gradient(135deg, transparent 0 14px, rgb(200 161 68 / 0.025) 14px 15px),
			#191510;
		color: var(--gold-bright);
		font-family: var(--font-display);
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.11em;
		text-align: center;
		text-decoration: none;
		text-transform: uppercase;
	}
	.community-visual small {
		color: var(--text-muted);
		font-family: system-ui, sans-serif;
		font-size: 0.7rem;
		font-weight: 500;
		letter-spacing: 0;
		text-transform: none;
	}
	.source-mark {
		margin-bottom: 0.15rem;
		color: var(--gold-dim);
		font-family: system-ui, sans-serif;
		font-size: 1.5rem;
		font-weight: 400;
	}
	.community-body {
		display: flex;
		min-width: 0;
		flex-direction: column;
		padding: 1rem;
	}
	.community-label {
		color: var(--gold-dim);
		font-family: var(--font-display);
		font-size: 0.64rem;
		font-weight: 700;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}
	h3 {
		margin: 0.48rem 0 0.2rem;
		font-family: var(--font-display);
		font-size: 1.08rem;
		font-weight: 600;
		line-height: 1.35;
	}
	h3 a {
		color: var(--text);
		text-decoration: none;
	}
	h3 a:hover {
		color: var(--gold-bright);
	}
	.creator,
	.attribution {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.79rem;
	}
	.creator strong {
		color: var(--text);
		font-weight: 650;
	}
	.attribution {
		margin-top: 0.6rem;
		line-height: 1.5;
	}
	.community-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: auto;
		padding-top: 1rem;
	}
	.community-actions a {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		justify-content: center;
		padding: 0.5rem 0.75rem;
		border-radius: 0.42rem;
		font-size: 0.76rem;
		font-weight: 750;
		text-decoration: none;
	}
	.source-link {
		border: 1px solid var(--gold-dim);
		background: rgb(200 161 68 / 0.1);
		color: var(--gold-bright);
	}
	.detail-link {
		color: var(--text-muted);
	}
</style>
