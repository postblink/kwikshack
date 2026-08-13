<script lang="ts">
	import '$lib/app.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
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
			<a class="browse-link community-link" href="/finds">Community Finds</a>
			<a class="gold-button" href="/submit">Submit a Build</a>
		</nav>
	</div>
</header>

<main class="site-main">
	{@render children()}
</main>

<footer class="site-footer">
	<div class="footer-inner">
		<p><span class="footer-brand">KwikShack</span> — your builds, home sweet home.</p>
		<p class="footer-note">
			<a href="/">kwikshack.com</a>
			<span aria-hidden="true">·</span>
			Made possible by the KwikShack in-game addon.
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
		min-height: 8rem;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		padding-block: 1.5rem;
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

	.footer-note {
		display: flex;
		align-items: center;
		gap: 0.48rem;
		text-align: right;
	}

	.footer-note a {
		color: var(--text);
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

		.community-link {
			display: inline-flex;
			padding-inline: 0.55rem;
			font-size: 0.72rem;
		}

		nav :global(.gold-button) {
			min-height: 2.5rem;
			padding-inline: 0.8rem;
			font-size: 0.77rem;
		}

		.footer-inner,
		.footer-note {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.45rem;
			text-align: left;
		}
	}
</style>
