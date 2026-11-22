<script lang="ts">
	import { untrack } from 'svelte';
	import { getClub } from '#lib/domain/clubs.ts';
	import { formatLong, monthGrid, monthLabel, toDate } from '#lib/domain/dates.ts';
	import { animate } from '#lib/motion/motion.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Crest from '#lib/ui/Crest.svelte';
	import Panel from '#lib/ui/Panel.svelte';
	import MatchCard from '#lib/ui/cards/MatchCard.svelte';
	import { CUP_ID } from '#lib/domain/cup.ts';
	import { enter } from '#lib/motion/actions.ts';

	let { data } = $props();
	const c = $derived(data.career);
	const v = $derived(data.view);

	const start = untrack(() => toDate(data.career.gameDate));
	let year = $state(start.getUTCFullYear());
	let month = $state(start.getUTCMonth());
	let grid: HTMLDivElement | undefined = $state();

	const days = $derived(monthGrid(year, month));
	const byDate = $derived(new Map(v.clubFixtures.map((f) => [f.date, f])));
	const monthFixtures = $derived(v.clubFixtures.filter((f) => toDate(f.date).getUTCMonth() === month && toDate(f.date).getUTCFullYear() === year));
	let selected = $state<string | null>(null);
	const selFixture = $derived(selected ? byDate.get(selected) : (monthFixtures[0] ?? null));

	function shift(delta: number) {
		const d = new Date(Date.UTC(year, month + delta, 1));
		year = d.getUTCFullYear();
		month = d.getUTCMonth();
		selected = null;
		if (grid) void animate(grid, { opacity: 1, x: 0 }, { spring: 'page', from: { opacity: 0, x: 24 * delta } });
	}
	const WEEK = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
	type Fx = (typeof v.clubFixtures)[number];
	/** Resultado oficial gravado para o jogo (ou undefined se ainda não foi disputado). */
	const resultOf = (f: Fx) => v.results.find((r) => r.round === f.round && r.home === f.home && (r.competition ?? 'liga-brasfc') === f.competition);
	const outcomeOf = (f: Fx) => {
		const r = resultOf(f);
		if (!r) return null;
		const gf = r.home === c.clubId ? r.homeGoals : r.awayGoals, ga = r.home === c.clubId ? r.awayGoals : r.homeGoals;
		return { r, key: gf > ga ? 'v' : gf === ga ? 'e' : 'd', label: gf > ga ? 'Vitória' : gf === ga ? 'Empate' : 'Derrota' } as const;
	};
	const compOf = (f: Fx) => (f.competition === CUP_ID ? 'Copa do Brasil' : v.divisionLabel);
	const nextFixture = $derived(v.clubFixtures.find((f) => !resultOf(f)));
	const summary = $derived.by(() => {
		const out = { games: monthFixtures.length, home: 0, cup: 0, v: 0, e: 0, d: 0 };
		for (const f of monthFixtures) {
			if (f.home === c.clubId) out.home++;
			if (f.competition === CUP_ID) out.cup++;
			const o = outcomeOf(f);
			if (o) out[o.key]++;
		}
		return out;
	});
</script>

<svelte:head><title>Calendário · {v.club.name} · BRASFC</title></svelte:head>

<div class="head" data-umx-enter>
	<div>
		<span class="eyebrow">Temporada {c.season}</span>
		<h1>Calendário</h1>
	</div>
	<div class="nav">
		<Button variant="secondary" icon="chevronLeft" onclick={() => shift(-1)} aria-label="Mês anterior" />
		<strong class="month">{monthLabel(year, month)}</strong>
		<Button variant="secondary" icon="chevronRight" onclick={() => shift(1)} aria-label="Próximo mês" />
	</div>
</div>

