<script lang="ts">
	import '$lib/app.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { LayoutData } from './$types';

	let { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header class="site-header">
	<div class="header-inner">
		<a class="brand" href="/" aria-label="KwikShack home">
			<span class="brand-word">Kwik</span>
			<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
				<path d="M4 14.5 16 4l12 10.5v12h-8v-8h-8v8H4z" />
			</svg>
			<span class="brand-word">Shack</span>
		</a>

		<nav aria-label="Primary navigation">
			<a class="browse-link" href="/">Browse</a>
			<a class="browse-link community-link" href="/blueprints">Indexed</a>
			<a class="browse-link community-link" href="/finds">
				<span class="full-label">Community Finds</span><span class="short-label" aria-hidden="true">Finds</span>
			</a>
			<a class="browse-link account-link" href="/account">{data.account ? data.account.displayName : 'Sign in'}</a>
			<a class="gold-button" href="/submit">
				<span class="full-label">Submit a Build</span><span class="short-label" aria-hidden="true">Submit</span>
			</a>
		</nav>
	</div>
</header>

<main class="site-main">
	{@render children()}
</main>

<footer class="site-footer">
	<div class="footer-inner">
		<p><span class="footer-brand">KwikShack</span> — your builds, home sweet home.</p>
		<a class="patreon-link" href="https://www.patreon.com/postblink">
			<span class="patreon-mark" aria-hidden="true"></span>
			Support on Patreon
			<span class="external-arrow" aria-hidden="true">↗</span>
		</a>
	</div>

	<!--
		Blizzard's Developer API Terms of Use require that Blizzard is clearly and
		conspicuously identified as the source of the Data, in a way that does not
		imply endorsement or affiliation. Site-wide footer rather than inside
		content cards, so it is always present and never reads as part of a
		creator's listing.
	-->
	<div class="footer-legal">
		<nav aria-label="Legal">
			<a href="/privacy">Privacy</a>
			<a href="/legal">Legal &amp; attribution</a>
		</nav>
		<p class="attribution">
			World of Warcraft and Blizzard Entertainment are trademarks of Blizzard Entertainment, Inc. Some game data is
			provided by Blizzard's APIs. KwikShack is not affiliated with or endorsed by Blizzard Entertainment.
		</p>
	</div>
</footer>

<style>
	.site-header {
		position: sticky;
		top: 0;
		z-index: 20;
		border-bottom: 1px solid rgb(200 161 68 / 0.16);
		background: rgb(20 17 13 / 0.9);
		box-shadow: 0 8px 28px rgb(0 0 0 / 0.2);
		backdrop-filter: blur(14px);
	}

	.header-inner,
	.footer-inner {
		width: 100%;
		max-width: var(--content-width);
		margin: 0 auto;
		padding-inline: 1rem;
	}

	.header-inner {
		display: flex;
		min-height: 4.65rem;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.28rem;
		color: var(--gold-bright);
		font-family: ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif;
		font-size: clamp(1.15rem, 3vw, 1.42rem);
		font-weight: 850;
		letter-spacing: -0.035em;
		line-height: 1;
		text-decoration: none;
	}

	.brand-word {
		display: block;
	}

	.brand-mark {
		width: 1.05em;
		height: 1.05em;
		flex: 0 0 auto;
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 2.5;
	}

	nav {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.short-label {
		display: none;
	}

	/* The signed-in name is user-supplied — cap it so a long BattleTag cannot
	   push the nav wider than the viewport. */
	.account-link {
		max-width: 9rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.browse-link {
		display: inline-flex;
		min-height: 2.65rem;
		align-items: center;
		padding: 0.55rem 0.85rem;
		border-radius: 0.42rem;
		color: var(--text-muted);
		font-size: 0.9rem;
		font-weight: 650;
		text-decoration: none;
		transition:
			background 150ms ease,
			color 150ms ease;
	}

	@media (hover: hover) and (pointer: fine) {
		.browse-link:hover {
			background: var(--surface-2);
			color: var(--text);
		}
	}

	.site-main {
		min-height: calc(100vh - 13rem);
	}

	.site-footer {
		border-top: 1px solid var(--border);
		background: rgb(12 10 8 / 0.48);
	}

	.footer-inner {
		display: flex;
		min-height: 6.5rem;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		padding-block: 1.5rem 1.1rem;
		color: var(--text-muted);
		font-size: 0.82rem;
	}

	.footer-inner p {
		margin: 0;
	}

	.footer-brand {
		color: var(--gold);
		font-family: var(--font-display);
		font-weight: 700;
		letter-spacing: 0.035em;
	}

	.patreon-link {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.58rem;
		padding: 0.65rem 0.9rem;
		border: 1px solid rgb(200 161 68 / 0.22);
		border-radius: 999px;
		background: rgb(200 161 68 / 0.06);
		color: var(--text);
		font-weight: 650;
		line-height: 1;
		text-decoration: none;
		transition:
			border-color 150ms ease,
			background 150ms ease,
			color 150ms ease;
	}

	.footer-legal {
		width: 100%;
		max-width: var(--content-width);
		margin: 0 auto;
		padding: 0 1rem 1.6rem;
		border-top: 1px solid rgb(200 161 68 / 0.09);
		padding-top: 1.1rem;
	}

	.footer-legal nav {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 0.4rem;
		/* Offset the links' own padding so the block still lines up with the text
		   above it. */
		margin: -0.55rem -0.6rem 0.35rem;
	}

	.footer-legal nav a {
		display: inline-flex;
		/* WCAG 2.2 target size: these were 19px tall, below even the 24px minimum. */
		min-height: 2.75rem;
		align-items: center;
		padding: 0.55rem 0.6rem;
		border-radius: 0.35rem;
		color: var(--text-muted);
		font-size: 0.8rem;
		text-decoration: none;
	}

	@media (hover: hover) and (pointer: fine) {
		.footer-legal nav a:hover {
			color: var(--gold);
		}
	}

	.footer-legal nav a:focus-visible {
		outline: 2px solid var(--gold-bright);
		outline-offset: 3px;
	}

	/* Required legal copy: readable, but never competing with the page content. */
	.attribution {
		max-width: 82ch;
		margin: 0;
		color: var(--text-muted);
		font-size: 0.74rem;
		line-height: 1.6;
		opacity: 0.82;
	}

	.patreon-mark {
		width: 0.62rem;
		height: 0.62rem;
		border-radius: 50%;
		background: var(--gold);
		box-shadow: 0 0 0 0.22rem rgb(200 161 68 / 0.1);
	}

	.external-arrow {
		color: var(--gold);
		font-size: 0.9em;
	}

	.patreon-link:focus-visible {
		outline: 2px solid var(--gold-bright);
		outline-offset: 3px;
	}

	@media (hover: hover) and (pointer: fine) {
		.patreon-link:hover {
			border-color: rgb(200 161 68 / 0.48);
			background: rgb(200 161 68 / 0.12);
			color: var(--gold-bright);
		}
	}

	@media (max-width: 620px) {
		.header-inner {
			min-height: 4.25rem;
			gap: 0.75rem;
			padding-block: 0.5rem;
		}

		.brand {
			font-size: 1.05rem;
		}

		nav {
			margin-left: auto;
		}

		.browse-link {
			display: none;
		}

		/* Signing in must stay reachable on a phone — it is the entry point to
		   claiming and creator editing. Labels shorten instead of disappearing. */
		.community-link,
		.account-link {
			display: inline-flex;
			padding-inline: 0.42rem;
			font-size: 0.72rem;
		}

		.account-link {
			max-width: 5.5rem;
		}

		.full-label {
			display: none;
		}

		.short-label {
			display: inline;
		}

		nav {
			gap: 0.28rem;
		}

		nav :global(.gold-button) {
			min-height: 2.5rem;
			padding-inline: 0.7rem;
			font-size: 0.74rem;
			white-space: nowrap;
		}

		.footer-inner {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.8rem;
			text-align: left;
		}
	}

	/* Narrow phones: the brand plus four nav targets does not fit at default
	   sizing, and the header was already overflowing the viewport by a few pixels
	   before the account link existed. Tighten rather than drop a destination. */
	@media (max-width: 430px) {
		.brand {
			font-size: 0.95rem;
		}

		.header-inner {
			gap: 0.5rem;
			padding-inline: 0.75rem;
		}

		nav {
			gap: 0.2rem;
		}

		.community-link,
		.account-link {
			padding-inline: 0.32rem;
		}

		.account-link {
			max-width: 4.5rem;
		}

		nav :global(.gold-button) {
			padding-inline: 0.6rem;
		}
	}

	/* Narrowest phones, and any width where a scrollbar eats into the viewport:
	   the four nav targets plus the wordmark were overflowing by a couple of
	   pixels. Tighten once more rather than drop a destination. */
	@media (max-width: 380px) {
		.brand {
			font-size: 0.88rem;
			gap: 0.2rem;
		}

		.header-inner {
			gap: 0.35rem;
			padding-inline: 0.6rem;
		}

		nav {
			gap: 0.12rem;
		}

		.community-link,
		.account-link {
			padding-inline: 0.26rem;
			font-size: 0.7rem;
		}

		.account-link {
			max-width: 4rem;
		}

		nav :global(.gold-button) {
			padding-inline: 0.5rem;
			font-size: 0.72rem;
		}
	}
</style>
