<script lang="ts">
	// Blizzard Developer API Terms of Use: "You shall clearly and conspicuously
	// identify Blizzard in Your Application as the source of the Data, and You
	// shall do it in such a way which makes it not appear that Blizzard is
	// endorsing or affiliated with Your Application."
	//
	// Blizzard publishes no mandated attribution wording, so this states the
	// required facts plainly: Blizzard is the source, and there is no affiliation.
	const lastUpdated = '17 August 2026';
</script>

<svelte:head>
	<title>Legal and attribution — KwikShack</title>
	<meta name="description" content="Blizzard attribution, trademark notice, and KwikShack's licensing and content policies." />
</svelte:head>

<div class="wrap">
	<header class="intro">
		<p class="eyebrow">Legal</p>
		<h1>Legal and attribution</h1>
		<p class="lede">Last updated {lastUpdated}.</p>
	</header>

	<section>
		<h2>Blizzard Entertainment</h2>
		<p class="attribution">
			World of Warcraft and Blizzard Entertainment are trademarks or registered trademarks of Blizzard Entertainment, Inc.
			in the U.S. and/or other countries. Certain game data on this site is provided by Blizzard Entertainment through the
			Blizzard Developer APIs, and is provided on an "as is" basis.
		</p>
		<p class="attribution">
			<strong>KwikShack is not affiliated with, endorsed by, or sponsored by Blizzard Entertainment, Inc.</strong>
		</p>
		<p>
			Where you see decor names, categories, and character information on KwikShack, Blizzard is the source of that data.
			Everything else — our writing, our curation, our layout, and creators' own screenshots and descriptions — is not
			Blizzard's and is not presented as theirs.
		</p>
	</section>

	<section>
		<h2>How we use Blizzard's APIs</h2>
		<ul>
			<li>We read the housing decor catalog so decor names on the site are the official ones.</li>
			<li>We use Battle.net sign-in so creators have a real identity, and read your characters only with your permission.</li>
			<li>We delete Blizzard-derived data within 30 days, as Blizzard's terms require.</li>
			<li>We do not sell, license, or pass Blizzard's data to anyone, and we do not use it for advertising or ad targeting.</li>
			<li>We do not scrape or data-mine Blizzard's games, services, or websites. We use the documented APIs.</li>
		</ul>
		<p class="fine">
			See our <a href="/privacy">privacy page</a> for what this means for your own information.
		</p>
	</section>

	<section>
		<h2>Creators' work</h2>
		<p>
			A blueprint code shared publicly for other players to use is what KwikShack indexes. The screenshots, writing, video,
			and artwork around it belong to the creator, and we don't copy them. Listings link back to the original post.
		</p>
		<p>
			If your work is on this site and you'd like it corrected, claimed, or removed, email
			<a href="mailto:privacy@postblink.wtf">privacy@postblink.wtf</a>. We remove on request — you don't have to prove
			ownership first.
		</p>
	</section>

	<section>
		<h2>KwikShack</h2>
		<p>
			The KwikShack addon and companion script are open source under the MIT licence. The decor catalog was seeded in part
			from the MIT-licensed Housing Decor Guide addon data.
		</p>
	</section>
</div>

<style>
	.wrap {
		width: min(100% - 2rem, 48rem);
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
		margin: 0.45rem 0 0;
		color: var(--gold-bright);
		font-size: clamp(2.1rem, 6vw, 3.4rem);
		font-weight: 600;
		line-height: 1.05;
		letter-spacing: -0.03em;
	}
	.lede {
		margin: 0.7rem 0 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}
	section {
		margin-top: 2.1rem;
	}
	h2 {
		margin: 0 0 0.7rem;
		color: var(--gold);
		font-family: var(--font-display);
		font-size: 1.22rem;
		font-weight: 700;
	}
	p {
		max-width: 68ch;
		margin: 0 0 0.75rem;
		color: var(--text-muted);
		font-size: 0.92rem;
		line-height: 1.68;
	}
	.attribution {
		padding: 0.7rem 0.9rem;
		border: 1px solid var(--border);
		border-left: 3px solid var(--gold-dim);
		border-radius: 0.4rem;
		background: rgb(29 25 20 / 0.55);
	}
	.fine {
		font-size: 0.84rem;
	}
	strong {
		color: var(--text);
	}
	ul {
		max-width: 68ch;
		margin: 0 0 0.75rem;
		padding-left: 1.1rem;
		color: var(--text-muted);
		font-size: 0.92rem;
		line-height: 1.68;
	}
	li {
		margin-bottom: 0.3rem;
	}
	a {
		color: var(--gold);
	}
</style>
