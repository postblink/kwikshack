<script lang="ts">
	import { onDestroy } from 'svelte';

	let {
		shareCode,
		buildTitle = '',
		compact = false
	}: { shareCode: string; buildTitle?: string; compact?: boolean } = $props();

	let state = $state<'idle' | 'copied' | 'error'>('idle');
	let resetTimer: ReturnType<typeof setTimeout> | undefined;

	onDestroy(() => {
		if (resetTimer) clearTimeout(resetTimer);
	});

	async function copyBlueprint(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		try {
			await navigator.clipboard.writeText(shareCode);
			state = 'copied';
		} catch {
			state = 'error';
		}
		if (resetTimer) clearTimeout(resetTimer);
		resetTimer = setTimeout(() => (state = 'idle'), 1800);
	}
</script>

<button
	type="button"
	class:compact
	class:success={state === 'copied'}
	class:error={state === 'error'}
	aria-label={`Copy blueprint${buildTitle ? ` for ${buildTitle}` : ''}`}
	title={state === 'error' ? 'Clipboard access was unavailable' : 'Copy blueprint code'}
	onclick={copyBlueprint}
>
	<span class="copy-icon" aria-hidden="true">⧉</span>
	<span aria-live="polite">{state === 'copied' ? 'Copied!' : state === 'error' ? 'Copy failed' : 'Copy Blueprint'}</span>
</button>

<style>
	button {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		padding: 0.55rem 0.9rem;
		border: 1px solid #6f541c;
		border-radius: 0.42rem;
		background: linear-gradient(to bottom, #f3da91 0, #d9b657 8%, #a57929 58%, #76511b 100%);
		box-shadow:
			inset 0 1px rgb(255 246 204 / 0.72),
			inset 0 -1px rgb(59 35 5 / 0.62),
			0 4px 14px rgb(0 0 0 / 0.2);
		color: #1b1409;
		font-size: 0.8rem;
		font-weight: 800;
		letter-spacing: 0.01em;
		text-shadow: 0 1px rgb(255 232 154 / 0.34);
		transition:
			filter 150ms ease,
			box-shadow 150ms ease,
			transform 150ms ease;
	}
	button.compact {
		min-height: 2.65rem;
		padding-inline: 0.75rem;
		font-size: 0.76rem;
	}
	button.success {
		border-color: color-mix(in srgb, var(--ok) 55%, #6f541c);
		background: linear-gradient(to bottom, #b9d6ad, #78a86d 55%, #476c43);
	}
	button.error {
		border-color: color-mix(in srgb, var(--bad) 65%, #6f541c);
		background: linear-gradient(to bottom, #dc9c8f, #b66152 55%, #71382f);
		color: #fff5e8;
		text-shadow: 0 1px rgb(0 0 0 / 0.35);
	}
	.copy-icon {
		font-size: 1rem;
		line-height: 1;
	}
	@media (hover: hover) and (pointer: fine) {
		button:hover {
			filter: brightness(1.12) saturate(1.04);
			box-shadow:
				inset 0 1px rgb(255 249 220 / 0.85),
				inset 0 -1px rgb(59 35 5 / 0.55),
				0 5px 18px rgb(200 161 68 / 0.18);
			transform: translateY(-1px);
		}
	}
</style>
