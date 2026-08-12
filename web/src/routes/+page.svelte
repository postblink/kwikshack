<script lang="ts">
	import type { PageData } from './$types';

	let { data } = $props<{ data: PageData }>();
	const typeLabels: Record<string, string> = { '1': 'Room', '2': 'Interior', '3': 'House', '4': 'Exterior' };
	let q = $state('');
	let type = $state('');
	let faction = $state('');

	function href() {
		const p = new URLSearchParams();
		if (q.trim()) p.set('q', q.trim());
		if (type) p.set('type', type);
		if (faction) p.set('faction', faction);
		const s = p.toString();
		return s ? `/?${s}` : '/';
	}
</script>

<svelte:head>
	<title>KwikShack — WoW Housing Builds</title>
</svelte:head>

<div class="wrap">
	<header>
		<h1>KwikShack</h1>
		<p class="tag">WoW housing builds, resolved from real blueprint codes.</p>
	</header>

	<form action={href()} method="get" class="filters">
		<input type="search" name="q" placeholder="Search builds…" bind:value={q} />
		<select name="type" bind:value={type}>
			<option value="">Any type</option>
			<option value="House">House</option>
			<option value="Interior">Interior</option>
			<option value="Exterior">Exterior</option>
			<option value="Room">Room</option>
		</select>
		<select name="faction" bind:value={faction}>
			<option value="">Any faction</option>
			<option value="Alliance">Alliance</option>
			<option value="Horde">Horde</option>
		</select>
		<button type="submit">Filter</button>
		<a class="submit-link" href="/submit">+ Submit a build</a>
	</form>

	{#if data.builds.length === 0}
		<div class="empty">
			<p>No builds yet — be the first to submit one from inside the game.</p>
			<p><a href="/submit">Submit a build</a> (or <code>POST /api/builds</code>)</p>
		</div>
	{:else}
		<div class="grid">
			{#each data.builds as b (b.id)}
				<a class="card" href={`/builds/${b.id}`}>
					<div class="card-head">
						<span class="type">{typeLabels[b.blueprintType] ?? b.blueprintType}</span>
						<span class="status {b.codeStatus}">{b.codeStatus}</span>
					</div>
					<h2>{b.title}</h2>
					<p class="code">{b.shareCode}</p>
					<p class="meta">
						{b.faction ?? 'Neutral'} · by {b.authorName ?? 'unknown'}
					</p>
					<p class="meta">
						{b.summary.decorCount} decor · {b.summary.roomCount} rooms
					</p>
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.wrap {
		max-width: 960px;
		margin: 0 auto;
		padding: 2rem 1rem;
	}
	header h1 {
		margin: 0;
		font-size: 2.4rem;
	}
	.tag {
		color: #888;
		margin-top: 0.25rem;
	}
	.filters {
		display: flex;
		gap: 0.5rem;
		margin: 1.5rem 0;
		flex-wrap: wrap;
	}
	.filters input,
	.filters select {
		padding: 0.4rem 0.6rem;
		border: 1px solid #444;
		border-radius: 6px;
		background: #1b1b1f;
		color: #eee;
	}
	.submit-link {
		margin-left: auto;
		padding: 0.4rem 0.8rem;
		background: #2f6f3f;
		border-radius: 6px;
		color: #fff;
		text-decoration: none;
	}
	.empty {
		border: 1px dashed #444;
		border-radius: 8px;
		padding: 2rem;
		text-align: center;
		color: #999;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 1rem;
	}
	.card {
		border: 1px solid #333;
		border-radius: 10px;
		padding: 1rem;
		text-decoration: none;
		color: inherit;
		background: #17171b;
		transition: border-color 0.15s;
	}
	.card:hover {
		border-color: #2f6f3f;
	}
	.card h2 {
		font-size: 1.05rem;
		margin: 0.5rem 0 0.25rem;
	}
	.code {
		font-family: monospace;
		font-size: 0.85rem;
		color: #7ad48f;
		margin: 0.25rem 0;
	}
	.meta {
		color: #888;
		font-size: 0.85rem;
	}
	.card-head {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
	}
	.type {
		background: #26262c;
		padding: 0.15rem 0.5rem;
		border-radius: 4px;
	}
	.status.active {
		color: #7ad48f;
	}
	.status.expired {
		color: #e07a5f;
	}
	.status.unverified {
		color: #d9a441;
	}
</style>
