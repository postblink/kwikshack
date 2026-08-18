<script lang="ts">
	// Written to match what the application actually does. If a data flow changes,
	// change this page in the same commit — a privacy policy that describes an
	// older version of the site is worse than none.
	//
	// Deliberately omitted: rate-limit thresholds, moderation heuristics, and
	// anything else that would help someone work around a safeguard.
	const lastUpdated = '17 August 2026';
</script>

<svelte:head>
	<title>Privacy — KwikShack</title>
	<meta name="description" content="What KwikShack stores, why, how long for, and how to have it removed." />
</svelte:head>

<div class="wrap">
	<header class="intro">
		<p class="eyebrow">Legal</p>
		<h1>Privacy</h1>
		<p class="lede">
			KwikShack is a WoW housing site. This page explains exactly what it stores, where that information comes from, how
			long it stays, and how to get it removed. Last updated {lastUpdated}.
		</p>
	</header>

	<nav class="toc" aria-label="On this page">
		<a href="#short">The short version</a>
		<a href="#you-give">What you give us</a>
		<a href="#blizzard">What Blizzard gives us</a>
		<a href="#public">Public and provenance data</a>
		<a href="#internal">Security and moderation</a>
		<a href="#cookies">Cookies</a>
		<a href="#retention">How long we keep things</a>
		<a href="#removal">Removing your data</a>
		<a href="#contact">Contact</a>
	</nav>

	<section id="short">
		<h2>The short version</h2>
		<ul>
			<li>You can browse KwikShack and copy blueprints without an account and without signing in.</li>
			<li>We never see or store your Battle.net password.</li>
			<li>We don't store Battle.net access tokens, so we can't read your Blizzard data when you're not here.</li>
			<li>Character information from Blizzard is deleted within 30 days.</li>
			<li>We don't sell anything to anyone, and we don't run ad tracking.</li>
			<li>Ask us and we'll delete your account and everything attached to it.</li>
		</ul>
	</section>

	<section id="you-give">
		<h2>What you give us directly</h2>

		<h3>If you sign in with Battle.net</h3>
		<p>
			We create a KwikShack account for you. It holds a display name (taken from your BattleTag, and you can change it),
			and a note of whether you're an operator. That's the account itself.
		</p>

		<h3>If you claim a listing</h3>
		<p>
			We keep your claim request: which listing you claimed, any character you chose to point at, any link you offered as
			evidence, and anything you wrote in the note field. We also record which supporting signals were present, so a human
			reviewer can make a fair decision. Claim requests are kept as a record of how a listing came to be yours.
		</p>

		<h3>If you manage a listing</h3>
		<p>
			Whatever you write is stored and shown publicly: title, description, tags, how you'd like to be credited, links you
			add, and the blueprint code. Screenshots you upload are stored on our server and shown on your listing. We don't copy
			images from anywhere else.
		</p>

		<h3>If you submit a build</h3>
		<p>
			We store the blueprint code, the build details, the resolved contents, any display name you typed, and any screenshots
			you upload. Build submissions are currently invitation-only.
		</p>
		<p class="fine">
			Screenshots are processed in your browser before upload — they're re-encoded, which removes ordinary camera and
			location metadata. Please still check an image before uploading it; anything visible in the picture stays visible.
		</p>
	</section>

	<section id="blizzard">
		<h2>What we get from Blizzard</h2>
		<p>
			When you sign in with Battle.net, Blizzard asks you what you're willing to share. You can approve part of it and
			decline the rest, and KwikShack works either way.
		</p>
		<ul>
			<li><strong>Your Battle.net account identifier and BattleTag.</strong> The identifier is how we recognise you when you come back.</li>
			<li>
				<strong>Your World of Warcraft characters</strong> — name, realm, faction, and level — but only if you allow the
				profile permission. If you decline it, you still get a working account with no characters attached.
			</li>
		</ul>
		<p>
			<strong>We do not see your password.</strong> Sign-in happens on Blizzard's site; we only receive the result.
		</p>
		<p>
			<strong>We do not keep the access token.</strong> It is used during sign-in and then discarded. The practical effect is
			that KwikShack cannot look at your Blizzard data while you're away — and that refreshing your character list means
			signing in again.
		</p>
		<p>
			We also read Blizzard's public housing decor catalog to show accurate decor names. That's game data about furniture,
			not about you.
		</p>
		<p class="fine">
			Blizzard offers its own control over this: your Battle.net account settings include a Game Data and Profile Privacy
			option that stops third-party sites like this one from seeing your profile at all.
		</p>
	</section>

	<section id="public">
		<h2>Public listing and source information</h2>
		<p>
			KwikShack indexes blueprint codes that people have shared publicly for others to use. For those listings we record the
			code, where we found it, a link to the original post, the creator name shown at the source, and the date we found it.
			This is information that was already public where we found it, and we link back rather than copying the post.
		</p>
		<p>
			If a listing is about your work, you can claim it, correct it, or ask us to take it down — see
			<a href="#removal">Removing your data</a>.
		</p>
	</section>

	<section id="internal">
		<h2>Security and moderation information</h2>
		<p>
			We keep a small amount of information that isn't shown publicly and exists to keep the site working and fair:
		</p>
		<ul>
			<li>Short-lived records tied to your network address, used to stop one source flooding the site with requests. These aren't linked to your account and aren't used to profile you.</li>
			<li>Review notes on curation and claim decisions, so decisions are auditable. These are never shown to visitors.</li>
			<li>A history of changes to a listing — when it was indexed, claimed, and edited.</li>
			<li>Ordinary server logs. We do not log Battle.net tokens, authorization codes, session values, or character details.</li>
		</ul>
	</section>

	<section id="cookies">
		<h2>Cookies</h2>
		<p>
			One cookie, and only if you sign in: a session cookie that keeps you signed in. It holds a random value, not your
			name or your BattleTag. It's marked HttpOnly so scripts can't read it, and it expires after seven days. Signing out
			deletes it here and on our server.
		</p>
		<p>There are no advertising cookies, no analytics cookies, and no third-party trackers.</p>
	</section>

	<section id="retention">
		<h2>How long we keep things</h2>
		<dl class="retention">
			<div><dt>Character information from Blizzard</dt><dd>Deleted within 30 days, automatically. Blizzard requires this, and we agree with it.</dd></div>
			<div><dt>Blizzard decor catalog data</dt><dd>Refreshed regularly and deleted on the same 30-day clock.</dd></div>
			<div><dt>Your session</dt><dd>7 days, or immediately when you sign out.</dd></div>
			<div><dt>Your account and display name</dt><dd>Until you ask us to delete it.</dd></div>
			<div><dt>Listings you manage, and builds you submitted</dt><dd>Until you ask us to remove them.</dd></div>
			<div><dt>Claim requests and listing history</dt><dd>Kept as a record of who manages what, and removed with your account.</dd></div>
			<div><dt>Rate-limiting records</dt><dd>Minutes.</dd></div>
		</dl>
	</section>

	<section id="removal">
		<h2>Removing your data</h2>
		<p>Email us and we'll act on any of these:</p>
		<ul>
			<li><strong>Delete my account.</strong> The account, the Battle.net link, characters, sessions, and claim requests all go.</li>
			<li><strong>Take down my listing.</strong> Removed from the site. You don't need to prove you own it for us to take it down.</li>
			<li><strong>Stop showing my blueprint code.</strong> We stop offering it immediately.</li>
			<li><strong>Correct my attribution.</strong> Tell us what's wrong and we'll fix it.</li>
			<li><strong>Tell me what you hold about me.</strong> We'll send you what we have.</li>
		</ul>
		<p>
			You can also sign out at any time from your <a href="/account">account page</a>, which ends the session immediately, and
			you can revoke KwikShack's access from your Battle.net account settings at any time.
		</p>
	</section>

	<section id="contact">
		<h2>Contact</h2>
		<p>
			Privacy questions, takedown requests, and corrections: <a href="mailto:privacy@postblink.wtf">privacy@postblink.wtf</a>.
		</p>
		<p class="fine">
			Game data shown on KwikShack is provided by Blizzard's APIs on an "as is" basis. See our
			<a href="/legal">legal and attribution notice</a>.
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
		max-width: 60ch;
		margin: 0.9rem 0 0;
		color: var(--text-muted);
		font-size: 0.98rem;
		line-height: 1.65;
	}
	.toc {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.5rem;
		margin: 1.6rem 0 0.5rem;
		padding: 0.9rem 1rem;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		background: rgb(29 25 20 / 0.5);
	}
	.toc a {
		color: var(--text-muted);
		font-size: 0.8rem;
		text-decoration: none;
		border-bottom: 1px solid rgb(200 161 68 / 0.25);
	}
	.toc a:hover {
		color: var(--gold);
	}
	section {
		margin-top: 2.1rem;
		scroll-margin-top: 5.5rem;
	}
	h2 {
		margin: 0 0 0.7rem;
		color: var(--gold);
		font-family: var(--font-display);
		font-size: 1.22rem;
		font-weight: 700;
		line-height: 1.25;
	}
	h3 {
		margin: 1.2rem 0 0.4rem;
		color: var(--text);
		font-size: 0.95rem;
		font-weight: 700;
	}
	p {
		max-width: 68ch;
		margin: 0 0 0.75rem;
		color: var(--text-muted);
		font-size: 0.92rem;
		line-height: 1.68;
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
	.retention {
		display: grid;
		gap: 0.55rem;
		max-width: 68ch;
		margin: 0;
	}
	.retention div {
		display: grid;
		grid-template-columns: minmax(11rem, 16rem) 1fr;
		gap: 0.3rem 1rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid rgb(200 161 68 / 0.1);
	}
	.retention dt {
		color: var(--text);
		font-size: 0.88rem;
		font-weight: 650;
	}
	.retention dd {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.88rem;
		line-height: 1.6;
	}
	@media (max-width: 560px) {
		.retention div {
			grid-template-columns: 1fr;
		}
	}
</style>
