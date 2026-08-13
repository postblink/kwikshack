<script lang="ts">
	import type { PageData } from './$types';
	import BuildStatus from '$lib/components/BuildStatus.svelte';
	import CopyBlueprintButton from '$lib/components/CopyBlueprintButton.svelte';
	import LikeButton from '$lib/components/LikeButton.svelte';
	import TagChips from '$lib/components/TagChips.svelte';
	import { iconUrl } from '$lib/icon';
	import { pluralize } from '$lib/pluralize';

	let { data } = $props<{ data: PageData }>();
	const b = $derived(data.build);
	const budgetLabels: Record<number, string> = { 0: 'Rooms', 1: 'Decor', 2: 'Pet decor' };
	const typeLabels: Record<string, string> = { '1': 'Room', '2': 'Interior', '3': 'House', '4': 'Exterior' };

	const typeLabel = $derived(typeLabels[String(b.blueprintType)] ?? b.blueprintType);
	const tags = $derived.by(() => {
		const value = (b as { tags?: unknown }).tags;
		return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : [];
	});

	const pageUrl = $derived(`https://kwikshack.com/builds/${encodeURIComponent(b.id)}`);
	const ogImageUrl = $derived(`https://kwikshack.com/api/og/${encodeURIComponent(b.id)}.svg`);
	const socialDescription = $derived(
		(
			b.description?.trim() ||
				`${typeLabel} blueprint by ${b.authorName ?? 'an unknown builder'} with ${data.items.length} unique ${pluralize(data.items.length, 'decor item')}.`
		).slice(0, 200)
	);

	// Structural groups (house type / rooms / exterior fixtures) rendered
	// separately from the decor grid.
	const structure = $derived.by(() => {
		const out: { name: string; total: number }[] = [];
		for (const group of b.manifest.contentGroups ?? []) {
			const ct = group.contentType ?? group.groupType;
			if (ct === 1 || ct === 2 || ct === 5) {
				for (const e of group.entries ?? []) {
					out.push({ name: String(e.name ?? `Type ${ct}`), total: Number(e.total ?? 1) });
				}
			}
		}
		return out;
	});
</script>

<svelte:head>
	<title>{b.title} — KwikShack</title>
	<meta name="description" content={socialDescription} />
	<meta property="og:title" content={`${b.title} — KwikShack`} />
	<meta property="og:description" content={socialDescription} />
	<meta property="og:image" content={ogImageUrl} />
	<meta property="og:image:type" content="image/svg+xml" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content={`Share preview for ${b.title}`} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={pageUrl} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={`${b.title} — KwikShack`} />
	<meta name="twitter:description" content={socialDescription} />
	<meta name="twitter:image" content={ogImageUrl} />
	<meta name="twitter:image:alt" content={`Share preview for ${b.title}`} />
</svelte:head>

