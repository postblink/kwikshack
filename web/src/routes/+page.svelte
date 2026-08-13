<script lang="ts">
	import { goto } from '$app/navigation';
	import BuildStatus from '$lib/components/BuildStatus.svelte';
	import CommunityFindCard from '$lib/components/CommunityFindCard.svelte';
	import CopyBlueprintButton from '$lib/components/CopyBlueprintButton.svelte';
	import TagChips from '$lib/components/TagChips.svelte';
	import { iconUrl } from '$lib/icon';
	import { pluralize } from '$lib/pluralize';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';

	let { data } = $props<{ data: PageData }>();
	type DecorOption = PageData['selectedItems'][number];
	type Sort = 'newest' | 'most_items' | 'most_liked';

	const typeLabels: Record<string, string> = { '1': 'Room', '2': 'Interior', '3': 'House', '4': 'Exterior' };
	let q = $state(untrack(() => data.filters.q));
	let type = $state(untrack(() => data.filters.type));
	let faction = $state(untrack(() => data.filters.faction));
	let author = $state(untrack(() => data.filters.author));
	let tag = $state(untrack(() => data.filters.tag));
	let sort = $state<Sort>(untrack(() => data.filters.sort));
	let selectedItems = $state<DecorOption[]>(untrack(() => data.selectedItems));
	let itemQuery = $state('');
	let suggestions = $state<DecorOption[]>([]);
	let itemSearchOpen = $state(false);
	let itemSearchFocused = $state(false);
	let itemSearchLoading = $state(false);
	let activeSuggestion = $state(-1);
	let searchRequest = 0;
	const hasActiveFilters = $derived(Boolean(q.trim() || type || faction || author || tag || selectedItems.length || sort !== 'newest'));

	$effect(() => {
		q = data.filters.q;
		type = data.filters.type;
		faction = data.filters.faction;
		author = data.filters.author;
		tag = data.filters.tag;
		sort = data.filters.sort;
		selectedItems = data.selectedItems;
	});

	$effect(() => {
		const query = itemQuery.trim();
		if (query.length < 2) {
			suggestions = [];
			itemSearchLoading = false;
			activeSuggestion = -1;
			return;
		}

		const requestID = ++searchRequest;
		itemSearchLoading = true;
		const timeout = setTimeout(async () => {
			try {
				const response = await fetch(`/api/decor/search?q=${encodeURIComponent(query)}&limit=10`);
				if (!response.ok) throw new Error('Decor search failed');
				const result = (await response.json()) as { items: DecorOption[] };
				if (requestID !== searchRequest) return;
				suggestions = result.items.filter((item) => !selectedItems.some((selected) => selected.itemID === item.itemID));
				activeSuggestion = -1;
				itemSearchOpen = itemSearchFocused;
			} catch {
				if (requestID === searchRequest) suggestions = [];
			} finally {
				if (requestID === searchRequest) itemSearchLoading = false;
			}
		}, 180);

		return () => clearTimeout(timeout);
	});

	function filterHref(authorFilter = author, tagFilter = tag) {
		const p = new URLSearchParams();
		if (q.trim()) p.set('q', q.trim());
		if (type) p.set('type', type);
		if (faction) p.set('faction', faction);
		if (authorFilter) p.set('author', authorFilter);
		if (tagFilter) p.set('tag', tagFilter);
		if (selectedItems.length) p.set('items', selectedItems.map((item) => item.itemID).join(','));
		if (sort !== 'newest') p.set('sort', sort);
		const s = p.toString();
		return s ? `/?${s}` : '/';
	}

	function tagsFor(build: unknown): string[] {
		if (!build || typeof build !== 'object') return [];
		const tags = (build as { tags?: unknown }).tags;
		return Array.isArray(tags) ? tags.filter((value): value is string => typeof value === 'string') : [];
	}

	function applyFilters() {
		void goto(filterHref(), { keepFocus: true, noScroll: true });
	}

	function clearAuthor() {
		author = '';
		applyFilters();
	}

	function clearTag() {
		tag = '';
		applyFilters();
	}

	function selectItem(item: DecorOption) {
		if (!selectedItems.some((selected) => selected.itemID === item.itemID)) {
			selectedItems = [...selectedItems, item];
		}
		itemQuery = '';
		suggestions = [];
		itemSearchOpen = false;
		applyFilters();
	}

	function removeItem(itemID: number) {
		selectedItems = selectedItems.filter((item) => item.itemID !== itemID);
		applyFilters();
	}

	function handleItemKeydown(event: KeyboardEvent) {
		if (!itemSearchOpen || suggestions.length === 0) {
			if (event.key === 'Escape') itemSearchOpen = false;
			return;
		}
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			activeSuggestion = (activeSuggestion + 1) % suggestions.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			activeSuggestion = (activeSuggestion - 1 + suggestions.length) % suggestions.length;
		} else if (event.key === 'Enter' && activeSuggestion >= 0) {
			event.preventDefault();
			selectItem(suggestions[activeSuggestion]);
		} else if (event.key === 'Escape') {
			itemSearchOpen = false;
		}
	}
