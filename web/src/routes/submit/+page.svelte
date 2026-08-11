<script lang="ts">
	let shareCode = $state('');
	let title = $state('');
	let blueprintType = $state('House');
	let faction = $state('');
	let authorName = $state('');
	let manifestText = $state('');
	let status = $state<'idle' | 'sending' | 'done' | 'error'>('idle');
	let errorMsg = $state('');

	async function submit() {
		status = 'sending';
		errorMsg = '';
		let manifest: unknown;
		try {
			manifest = manifestText.trim() ? JSON.parse(manifestText) : { shareCode, contentGroups: [] };
		} catch (e) {
			status = 'error';
			errorMsg = 'Manifest is not valid JSON: ' + (e as Error).message;
			return;
		}
		const res = await fetch('/api/builds', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				shareCode,
				title,
				blueprintType,
				faction: faction || null,
				authorName,
				manifest
			})
		});
		const body = await res.json().catch(() => ({}));
		if (res.ok) {
			status = 'done';
			window.location.href = `/builds/${body.id}`;
		} else {
			status = 'error';
			errorMsg = (body as any).message ?? `HTTP ${res.status}`;
		}
	}

	const example = `{
  "shareCode": "YOUR-CODE",
  "blueprintType": "House",
  "contentGroups": [
    { "groupType": 3, "entries": [ { "itemID": 220123, "count": 2 } ] }
  ],
  "budgetInfo": {
    "interiorBudgets": [ { "cost": 4, "max": 10, "current": 2 } ],
    "exteriorBudgets": [ { "cost": -1, "max": -1, "current": 0 } ]
  },
  "blockingRequirements": { "missingBudgets": false, "missingRooms": false, "missingDecor": false, "factionMismatch": false, "rawFlags": 0 }
}`;
</script>

<svelte:head>
	<title>Submit a build — KwikShack</title>
</svelte:head>

<div class="wrap">
	<a class="back" href="/">← All builds</a>
	<h1>Submit a build</h1>
	<p class="tag">
		In v0, paste the manifest your addon exported (or hand-edit the example). The addon → API
		pipeline will automate this.
	</p>

	<form onsubmit={(e) => { e.preventDefault(); submit(); }}>
		<label>
			Blueprint code
			<input bind:value={shareCode} required placeholder="e.g. ABCDEFGHIJ" />
		</label>
		<label>
			Title
			<input bind:value={title} placeholder="Cozy Goblin Shack" />
		</label>
		<div class="row">
			<label>
				Type
				<select bind:value={blueprintType}>
					<option>House</option>
					<option>Interior</option>
					<option>Exterior</option>
					<option>Room</option>
				</select>
			</label>
			<label>
				Faction
				<select bind:value={faction}>
					<option value="">Neutral</option>
					<option value="Alliance">Alliance</option>
					<option value="Horde">Horde</option>
				</select>
			</label>
			<label>
				Author
				<input bind:value={authorName} placeholder="CharName-Realm" />
			</label>
		</div>
		<label>
			Manifest JSON
			<textarea bind:value={manifestText} rows="14" placeholder={example}></textarea>
		</label>

		{#if status === 'error'}
			<p class="error">{errorMsg}</p>
		{/if}

		<button type="submit" disabled={status === 'sending'}>
			{status === 'sending' ? 'Submitting…' : 'Submit build'}
		</button>
	</form>
</div>

<style>
	.wrap {
		max-width: 700px;
		margin: 0 auto;
		padding: 2rem 1rem;
	}
	.back {
		color: #7ad48f;
		text-decoration: none;
		font-size: 0.9rem;
	}
	.tag {
		color: #888;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-top: 1.5rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.85rem;
		color: #bbb;
	}
	input,
	select,
	textarea {
		padding: 0.5rem 0.6rem;
		border: 1px solid #444;
		border-radius: 6px;
		background: #1b1b1f;
		color: #eee;
		font: inherit;
	}
	textarea {
		font-family: monospace;
		font-size: 0.8rem;
	}
	.row {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 0.75rem;
	}
	.error {
		color: #e07a5f;
	}
	button[type='submit'] {
		background: #2f6f3f;
		border: none;
		border-radius: 8px;
		color: #fff;
		padding: 0.6rem 1rem;
		font-size: 1rem;
		cursor: pointer;
	}
	button[type='submit']:disabled {
		opacity: 0.6;
	}
</style>
