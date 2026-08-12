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
			<p class="eyebrow">The Warcraft housing gallery</p>
			<h1>Every great build deserves a home.</h1>
			<p class="tag">Discover player-made spaces, resolved from real in-game blueprint codes.</p>
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

	<div class="browse-heading">
		<h2>Browse the gallery</h2>
		<p>Fresh ideas for every room, house, and corner of Azeroth.</p>
	</div>

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
			<p class="empty-title">The shack's empty — be the first to unpack a build.</p>
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
		max-width: var(--content-width);
		margin: 0 auto;
		padding: clamp(1.5rem, 4vw, 3rem) 1rem clamp(3rem, 7vw, 5rem);
	}
	.hero {
		position: relative;
		overflow: hidden;
		padding: clamp(2rem, 6vw, 4.25rem);
		border: 1px solid rgb(200 161 68 / 0.28);
		border-radius: 0.75rem;
		background:
			radial-gradient(circle at 88% 0%, rgb(200 161 68 / 0.12), transparent 26rem),
			linear-gradient(145deg, rgb(38 33 26 / 0.96), rgb(27 23 18 / 0.98));
		box-shadow:
			inset 0 1px rgb(232 200 115 / 0.1),
			var(--shadow-high);
	}
	.hero::before {
		position: absolute;
		top: 0;
		right: 10%;
		left: 10%;
		height: 1px;
		background: linear-gradient(90deg, transparent, var(--gold-bright), transparent);
		content: '';
		opacity: 0.55;
	}
	.hero-copy {
		max-width: 48rem;
	}
	.hero h1 {
		max-width: 16ch;
		margin: 0.45rem 0 0;
		background: linear-gradient(180deg, #fff3c7 0%, var(--gold-bright) 42%, #ae8430 100%);
		background-clip: text;
		color: transparent;
		font-size: clamp(2.65rem, 7vw, 5.25rem);
		font-weight: 600;
		line-height: 1.03;
		letter-spacing: -0.035em;
		text-shadow: 0 12px 34px rgb(0 0 0 / 0.14);
		text-wrap: balance;
	}
	.eyebrow,
	.how-it-works h2,
	.browse-heading h2 {
		margin: 0;
		color: var(--gold-dim);
		font-family: var(--font-display);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}
	.tag {
		max-width: 60ch;
		margin: 1rem 0 0;
		color: var(--text-muted);
		font-size: clamp(1rem, 2.5vw, 1.12rem);
		line-height: 1.65;
		text-wrap: pretty;
	}
	.how-it-works {
		margin-top: clamp(2.25rem, 5vw, 3.5rem);
		padding-top: 1.4rem;
		border-top: 1px solid rgb(200 161 68 / 0.18);
	}
	.steps {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
		margin: 1.05rem 0 0;
		padding: 0;
		list-style: none;
	}
	.steps li {
		display: grid;
		grid-template-columns: 2.2rem minmax(0, 1fr);
		gap: 0.8rem;
		padding: 1rem;
		border: 1px solid var(--border);
		border-radius: 0.48rem;
		background: rgb(20 17 13 / 0.48);
		box-shadow: inset 0 1px rgb(255 255 255 / 0.02);
	}
	.step-number {
		display: grid;
		width: 2rem;
		height: 2rem;
		place-items: center;
		border: 1px solid var(--gold-dim);
		border-radius: 0.38rem;
		background: linear-gradient(145deg, rgb(200 161 68 / 0.16), rgb(138 116 63 / 0.06));
		box-shadow: inset 0 1px rgb(232 200 115 / 0.13);
		color: var(--gold-bright);
		font-family: var(--font-display);
		font-size: 0.75rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.steps strong {
		display: block;
		color: var(--text);
		font-size: 0.88rem;
		line-height: 1.35;
	}
	.steps p {
		margin: 0.35rem 0 0;
		color: var(--text-muted);
		font-size: 0.8rem;
		line-height: 1.5;
		text-wrap: pretty;
	}
	.browse-heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
		margin-top: clamp(2.5rem, 6vw, 4rem);
		padding-bottom: 0.8rem;
		border-bottom: 1px solid var(--border);
	}
	.browse-heading p {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.82rem;
	}
	.filters {
		display: flex;
		gap: 0.65rem;
		margin: 1rem 0 1.5rem;
		flex-wrap: wrap;
	}
	.filters input,
	.filters select {
		min-height: 2.75rem;
		padding: 0.55rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 0.42rem;
		background: var(--surface);
		box-shadow: inset 0 1px 3px rgb(0 0 0 / 0.25);
		color: var(--text);
		transition:
			border-color 150ms ease,
			box-shadow 150ms ease;
	}
	.filters input {
		flex: 1 1 16rem;
	}
	.filters input::placeholder {
		color: #827866;
	}
	.filters :is(input, select):focus {
		border-color: var(--gold-dim);
		box-shadow:
			inset 0 1px 3px rgb(0 0 0 / 0.2),
			0 0 0 3px rgb(200 161 68 / 0.08);
	}
	.filters button,
	.submit-link {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		justify-content: center;
		padding: 0.55rem 0.95rem;
		border-radius: 0.42rem;
		font-size: 0.84rem;
		font-weight: 750;
		transition:
			border-color 150ms ease,
			box-shadow 150ms ease,
			filter 150ms ease,
			transform 150ms ease;
	}
	.filters button {
		border: 1px solid #6f541c;
		background: linear-gradient(to bottom, #f1d686 0, #d2a944 9%, #9b7025 62%, #76511b 100%);
		box-shadow:
			inset 0 1px rgb(255 247 210 / 0.72),
			inset 0 -1px rgb(55 32 4 / 0.62);
		color: #1b1409;
		text-shadow: 0 1px rgb(255 232 154 / 0.32);
	}
	.submit-link {
		margin-left: auto;
		border: 1px solid var(--gold-dim);
		background: rgb(200 161 68 / 0.07);
		color: var(--gold-bright);
		text-decoration: none;
	}
	@media (hover: hover) and (pointer: fine) {
		.filters button:hover {
			filter: brightness(1.12);
			transform: translateY(-1px);
		}
		.submit-link:hover {
			border-color: var(--gold);
			background: rgb(200 161 68 / 0.12);
			box-shadow: 0 4px 16px rgb(200 161 68 / 0.08);
		}
	}
	.empty {
		border: 1px dashed var(--gold-dim);
		border-radius: 0.65rem;
		padding: clamp(2rem, 6vw, 3.5rem);
		background: rgb(29 25 20 / 0.56);
		text-align: center;
		color: var(--text-muted);
	}
	.empty p {
		margin: 0.6rem 0 0;
	}
	.empty-title {
		color: var(--text);
		font-family: var(--font-display);
		font-size: clamp(1.05rem, 3vw, 1.3rem);
		font-weight: 600;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 0.9rem;
	}
	.card {
		position: relative;
		overflow: hidden;
		border: 1px solid rgb(138 116 63 / 0.5);
		border-radius: 0.58rem;
		padding: 1.1rem;
		text-decoration: none;
		color: var(--text);
		background: linear-gradient(150deg, var(--surface-2), var(--surface));
		box-shadow:
			inset 0 1px rgb(232 200 115 / 0.05),
			var(--shadow-low);
		transition:
			border-color 160ms ease,
			transform 160ms ease,
			box-shadow 160ms ease;
	}
	@media (hover: hover) and (pointer: fine) {
		.card:hover {
			transform: translateY(-3px);
			border-color: var(--gold);
			box-shadow:
				inset 0 1px rgb(232 200 115 / 0.08),
				0 14px 34px rgb(0 0 0 / 0.3),
				0 0 22px rgb(200 161 68 / 0.08);
		}
	}
	.card h2 {
		margin: 0.65rem 0 0.3rem;
		color: var(--text);
		font-size: 1.05rem;
		font-weight: 600;
		letter-spacing: 0.005em;
		line-height: 1.4;
	}
	.code {
		margin: 0.25rem 0;
		color: var(--gold-bright);
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.85rem;
	}
	.meta {
		margin: 0.5rem 0 0;
		color: var(--text-muted);
		font-size: 0.85rem;
	}
	.card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		font-size: 0.75rem;
	}
	.type {
		padding: 0.16rem 0.5rem;
		border: 1px solid rgb(138 116 63 / 0.52);
		border-radius: 999px;
		background: rgb(138 116 63 / 0.15);
		color: var(--gold-bright);
		font-weight: 700;
		letter-spacing: 0.035em;
	}
	.status.active {
		color: var(--ok);
	}
	.status.expired {
		color: var(--bad);
	}
	.status.unverified {
		color: var(--warn);
	}
	@media (max-width: 700px) {
		.wrap {
			padding-top: 1.25rem;
		}
		.hero {
			padding: 1.4rem;
		}
		.hero h1 {
			font-size: clamp(2.35rem, 12vw, 3.45rem);
		}
		.steps {
			grid-template-columns: 1fr;
			gap: 0.65rem;
		}
		.browse-heading {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.3rem;
		}
		.filters input {
			flex-basis: 100%;
		}
		.submit-link {
			margin-left: 0;
		}
	}
	@media (max-width: 430px) {
		.filters select,
		.filters button,
		.submit-link {
			flex: 1 1 calc(50% - 0.65rem);
		}
	}
</style>