<div class="layout">
	<Panel pad={false} index={0}>
		<div class="cal" bind:this={grid}>
			{#each WEEK as w (w)}<div class="wh">{w}</div>{/each}
			{#each days as d (d)}
				{@const f = byDate.get(d)}
				{@const dt = toDate(d)}
				<button
					type="button"
					class="cell"
					class:out={dt.getUTCMonth() !== month}
					class:today={d === c.gameDate}
					class:match={!!f}
					class:cup={f?.competition === CUP_ID}
					class:next={!!f && nextFixture === f}
					data-outcome={f ? outcomeOf(f)?.key : undefined}
					class:sel={(selFixture?.date ?? '') === d && !!f}
					disabled={!f}
					onclick={() => (selected = d)}
					aria-label={f ? `${formatLong(d)}: jogo contra ${getClub(f.home === c.clubId ? f.away : f.home)?.name}` : formatLong(d)}
				>
					<span class="dn num">{dt.getUTCDate()}</span>
					{#if f}
						{@const opp = f.home === c.clubId ? f.away : f.home}
						{@const o = outcomeOf(f)}
						<span class="tag">{f.competition === CUP_ID ? 'Copa' : `R${f.round}`}</span>
						<span class="m">
							<Crest clubId={opp} size={28} />
							{#if o}<span class="score num">{o.r.homeGoals}–{o.r.awayGoals}</span>{:else}<span class="ha">{f.home === c.clubId ? 'Casa' : 'Fora'}</span>{/if}
						</span>
					{:else if d === c.gameDate}
						<span class="now">Hoje</span>
					{/if}
				</button>
			{/each}
		</div>
	</Panel>

	<div class="side">
		<Panel title="Jogo selecionado" icon="whistle" index={1}>
			{#if selFixture}
				{@const opp = selFixture.home === c.clubId ? selFixture.away : selFixture.home}
				{@const o = outcomeOf(selFixture)}
				{#key selFixture.date}
					<div class="sel-card" use:enter={{ y: 6 }}>
						<Crest clubId={opp} size={72} />
						<span class="eyebrow">{compOf(selFixture)}{selFixture.competition === CUP_ID ? '' : ` · Rodada ${selFixture.round}`} · {selFixture.home === c.clubId ? 'em casa' : 'fora de casa'}</span>
						<strong>{getClub(opp)?.name}</strong>
						{#if o}<span class="final" data-outcome={o.key}>{o.label} · {getClub(o.r.home)?.short} {o.r.homeGoals} × {o.r.awayGoals} {getClub(o.r.away)?.short}</span>{/if}
						<span class="muted">{formatLong(selFixture.date)} · {selFixture.time}</span>
						<span class="subtle">{getClub(selFixture.home)?.stadium}</span>
					</div>
				{/key}
			{:else}
				<p class="muted">Nenhum jogo neste mês.</p>
			{/if}
			<p class="legend subtle"><span class="lg match"></span> Liga <span class="lg cup"></span> Copa <span class="lg today"></span> Hoje <span class="lg next"></span> Próximo</p>
		</Panel>
		<Panel title="Resumo do mês" icon="calendar" index={2}>
			<dl class="sum">
				<div><dt>Jogos</dt><dd>{summary.games}</dd></div>
				<div><dt>Em casa</dt><dd>{summary.home}</dd></div>
				<div><dt>Copa</dt><dd>{summary.cup}</dd></div>
				<div><dt>V · E · D</dt><dd><span class="pos">{summary.v}</span> · {summary.e} · <span class="neg">{summary.d}</span></dd></div>
			</dl>
			<div class="agenda">
				{#each monthFixtures as f (f.competition + f.round + f.home)}
					{@const o = outcomeOf(f)}
					<button type="button" class="agenda-item" class:on={selFixture === f} onclick={() => (selected = f.date)} data-umx-press>
						<MatchCard home={f.home} away={f.away} score={o ? { home: o.r.homeGoals, away: o.r.awayGoals } : null} time={f.time}
							label={`${formatLong(f.date).split(',')[0]} · ${f.competition === CUP_ID ? 'Copa' : `R${f.round}`}`} status={o ? o.label : nextFixture === f ? 'Próximo' : undefined} highlight={nextFixture === f} />
					</button>
				{:else}<p class="muted">Sem jogos neste mês.</p>{/each}
			</div>
		</Panel>
	</div>
</div>

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: var(--sp-4);
		flex-wrap: wrap;
		margin-bottom: var(--sp-5);
	}
	h1 {
		font-size: var(--fs-3xl);
		text-transform: uppercase;
		font-weight: 800;
	}
	.nav {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}
	.month {
		min-width: 170px;
		text-align: center;
		font-family: var(--font-display);
		font-size: var(--fs-xl);
		text-transform: uppercase;
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
		gap: var(--sp-4);
		align-items: start;
	}
	.cal {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 4px;
		padding: var(--sp-4);
	}
	.wh {
		text-align: center;
		font-size: var(--fs-xs);
		font-weight: 700;
		color: var(--text-3);
		text-transform: uppercase;
		padding-bottom: var(--sp-2);
	}
	.cell {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		min-height: 86px;
		padding: 6px 8px;
		border-radius: var(--radius-s);
		border: 1px solid var(--line);
		background: var(--surface-sunken);
		text-align: left;
	}
	.cell:disabled {
		cursor: default;
	}
	.out {
		opacity: 0.35;
	}
	.dn {
		font-size: var(--fs-sm);
		font-weight: 600;
		color: var(--text-2);
	}
	.match {
		background: linear-gradient(160deg, rgb(232 184 106 / 0.16), var(--surface-sunken));
		border-color: rgb(232 184 106 / 0.35);
	}
	.match:hover {
		border-color: var(--gold);
	}
	.sel {
		box-shadow: 0 0 0 2px var(--gold);
	}
	.today {
		border-color: var(--emerald);
		box-shadow: inset 0 0 0 1px var(--emerald);
	}
	.m {
		display: flex;
		align-items: center;
		gap: 6px;
		align-self: center;
		margin-top: auto;
	}
	.tag {
		position: absolute;
		top: 6px;
		right: 7px;
		font-size: 11px;
		font-weight: 700;
		color: var(--text-3);
	}
	.cup {
		background: linear-gradient(160deg, rgb(124 182 248 / 0.16), var(--surface-sunken));
		border-color: rgb(124 182 248 / 0.4);
	}
	.cup .ha { color: var(--info); }
	.next { box-shadow: inset 0 0 0 2px var(--emerald-strong); }
	.score {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: var(--fs-md);
		padding: 0 6px;
		border-radius: 6px;
		background: rgb(0 0 0 / 0.35);
	}
	[data-outcome='v'] .score { color: var(--good); }
	[data-outcome='d'] .score { color: var(--bad); }
	.side { display: grid; gap: var(--sp-4); min-width: 0; }
	.final { font-weight: 700; padding: 3px 10px; border-radius: 99px; background: rgb(231 237 240 / 0.07); }
	.final[data-outcome='v'] { color: var(--good); background: var(--emerald-soft); }
	.final[data-outcome='d'] { color: var(--bad); background: var(--danger-soft); }
	.sum { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin: 0 0 var(--sp-3); }
	.sum div { padding: 8px; border-radius: 10px; background: var(--surface-sunken); text-align: center; }
	.sum dt { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
	.sum dd { margin: 0; font-family: var(--font-display); font-size: var(--fs-xl); font-weight: 800; }
	.agenda { display: grid; gap: 6px; max-height: 360px; overflow: auto; }
	.agenda-item { display: block; width: 100%; padding: 0; border: 0; border-radius: var(--radius-m); background: none; text-align: start; }
	.agenda-item.on :global(.match) { border-color: var(--gold); }
	.lg.cup { background: var(--info-soft); border: 1px solid var(--info); }
	.lg.next { border: 2px solid var(--emerald-strong); }
	.ha {
		font-size: 11px;
		font-weight: 700;
		color: var(--gold);
		text-transform: uppercase;
	}
	.now {
		margin-top: auto;
		font-size: 11px;
		font-weight: 700;
		color: var(--emerald-strong);
		text-transform: uppercase;
	}
	.sel-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		text-align: center;
		padding: var(--sp-3) 0 var(--sp-4);
	}
	.sel-card strong {
		font-family: var(--font-display);
		font-size: var(--fs-2xl);
		text-transform: uppercase;
	}
	.legend {
		flex-wrap: wrap;
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--fs-xs);
		border-top: 1px solid var(--line);
		padding-top: var(--sp-3);
	}
	.lg {
		width: 12px;
		height: 12px;
		border-radius: 3px;
		margin-left: var(--sp-2);
	}
	.lg.match {
		background: var(--gold-soft);
		border: 1px solid var(--gold);
	}
	.lg.today {
		border: 1px solid var(--emerald);
	}
	@media (max-width: 1000px) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}
		.cell {
			min-height: 64px;
		}
	}
</style>
