<script lang="ts">
	import { EVIDENCE_KINDS } from '$lib/types/evidence';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const EVIDENCE_COPY: Record<string, { label: string; strength: 'strong' | 'moderate' | 'weak' }> = {
		[EVIDENCE_KINDS.characterOwnership]: { label: 'Battle.net confirms they control the cited character', strength: 'strong' },
		[EVIDENCE_KINDS.characterMatchesAttribution]: { label: 'Cited character matches the source attribution', strength: 'strong' },
		[EVIDENCE_KINDS.claimantEvidenceUrl]: { label: 'Claimant supplied an evidence link (check it yourself)', strength: 'moderate' },
		[EVIDENCE_KINDS.displayNameSimilarity]: { label: 'BattleTag name resembles the attribution — NOT sufficient alone', strength: 'weak' }
	};
</script>

<svelte:head>
	<title>Claim review — KwikShack</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="wrap">
	<h1>Claim review</h1>
	<p class="lede">
		Battle.net proves account and character control. It does not prove who built a house. Approve only when the evidence
		actually connects this account to the original share — a matching name on its own never does.
	</p>

	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
	{#if form?.done}<p class="ok" role="status">Claim {form.done}.</p>{/if}

	{#each data.claims as claim (claim.claimId)}
		<article class="panel">
			<h2><a href="/blueprints/{claim.blueprintId}">{claim.blueprintTitle}</a></h2>
			<dl>
				<div><dt>Attributed at source</dt><dd>{claim.attributedCreator}</dd></div>
				<div><dt>Claimant</dt><dd>{claim.claimantDisplayName}{claim.claimantBattletag ? ` (${claim.claimantBattletag})` : ''}</dd></div>
				<div><dt>Cited character</dt><dd>{claim.claimedCharacter ?? '—'}</dd></div>
				<div><dt>Blueprint code</dt><dd class="mono">{claim.shareCode}</dd></div>
				<div><dt>Requested</dt><dd>{claim.createdAt}</dd></div>
			</dl>

			<h3>Evidence present</h3>
			{#if claim.evidenceKinds.length}
				<ul class="evidence">
					{#each claim.evidenceKinds as kind (kind)}
						<li class={EVIDENCE_COPY[kind]?.strength ?? 'weak'}>{EVIDENCE_COPY[kind]?.label ?? kind}</li>
					{/each}
				</ul>
			{:else}
				<p class="fine">No supporting signals. This is an unsupported assertion.</p>
			{/if}

			{#if claim.evidenceUrl}
				<p class="fine">Evidence link: <a href={claim.evidenceUrl} rel="noopener noreferrer nofollow" target="_blank">{claim.evidenceUrl}</a></p>
			{/if}
			{#if claim.claimantNote}<p class="fine note">“{claim.claimantNote}”</p>{/if}

			<h3>Sources on file</h3>
			<ul class="fine">
				{#each claim.sourceUrls as url (url)}
					<li><a href={url} rel="noopener noreferrer nofollow" target="_blank">{url}</a></li>
				{/each}
			</ul>

			<form method="POST" class="review">
				<input type="hidden" name="claimId" value={claim.claimId} />
				<input name="reviewerNote" placeholder="Reviewer note (internal)" maxlength="1000" />
				<button class="gold-button" formaction="?/approve" type="submit">Approve</button>
				<button class="ghost" formaction="?/reject" type="submit">Reject</button>
			</form>
		</article>
	{:else}
		<p class="fine">No claims are waiting.</p>
	{/each}
</div>

<style>
	.wrap {
		width: min(100% - 2rem, 54rem);
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
		margin-bottom: 1.1rem;
		padding: 1.1rem 1.2rem;
		border: 1px solid var(--border);
		border-radius: 0.55rem;
		background: rgb(29 25 20 / 0.62);
	}
	.panel h2 {
		margin: 0 0 0.6rem;
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 700;
	}
	.panel h2 a {
		color: var(--gold);
	}
	.panel h3 {
		margin: 0.9rem 0 0.35rem;
		color: var(--gold-dim);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	dl {
		display: grid;
		gap: 0.3rem;
		margin: 0;
	}
	dl div {
		display: flex;
		gap: 0.6rem;
		font-size: 0.84rem;
	}
	dt {
		min-width: 11rem;
		color: var(--text-muted);
	}
	dd {
		margin: 0;
		color: var(--text);
		overflow-wrap: anywhere;
	}
	.mono {
		font-family: ui-monospace, monospace;
		font-size: 0.76rem;
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.evidence li {
		padding: 0.22rem 0 0.22rem 0.7rem;
		border-left: 3px solid var(--border);
		font-size: 0.83rem;
	}
	.evidence li.strong {
		border-left-color: var(--ok);
		color: var(--text);
	}
	.evidence li.moderate {
		border-left-color: var(--warn);
		color: var(--text-muted);
	}
	.evidence li.weak {
		border-left-color: var(--bad);
		color: var(--text-muted);
	}
	.fine {
		color: var(--text-muted);
		font-size: 0.8rem;
		line-height: 1.55;
		overflow-wrap: anywhere;
	}
	.note {
		font-style: italic;
	}
	.review {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.9rem;
	}
	.review input {
		flex: 1 1 16rem;
		padding: 0.45rem 0.55rem;
		border: 1px solid var(--border);
		border-radius: 0.36rem;
		background: rgb(20 17 13 / 0.7);
		color: var(--text);
		font: inherit;
		font-size: 0.84rem;
	}
	.ghost {
		min-height: 2.5rem;
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--gold-dim);
		border-radius: 0.36rem;
		background: transparent;
		color: var(--gold);
		font: inherit;
		font-size: 0.84rem;
		cursor: pointer;
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