<div class="wrap">
	<a class="back" href="/">← All builds</a>

	<header>
		<div class="title-row">
			<div>
				<h1>{b.title}</h1>
				<p class="meta">
					{typeLabel} · {b.faction ?? 'Neutral'} · by {#if b.authorName}<a href={`/?author=${encodeURIComponent(b.authorName)}`}>{b.authorName}</a>{:else}unknown{/if}
				</p>
			</div>
			<div class="title-actions">
				<BuildStatus codeStatus={b.codeStatus} />
				<LikeButton buildId={b.id} initialCount={b.likeCount} initialLiked={b.liked} roomy />
			</div>
		</div>
		{#if data.tagsAvailable}<TagChips {tags} limit={5} />{/if}
	</header>

	{#if data.screenshots && data.screenshots.length > 0}
		<section class="build-gallery" aria-labelledby="screenshots-title">
			<h2 id="screenshots-title">Build gallery</h2>
			<div class="screenshots" class:single={data.screenshots.length === 1}>
				{#each data.screenshots as s (s.id)}
					<img src={s.url} alt={s.caption || `${b.title} build screenshot`} />
				{/each}
			</div>
		</section>
	{/if}

	<section class="code-box">
		<div class="code-copy">
			<span class="code-label">Ready to build this?</span>
			<code>{b.shareCode}</code>
		</div>
		<CopyBlueprintButton shareCode={b.shareCode} buildTitle={b.title} />
		<p class="hint">Copy the blueprint, then paste it into WoW's Blueprint Import window.</p>
	</section>

	{#if b.manifest.budgetInfo}
		<section>
			<h2>Budgets</h2>
			{#each ['interiorBudgets', 'exteriorBudgets'] as key, ki (key)}
				{#if (b.manifest.budgetInfo as Record<string, any>)[key]}
					<h3>{ki === 0 ? 'Interior' : 'Exterior'}</h3>
					{#each (b.manifest.budgetInfo as Record<string, any>)[key] as budget, i (ki + '-' + i)}
						{#if budget.cost < 0}
							<div class="budget">
								<span class="budget-name">{budgetLabels[budget.budgetType] ?? 'Budget ' + i}</span>
								<div class="bar"></div>
								<span class="budget-num">not used</span>
							</div>
						{:else}
							<div class="budget">
								<span class="budget-name">{budgetLabels[budget.budgetType] ?? 'Budget ' + i}</span>
								<div class="bar">
									<div
										class="fill"
										style={`width: ${budget.max > 0 ? Math.min(100, (budget.cost / budget.max) * 100) : 0}%`}
									></div>
								</div>
								<span class="budget-num">{budget.cost} / {budget.max}</span>
							</div>
						{/if}
					{/each}
				{/if}
			{/each}
		</section>
	{/if}

	{#if b.manifest.blockingRequirements}
		<section>
			<h2>Import requirements</h2>
			<ul class="reqs">
				{#if b.manifest.blockingRequirements.factionMismatch}<li class="bad">Opposite faction house required</li>{/if}
				{#if b.manifest.blockingRequirements.missingRooms}<li class="bad">Rooms not unlocked</li>{/if}
				{#if b.manifest.blockingRequirements.missingBudgets}<li class="bad">Not enough placement budget</li>{/if}
				{#if b.manifest.blockingRequirements.missingDecor}<li class="warn">Missing decor (can still import)</li>{/if}
				{#if !b.manifest.blockingRequirements.missingRooms && !b.manifest.blockingRequirements.missingBudgets && !b.manifest.blockingRequirements.factionMismatch}
					<li class="good">Importable</li>
				{/if}
			</ul>
		</section>
	{/if}

	{#if structure.length > 0}
		<section>
			<h2>Structure</h2>
			<ul class="structure">
				{#each structure as s (s.name + s.total)}
					<li>{s.name} ×{s.total}</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section>
		<h2>Decor ({data.items.length} unique {pluralize(data.items.length, 'item')})</h2>
		<div class="items">
			{#each data.items as item (item.key)}
				<div class="item">
					{#if iconUrl(item.icon)}
						<img src={iconUrl(item.icon)} alt="" width="36" height="36" />
					{:else}
						<div class="no-icon">?</div>
					{/if}
					<div class="item-info">
						<span class="item-name">{item.name}</span>
						<span class="item-count">×{item.count}</span>
					</div>
				</div>
			{/each}
		</div>
	</section>

	{#if b.description}
		<section>
			<h2>About this build</h2>
			<p>{b.description}</p>
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
		color: var(--gold-bright);
		text-decoration: none;
		font-size: 0.9rem;
	}
	header h1 {
		margin: 0.65rem 0 0.25rem;
		color: var(--text);
		font-family: var(--font-display);
		font-size: clamp(2rem, 6vw, 3.35rem);
		font-weight: 600;
		line-height: 1.12;
		letter-spacing: -0.025em;
		text-wrap: balance;
	}
	.title-row {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
	}
	.title-row > div {
		min-width: 0;
	}
	.title-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.7rem;
		flex-wrap: wrap;
	}
	.meta {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}
	.meta a {
		color: var(--text-muted);
	}
	header :global(.tag-chips) {
		margin-top: 0.9rem;
	}
	.code-box {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: var(--surface-2);
		border: 1px solid var(--gold-dim);
		border-radius: 0.58rem;
		padding: 0.75rem 1rem;
		margin: 1.5rem 0 2rem;
		flex-wrap: wrap;
		box-shadow:
			inset 0 1px color-mix(in srgb, var(--gold-bright) 9%, transparent),
			var(--shadow-low);
	}
	.code-box code {
		display: block;
		font-size: 1.05rem;
		color: var(--gold-bright);
		background: transparent;
		border: 0;
		padding: 0;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		overflow-wrap: anywhere;
	}
	.code-copy {
		flex: 1 1 20rem;
		min-width: 0;
	}
	.code-label {
		display: block;
		margin-bottom: 0.22rem;
		color: var(--text);
		font-family: var(--font-display);
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.055em;
	}
	.hint {
		width: 100%;
		margin: 0;
		color: var(--text-muted);
		font-size: 0.8rem;
	}
	section {
		margin: 2rem 0;
	}
	section h2 {
		margin: 0 0 0.85rem;
		padding-bottom: 0.6rem;
		border-bottom: 1px solid var(--border);
		color: var(--gold-dim);
		font-family: var(--font-display);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}
	section h3 {
		font-size: 0.78rem;
		color: var(--text-muted);
		margin: 1rem 0 0.45rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.budget {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin: 0.3rem 0;
	}
	.budget-name {
		width: 90px;
		font-size: 0.85rem;
		color: var(--text-muted);
	}
	.bar {
		flex: 1;
		height: 10px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 5px;
		overflow: hidden;
	}
	.fill {
		height: 100%;
		background: linear-gradient(90deg, var(--gold-dim), var(--gold-bright));
		box-shadow: inset 0 1px color-mix(in srgb, var(--text) 30%, transparent);
	}
	.budget-num {
		font-size: 0.8rem;
		color: var(--text-muted);
		width: 90px;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.reqs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.reqs li {
		padding: 0.35rem 0.7rem;
		border: 1px solid;
		border-radius: 999px;
		font-size: 0.9rem;
	}
	.reqs .bad {
		background: color-mix(in srgb, var(--bad) 14%, var(--surface));
		border-color: color-mix(in srgb, var(--bad) 48%, var(--border));
		color: var(--bad);
	}
	.reqs .warn {
		background: color-mix(in srgb, var(--warn) 14%, var(--surface));
		border-color: color-mix(in srgb, var(--warn) 48%, var(--border));
		color: var(--warn);
	}
	.reqs .good {
		background: color-mix(in srgb, var(--ok) 14%, var(--surface));
		border-color: color-mix(in srgb, var(--ok) 48%, var(--border));
		color: var(--ok);
	}
	.structure {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.structure li {
		background: color-mix(in srgb, var(--gold-dim) 15%, transparent);
		border: 1px solid color-mix(in srgb, var(--gold-dim) 52%, transparent);
		border-radius: 999px;
		padding: 0.3rem 0.7rem;
		font-size: 0.85rem;
		color: var(--gold-bright);
		font-weight: 700;
		letter-spacing: 0.035em;
	}
	.items {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 0.5rem;
	}
	.item {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		background: linear-gradient(150deg, var(--surface-2), var(--surface));
		border: 1px solid color-mix(in srgb, var(--gold-dim) 50%, var(--border));
		border-radius: 0.5rem;
		padding: 0.5rem;
		box-shadow: inset 0 1px color-mix(in srgb, var(--gold-bright) 5%, transparent);
	}
	.item img {
		border: 1px solid var(--border);
		border-radius: 0.3rem;
	}
	.screenshots {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 0.75rem;
	}
	.screenshots img {
		width: 100%;
		height: 100%;
		max-height: 32rem;
		object-fit: cover;
		border-radius: 0.58rem;
		border: 1px solid color-mix(in srgb, var(--gold-dim) 45%, var(--border));
	}
	.screenshots:not(.single) img:first-child {
		grid-column: 1 / -1;
		aspect-ratio: 16 / 9;
	}
	.screenshots.single img {
		aspect-ratio: 16 / 9;
	}
	.no-icon {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 0.3rem;
		color: var(--text-muted);
	}
	.item-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.item-name {
		font-size: 0.82rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.item-count {
		font-size: 0.75rem;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	@media (max-width: 560px) {
		.title-row {
			align-items: flex-start;
			flex-direction: column;
		}
		.title-actions {
			width: 100%;
			justify-content: space-between;
		}
		.code-box :global(button) {
			width: 100%;
		}
		.budget {
			align-items: start;
			display: grid;
			grid-template-columns: 1fr auto;
			gap: 0.35rem 0.75rem;
			margin-block: 0.7rem;
		}
		.budget-name,
		.budget-num {
			width: auto;
		}
		.bar {
			grid-column: 1 / -1;
			grid-row: 2;
		}
	}
</style>
