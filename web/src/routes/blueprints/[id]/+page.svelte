<script lang="ts">
	import BlueprintPlaceholder from '$lib/components/BlueprintPlaceholder.svelte';
	import BlueprintResolutionStatus from '$lib/components/BlueprintResolutionStatus.svelte';
	import CopyBlueprintButton from '$lib/components/CopyBlueprintButton.svelte';
	import { RESOLUTION_BLURBS } from '$lib/types/indexed-blueprint';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const blueprint = $derived(data.blueprint);
	const claimHref = $derived(`/auth/battlenet?redirectTo=${encodeURIComponent(`/blueprints/${blueprint.id}`)}`);
</script>

<svelte:head>
	<title>{blueprint.title} — KwikShack</title>
	<!-- Indexed listings carry a third party's attribution; keep them out of
	     search result summaries that could read as KwikShack authorship. -->
	<meta name="description" content={`A publicly shared WoW housing blueprint indexed by KwikShack, attributed to ${blueprint.attributedCreator}.`} />
</svelte:head>

<div class="wrap">
	<nav class="crumbs" aria-label="Breadcrumb">
		<a href="/blueprints">Indexed blueprints</a>
	</nav>

	<header class="head">
		<div>
			<p class="eyebrow">
				{blueprint.claimState === 'claimed' ? 'Managed by the claimed creator' : 'Indexed from a public community share'}
			</p>
			<h1>{blueprint.title}</h1>
			<p class="byline">
				{#if blueprint.claimState === 'claimed' && blueprint.claimedCreatorName}
					Managed by <strong>{blueprint.preferredAttribution ?? blueprint.claimedCreatorName}</strong>
				{:else}
					Attributed to <strong>{blueprint.attributedCreator}</strong>
					{#if blueprint.attributedCharacter}<span class="dim">({blueprint.attributedCharacter}{blueprint.attributedRealm ? `-${blueprint.attributedRealm}` : ''})</span>{/if}
				{/if}
			</p>
		</div>
		<BlueprintResolutionStatus state={blueprint.resolutionState} />
	</header>

	<section class="hero">
		{#if blueprint.screenshots.length}
			<img src={blueprint.screenshots[0].url} alt={blueprint.screenshots[0].caption || blueprint.title} />
		{:else}
			<div class="placeholder-frame">
				<div class="placeholder-art">
					<BlueprintPlaceholder blueprintType={blueprint.blueprintType} seed={blueprint.id} />
				</div>
				<p>KwikShack does not copy images from the original post. Screenshots appear once the creator claims this listing and uploads their own.</p>
			</div>
		{/if}
	</section>

	<section class="actions-row">
		{#if blueprint.copyable}
			<CopyBlueprintButton shareCode={blueprint.shareCode} buildTitle={blueprint.title} />
		{:else}
			<p class="gone" role="status">
				<strong>Blueprint unavailable.</strong>
				{RESOLUTION_BLURBS[blueprint.resolutionState]}
			</p>
		{/if}
		{#if blueprint.nativeBuildId}
			<a class="native-link" href="/builds/{blueprint.nativeBuildId}">The creator's own KwikShack listing →</a>
		{/if}
	</section>

	{#if blueprint.description}
		<section class="panel">
			<h2>From the creator</h2>
			<p class="prose">{blueprint.description}</p>
		</section>
	{/if}

	{#if blueprint.tags.length}
		<ul class="tags">
			{#each blueprint.tags as tag (tag)}<li>{tag}</li>{/each}
		</ul>
	{/if}

	<section class="panel">
		<h2>Where KwikShack found this</h2>
		<ul class="sources">
			{#each blueprint.sources as source (source.sourceUrl)}
				<li>
					<a href={source.sourceUrl} rel="noopener noreferrer nofollow ugc" target="_blank">{source.platformLabel} ↗</a>
					<span class="dim">attributed to {source.attributedCreator} · discovered {source.discoveredAt}</span>
				</li>
			{/each}
		</ul>
		<p class="fine">Indexed {blueprint.indexedAt}. The original post is the creator's; KwikShack links to it rather than reproducing it.</p>
	</section>

	{#if blueprint.resolutionState === 'resolved' && data.items.length}
		<section class="panel">
			<h2>What's in it</h2>
			<p class="fine">
				Resolved by KwikShack through the in-game addon
				{#if blueprint.derived}
					· {blueprint.derived.decorCount} decor placed · {blueprint.derived.distinctDecorItems} distinct items
					{#if blueprint.derived.roomCount}· {blueprint.derived.roomCount} rooms{/if}
				{/if}
			</p>
			<ul class="items">
				{#each data.items as item (item.key)}
					<li>
						<span class="item-name">{item.name}</span>
						<span class="item-count">×{item.count}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if blueprint.creatorLinks.length}
		<section class="panel">
			<h2>Creator links</h2>
			<ul class="sources">
				{#each blueprint.creatorLinks as link (link)}
					<li><a href={link} rel="noopener noreferrer nofollow ugc" target="_blank">{link} ↗</a></li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="panel claim">
		<h2>Is this yours?</h2>
		{#if blueprint.claimState === 'claimed'}
			<p class="fine">This listing has been claimed and is managed by its creator.</p>
		{:else if form?.claimSubmitted}
			<p class="fine">Claim request received. A person reviews every claim — we'll follow up through your account page.</p>
		{:else}
			<p>
				If you shared this blueprint, you can claim the listing. Signing in with Battle.net proves you control a Battle.net
				account and, optionally, which characters it controls — it does not by itself prove you built this. A person reviews
				every claim.
			</p>
			{#if form?.claimError}<p class="error" role="alert">{form.claimError}</p>{/if}
			{#if data.signedIn}
				<form method="POST" action="?/claim" class="claim-form">
					{#if data.characters.length}
						<label>
							Character that published it
							<select name="characterIdentityId">
								<option value="">Prefer not to say</option>
								{#each data.characters as character (character.id)}
									<option value={character.id}>{character.label}</option>
								{/each}
							</select>
						</label>
					{/if}
					<label>
						A link that shows you control the original post
						<input type="url" name="evidenceUrl" placeholder="https://…" />
					</label>
					<label>
						Anything else that helps us check
						<textarea name="claimantNote" rows="3" maxlength="1000"></textarea>
					</label>
					<button class="gold-button" type="submit">Request this claim</button>
				</form>
			{:else}
				<a class="gold-button" href={claimHref} data-sveltekit-reload>Sign in with Battle.net to claim</a>
			{/if}
		{/if}
	</section>
</div>

<style>
	.wrap {
		width: min(100% - 2rem, var(--content-width));
		margin: 0 auto;
		padding: clamp(1.2rem, 3vw, 2.2rem) 0 clamp(3rem, 7vw, 5rem);
	}
	.crumbs a {
		color: var(--text-muted);
		font-size: 0.8rem;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin: 0.8rem 0 1.2rem;
	}
	.eyebrow {
		margin: 0;
		color: var(--gold-dim);
		font-family: var(--font-display);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	h1 {
		margin: 0.35rem 0 0;
		color: var(--gold-bright);
		font-size: clamp(1.9rem, 5vw, 3.1rem);
		font-weight: 600;
		line-height: 1.08;
		letter-spacing: -0.03em;
	}
	.byline {
		margin: 0.4rem 0 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}
	.byline strong {
		color: var(--text);
	}
	.dim {
		color: var(--text-muted);
		font-size: 0.78rem;
	}
	.hero {
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: 0.6rem;
		background: linear-gradient(160deg, rgb(46 38 28 / 0.9), rgb(20 17 13 / 0.95));
	}
	.hero img {
		display: block;
		width: 100%;
		max-height: 30rem;
		object-fit: cover;
	}
	.placeholder-frame {
		display: grid;
		aspect-ratio: 16 / 7;
		place-content: center;
		place-items: center;
		gap: 0.9rem;
		padding: 1.5rem;
		text-align: center;
	}
	.placeholder-art {
		width: 7rem;
		aspect-ratio: 1;
		overflow: hidden;
		border-radius: 0.5rem;
	}
	.placeholder-frame p {
		max-width: 44ch;
		margin: 0;
		color: var(--text-muted);
		font-size: 0.82rem;
		line-height: 1.55;
	}
	.actions-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;
		margin: 1.1rem 0;
	}
	.gone {
		margin: 0;
		padding: 0.7rem 0.9rem;
		border: 1px solid var(--border);
		border-left: 3px solid var(--bad);
		border-radius: 0.42rem;
		background: rgb(29 25 20 / 0.62);
		color: var(--text-muted);
		font-size: 0.84rem;
		line-height: 1.55;
	}
	.gone strong {
		color: var(--bad);
	}
	.native-link {
		color: var(--gold);
		font-size: 0.85rem;
	}
	.panel {
		margin-bottom: 1rem;
		padding: 1rem 1.1rem;
		border: 1px solid var(--border);
		border-radius: 0.55rem;
		background: rgb(29 25 20 / 0.62);
	}
	.panel h2 {
		margin: 0 0 0.55rem;
		color: var(--gold);
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 700;
	}
	.panel p {
		max-width: 70ch;
		margin: 0 0 0.6rem;
		color: var(--text-muted);
		font-size: 0.88rem;
		line-height: 1.6;
	}
	.prose {
		white-space: pre-wrap;
	}
	.fine {
		font-size: 0.79rem;
	}
	.error {
		color: var(--bad);
		font-size: 0.84rem;
	}
	.sources,
	.items,
	.tags {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.sources li {
		padding: 0.3rem 0;
		font-size: 0.85rem;
	}
	.sources a {
		color: var(--gold);
		overflow-wrap: anywhere;
	}
	.sources .dim {
		display: block;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-bottom: 1rem;
	}
	.tags li {
		padding: 0.15rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 0.3rem;
		color: var(--text-muted);
		font-size: 0.74rem;
	}
	.items {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 0.2rem 1rem;
	}
	.items li {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.28rem 0;
		border-bottom: 1px solid rgb(200 161 68 / 0.08);
		font-size: 0.83rem;
	}
	.item-name {
		color: var(--text);
	}
	.item-count {
		color: var(--gold-dim);
	}
	.claim-form {
		display: grid;
		gap: 0.7rem;
		max-width: 34rem;
	}
	.claim-form label {
		display: grid;
		gap: 0.28rem;
		color: var(--text-muted);
		font-size: 0.8rem;
	}
	.claim-form input,
	.claim-form select,
	.claim-form textarea {
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 0.38rem;
		background: rgb(20 17 13 / 0.7);
		color: var(--text);
		font: inherit;
		font-size: 0.85rem;
	}
	.claim-form button {
		justify-self: start;
	}
</style>
