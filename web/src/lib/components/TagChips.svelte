<script lang="ts">
	let {
		tags = [],
		limit = 4,
		activeTag = '',
		hrefForTag = (tag: string) => `/?tag=${encodeURIComponent(tag)}`
	}: { tags?: string[] | null; limit?: number; activeTag?: string; hrefForTag?: (tag: string) => string } = $props();

	const visibleTags = $derived(
		[...new Set((tags ?? []).filter((tag): tag is string => typeof tag === 'string' && Boolean(tag.trim())).map((tag) => tag.trim()))].slice(
			0,
			limit
		)
	);
</script>

{#if visibleTags.length}
	<nav class="tag-chips" aria-label="Build tags">
		{#each visibleTags as tag (tag)}
			<a class:active={tag === activeTag} href={hrefForTag(tag)}>#{tag}</a>
		{/each}
	</nav>
{/if}

<style>
	.tag-chips {
		display: flex;
		gap: 0.38rem;
		flex-wrap: wrap;
	}
	a {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		padding: 0.2rem 0.55rem;
		border: 1px solid color-mix(in srgb, var(--gold-dim) 44%, var(--border));
		border-radius: 0.3rem;
		background: color-mix(in srgb, var(--gold-dim) 10%, var(--surface));
		color: var(--gold-dim);
		font-family: var(--font-display);
		font-size: 0.67rem;
		font-weight: 700;
		letter-spacing: 0.035em;
		text-decoration: none;
		text-transform: lowercase;
		transition:
			border-color 120ms ease,
			background-color 120ms ease,
			color 120ms ease;
	}
	a.active {
		border-color: var(--gold);
		background: color-mix(in srgb, var(--gold) 18%, var(--surface));
		color: var(--gold-bright);
	}
	@media (hover: hover) and (pointer: fine) {
		a:hover {
			border-color: var(--gold);
			color: var(--gold-bright);
		}
	}
</style>
