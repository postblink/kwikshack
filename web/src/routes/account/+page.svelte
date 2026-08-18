<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const signInHref = $derived(`/auth/battlenet?redirectTo=${encodeURIComponent(data.redirectTo)}`);
</script>

<svelte:head>
	<title>Your account — KwikShack</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="wrap">
	<header class="intro">
		<p class="eyebrow">Creator identity</p>
		<h1>Your account</h1>
	</header>

	{#if data.signInError}
		<p class="notice error" role="alert">{data.signInError}</p>
	{/if}

	{#if !data.account}
		<section class="panel">
			<h2>Sign in with Battle.net</h2>
			<p>
				Battle.net sign-in gives KwikShack a real creator identity: it confirms you control a Battle.net account, and — if
				you allow the WoW profile permission — which characters that account controls.
			</p>
			<p class="fine">
				It does <strong>not</strong> prove that you created any particular blueprint. Claiming a listing is reviewed by a
				person.
			</p>
			{#if data.authEnabled}
				<a class="gold-button" href={signInHref} data-sveltekit-reload>Sign in with Battle.net</a>
			{:else}
				<p class="notice">Battle.net sign-in is not available on this deployment yet.</p>
				{#if data.authDisabledReason}<p class="fine">{data.authDisabledReason}</p>{/if}
			{/if}
		</section>

		<section class="panel">
			<h2>What KwikShack stores</h2>
			<ul class="plain">
				<li>Your Battle.net account identifier and BattleTag.</li>
				<li>Your WoW characters, only if you grant the profile permission.</li>
				<li>
					No Battle.net password, and no OAuth tokens — tokens are used during sign-in and discarded, so KwikShack has to
					ask you again rather than acting on your behalf later.
				</li>
				<li>Character data is deleted within 30 days, per Blizzard's Developer API Terms of Use.</li>
			</ul>
		</section>
	{:else}
		<section class="panel">
			<h2>Battle.net verified</h2>
			<dl class="facts">
				<div><dt>Display name</dt><dd>{data.account.displayName}</dd></div>
				{#if data.account.battletag}<div><dt>BattleTag</dt><dd>{data.account.battletag}</dd></div>{/if}
				{#if data.account.region}<div><dt>Region</dt><dd>{data.account.region.toUpperCase()}</dd></div>{/if}
				{#if data.account.role === 'admin'}<div><dt>Role</dt><dd>Operator</dd></div>{/if}
			</dl>
			<form method="POST" action="/auth/logout">
				<input type="hidden" name="redirectTo" value="/" />
				<button class="ghost-button" type="submit">Sign out</button>
			</form>
		</section>

		<section class="panel">
			<h2>Characters</h2>
			{#if data.characters.length}
				<p class="fine">
					Battle.net confirms your account controls these characters. Blizzard's terms cap how long KwikShack may keep
					this, so each row shows its deletion date — sign in again to refresh.
				</p>
				<ul class="characters">
					{#each data.characters as character (character.id)}
						<li>
							<strong>{character.name}</strong>
							<span class="realm">{character.realm}</span>
							{#if character.faction}<span class="chip">{character.faction}</span>{/if}
							{#if character.level}<span class="chip">Level {character.level}</span>{/if}
							<span class="expiry">refreshed until {character.expiresAt}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="fine">
					No characters are associated. That happens when the WoW profile permission was declined, or when your account
					has no characters in this region. Everything else still works — character association only strengthens a claim.
				</p>
				<a class="ghost-button" href={signInHref} data-sveltekit-reload>Re-authorize with Battle.net</a>
			{/if}
		</section>

		<section class="panel">
			<h2>Listings you manage</h2>
			{#if data.managed.length}
				<ul class="plain">
					{#each data.managed as listing (listing.id)}
						<li><a href="/blueprints/{listing.id}">{listing.title}</a> — <a href="/blueprints/{listing.id}/edit">edit</a></li>
					{/each}
				</ul>
			{:else}
				<p class="fine">None yet. Find your build under <a href="/blueprints">indexed blueprints</a> and request a claim.</p>
			{/if}
		</section>

		<section class="panel">
			<h2>Claim requests</h2>
			{#if data.claims.length}
				<ul class="plain">
					{#each data.claims as claim (claim.id)}
						<li>
							<a href="/blueprints/{claim.blueprintId}">{claim.blueprintTitle}</a>
							<span class="chip">{claim.status}</span>
							<span class="expiry">{claim.createdAt}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="fine">No claim requests yet.</p>
			{/if}
		</section>
	{/if}
</div>

<style>
	.wrap {
		width: min(100% - 2rem, var(--content-width));
		margin: 0 auto;
		padding: clamp(1.5rem, 4vw, 3rem) 0 clamp(3rem, 7vw, 5rem);
	}
	.eyebrow {
		margin: 0;
		color: var(--gold-dim);
		font-family: var(--font-display);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	h1 {
		margin: 0.45rem 0 1.5rem;
		color: var(--gold-bright);
		font-size: clamp(2.1rem, 6vw, 3.6rem);
		font-weight: 600;
		line-height: 1.05;
		letter-spacing: -0.03em;
	}
	.panel {
		margin-bottom: 1.1rem;
		padding: 1.1rem 1.2rem;
		border: 1px solid var(--border);
		border-radius: 0.55rem;
		background: rgb(29 25 20 / 0.62);
	}
	.panel h2 {
		margin: 0 0 0.6rem;
		color: var(--gold);
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 700;
	}
	.panel p {
		max-width: 68ch;
		margin: 0 0 0.7rem;
		color: var(--text-muted);
		font-size: 0.9rem;
		line-height: 1.6;
	}
	.fine {
		font-size: 0.82rem;
	}
	.notice {
		padding: 0.7rem 0.9rem;
		border: 1px solid var(--border);
		border-left: 3px solid var(--gold-dim);
		border-radius: 0.4rem;
		background: rgb(29 25 20 / 0.62);
		color: var(--text-muted);
		font-size: 0.85rem;
	}
	.error {
		border-left-color: #c2543f;
	}
	.facts {
		display: grid;
		gap: 0.4rem;
		margin: 0 0 0.9rem;
	}
	.facts div {
		display: flex;
		gap: 0.6rem;
		font-size: 0.88rem;
	}
	.facts dt {
		min-width: 8rem;
		color: var(--text-muted);
	}
	.facts dd {
		margin: 0;
		color: var(--text);
	}
	ul.plain,
	ul.characters {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	ul.plain li,
	ul.characters li {
		padding: 0.35rem 0;
		border-bottom: 1px solid rgb(200 161 68 / 0.09);
		color: var(--text-muted);
		font-size: 0.86rem;
		line-height: 1.55;
	}
	ul.plain li:last-child,
	ul.characters li:last-child {
		border-bottom: none;
	}
	ul.characters strong {
		color: var(--text);
	}
	.realm {
		margin-left: 0.4rem;
	}
	.chip {
		display: inline-block;
		margin-left: 0.4rem;
		padding: 0.1rem 0.42rem;
		border: 1px solid var(--border);
		border-radius: 0.3rem;
		font-size: 0.72rem;
	}
	.expiry {
		margin-left: 0.4rem;
		color: var(--gold-dim);
		font-size: 0.72rem;
	}
	.ghost-button {
		display: inline-flex;
		min-height: 2.5rem;
		align-items: center;
		padding: 0.5rem 0.9rem;
		border: 1px solid var(--gold-dim);
		border-radius: 0.4rem;
		background: transparent;
		color: var(--gold);
		font: inherit;
		font-size: 0.85rem;
		font-weight: 650;
		cursor: pointer;
		text-decoration: none;
	}
</style>
