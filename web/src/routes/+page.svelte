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
	<header class="hero">
		<div class="hero-copy">
			<h1>KwikShack</h1>
			<p class="tag">WoW housing builds, resolved from real blueprint codes.</p>
		</div>

		<section class="how-it-works" aria-labelledby="how-it-works-title">
			<h2 id="how-it-works-title">How it works</h2>
			<ol class="steps">
				<li>
					<span class="step-number" aria-hidden="true">1</span>
					<div>
						<strong>Resolve a build in-game</strong>
						<p>Paste a blueprint code into the KwikShack addon's Import window.</p>
					</div>
				</li>
				<li>
					<span class="step-number" aria-hidden="true">2</span>
					<div>
						<strong>Share the code</strong>
						<p>Submit it yourself, or let the companion app handle it.</p>
					</div>
				</li>
				<li>
					<span class="step-number" aria-hidden="true">3</span>
					<div>
						<strong>Browse and get inspired</strong>
						<p>Explore resolved housing builds right here.</p>
					</div>
				</li>
			</ol>
		</section>
	</header>

	<form action={href()} method="get" class="filters">
		<input type="search" name="q" placeholder="Search builds…" aria-label="Search builds" bind:value={q} />
		<select name="type" aria-label="Filter by build type" bind:value={type}>
			<option value="">Any type</option>
			<option value="House">House</option>
			<option value="Interior">Interior</option>
			<option value="Exterior">Exterior</option>
			<option value="Room">Room</option>
		</select>
		<select name="faction" aria-label="Filter by faction" bind:value={faction}>
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
		padding: 2.5rem 1rem 3rem;
	}
	.hero {
		padding: clamp(1.5rem, 4vw, 2.5rem);
		border: 1px solid #2f2f34;
		border-radius: 16px;
		background: #17171b;
		box-shadow:
			inset 0 1px rgba(255, 255, 255, 0.025),
			0 18px 50px rgba(0, 0, 0, 0.16);
	}
	.hero-copy {
		padding-left: 1rem;
		border-left: 3px solid #2f6f3f;
	}
	.hero h1 {
		margin: 0;
		color: #f1f1f3;
		font-size: clamp(3rem, 8vw, 5rem);
		line-height: 0.95;
		letter-spacing: -0.055em;
		text-wrap: balance;
	}
	.tag {
		max-width: 52ch;
		margin: 0.75rem 0 0;
		color: #aaa;
		font-size: clamp(1rem, 2.5vw, 1.15rem);
		line-height: 1.5;
		text-wrap: pretty;
	}
	.how-it-works {
		margin-top: 2rem;
		padding-top: 1.25rem;
		border-top: 1px solid #2f2f34;
	}
	.how-it-works h2 {
		margin: 0;
		color: #8f8f96;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.steps {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		margin: 1rem 0 0;
		padding: 0;
		list-style: none;
	}
	.steps li {
		display: grid;
		grid-template-columns: 2rem minmax(0, 1fr);
		gap: 0.75rem;
		padding-right: 1.25rem;
	}
	.steps li + li {
		padding-left: 1.25rem;
		border-left: 1px solid #2f2f34;
	}
	.step-number {
		display: grid;
		width: 1.75rem;
		height: 1.75rem;
		place-items: center;
		border: 1px solid #2f6f3f;
		border-radius: 50%;
		background: rgba(47, 111, 63, 0.14);
		color: #8fd39f;
		font-size: 0.75rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.steps strong {
		display: block;
		color: #dedee2;
		font-size: 0.9rem;
		line-height: 1.35;
	}
	.steps p {
		margin: 0.35rem 0 0;
		color: #888;
		font-size: 0.82rem;
		line-height: 1.5;
		text-wrap: pretty;
	}
	.filters {
		display: flex;
		gap: 0.5rem;
		margin: 1.25rem 0 1.5rem;
		flex-wrap: wrap;
	}
	.filters input,
	.filters select {
		min-height: 2.75rem;
		padding: 0.5rem 0.7rem;
		border: 1px solid #444;
		border-radius: 6px;
		background: #1b1b1f;
		color: #eee;
	}
	.filters input {
		flex: 1 1 16rem;
	}
	.filters button,
	.submit-link {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		justify-content: center;
		padding: 0.5rem 0.9rem;
		border-radius: 6px;
	}
	.submit-link {
		margin-left: auto;
		background: #2f6f3f;
		color: #fff;
		text-decoration: none;
	}
	.filters :is(input, select, button, a):focus-visible,
	.card:focus-visible {
		outline: 2px solid #7ad48f;
		outline-offset: 2px;
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
		transition:
			border-color 0.15s,
			transform 0.15s,
			box-shadow 0.15s;
	}
	@media (hover: hover) and (pointer: fine) {
		.card:hover {
			transform: translateY(-2px);
			border-color: #2f6f3f;
			box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
		}
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
	@media (max-width: 700px) {
		.wrap {
			padding-top: 1rem;
		}
		.hero {
			padding: 1.25rem;
		}
		.steps {
			grid-template-columns: 1fr;
			gap: 0;
		}
		.steps li {
			padding: 0 0 1rem;
		}
		.steps li + li {
			padding: 1rem 0;
			border-top: 1px solid #2f2f34;
			border-left: 0;
		}
		.steps li:last-child {
			padding-bottom: 0;
		}
		.filters input {
			flex-basis: 100%;
		}
		.submit-link {
			margin-left: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.card {
			transition-duration: 0.01ms;
		}
	}
</style>
