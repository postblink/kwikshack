<script lang="ts">
	import { onMount, untrack } from 'svelte';

	let {
		buildId,
		initialCount = 0,
		initialLiked = false,
		roomy = false
	}: { buildId: string; initialCount?: number; initialLiked?: boolean; roomy?: boolean } = $props();

	let likeCount = $state(untrack(() => initialCount));
	let liked = $state(untrack(() => initialLiked));
	let clientId = $state('');
	let loading = $state(false);

	function getClientId(): string {
		const storageKey = 'kwikshack_client_id';
		const stored = localStorage.getItem(storageKey);
		if (stored) return stored;
		const generated = crypto.randomUUID();
		localStorage.setItem(storageKey, generated);
		return generated;
	}

	onMount(() => {
		try {
			clientId = getClientId();
			void refreshState();
		} catch {
			// Privacy modes can disable storage; the read-only count still works.
		}
	});

	async function refreshState() {
		try {
			const response = await fetch(`/api/builds/${encodeURIComponent(buildId)}/like?clientId=${encodeURIComponent(clientId)}`);
			if (!response.ok) return;
			const state = (await response.json()) as { likeCount?: unknown; liked?: unknown };
			if (typeof state.likeCount === 'number') likeCount = state.likeCount;
			if (typeof state.liked === 'boolean') liked = state.liked;
		} catch {
			// Keep the server-rendered count when the optional client sync is unavailable.
		}
	}

	async function toggleLike() {
		if (!clientId || loading) return;
		loading = true;
		try {
			const response = await fetch(`/api/builds/${encodeURIComponent(buildId)}/like`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ clientId })
			});
			if (!response.ok) return;
			const state = (await response.json()) as { likeCount?: unknown; liked?: unknown };
			if (typeof state.likeCount === 'number') likeCount = state.likeCount;
			if (typeof state.liked === 'boolean') liked = state.liked;
		} catch {
			// A failed toggle leaves the last confirmed state in place.
		} finally {
			loading = false;
		}
	}
</script>

<button
	type="button"
	class:liked
	class:roomy
	aria-pressed={liked}
	aria-label={`${liked ? 'Unlike' : 'Like'} this build. ${likeCount} ${likeCount === 1 ? 'like' : 'likes'}`}
	disabled={!clientId || loading}
	onclick={(event) => {
		event.preventDefault();
		event.stopPropagation();
		void toggleLike();
	}}
>
	<svg aria-hidden="true" viewBox="0 0 24 24">
		<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
	</svg>
	<span>{likeCount}</span>
</button>

<style>
	button {
		display: inline-flex;
		min-width: 2.75rem;
		min-height: 2.75rem;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 0.35rem 0.65rem;
		border: 1px solid color-mix(in srgb, var(--gold-dim) 52%, var(--border));
		border-radius: 999px;
		background: color-mix(in srgb, var(--surface-2) 88%, transparent);
		color: var(--text-muted);
		font-size: 0.78rem;
		font-variant-numeric: tabular-nums;
		transition:
			border-color 120ms ease,
			background-color 120ms ease,
			color 120ms ease,
			transform 120ms ease;
	}
	button.roomy {
		padding-inline: 0.9rem;
		font-size: 0.88rem;
	}
	button:active:not(:disabled) {
		transform: scale(0.96);
	}
	button:disabled {
		cursor: default;
		opacity: 0.72;
	}
	button.liked {
		border-color: color-mix(in srgb, var(--bad) 62%, var(--gold-dim));
		background: color-mix(in srgb, var(--bad) 14%, var(--surface));
		color: color-mix(in srgb, var(--bad) 78%, var(--text));
	}
	svg {
		width: 1rem;
		height: 1rem;
		fill: transparent;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 1.8;
	}
	.liked svg {
		fill: currentColor;
	}
	@media (hover: hover) and (pointer: fine) {
		button:hover:not(:disabled) {
			border-color: var(--gold);
			color: var(--gold-bright);
		}
	}
</style>
