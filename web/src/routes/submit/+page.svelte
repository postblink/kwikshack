<script lang="ts">
	import { decodeCompact, compactToPayload } from '$lib/compact-code';
	let shareCode = $state('');
	let title = $state('');
	let blueprintType = $state('House');
	let faction = $state('');
	let authorName = $state('');
	let submitKey = $state('');
	let manifestText = $state('');
	let status = $state<'idle' | 'uploading' | 'sending' | 'done' | 'error'>('idle');
	let errorMsg = $state('');
	let screenshots = $state<string[]>([]);
	let uploadCount = $state(0);
	const MAX_IMAGE_EDGE = 1920;
	const JPEG_QUALITY = 0.85;
	const MAX_SCREENSHOTS = 8;

	async function resizeImageForUpload(file: File): Promise<File> {
		if (!file.type.startsWith('image/')) return file;

		const objectUrl = URL.createObjectURL(file);
		try {
			const image = new Image();
			image.decoding = 'async';
			image.src = objectUrl;
			await image.decode();

			const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
			const scale = Math.min(1, MAX_IMAGE_EDGE / longestEdge);
			const canvas = document.createElement('canvas');
			canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
			canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
			const context = canvas.getContext('2d');
			if (!context) throw new Error('Could not prepare image for upload');

			context.fillStyle = '#14110d';
			context.fillRect(0, 0, canvas.width, canvas.height);
			context.drawImage(image, 0, 0, canvas.width, canvas.height);

			const blob = await new Promise<Blob>((resolve, reject) => {
				canvas.toBlob(
					(result) => result ? resolve(result) : reject(new Error('Could not resize image')),
					'image/jpeg',
					JPEG_QUALITY
				);
			});
			const baseName = file.name.replace(/\.[^/.]+$/, '') || 'screenshot';
			return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
		} finally {
			URL.revokeObjectURL(objectUrl);
		}
	}

	async function uploadImage(file: File) {
		const form = new FormData();
		form.append('file', file);
		const headers = new Headers();
		if (submitKey) headers.set('x-kwikshack-key', submitKey);
		const res = await fetch('/api/uploads', { method: 'POST', headers, body: form });
		if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
		const data = await res.json();
		return data.url as string;
	}

	async function handleImages(e: Event) {
		const files = (e.target as HTMLInputElement).files;
		if (!files) return;
		status = 'uploading';
		errorMsg = '';
		const remaining = Math.max(0, MAX_SCREENSHOTS - screenshots.length);
		const selected = Array.from(files).slice(0, remaining);
		if (files.length > remaining) errorMsg = `You can attach up to ${MAX_SCREENSHOTS} screenshots.`;
		for (const file of selected) {
			try {
				const uploadFile = await resizeImageForUpload(file);
				const url = await uploadImage(uploadFile);
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
		const headers = new Headers({ 'content-type': 'application/json' });
		if (submitKey) headers.set('x-kwikshack-key', submitKey);
		const res = await fetch('/api/builds', {
			method: 'POST',
			headers,
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
			Submission access key
			<input type="password" bind:value={submitKey} autocomplete="off" placeholder="Provided with your builder invitation" />
			<small>Used only for this submission and its screenshots; it is not saved by KwikShack.</small>
		</label>
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
			<input type="file" accept="image/jpeg,image/png" multiple onchange={(e) => handleImages(e)} />
			<small>Up to {MAX_SCREENSHOTS} JPEG or PNG images. Images are resized and metadata is removed before upload.</small>
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

		<button class="gold-button submit-button" type="submit" disabled={status === 'sending' || status === 'uploading'}>
			{status === 'sending' ? 'Submitting…' : status === 'uploading' ? `Uploading ${uploadCount}…` : 'Submit build'}
		</button>
	</form>
</div>

<style>
	.wrap {
		max-width: 700px;
		margin: 0 auto;
		padding: clamp(1.5rem, 4vw, 3rem) 1rem clamp(3rem, 7vw, 5rem);
	}
	.back {
		color: var(--gold-bright);
		text-decoration: none;
		font-size: 0.9rem;
	}
	h1 {
		margin: 0.65rem 0 0.35rem;
		color: var(--text);
		font-family: var(--font-display);
		font-size: clamp(2rem, 6vw, 3.35rem);
		font-weight: 600;
		line-height: 1.12;
		letter-spacing: -0.025em;
		text-wrap: balance;
	}
	.tag {
		max-width: 60ch;
		margin: 0;
		color: var(--text-muted);
		line-height: 1.65;
		text-wrap: pretty;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-top: 2rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--border);
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.85rem;
		color: var(--text-muted);
		font-weight: 650;
	}
	label small {
		color: var(--text-muted);
		font-size: 0.72rem;
		font-weight: 450;
		line-height: 1.45;
	}
	input,
	select,
	textarea {
		min-height: 2.75rem;
		padding: 0.55rem 0.7rem;
		border: 1px solid color-mix(in srgb, var(--gold-dim) 55%, var(--border));
		border-radius: 0.42rem;
		background: var(--surface-2);
		box-shadow: inset 0 1px 3px color-mix(in srgb, var(--bg) 70%, transparent);
		color: var(--text);
		font: inherit;
		transition:
			border-color 150ms ease,
			box-shadow 150ms ease;
	}
	:is(input, select, textarea):focus {
		border-color: var(--gold);
		box-shadow:
			inset 0 1px 3px color-mix(in srgb, var(--bg) 60%, transparent),
			0 0 0 3px color-mix(in srgb, var(--gold) 12%, transparent);
	}
	:is(input, textarea)::placeholder {
		color: var(--text-muted);
		opacity: 0.72;
	}
	textarea {
		background: var(--surface);
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.8rem;
		line-height: 1.55;
		resize: vertical;
	}
	.row {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 0.75rem;
	}
	.error {
		margin: 0;
		color: var(--bad);
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
		border-radius: 0.42rem;
		overflow: hidden;
		border: 1px solid color-mix(in srgb, var(--gold-dim) 50%, var(--border));
		background: var(--surface);
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
		min-width: 1.6rem;
		min-height: 1.6rem;
		background: color-mix(in srgb, var(--bad) 18%, var(--surface));
		color: var(--bad);
		border: 1px solid color-mix(in srgb, var(--bad) 48%, var(--border));
		border-radius: 0.28rem;
		font-size: 0.8rem;
		cursor: pointer;
		padding: 0 0.3rem;
		line-height: 1.2;
	}
	.submit-button {
		align-self: flex-start;
		min-width: 9rem;
	}
	.submit-button:disabled {
		cursor: not-allowed;
		filter: saturate(0.55);
		opacity: 0.6;
	}
	@media (max-width: 600px) {
		.row {
			grid-template-columns: 1fr;
		}
		.submit-button {
			width: 100%;
		}
	}
</style>