</script>

<svelte:head>
	<title>KwikShack — WoW Housing Builds</title>
</svelte:head>

<div class="wrap">
	<header class="hero">
		<div class="hero-copy">
			<p class="eyebrow">The Warcraft housing gallery</p>
			<h1>Find your next build.</h1>
			<p class="tag">Discover player-made spaces built from real in-game blueprint codes.</p>
		</div>
	</header>

	<section class="discovery" aria-labelledby="browse-title">
		<div class="browse-heading">
			<div>
				<p class="eyebrow">Build discovery</p>
				<h2 id="browse-title">What do you want to build?</h2>
			</div>
			<p>Search ideas, narrow the space, or start with a decor piece you love.</p>
		</div>

		<form action="/" method="get" class="filters" onsubmit={(event) => { event.preventDefault(); applyFilters(); }}>
		<input type="hidden" name="author" value={author} />
		<input type="hidden" name="tag" value={tag} />
		<div class="search-row">
			<input type="search" name="q" placeholder="Search builds, descriptions, or creators…" aria-label="Search builds, descriptions, or creators" bind:value={q} />
			<button type="submit">Search builds</button>
		</div>
		<div class="filter-controls" aria-label="Build filters">
			<label>
				<span>Space</span>
				<select name="type" aria-label="Filter by build type" bind:value={type} onchange={applyFilters}>
				<option value="">Any type</option>
				<option value="House">House</option>
				<option value="Interior">Interior</option>
				<option value="Exterior">Exterior</option>
				<option value="Room">Room</option>
				</select>
			</label>
			<label>
				<span>Faction</span>
				<select name="faction" aria-label="Filter by faction" bind:value={faction} onchange={applyFilters}>
				<option value="">Any faction</option>
				<option value="Alliance">Alliance</option>
				<option value="Horde">Horde</option>
				</select>
			</label>
			<label>
				<span>Sort</span>
				<select
				name="sort"
				aria-label="Sort builds"
				value={sort}
				onchange={(event) => {
					sort = event.currentTarget.value as Sort;
					applyFilters();
				}}
			>
				<option value="newest">Newest</option>
				<option value="most_items">Most items</option>
				<option value="most_liked">Most liked</option>
				</select>
			</label>
			{#if hasActiveFilters}<a class="clear-link" href="/">Clear filters</a>{/if}
		</div>

		<div class="item-filter-row">
			<div class="decor-intro">
				<strong>Find builds using a decor item</strong>
				<span>Start with something you own, use often, or want to build around.</span>
			</div>
			<div class="item-autocomplete">
				<div class="item-search-box">
					<input
						id="item-search"
						type="search"
						placeholder="Try “fireplace”, “rug”, or a category…"
						aria-label="Search decor items"
						role="combobox"
						aria-autocomplete="list"
						aria-controls="decor-suggestions"
						aria-expanded={itemSearchOpen && itemQuery.trim().length >= 2}
						aria-activedescendant={activeSuggestion >= 0 ? `decor-option-${suggestions[activeSuggestion]?.itemID}` : undefined}
						bind:value={itemQuery}
						onfocus={() => {
							itemSearchFocused = true;
							if (itemQuery.trim().length >= 2) itemSearchOpen = true;
						}}
						onblur={() => {
							setTimeout(() => {
								itemSearchFocused = false;
								itemSearchOpen = false;
							}, 120);
						}}
						onkeydown={handleItemKeydown}
					/>
					{#if itemSearchLoading}<span class="search-status" aria-live="polite">Searching…</span>{/if}
				</div>
				{#if itemSearchOpen && itemQuery.trim().length >= 2}
					<div class="suggestions" id="decor-suggestions" role="listbox">
						{#if suggestions.length}
							{#each suggestions as suggestion, index (suggestion.itemID)}
								{@const suggestionIcon = iconUrl(suggestion.icon)}
								<button
									type="button"
									id={`decor-option-${suggestion.itemID}`}
									class:active={index === activeSuggestion}
									role="option"
									aria-selected={index === activeSuggestion}
									onmousedown={(event) => event.preventDefault()}
									onclick={() => selectItem(suggestion)}
								>
									{#if suggestionIcon}<img src={suggestionIcon} alt="" />{:else}<span class="icon-placeholder" aria-hidden="true">?</span>{/if}
									<span><strong>{suggestion.name}</strong>{#if suggestion.category}<small>{suggestion.category}</small>{/if}</span>
								</button>
							{/each}
						{:else if !itemSearchLoading}
							<p>No decor items found.</p>
						{/if}
					</div>
				{/if}
			</div>
			<input type="hidden" name="items" value={selectedItems.map((item) => item.itemID).join(',')} />

			{#if selectedItems.length}
				<div class="item-chips" aria-label="Selected decor items">
					{#each selectedItems as item (item.itemID)}
						{@const chipIcon = iconUrl(item.icon)}
						<span class="item-chip">
							{#if chipIcon}<img src={chipIcon} alt="" />{/if}
							<span>{item.name}</span>
							<button type="button" aria-label={`Remove ${item.name}`} onclick={() => removeItem(item.itemID)}>×</button>
						</span>
					{/each}
				</div>
			{/if}
		</div>

		{#if author || (tag && data.availableTags.length)}
			<div class="active-filters" aria-label="Active filters">
				{#if author}
					<span>by <strong>{author}</strong><button type="button" aria-label={`Clear author filter ${author}`} onclick={clearAuthor}>×</button></span>
				{/if}
				{#if tag && data.availableTags.length}
					<span>tagged <strong>#{tag}</strong><button type="button" aria-label={`Clear tag filter ${tag}`} onclick={clearTag}>×</button></span>
				{/if}
			</div>
		{/if}

		{#if data.availableTags.length}
			<details class="style-browser" open={Boolean(tag)}>
				<summary>Browse inferred styles <span>{data.availableTags.length} available</span></summary>
				<nav class="tag-browser" aria-label="Browse inferred build styles">
					{#each data.availableTags.slice(0, 16) as availableTag (availableTag.name)}
						<a class:active={tag === availableTag.name} href={filterHref(author, availableTag.name)}>
							{availableTag.name.replaceAll('-', ' ')}{#if availableTag.count > 0}<small>{availableTag.count}</small>{/if}
						</a>
					{/each}
				</nav>
			</details>
		{/if}
		</form>
	</section>

	{#if data.featuredBuild}
		<section class="featured" aria-labelledby="featured-title">
			<div class="section-kicker">
				<h2 id="featured-title">A build to start with</h2>
				<span>From the community gallery</span>
			</div>
			<article class="featured-card">
				<a class="featured-visual" href={`/builds/${data.featuredBuild.id}`} aria-label={`View ${data.featuredBuild.title}`}>
					{#if data.featuredBuild.primaryScreenshot}
						<img class="featured-image" src={data.featuredBuild.primaryScreenshot} alt="" />
					{:else}
						<span class="image-placeholder large" aria-hidden="true"><span>⌂</span><small>Build preview</small></span>
					{/if}
				</a>
				<div class="featured-content">
					<div class="featured-topline">
						<span class="featured-type">{typeLabels[data.featuredBuild.blueprintType] ?? data.featuredBuild.blueprintType}</span>
						<BuildStatus codeStatus={data.featuredBuild.codeStatus} />
					</div>
					<h3><a href={`/builds/${data.featuredBuild.id}`}>{data.featuredBuild.title}</a></h3>
					<p class="featured-author">by {#if data.featuredBuild.authorName}<a href={`/?author=${encodeURIComponent(data.featuredBuild.authorName)}`}>{data.featuredBuild.authorName}</a>{:else}unknown{/if}</p>
					{#if data.availableTags.length}
						<TagChips tags={tagsFor(data.featuredBuild)} limit={3} activeTag={tag} hrefForTag={(value) => filterHref(author, value)} />
					{/if}
					<div class="featured-counts">
						<span>{data.featuredBuild.faction ?? 'Neutral'}</span>
						<span><strong>{data.featuredBuild.summary.decorCount}</strong> decor</span>
						{#if data.featuredBuild.summary.roomCount > 0}<span><strong>{data.featuredBuild.summary.roomCount}</strong> {pluralize(data.featuredBuild.summary.roomCount, 'room')}</span>{/if}
					</div>
					<div class="featured-action">
						<CopyBlueprintButton shareCode={data.featuredBuild.shareCode} buildTitle={data.featuredBuild.title} />
					</div>
				</div>
			</article>
		</section>
	{/if}

	{#if data.builds.length === 0}
		<div class="empty">
			<p class="empty-title">The shack's empty — be the first to unpack a build.</p>
			<p><a href="/submit">Submit a build</a> (or <code>POST /api/builds</code>)</p>
		</div>
	{:else}
		<section class="gallery" aria-labelledby="gallery-title">
			<div class="gallery-heading">
				<h2 id="gallery-title">Explore the gallery</h2>
				<span>{data.builds.length} {data.builds.length === 1 ? 'build' : 'builds'} shown</span>
			</div>
		<div class="grid">
			{#each data.builds as b (b.id)}
				<article class="card">
					<a class="card-image" href={`/builds/${b.id}`} aria-label={`View ${b.title}`}>
						{#if b.primaryScreenshot}
							<img src={b.primaryScreenshot} alt="" />
						{:else}
							<span class="image-placeholder" aria-hidden="true"><span>⌂</span><small>Build preview</small></span>
						{/if}
					</a>
					<div class="card-body">
					<div class="card-head">
						<span class="type">{typeLabels[b.blueprintType] ?? b.blueprintType}</span>
						<BuildStatus codeStatus={b.codeStatus} />
					</div>
					<h2><a href={`/builds/${b.id}`}>{b.title}</a></h2>
					<p class="creator">
						by {#if b.authorName}<a class="author-link" href={`/?author=${encodeURIComponent(b.authorName)}`}>{b.authorName}</a>{:else}unknown{/if}
					</p>
					<div class="structured-meta" aria-label="Build details">
						<span>{b.faction ?? 'Neutral'}</span><span aria-hidden="true">·</span><span>{b.summary.decorCount} decor</span>
						{#if b.summary.roomCount > 0}<span aria-hidden="true">·</span><span>{b.summary.roomCount} {pluralize(b.summary.roomCount, 'room')}</span>{/if}
					</div>
					{#if data.availableTags.length}
						<TagChips tags={tagsFor(b)} limit={3} activeTag={tag} hrefForTag={(value) => filterHref(author, value)} />
					{/if}
					<div class="card-actions">
						<CopyBlueprintButton shareCode={b.shareCode} buildTitle={b.title} compact />
					</div>
					</div>
				</article>
			{/each}
		</div>
		</section>
	{/if}

	{#if data.communityFinds.length}
		<section class="community-finds" aria-labelledby="community-finds-title">
			<div class="gallery-heading">
				<div>
					<p class="eyebrow">Beyond the native gallery</p>
					<h2 id="community-finds-title">Elsewhere in the community</h2>
				</div>
				<a href="/finds">See all Community Finds →</a>
			</div>
			<p class="community-finds-intro">Curated links to original work by WoW housing creators. These are clearly separated from import-ready KwikShack builds.</p>
			<div class="community-grid">
				{#each data.communityFinds as find (find.id)}
					<CommunityFindCard {find} />
				{/each}
			</div>
		</section>
	{/if}

	<section class="how-it-works" aria-labelledby="how-it-works-title">
		<div class="how-heading">
			<p class="eyebrow">From gallery to game</p>
			<h2 id="how-it-works-title">How KwikShack works</h2>
		</div>
		<ol class="steps">
			<li>
				<span class="step-number" aria-hidden="true">1</span>
				<div><strong>Import a Blueprint</strong><p>Paste a blueprint code into the KwikShack addon in-game.</p></div>
			</li>
			<li>
				<span class="step-number" aria-hidden="true">2</span>
				<div><strong>Share Your Build</strong><p>Submit the blueprint and screenshots yourself, or let the companion app handle the upload.</p></div>
			</li>
			<li>
				<span class="step-number" aria-hidden="true">3</span>
				<div><strong>Find Your Next Idea</strong><p>Browse builds, explore how other players use decor, and copy blueprints to try yourself.</p></div>
			</li>
		</ol>
	</section>
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
		padding: clamp(1.65rem, 3.5vw, 2.35rem);
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
		max-width: 18ch;
		margin: 0.45rem 0 0;
		background: linear-gradient(180deg, #fff3c7 0%, var(--gold-bright) 42%, #ae8430 100%);
		background-clip: text;
		color: transparent;
		font-size: clamp(2.35rem, 5vw, 3.7rem);
		font-weight: 600;
		line-height: 1.03;
		letter-spacing: -0.035em;
		text-shadow: 0 12px 34px rgb(0 0 0 / 0.14);
		text-wrap: balance;
	}
	.eyebrow {
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
		margin-top: clamp(3rem, 7vw, 5rem);
		padding: clamp(1.4rem, 4vw, 2.25rem);
		border: 1px solid rgb(200 161 68 / 0.2);
		border-radius: 0.68rem;
		background: linear-gradient(145deg, rgb(38 33 26 / 0.74), rgb(27 23 18 / 0.76));
	}
	.how-heading h2 {
		margin: 0.35rem 0 0;
		color: var(--text);
		font-size: clamp(1.35rem, 3vw, 1.8rem);
		font-weight: 600;
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
	.discovery {
		margin-top: clamp(1.25rem, 3vw, 2rem);
		padding: clamp(1rem, 3vw, 1.4rem);
		border: 1px solid rgb(138 116 63 / 0.46);
		border-radius: 0.62rem;
		background: rgb(20 17 13 / 0.62);
		box-shadow: var(--shadow-low);
	}
	.browse-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 0.9rem;
	}
	.browse-heading h2 {
		margin: 0.25rem 0 0;
		color: var(--text);
		font-size: clamp(1.15rem, 3vw, 1.55rem);
		font-weight: 600;
	}
	.browse-heading > p {
		max-width: 34rem;
		margin: 0;
		color: var(--text-muted);
		font-size: 0.8rem;
		text-align: right;
	}
	.filters {
		display: grid;
		grid-template-columns: minmax(22rem, 1fr) auto;
		gap: 0.65rem;
		border-top: 1px solid var(--border);
		padding-top: 0.9rem;
	}
	.search-row {
		display: flex;
		gap: 0.55rem;
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
	.search-row input {
		flex: 1;
		min-width: 0;
		font-size: 0.95rem;
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
	.search-row button {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		justify-content: center;
		padding: 0.55rem 1.2rem;
		border: 1px solid #6f541c;
		border-radius: 0.42rem;
		background: linear-gradient(to bottom, #f1d686 0, #d2a944 9%, #9b7025 62%, #76511b 100%);
		box-shadow:
			inset 0 1px rgb(255 247 210 / 0.72),
			inset 0 -1px rgb(55 32 4 / 0.62);
		color: #1b1409;
		font-size: 0.84rem;
		font-weight: 750;
		text-shadow: 0 1px rgb(255 232 154 / 0.32);
		transition:
			filter 150ms ease,
			transform 150ms ease;
	}
	.filter-controls {
		display: flex;
		align-items: flex-end;
		gap: 0.55rem;
		margin-top: 0;
		flex-wrap: wrap;
	}
	.filter-controls label {
		display: grid;
		gap: 0.26rem;
		min-width: 9.5rem;
		color: var(--text-muted);
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.filter-controls select {
		width: 100%;
		min-width: 0;
		font-size: 0.82rem;
		text-transform: none;
		letter-spacing: 0;
	}
	.clear-link {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		padding: 0.55rem 0.7rem;
		color: var(--text-muted);
		font-size: 0.78rem;
		font-weight: 700;
		text-decoration: none;
	}
	.clear-link:hover {
		color: var(--text);
	}
	@media (hover: hover) and (pointer: fine) {
		.search-row button:hover {
			filter: brightness(1.12);
			transform: translateY(-1px);
		}
	}
	.item-filter-row {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: minmax(13rem, 0.7fr) minmax(18rem, 1.3fr);
		align-items: end;
		gap: 0.75rem;
		margin-top: 0.75rem;
		padding: 0.85rem;
		border: 1px solid var(--border);
		border-radius: 0.52rem;
		background: rgb(29 25 20 / 0.62);
	}
	.decor-intro {
		display: grid;
		gap: 0.28rem;
		align-self: center;
	}
	.decor-intro strong {
		color: var(--gold-bright);
		font-family: var(--font-display);
		font-size: 0.78rem;
		letter-spacing: 0.045em;
	}
	.decor-intro span {
		color: var(--text-muted);
		font-size: 0.74rem;
		line-height: 1.45;
	}
	.active-filters {
		grid-column: 1 / -1;
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 0.75rem;
	}
	.active-filters > span {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.3rem;
		padding-left: 0.75rem;
		border: 1px solid color-mix(in srgb, var(--gold-dim) 48%, var(--border));
		border-radius: 999px;
		background: color-mix(in srgb, var(--gold-dim) 9%, var(--surface));
		color: var(--text-muted);
		font-size: 0.78rem;
	}
	.active-filters strong {
		color: var(--gold-bright);
	}
	.active-filters button {
		width: 2.75rem;
		align-self: stretch;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--text-muted);
		font-size: 1rem;
	}
	.active-filters button:hover {
		color: var(--text);
	}
	.style-browser {
		grid-column: 1 / -1;
		margin-top: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 0.52rem;
		background: rgb(29 25 20 / 0.45);
	}
	.style-browser summary {
		min-height: 2.75rem;
		padding: 0.78rem 0.85rem;
		color: var(--gold-dim);
		font-family: var(--font-display);
		font-size: 0.69rem;
		font-weight: 700;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.style-browser summary span {
		margin-left: 0.35rem;
		color: var(--text-muted);
		font-family: system-ui, sans-serif;
		font-size: 0.65rem;
		font-weight: 500;
		letter-spacing: 0;
		text-transform: none;
	}
	.tag-browser {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex-wrap: wrap;
		padding: 0 0.8rem 0.8rem;
	}
	.tag-browser a {
		display: inline-flex;
		min-height: 2.5rem;
		align-items: center;
		gap: 0.35rem;
		padding: 0.3rem 0.65rem;
		border: 1px solid color-mix(in srgb, var(--gold-dim) 42%, var(--border));
		border-radius: 0.32rem;
		background: color-mix(in srgb, var(--gold-dim) 8%, var(--surface));
		color: var(--gold-dim);
		font-family: var(--font-display);
		font-size: 0.68rem;
		font-weight: 700;
		text-decoration: none;
		text-transform: capitalize;
	}
	.tag-browser a.active {
		border-color: var(--gold);
		background: color-mix(in srgb, var(--gold) 17%, var(--surface));
		color: var(--gold-bright);
	}
	.tag-browser small {
		color: var(--text-muted);
		font-family: inherit;
		font-size: 0.62rem;
		font-variant-numeric: tabular-nums;
	}
	.item-autocomplete {
		position: relative;
		flex: 1 1 22rem;
		min-width: 0;
	}
	.item-search-box {
		position: relative;
	}
	.item-search-box input {
		width: 100%;
		padding-right: 5.5rem;
	}
	.search-status {
		position: absolute;
		top: 50%;
		right: 0.75rem;
		color: var(--text-muted);
		font-size: 0.72rem;
		transform: translateY(-50%);
	}
	.suggestions {
		position: absolute;
		z-index: 20;
		top: calc(100% + 0.35rem);
		right: 0;
		left: 0;
		overflow: hidden;
		border: 1px solid var(--gold-dim);
		border-radius: 0.5rem;
		background: #211c16;
		box-shadow: 0 18px 40px rgb(0 0 0 / 0.48);
	}
	.suggestions button {
		display: flex;
		width: 100%;
		align-items: center;
		gap: 0.7rem;
		padding: 0.58rem 0.7rem;
		border: 0;
		border-bottom: 1px solid rgb(138 116 63 / 0.22);
		background: transparent;
		color: var(--text);
		text-align: left;
	}
	.suggestions button:last-child {
		border-bottom: 0;
	}
	.suggestions button:is(:hover, .active) {
		background: rgb(200 161 68 / 0.12);
	}
	.suggestions img,
	.icon-placeholder {
		width: 2.25rem;
		height: 2.25rem;
		flex: 0 0 2.25rem;
		border: 1px solid rgb(200 161 68 / 0.35);
		border-radius: 0.35rem;
		background: var(--surface-2);
		object-fit: cover;
	}
	.icon-placeholder {
		display: grid;
		place-items: center;
		color: var(--gold-dim);
	}
	.suggestions strong,
	.suggestions small {
		display: block;
	}
	.suggestions strong {
		font-size: 0.84rem;
	}
	.suggestions small {
		margin-top: 0.12rem;
		color: var(--text-muted);
		font-size: 0.7rem;
	}
	.suggestions p {
		margin: 0;
		padding: 0.85rem;
		color: var(--text-muted);
		font-size: 0.8rem;
	}
	.item-chips {
		display: flex;
		grid-column: 1 / -1;
		gap: 0.45rem;
		flex-wrap: wrap;
	}
	.item-chip {
		display: inline-flex;
		min-height: 2.35rem;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.3rem 0.25rem 0.25rem;
		border: 1px solid rgb(200 161 68 / 0.38);
		border-radius: 999px;
		background: rgb(200 161 68 / 0.09);
		color: var(--text);
		font-size: 0.78rem;
	}
	.item-chip img {
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 50%;
		object-fit: cover;
	}
	.item-chip button {
		display: grid;
		width: 1.6rem;
		height: 1.6rem;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: rgb(0 0 0 / 0.2);
		color: var(--text-muted);
		font-size: 1rem;
		line-height: 1;
	}
	.item-chip button:hover {
		background: rgb(207 112 93 / 0.2);
		color: var(--text);
	}
	.featured {
		margin: clamp(1.5rem, 4vw, 2.5rem) 0;
	}
	.section-kicker {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.7rem;
	}
	.section-kicker h2 {
		margin: 0;
		color: var(--gold-bright);
		font-size: 0.88rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}
	.section-kicker > span {
		color: var(--text-muted);
		font-size: 0.72rem;
	}
	.featured-card {
		display: grid;
		grid-template-columns: minmax(0, 1.35fr) minmax(18rem, 0.65fr);
		overflow: hidden;
		min-height: clamp(20rem, 36vw, 25rem);
		border: 1px solid rgb(232 200 115 / 0.52);
		border-radius: 0.72rem;
		background:
			radial-gradient(circle at 78% 20%, rgb(232 200 115 / 0.17), transparent 28rem),
			linear-gradient(135deg, #32291d, #17130f 70%);
		box-shadow:
			inset 0 1px rgb(255 245 204 / 0.11),
			var(--shadow-high);
		transition:
			border-color 160ms ease,
			box-shadow 160ms ease,
			transform 160ms ease;
	}
	.featured-visual {
		position: relative;
		display: block;
		min-height: 20rem;
		overflow: hidden;
		border-right: 1px solid rgb(138 116 63 / 0.45);
		background: #17130f;
	}
	.featured-image {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.featured-content {
		display: flex;
		min-width: 0;
		flex-direction: column;
		justify-content: center;
		padding: clamp(1.35rem, 3vw, 2.15rem);
	}
	.featured-topline {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.featured-type {
		display: inline-block;
		padding: 0.2rem 0.58rem;
		border: 1px solid rgb(232 200 115 / 0.48);
		border-radius: 999px;
		background: rgb(200 161 68 / 0.14);
		color: var(--gold-bright);
		font-size: 0.72rem;
		font-weight: 750;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.featured-content h3 {
		margin: 0.75rem 0 0.35rem;
		color: #fff3cf;
		font-family: var(--font-display);
		font-size: clamp(1.55rem, 3.7vw, 2.45rem);
		font-weight: 600;
		line-height: 1.08;
		text-wrap: balance;
	}
	.featured-content h3 a {
		color: inherit;
		text-decoration: none;
	}
	.featured-author {
		margin: 0.35rem 0 0;
		color: var(--text-muted);
		font-size: 0.88rem;
	}
	.featured-author a {
		color: var(--text-muted);
	}
	.featured-content :global(.tag-chips) {
		margin-top: 0.9rem;
	}
	.featured-counts {
		display: flex;
		gap: 0.42rem;
		flex-wrap: wrap;
		margin-top: 1.15rem;
	}
	.featured-counts span {
		padding: 0.45rem 0.65rem;
		border: 1px solid rgb(138 116 63 / 0.46);
		border-radius: 0.42rem;
		background: rgb(0 0 0 / 0.24);
		color: var(--text-muted);
		font-size: 0.78rem;
	}
	.featured-counts strong {
		color: var(--text);
		font-size: 0.92rem;
	}
	.featured-action {
		margin-top: 1rem;
	}
	@media (hover: hover) and (pointer: fine) {
		.featured-card:has(.featured-visual:hover, h3 a:hover) {
			border-color: var(--gold-bright);
			box-shadow:
				inset 0 1px rgb(255 245 204 / 0.14),
				0 22px 52px rgb(0 0 0 / 0.38),
				0 0 28px rgb(200 161 68 / 0.1);
			transform: translateY(-2px);
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
	.gallery {
		margin-top: clamp(2rem, 5vw, 3.25rem);
	}
	.community-finds {
		margin-top: clamp(2.5rem, 6vw, 4rem);
		padding-top: clamp(1.5rem, 4vw, 2.25rem);
		border-top: 1px solid var(--border);
	}
	.community-finds .gallery-heading {
		align-items: center;
		border-bottom: 0;
		margin-bottom: 0;
		padding-bottom: 0;
	}
	.community-finds .gallery-heading h2 {
		margin-top: 0.28rem;
	}
	.community-finds .gallery-heading > a {
		min-height: 2.75rem;
		align-content: center;
		font-size: 0.78rem;
		font-weight: 700;
		text-decoration: none;
	}
	.community-finds-intro {
		max-width: 58ch;
		margin: 0.7rem 0 1rem;
		color: var(--text-muted);
		font-size: 0.82rem;
		line-height: 1.55;
	}
	.community-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
		gap: 1rem;
	}
	.gallery-heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.8rem;
		padding-bottom: 0.65rem;
		border-bottom: 1px solid var(--border);
	}
	.gallery-heading h2 {
		margin: 0;
		color: var(--gold-bright);
		font-size: 0.9rem;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}
	.gallery-heading span {
		color: var(--text-muted);
		font-size: 0.74rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
		gap: 1rem;
	}
	.card {
		display: grid;
		grid-template-rows: auto 1fr;
		overflow: hidden;
		min-height: 25rem;
		border: 1px solid rgb(138 116 63 / 0.5);
		border-radius: 0.62rem;
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
	.card-image {
		position: relative;
		display: block;
		aspect-ratio: 16 / 10;
		overflow: hidden;
		border-bottom: 1px solid rgb(138 116 63 / 0.42);
		background: #17130f;
	}
	.card-image img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 220ms ease;
	}
	@media (hover: hover) and (pointer: fine) {
		.card-image:hover img {
			transform: scale(1.025);
		}
	}
	.image-placeholder {
		display: grid;
		width: 100%;
		height: 100%;
		place-content: center;
		gap: 0.28rem;
		background:
			radial-gradient(circle at 50% 26%, rgb(232 200 115 / 0.18), transparent 8rem),
			linear-gradient(145deg, #30271c, #18140f 72%);
		color: var(--gold-dim);
		text-align: center;
	}
	.image-placeholder > span {
		font-family: Georgia, serif;
		font-size: 2.2rem;
	}
	.image-placeholder small {
		font-family: var(--font-display);
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.image-placeholder.large > span {
		font-size: 3.2rem;
	}
	.card-body {
		display: flex;
		min-width: 0;
		flex-direction: column;
		padding: 1rem;
	}
	.card h2 {
		margin: 0.65rem 0 0.18rem;
		color: var(--text);
		font-size: 1.05rem;
		font-weight: 600;
		letter-spacing: 0.005em;
		line-height: 1.4;
	}
	.card h2 a {
		color: inherit;
		text-decoration: none;
	}
	.card h2 a:hover {
		color: var(--gold-bright);
	}
	.creator {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.78rem;
	}
	.author-link {
		color: var(--text-muted);
	}
	.structured-meta {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
		margin-top: 0.75rem;
		color: var(--text-muted);
		font-size: 0.78rem;
		font-variant-numeric: tabular-nums;
	}
	.card :global(.tag-chips) {
		margin-top: 0.8rem;
	}
	.card-actions {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 0.75rem;
		margin-top: auto;
		padding-top: 1rem;
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
	@media (max-width: 900px) {
		.filters {
			display: block;
		}
		.filter-controls {
			margin-top: 0.65rem;
		}
	}
	@media (max-width: 700px) {
		.wrap {
			padding-top: 1.25rem;
		}
		.hero {
			padding: 1.4rem;
		}
		.hero h1 {
			font-size: clamp(2.2rem, 11vw, 3.2rem);
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
		.browse-heading > p {
			text-align: left;
		}
		.filter-controls label {
			flex: 1 1 8rem;
		}
		.item-filter-row {
			grid-template-columns: 1fr;
		}
		.item-chips {
			grid-column: auto;
		}
		.featured-card {
			grid-template-columns: 1fr;
		}
		.featured-visual {
			min-height: 15rem;
			border-right: 0;
			border-bottom: 1px solid rgb(138 116 63 / 0.45);
		}
		.featured-content {
			padding: 1.25rem;
		}
		.grid {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 430px) {
		.discovery {
			padding: 0.85rem;
		}
		.search-row {
			align-items: stretch;
			flex-direction: column;
		}
		.search-row button {
			width: 100%;
		}
		.filter-controls {
			display: grid;
			grid-template-columns: 1fr 1fr;
		}
		.filter-controls label:last-of-type,
		.clear-link {
			grid-column: 1 / -1;
		}
		.clear-link {
			justify-content: center;
		}
		.section-kicker {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.2rem;
		}
		.featured-topline {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
