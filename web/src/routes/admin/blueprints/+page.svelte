<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Index a blueprint — KwikShack</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="wrap">
	<h1>Index a public blueprint</h1>
	<p class="lede">
		Manual, import-assisted indexing. Record where the code was publicly shared and who shared it; never copy the source's
		screenshots, prose, or video. Every platform below is manual-only until its terms have been reviewed for a specific
		permitted access method.
	</p>

	{#if form?.error}
		<p class="error" role="alert">
			{form.error}
			{#if form.errors}<br />{form.errors.join('; ')}{/if}
			{#if form.nativeBuildId}<br /><a href="/builds/{form.nativeBuildId}">See the native build</a>{/if}
		</p>
	{/if}
	{#if form?.indexed}
		<p class="ok" role="status">
			{form.indexed === 'created'
				? 'Indexed.'
				: form.indexed === 'source_added'
					? 'This code was already indexed — the new source was added as extra provenance.'
					: 'This source was already recorded. Nothing changed.'}
			{#if form.id}<a href="/blueprints/{form.id}">Open the listing</a>{/if}
		</p>
	{/if}
	{#if form?.check}
		<p class="ok" role="status">
			{#if form.check.native}Native build already owns this code: {form.check.native.title}.
			{:else if form.check.indexed}Already indexed as “{form.check.indexed.title}” — submitting will add a source, not a duplicate.
			{:else}No conflict found.{/if}
		</p>
	{/if}

	<form method="POST" action="?/index" class="panel">
		<h2>New record</h2>
		<div class="row">
			<label>Blueprint code<input name="shareCode" required maxlength="256" /></label>
			<button class="ghost" type="submit" formaction="?/check">Check for conflicts</button>
		</div>
		<label>KwikShack curation title <span class="hint">your words, not the source's</span><input name="title" required maxlength="120" /></label>
		<label>Attributed creator <span class="hint">as shown at the source</span><input name="attributedCreator" required maxlength="80" /></label>
		<div class="row">
			<label>Attributed character<input name="attributedCharacter" maxlength="80" /></label>
			<label>Attributed realm<input name="attributedRealm" maxlength="80" /></label>
		</div>
		<label>
			Source platform
			<select name="platform" required>
				{#each data.platforms as platform (platform.id)}
					<option value={platform.id}>{platform.label} ({platform.automation})</option>
				{/each}
			</select>
		</label>
		<label>Canonical source URL <span class="hint">the original post, not a repost or search result</span><input type="url" name="sourceUrl" required /></label>
		<label>Discovered on<input type="date" name="discoveredAt" /></label>
		<div class="row">
			<label>
				Blueprint type
				<select name="blueprintType">
					<option>House</option><option>Interior</option><option>Exterior</option><option>Room</option>
				</select>
			</label>
			<label>
				Scope
				<select name="blueprintScope">
					<option value="">Unknown</option>
					<option value="full_house">Full House</option>
					<option value="interior">Interior</option>
					<option value="exterior">Exterior</option>
					<option value="room">Room</option>
				</select>
			</label>
			<label>
				Faction
				<select name="faction"><option value="">Neutral / unknown</option><option>Alliance</option><option>Horde</option></select>
			</label>
		</div>
		<label>
			Internal notes <span class="hint">review evidence — stored, never shown to visitors</span>
			<textarea name="internalNotes" rows="3" maxlength="4000"></textarea>
		</label>
		<label class="inline"><input type="checkbox" name="publication" value="published" /> Publish immediately</label>
		<button class="gold-button" type="submit">Index it</button>
	</form>

	<form method="POST" action="?/resolve" class="panel">
		<h2>Attach a resolved manifest</h2>
		<p class="hint">
			Paste the JSON the KwikShack addon produced for this code. This is the only way a listing gains KwikShack-derived
			decor data — the manifest is not fed back into the decor catalog.
		</p>
		<label>Listing id<input name="blueprintId" required /></label>
		<label>Addon manifest JSON<textarea name="manifest" rows="6" required></textarea></label>
		<button class="gold-button" type="submit">Attach</button>
	</form>

	<form method="POST" action="?/state" class="panel">
		<h2>Change state</h2>
		<label>Listing id<input name="blueprintId" required /></label>
		<div class="row">
			<label>
				Publication
				<select name="publication"><option value="">unchanged</option><option>draft</option><option>published</option><option>archived</option></select>
			</label>
			<label>
				Resolution
				<select name="resolutionState">
					<option value="">unchanged</option>
					<option value="unresolved">unresolved</option>
					<option value="unavailable">unavailable — code stopped resolving</option>
					<option value="revoked">revoked — sharing withdrawn</option>
				</select>
			</label>
		</div>
		<label>Note<input name="note" maxlength="500" /></label>
		<button class="gold-button" type="submit">Apply</button>
	</form>

	<section class="panel">
		<h2>Indexed listings</h2>
		<div class="table-scroll">
			<table>
				<thead>
					<tr><th>Title</th><th>Creator</th><th>Resolution</th><th>Claim</th><th>Publication</th><th>Indexed</th><th>id</th></tr>
				</thead>
				<tbody>
					{#each data.blueprints as blueprint (blueprint.id)}
						<tr>
							<td><a href="/blueprints/{blueprint.id}">{blueprint.title}</a></td>
							<td>{blueprint.attributedCreator}</td>
							<td>{blueprint.resolutionState}</td>
							<td>{blueprint.claimState}</td>
							<td>{blueprint.publication}</td>
							<td>{blueprint.indexedAt}</td>
							<td class="mono">{blueprint.id}</td>
						</tr>
					{:else}
						<tr><td colspan="7">Nothing indexed yet.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>

<style>
	.wrap {
		width: min(100% - 2rem, 60rem);
		margin: 0 auto;
		padding: clamp(1.2rem, 3vw, 2.2rem) 0 clamp(3rem, 7vw, 5rem);
	}
	h1 {
		margin: 0 0 0.5rem;
		color: var(--gold-bright);
		font-size: clamp(1.8rem, 5vw, 2.6rem);
		font-weight: 600;
		letter-spacing: -0.03em;
	}
	.lede {
		max-width: 68ch;
		margin: 0 0 1.2rem;
		color: var(--text-muted);
		font-size: 0.9rem;
		line-height: 1.6;
	}
	.panel {
		display: grid;
		gap: 0.7rem;
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
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.7rem;
	}
	.row label {
		flex: 1 1 12rem;
	}
	label {
		display: grid;
		gap: 0.26rem;
		color: var(--text-muted);
		font-size: 0.8rem;
	}
	label.inline {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}
	input,
	select,
	textarea {
		padding: 0.45rem 0.55rem;
		border: 1px solid var(--border);
		border-radius: 0.36rem;
		background: rgb(20 17 13 / 0.7);
		color: var(--text);
		font: inherit;
		font-size: 0.84rem;
	}
	.hint {
		color: var(--gold-dim);
		font-size: 0.73rem;
		line-height: 1.5;
	}
	button {
		justify-self: start;
	}
	.ghost {
		min-height: 2.4rem;
		padding: 0.45rem 0.8rem;
		border: 1px solid var(--gold-dim);
		border-radius: 0.36rem;
		background: transparent;
		color: var(--gold);
		font: inherit;
		font-size: 0.8rem;
		cursor: pointer;
	}
	.table-scroll {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8rem;
	}
	th,
	td {
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid rgb(200 161 68 / 0.1);
		color: var(--text-muted);
		text-align: left;
		white-space: nowrap;
	}
	th {
		color: var(--gold-dim);
	}
	td a {
		color: var(--text);
	}
	.mono {
		font-family: ui-monospace, monospace;
		font-size: 0.72rem;
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
