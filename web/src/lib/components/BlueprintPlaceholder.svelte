<script lang="ts">
	// Branded placeholder for listings with no creator-uploaded image.
	//
	// Seeding the first real cohort made the problem obvious: fourteen identical
	// grey house glyphs read as a database dump rather than a gallery. So the
	// placeholder now varies by blueprint type — which is real information the
	// listing already carries — and picks a subtle tint deterministically from the
	// listing id so a grid has texture.
	//
	// This is still entirely KwikShack's own artwork. No source-site media is
	// copied, proxied, or hotlinked to fill this space.

	let { blueprintType = 'House', seed = '' }: { blueprintType?: string; seed?: string } = $props();

	const GLYPHS: Record<string, string> = {
		// Whole house: roof over a body.
		House: 'M4 14.5 16 4l12 10.5v12h-8v-8h-8v8H4z',
		// Interior: a room seen from inside — floor line and back wall.
		Interior: 'M5 6h22v20H5zM5 20h22M11 20v6M21 20v6',
		// Exterior: a house with ground and surrounding plot.
		Exterior: 'M7 15 16 8l9 7v8H7zM2 27h28M11 23v-4h4v4',
		// Room: a single bounded space with a doorway.
		Room: 'M6 7h20v18H6zM14 25v-8h4v8'
	};

	const TINTS = [
		{ from: 'rgb(58 46 32 / 0.92)', to: 'rgb(20 17 13 / 0.96)' },
		{ from: 'rgb(44 50 40 / 0.92)', to: 'rgb(17 19 15 / 0.96)' },
		{ from: 'rgb(48 42 54 / 0.92)', to: 'rgb(18 16 21 / 0.96)' },
		{ from: 'rgb(40 48 56 / 0.92)', to: 'rgb(15 18 21 / 0.96)' },
		{ from: 'rgb(56 42 42 / 0.92)', to: 'rgb(21 16 16 / 0.96)' }
	];

	/** Stable per listing, so a card looks the same on every visit. */
	function tintFor(value: string) {
		let hash = 0;
		for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
		return TINTS[hash % TINTS.length];
	}

	const glyph = $derived(GLYPHS[blueprintType] ?? GLYPHS.House);
	const tint = $derived(tintFor(seed || blueprintType));
</script>

<div class="placeholder" style="--from:{tint.from}; --to:{tint.to}">
	<svg viewBox="0 0 32 32" aria-hidden="true">
		<path d={glyph} />
	</svg>
</div>

<style>
	.placeholder {
		display: grid;
		width: 100%;
		height: 100%;
		place-items: center;
		background: linear-gradient(160deg, var(--from), var(--to));
	}

	svg {
		width: 34%;
		max-width: 5rem;
		fill: none;
		stroke: var(--gold-dim);
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 2;
		opacity: 0.55;
	}
</style>
