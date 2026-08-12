<script lang="ts">
	import { decodeCompact, compactToPayload } from '$lib/compact-code';
	let shareCode = $state('');
	let title = $state('');
	let blueprintType = $state('House');
	let faction = $state('');
	let authorName = $state('');
	let manifestText = $state('');
	let status = $state<'idle' | 'uploading' | 'sending' | 'done' | 'error'>('idle');
	let errorMsg = $state('');
	let screenshots = $state<string[]>([]);
	let uploadCount = $state(0);

	async function uploadImage(file: File) {
		const form = new FormData();
		form.append('file', file);
		const res = await fetch('/api/uploads', { method: 'POST', body: form });
		if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
		const data = await res.json();
		return data.url as string;
	}

	async function handleImages(e: Event) {
		const files = (e.target as HTMLInputElement).files;
		if (!files) return;
		status = 'uploading';
		errorMsg = '';
		for (const file of files) {
			try {
				const url = await uploadImage(file);
				screenshots = [...screenshots, url];
				uploadCount++;
			} catch (err) {
				errorMsg = (err as Error).message;
			}
		}
		status = 'idle';
	}

	function removeScreenshot(url: string) {
		screenshots = screenshots.filter((u) => u !== url);
	}

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
				manifest,
				screenshotUrls: screenshots.length ? screenshots : undefined
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
    "exteriorBudgets": []
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
		Use <code>/kshack copy</code> in-game, paste the JSON here. Screenshots are auto-uploaded.
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
			Screenshots
			<input type="file" accept="image/*" multiple onchange={(e) => handleImages(e)} />
		</label>
		{#if screenshots.length > 0}
			<div class="thumbs">
				{#each screenshots as url (url)}
					<div class="thumb">
						<img src={url} alt="" />
						<button type="button" class="rm" onclick={() => removeScreenshot(url)}>×</button>
					</div>
				{/each}
			</div>
		{/if}
		<label>
			Compact code (paste from /kshack ccode)
			<input
				placeholder="Paste the short code from in-game here — auto-fills everything below"
				onpaste={(e) => {
					const text = e.clipboardData?.getData?.('text') ?? '';
					if (!text) return;
					try {
						const decoded = decodeCompact(text);
						const payload = compactToPayload(decoded);
						shareCode = payload.shareCode;
						title = payload.title;
						blueprintType = payload.blueprintType;
						manifestText = JSON.stringify(payload.manifest, null, 2);
					} catch (_) { /* not a compact code — ignore */ }
				}}
			/>
		</label>
		<label>
			Manifest JSON
			<textarea bind:value={manifestText} rows="14" placeholder={example}></textarea>
		</label>

		{#if status === 'error'}
			<p class="error">{errorMsg}</p>
		{/if}

		<button type="submit" disabled={status === 'sending' || status === 'uploading'}>
			{status === 'sending' ? 'Submitting…' : status === 'uploading' ? `Uploading ${uploadCount}…` : 'Submit build'}
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
	.thumbs {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.thumb {
		position: relative;
		width: 80px;
		height: 80px;
		border-radius: 6px;
		overflow: hidden;
		border: 1px solid #333;
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.rm {
		position: absolute;
		top: 2px;
		right: 2px;
		background: #3a1f1f;
		color: #e07a5f;
		border: none;
		border-radius: 4px;
		font-size: 0.8rem;
		cursor: pointer;
		padding: 0 4px;
		line-height: 1.2;
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
