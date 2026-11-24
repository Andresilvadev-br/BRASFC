<script lang="ts">
	import { getClub } from '#lib/domain/clubs.ts';
	import Crest from '../Crest.svelte';

	/** Match Card — confronto compacto com escudos, placar ou horário, competição e status. */
	let {
		home,
		away,
		score,
		time,
		label,
		status,
		live = false,
		highlight = false,
		href
	}: {
		home: string;
		away: string;
		score?: { home: number; away: number } | null;
		time?: string;
		/** Competição/rodada ("Série A · Rodada 3"). */
		label?: string;
		status?: string;
		live?: boolean;
		highlight?: boolean;
		href?: string;
	} = $props();
	const h = $derived(getClub(home));
	const a = $derived(getClub(away));
	const winner = $derived(!score ? null : score.home > score.away ? 'home' : score.away > score.home ? 'away' : null);
</script>

<svelte:element this={href ? 'a' : 'div'} {href} class="match" class:highlight class:live data-umx-press={href ? '' : undefined}
	style:--home={h?.colors.primary ?? '#2a353d'} style:--away={a?.colors.primary ?? '#2a353d'}>
	{#if label || status}
		<span class="meta"><span>{label ?? ''}</span>{#if status}<span class="status">{#if live}<i aria-hidden="true"></i>{/if}{status}</span>{/if}</span>
	{/if}
	<span class="team" class:win={winner === 'home'}><Crest clubId={home} size={26} /><span class="name">{h?.short ?? home}</span></span>
	<span class="center num">{#if score}{score.home}<em>×</em>{score.away}{:else}{time ?? '×'}{/if}</span>
	<span class="team away" class:win={winner === 'away'}><span class="name">{a?.short ?? away}</span><Crest clubId={away} size={26} /></span>
	<span class="sr-only">{h?.name ?? home} {score ? `${score.home} a ${score.away}` : 'contra'} {a?.name ?? away}</span>
</svelte:element>

<style>
	.match {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: center;
		gap: 6px 10px;
		min-width: 0;
		padding: 10px 12px;
		border-radius: var(--radius-m);
		background:
			linear-gradient(90deg, color-mix(in srgb, var(--home) 22%, transparent), transparent 32%, transparent 68%, color-mix(in srgb, var(--away) 22%, transparent)),
			var(--surface-sunken);
		border: 1px solid var(--line);
		color: var(--text);
	}
	.highlight { border-color: var(--emerald-line); box-shadow: 0 0 0 1px var(--emerald-line) inset; }
	.meta { grid-column: 1 / -1; display: flex; justify-content: space-between; gap: 8px; font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-3); }
	.status { display: inline-flex; align-items: center; gap: 5px; color: var(--text-2); }
	.live .status { color: var(--emerald-strong); }
	.status i { width: 6px; height: 6px; border-radius: 50%; background: var(--emerald-strong); animation: blink 1.4s ease-in-out infinite; }
	@keyframes blink { 50% { opacity: 0.25; } }
	.team { display: flex; align-items: center; gap: 8px; min-width: 0; color: var(--text-2); font-weight: 600; }
	.team.away { justify-content: flex-end; }
	.team.win { color: var(--text); }
	/* Siglas de 3 a 4 letras nunca são cortadas. */
	.name { white-space: nowrap; font-size: var(--fs-sm); flex: none; }
	.center { font-family: var(--font-display); font-weight: 800; font-size: 1.25rem; min-width: 3.2em; text-align: center; letter-spacing: 0.02em; }
	.center em { font-style: normal; color: var(--text-3); margin: 0 5px; font-weight: 600; }
</style>
