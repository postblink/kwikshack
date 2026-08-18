<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Edit {data.blueprint.title} — KwikShack</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="wrap">
	<nav class="crumbs" aria-label="Breadcrumb">
		<a href="/blueprints/{data.blueprint.id}">← Back to the listing</a>
	</nav>

	<h1>Edit your listing</h1>
	<p class="lede">
		You manage this listing because your claim was approved. KwikShack keeps the original discovery record intact — that is
		how visitors can see this started as a public community share rather than a KwikShack submission.
	</p>

	{#if form?.saved}<p class="ok" role="status">Saved.</p>{/if}
	{#if form?.error}
		<p class="error" role="alert">
			{form.error}
			{#if form.errors}<br />{form.errors.join('; ')}{/if}
		</p>
	{/if}

	<form method="POST" action="?/save" class="panel">
		<h2>Your listing</h2>
		<label>
			Title
			<input name="title" value={data.current.title} maxlength="120" required />
		</label>
		<label>
			Description
			<textarea name="description" rows="6" maxlength="2000">{data.current.description}</textarea>
		</label>
		<label>
			Tags <span class="hint">comma separated, up to 12</span>
			<input name="tags" value={data.current.tags} />
		</label>
		<label>
			Your links <span class="hint">one https URL per line, up to 4</span>
			<textarea name="links" rows="3">{data.current.links}</textarea>
		</label>
		<label>
			How you'd like to be credited
			<input name="preferredAttribution" value={data.current.preferredAttribution} maxlength="80" />
		</label>
		<label>
			Blueprint code
			<input name="shareCode" value={data.current.shareCode} maxlength="256" required />
			<span class="hint">
				Replacing the code clears KwikShack's resolved contents for this listing. They come back once the new code is
				resolved through the addon — we will not carry the old blueprint's data onto a new code.
			</span>
		</label>
		<button class="gold-button" type="submit">Save</button>
	</form>

	<form method="POST" action="?/screenshots" class="panel">
		<h2>Your screenshots</h2>
		<p class="hint">
			Only images you upload to KwikShack appear here. We do not copy pictures from the original post, even when the code
			itself was shared publicly.
		</p>
		{#each data.blueprint.screenshots as shot, index (shot.url)}
			<div class="shot-row">
				<img src={shot.url} alt="" />
				<input name="screenshotUrls" value={shot.url} readonly aria-label={`Screenshot ${index + 1}`} />
			</div>
		{/each}
		<label>
			Add an uploaded image URL
			<input name="screenshotUrls" placeholder="/uploads/…" />
		</label>
		<button class="gold-button" type="submit">Update screenshots</button>
	</form>

	<section class="panel readonly">
		<h2>Provenance — read only</h2>
		<p class="hint">This is KwikShack's record of how the listing came to exist. Editing a listing never rewrites it.</p>
		<dl>
			<div><dt>Curation title</dt><dd>{data.readOnly.curationTitle}</dd></div>
			<div><dt>Attributed at source</dt><dd>{data.readOnly.attributedCreator}</dd></div>
			<div><dt>Indexed</dt><dd>{data.readOnly.indexedAt}</dd></div>
		</dl>
		<ul>
			{#each data.readOnly.sources as source (source.sourceUrl)}
				<li><a href={source.sourceUrl} rel="noopener noreferrer nofollow ugc" target="_blank">{source.platformLabel} ↗</a></li>
			{/each}
		</ul>
	</section>
</div>

<style>
	.wrap {
		width: min(100% - 2rem, 52rem);
		margin: 0 auto;
		padding: clamp(1.2rem, 3vw, 2.2rem) 0 clamp(3rem, 7vw, 5rem);
	}
	.crumbs a {
		color: var(--text-muted);
		font-size: 0.8rem;
	}
	h1 {
		margin: 0.7rem 0 0.5rem;
		color: var(--gold-bright);
		font-size: clamp(1.8rem, 5vw, 2.6rem);
		font-weight: 600;
		letter-spacing: -0.03em;
	}
	.lede {
		max-width: 66ch;
		margin: 0 0 1.2rem;
		color: var(--text-muted);
		font-size: 0.92rem;
		line-height: 1.6;
	}
	.panel {
		display: grid;
		gap: 0.75rem;
		margin-bottom: 1.1rem;
		padding: 1.1rem 1.2rem;
		border: 1px solid var(--border);
		border-radius: 0.55rem;
		background: rgb(29 25 20 / 0.62);
	}
	.panel h2 {
		margin: 0;
		color: var(--gold);
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 700;
	}
	label {
		display: grid;
		gap: 0.28rem;
		color: var(--text-muted);
		font-size: 0.82rem;
	}
	input,
	textarea {
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 0.38rem;
		background: rgb(20 17 13 / 0.7);
		color: var(--text);
		font: inherit;
		font-size: 0.85rem;
	}
	input[readonly] {
		opacity: 0.7;
	}
	.hint {
		color: var(--gold-dim);
		font-size: 0.74rem;
		line-height: 1.5;
	}
	button {
		justify-self: start;
	}
	.shot-row {
		display: grid;
		grid-template-columns: 5rem 1fr;
		align-items: center;
		gap: 0.6rem;
	}
	.shot-row img {
		width: 100%;
		aspect-ratio: 16 / 10;
		border-radius: 0.3rem;
		object-fit: cover;
	}
	.readonly dl {
		display: grid;
		gap: 0.35rem;
		margin: 0;
	}
	.readonly dl div {
		display: flex;
		gap: 0.6rem;
		font-size: 0.84rem;
	}
	.readonly dt {
		min-width: 11rem;
		color: var(--text-muted);
	}
	.readonly dd {
		margin: 0;
		color: var(--text);
	}
	.readonly ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.readonly li {
		padding: 0.2rem 0;
		font-size: 0.83rem;
	}
	.readonly a {
		color: var(--gold);
		overflow-wrap: anywhere;
	}
	.ok {
		color: var(--ok);
		font-size: 0.86rem;
	}
	.error {
		color: var(--bad);
		font-size: 0.86rem;
	}
</style>
