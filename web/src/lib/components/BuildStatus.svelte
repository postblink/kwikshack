<script lang="ts">
	let { codeStatus }: { codeStatus: string } = $props();

	const status = $derived.by(() => {
		if (codeStatus === 'active') {
			return {
				label: 'Verified',
				description: 'This blueprint code was confirmed importable in-game.',
				kind: 'verified'
			};
		}
		if (codeStatus === 'expired') {
			return {
				label: 'Code unavailable',
				description: 'The build is still browsable, but its blueprint code is no longer available to import.',
				kind: 'expired'
			};
		}
		return {
			label: 'Community submission',
			description: 'Build details were submitted by the community. KwikShack has not confirmed that the blueprint code is still importable.',
			kind: 'community'
		};
	});
</script>

<span class="status" class:verified={status.kind === 'verified'} class:expired={status.kind === 'expired'}>
	<span class="label">{status.label}</span>
	<button class="info" type="button" aria-label={status.description}>
		<span aria-hidden="true">i</span>
		<span class="tooltip" role="tooltip">{status.description}</span>
	</button>
</span>

<style>
	.status {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 0.32rem;
		color: var(--warn);
		font-size: 0.71rem;
		font-weight: 700;
	}
	.status.verified {
		color: var(--ok);
	}
	.status.expired {
		color: var(--bad);
	}
	.info {
		position: relative;
		display: grid;
		width: 1.5rem;
		height: 1.5rem;
		place-items: center;
		padding: 0;
		border: 1px solid currentColor;
		border-radius: 50%;
		background: transparent;
		color: inherit;
		font-family: Georgia, serif;
		font-size: 0.7rem;
		font-style: italic;
		line-height: 1;
		cursor: help;
		opacity: 0.78;
	}
	.tooltip {
		position: absolute;
		z-index: 40;
		right: -0.35rem;
		bottom: calc(100% + 0.55rem);
		width: min(17rem, calc(100vw - 2rem));
		padding: 0.62rem 0.7rem;
		border: 1px solid var(--gold-dim);
		border-radius: 0.42rem;
		background: #211c16;
		box-shadow: 0 12px 30px rgb(0 0 0 / 0.42);
		color: var(--text);
		font-family: system-ui, sans-serif;
		font-size: 0.74rem;
		font-style: normal;
		font-weight: 500;
		line-height: 1.45;
		opacity: 0;
		pointer-events: none;
		transform: translateY(0.2rem);
		transition:
			opacity 120ms ease,
			transform 120ms ease;
	}
	.info:is(:hover, :focus-visible) .tooltip {
		opacity: 1;
		transform: translateY(0);
	}
</style>
