<script lang="ts">
	import Crest from '../Crest.svelte';

	/** Comparativo de estatísticas oficiais da partida (intervalo e súmula), lado a lado. */
	type TeamStats = { shots: number; shotsOnTarget: number; xg: number; passes: number; passesCompleted: number; possessionTicks: number;
		corners: number; fouls: number; offsides: number; yellows: number; reds: number };
	type Team = { id: string; short: string; colors: { primary: string } };
	let { home, away, stats }: { home: Team; away: Team; stats: { home: TeamStats; away: TeamStats } } = $props();

	const pct = (a: number, b: number) => (a + b > 0 ? Math.round((a / (a + b)) * 100) : 50);
	const accuracy = (t: TeamStats) => (t.passes ? Math.round((t.passesCompleted / t.passes) * 100) : 0);
	const rows = $derived.by(() => {
		const h = stats.home, a = stats.away;
		const possession = pct(h.possessionTicks, a.possessionTicks);
		return [
			{ label: 'Posse de bola', home: possession, away: 100 - possession, fmt: (v: number) => `${v}%` },
			{ label: 'Finalizações', home: h.shots, away: a.shots },
			{ label: 'No alvo', home: h.shotsOnTarget, away: a.shotsOnTarget },
			{ label: 'Gols esperados (xG)', home: h.xg, away: a.xg, fmt: (v: number) => v.toFixed(2) },
			{ label: 'Passes certos', home: accuracy(h), away: accuracy(a), fmt: (v: number) => `${v}%` },
			{ label: 'Escanteios', home: h.corners, away: a.corners },
			{ label: 'Faltas', home: h.fouls, away: a.fouls },
			{ label: 'Impedimentos', home: h.offsides, away: a.offsides },
			{ label: 'Cartões amarelos', home: h.yellows, away: a.yellows },
			{ label: 'Cartões vermelhos', home: h.reds, away: a.reds }
		];
	});
</script>

<div class="compare" style:--home={home.colors.primary} style:--away={away.colors.primary}>
	<div class="teams"><span><Crest clubId={home.id} size={26} />{home.short}</span><span>{away.short}<Crest clubId={away.id} size={26} /></span></div>
	<dl>
		{#each rows as row (row.label)}
			{@const share = pct(row.home, row.away)}
			<div class="row" class:lead-home={row.home > row.away} class:lead-away={row.away > row.home}>
				<dd class="v h num">{row.fmt ? row.fmt(row.home) : row.home}</dd>
				<dt>{row.label}</dt>
				<dd class="v a num">{row.fmt ? row.fmt(row.away) : row.away}</dd>
				<span class="bar" aria-hidden="true"><i class="bh" style:width="{row.home + row.away ? share : 50}%"></i><i class="ba" style:width="{row.home + row.away ? 100 - share : 50}%"></i></span>
			</div>
		{/each}
	</dl>
</div>

<style>
	.compare { display: grid; gap: 10px; }
	.teams { display: flex; justify-content: space-between; font-family: var(--font-display); font-weight: 800; font-size: var(--fs-lg); text-transform: uppercase; }
	.teams span { display: inline-flex; align-items: center; gap: 8px; }
	dl { display: grid; gap: 8px; margin: 0; }
	.row { display: grid; grid-template-columns: 4.5em minmax(0, 1fr) 4.5em; align-items: center; gap: 2px 10px; }
	dt { text-align: center; color: var(--text-2); font-size: var(--fs-sm); }
	.v { margin: 0; font-family: var(--font-display); font-weight: 800; font-size: var(--fs-lg); color: var(--text-2); }
	.h { text-align: left; }
	.a { text-align: right; }
	.lead-home .h, .lead-away .a { color: var(--text); }
	.bar { grid-column: 1 / -1; display: flex; gap: 3px; height: 5px; }
	.bar i { display: block; height: 100%; border-radius: 3px; transition: width 0.5s var(--ease-out); }
	.bh { background: color-mix(in srgb, var(--home) 70%, var(--emerald-strong)); }
	.ba { background: color-mix(in srgb, var(--away) 70%, var(--info)); }
	.lead-home .ba, .lead-away .bh { opacity: 0.45; }
</style>
