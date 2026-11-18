<script lang="ts">
	import { untrack } from 'svelte';
	import { getClub, LEAGUE } from '#lib/domain/clubs.ts';
	import { formatShort } from '#lib/domain/dates.ts';
	import StandingsTable from '#lib/ui/career/StandingsTable.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Crest from '#lib/ui/Crest.svelte';
	import Panel from '#lib/ui/Panel.svelte';
	import Unavailable from '#lib/ui/Unavailable.svelte';

	let { data } = $props();
	const c = $derived(data.career);
	const v = $derived(data.view);
	const TOTAL = 38;

	let round = $state(untrack(() => data.view.next?.round ?? 1));
	const games = $derived(v.fixtures.filter((f) => f.round === round));
</script>

<svelte:head><title>Competições · {v.club.name} · BRASFC</title></svelte:head>

<div class="head" data-umx-enter>
	<span class="eyebrow">Temporada {c.season}</span>
	<h1>{LEAGUE.name}</h1>
	<p class="muted">20 clubes · turno e returno · os 4 primeiros em destaque verde, os 4 últimos em vermelho. {data.view.results.length ? `Calculada a partir de ${new Set(data.view.results.map((r) => r.round)).size} rodada(s) disputada(s).` : 'A tabela começa zerada: nenhuma rodada foi disputada.'}</p>
</div>

<div class="layout">
	<Panel title="Classificação" icon="trophy" demo index={0}>
		<StandingsTable rows={v.standings} highlight={c.clubId} />
	</Panel>

	<div class="side">
		<Panel title="Rodadas" icon="calendar" index={1}>
			<div class="stepper">
				<Button variant="secondary" size="sm" icon="chevronLeft" disabled={round <= 1} onclick={() => round--} aria-label="Rodada anterior" />
				<div class="rlabel">
					<strong>Rodada {round}</strong>
					<small class="muted">{formatShort(games[0].date)}</small>
				</div>
				<Button variant="secondary" size="sm" icon="chevronRight" disabled={round >= TOTAL} onclick={() => round++} aria-label="Próxima rodada" />
			</div>
			<div class="progress" aria-hidden="true"><span style="width:{(round / TOTAL) * 100}%"></span></div>
			<ul class="games">
				{#each games as g (g.home)}
					<li class:mine={g.home === c.clubId || g.away === c.clubId}>
						<span class="t h">{getClub(g.home)?.short}<Crest clubId={g.home} size={26} /></span>
						<span class="x">{g.time}</span>
						<span class="t a"><Crest clubId={g.away} size={26} />{getClub(g.away)?.short}</span>
					</li>
				{/each}
			</ul>
		</Panel>
		<Unavailable title="Copa BRASFC" detail="Mata-mata com clubes de todas as divisões" icon="trophy" />
		<Unavailable title="Artilharia e estatísticas" detail="Disponíveis quando as partidas forem simuladas" icon="chart" />
	</div>
</div>

<style>
	.head {
		margin-bottom: var(--sp-5);
	}
	.head p {
		font-size: var(--fs-sm);
		max-width: 75ch;
	}
	h1 {
		font-size: var(--fs-3xl);
		text-transform: uppercase;
		font-weight: 800;
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(320px, 1fr);
		gap: var(--sp-4);
		align-items: start;
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}
	.stepper {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.rlabel {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.rlabel strong {
		font-family: var(--font-display);
		font-size: var(--fs-xl);
		text-transform: uppercase;
	}
	.progress {
		height: 4px;
		border-radius: 2px;
		background: var(--surface-3);
		margin: var(--sp-3) 0;
		overflow: hidden;
	}
	.progress span {
		display: block;
		height: 100%;
		background: var(--emerald);
		transition: width 0.3s;
	}
	.games {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}
	.games li {
		display: grid;
		grid-template-columns: 1fr 64px 1fr;
		align-items: center;
		padding: 6px var(--sp-2);
		border-radius: var(--radius-s);
		background: var(--surface-sunken);
		font-weight: 700;
		font-size: var(--fs-sm);
	}
	.games li.mine {
		background: var(--emerald-soft);
		box-shadow: inset 0 0 0 1px var(--emerald-line);
	}
	.t {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.h {
		justify-content: flex-end;
	}
	.x {
		text-align: center;
		font-size: var(--fs-xs);
		color: var(--text-3);
		font-weight: 600;
	}
	@media (max-width: 1100px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}
</style>
