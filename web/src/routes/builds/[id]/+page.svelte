<script lang="ts">
	import type { PageData } from './$types';

	let { data } = $props<{ data: PageData }>();
	const b = $derived(data.build);
	const budgetLabels: Record<number, string> = { 0: 'Rooms', 1: 'Decor', 2: 'Pet decor' };

	let copied = $state(false);
	async function copyCode() {
		await navigator.clipboard.writeText(b.shareCode);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	function iconUrl(icon: string | null): string | null {
		if (!icon) return null;
		return `https://wow.zamimg.com/images/wow/icons/large/${icon}.jpg`;
	}
</script>

<svelte:head>
	<title>{b.title} — KwikShack</title>
</svelte:head>

<div class="wrap">
	<a class="back" href="/">← All builds</a>

	<header>
		<h1>{b.title}</h1>
		<p class="meta">
			{b.blueprintType} · {b.faction ?? 'Neutral'} · by {b.authorName ?? 'unknown'} · {b.codeStatus}
		</p>
	</header>

	<section class="code-box">
		<code>{b.shareCode}</code>
		<button onclick={copyCode}>{copied ? 'Copied!' : 'Copy code'}</button>
		<p class="hint">Paste in-game in the Blueprint Import window to use this build.</p>
	</section>

	{#if b.manifest.budgetInfo}
		<section>
			<h2>Budgets</h2>
			{#each ['interiorBudgets', 'exteriorBudgets'] as key, ki (key)}
				{#if (b.manifest.budgetInfo as Record<string, any>)[key]}
					<h3>{ki === 0 ? 'Interior' : 'Exterior'}</h3>
					{#each (b.manifest.budgetInfo as Record<string, any>)[key] as budget, i (ki + '-' + i)}
						<div class="budget">
							<span class="budget-name">{budgetLabels[i] ?? 'Budget ' + i}</span>
							<div class="bar">
								<div
									class="fill"
									style={`width: ${budget.max > 0 ? Math.min(100, (budget.cost / budget.max) * 100) : 0}%`}
								></div>
							</div>
							<span class="budget-num">{budget.cost} / {budget.max}</span>
						</div>
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

	<section>
		<h2>Decor ({data.items.length} unique)</h2>
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

	{#if data.screenshots && data.screenshots.length > 0}
		<section>
			<h2>Screenshots</h2>
			<div class="screenshots">
				{#each data.screenshots as s (s.id)}
					<img src={s.url} alt={s.caption || ''} />
				{/each}
			</div>
		</section>
	{/if}

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
		padding: 2rem 1rem;
	}
	.back {
		color: #7ad48f;
		text-decoration: none;
		font-size: 0.9rem;
	}
	header h1 {
		margin: 0.5rem 0 0.25rem;
	}
	.meta {
		color: #888;
		font-size: 0.9rem;
	}
	.code-box {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: #17171b;
		border: 1px solid #333;
		border-radius: 8px;
		padding: 0.75rem 1rem;
		margin: 1.25rem 0;
		flex-wrap: wrap;
	}
	.code-box code {
		font-size: 1.05rem;
		color: #7ad48f;
		flex: 1;
	}
	.code-box button {
		background: #2f6f3f;
		border: none;
		border-radius: 6px;
		color: #fff;
		padding: 0.4rem 0.8rem;
		cursor: pointer;
	}
	.hint {
		width: 100%;
		margin: 0;
		color: #777;
		font-size: 0.8rem;
	}
	section {
		margin: 1.5rem 0;
	}
	section h2 {
		font-size: 1.15rem;
		margin-bottom: 0.6rem;
	}
	section h3 {
		font-size: 0.9rem;
		color: #999;
		margin: 0.8rem 0 0.35rem;
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
		color: #bbb;
	}
	.bar {
		flex: 1;
		height: 10px;
		background: #26262c;
		border-radius: 5px;
		overflow: hidden;
	}
	.fill {
		height: 100%;
		background: #2f6f3f;
	}
	.budget-num {
		font-size: 0.8rem;
		color: #aaa;
		width: 90px;
		text-align: right;
	}
	.reqs {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.reqs li {
		padding: 0.35rem 0.7rem;
		border-radius: 6px;
		margin: 0.25rem 0;
		font-size: 0.9rem;
	}
	.reqs .bad {
		background: #3a1f1f;
		color: #e07a5f;
	}
	.reqs .warn {
		background: #3a2f1a;
		color: #d9a441;
	}
	.reqs .good {
		background: #1a3a22;
		color: #7ad48f;
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
		background: #17171b;
		border: 1px solid #2a2a30;
		border-radius: 8px;
		padding: 0.5rem;
	}
	.item img {
		border-radius: 4px;
	}
	.screenshots {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 0.75rem;
	}
	.screenshots img {
		width: 100%;
		border-radius: 10px;
		border: 1px solid #333;
	}
	.no-icon {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #26262c;
		border-radius: 4px;
		color: #666;
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
		color: #888;
	}
</style>
