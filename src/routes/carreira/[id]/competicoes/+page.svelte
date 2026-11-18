<script lang="ts">
	import { untrack } from 'svelte';
	import { getClub } from '#lib/domain/clubs.ts';
	import { formatShort } from '#lib/domain/dates.ts';
	import { DIVISION_LABELS, divisionStandings, effectiveRule, groupStandings, type BrasilDivision, type DivisionId } from '#lib/domain/league.ts';
	import StandingsTable from '#lib/ui/career/StandingsTable.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Crest from '#lib/ui/Crest.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Panel from '#lib/ui/Panel.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';
	import Unavailable from '#lib/ui/Unavailable.svelte';

	let { data } = $props();
	const c = $derived(data.career);
	const v = $derived(data.view);

	let div = $state<DivisionId>(untrack(() => data.view.division));
	const divisions = $derived(Object.keys(v.league.divisions) as DivisionId[]);
	const rows = $derived(divisionStandings(v.league, div, v.results));
	const groups = $derived(div === 'serie-c' ? groupStandings(v.league, v.results) : []);
	const divFixtures = $derived(v.fixtures.filter((f) => f.competition === div));
	const maxRound = $derived(Math.max(1, ...divFixtures.map((f) => f.round)));
	let round = $state(untrack(() => Math.max(1, Math.min(data.view.nextRound, 38))));
	const shownRound = $derived(Math.min(round, maxRound));
	const games = $derived(divFixtures.filter((f) => f.round === shownRound));
	const resultOf = (home: string) => v.results.find((r) => r.round === shownRound && r.home === home && (r.competition ?? div) === div);
	const zones = $derived.by(() => {
		if (div === 'liga-brasfc') return { up: 4, down: 4, text: 'Os 4 primeiros em verde e os 4 últimos em vermelho (liga fictícia, sem acesso).' };
		const r = effectiveRule(v.league, div as BrasilDivision);
		const st = r.status === 'oficial' ? 'regra oficial' : r.status === 'anunciado' ? 'regra anunciada' : 'regra projetada pelo BRASFC';
		if (div === 'serie-a') return { up: 0, down: r.relegated, text: `Os ${r.relegated} últimos caem para a Série B (${st}).` };
		if (div === 'serie-b') return { up: r.promoted, down: r.relegated, text: `Os ${r.promoted} primeiros sobem; os ${r.relegated} últimos caem para a Série C (${st}).` };
		if (div === 'serie-d') return { up: 0, down: 0, text: `16 grupos de 6; os 4 primeiros de cada grupo vão ao mata-mata. Sobem os semifinalistas e os vencedores dos playoffs (${st}).` };
		return { up: 8, down: r.relegated, text: `${r.size} clubes. ${r.nota ?? ''} Sobem 4; caem ${r.relegated} (${st}).` };
	});
	const OUTCOME: Record<string, string> = { campeao: 'Campeão', acesso: 'Acesso', rebaixado: 'Rebaixado', permanece: 'Permanência' };
</script>

<svelte:head><title>Competições · {v.club.name} · BRASFC</title></svelte:head>

<div class="head" data-umx-enter>
	<span class="eyebrow">Temporada {c.season}{v.world === 'brasil' && c.season > 2026 ? ' · projeção do BRASFC a partir da base 2026' : ''}</span>
	<h1>{DIVISION_LABELS[div]}</h1>
	<p class="muted">{zones.text} {v.results.length ? `Tabela calculada a partir das rodadas disputadas na sua carreira.` : 'Nenhuma rodada disputada ainda.'}</p>
	{#if divisions.length > 1}
		<Segmented label="Divisão" bind:value={div} options={divisions.map((d) => ({ value: d, label: DIVISION_LABELS[d] }))} />
	{/if}
</div>

<div class="layout">
	<div class="main">
		<Panel title="Classificação{div === 'serie-c' ? ' · 1ª fase' : ''}" icon="trophy" demo={v.world === 'brasfc'} index={0}>
			<StandingsTable {rows} highlight={c.clubId} up={zones.up} down={zones.down} />
		</Panel>
		{#if groups.length}
			<div class="groups">
				{#each groups as g, i (i)}
					<Panel title="Grupo {i + 1} · 2ª fase" icon="trophy" index={1}>
						<StandingsTable rows={g} highlight={c.clubId} up={2} down={0} />
					</Panel>
				{/each}
			</div>
		{/if}
	</div>

	<div class="side">
		<Panel title="Rodadas" icon="calendar" index={1}>
			<div class="stepper">
				<Button variant="secondary" size="sm" icon="chevronLeft" disabled={shownRound <= 1} onclick={() => (round = shownRound - 1)} aria-label="Rodada anterior" />
				<div class="rlabel">
					<strong>Rodada {shownRound}</strong>
					<small class="muted">{games[0] ? formatShort(games[0].date) : ''}</small>
				</div>
				<Button variant="secondary" size="sm" icon="chevronRight" disabled={shownRound >= maxRound} onclick={() => (round = shownRound + 1)} aria-label="Próxima rodada" />
			</div>
			<div class="progress" aria-hidden="true"><span style="width:{(shownRound / maxRound) * 100}%"></span></div>
			<ul class="games">
				{#each games as g (g.home)}
					{@const r = resultOf(g.home)}
					<li class:mine={g.home === c.clubId || g.away === c.clubId}>
						<span class="t h">{getClub(g.home)?.short}<Crest clubId={g.home} size={26} /></span>
						<span class="x" class:score={!!r}>{r ? `${r.homeGoals} × ${r.awayGoals}` : g.time}</span>
						<span class="t a"><Crest clubId={g.away} size={26} />{getClub(g.away)?.short}</span>
					</li>
				{:else}
					<li class="none">Sem jogos desta divisão nesta rodada.</li>
				{/each}
			</ul>
		</Panel>
		{#if v.seasons.length}
			<Panel title="Suas temporadas" icon="star" index={2}>
				<ul class="seasons">
					{#each [...v.seasons].reverse() as s (s.season)}
						<li data-o={s.outcome}><b>{s.season}</b><span>{DIVISION_LABELS[s.division]}</span><span>{s.position}º · {s.points} pts</span><span class="o">{OUTCOME[s.outcome]}</span></li>
					{/each}
				</ul>
			</Panel>
		{/if}
		<a class="statslink" href="/carreira/{c.id}/estatisticas"><Icon name="chart" /> Estatísticas e artilharia do seu time</a>
		<Unavailable title="Copa do Brasil" detail="Mata-mata ainda não implementado" icon="trophy" />
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
	.games li.none {
		display: block;
		color: var(--text-3);
		font-weight: 500;
	}
	.x.score {
		color: var(--text);
		font-size: var(--fs-sm);
		font-weight: 800;
	}
	.groups {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-3);
		margin-top: var(--sp-3);
	}
	.seasons {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
		font-size: var(--fs-sm);
	}
	.seasons li {
		display: grid;
		grid-template-columns: 48px 1fr auto auto;
		gap: 8px;
	}
	.seasons li[data-o='campeao'] .o,
	.seasons li[data-o='acesso'] .o {
		color: var(--emerald-strong);
	}
	.seasons li[data-o='rebaixado'] .o {
		color: var(--danger);
	}
	.statslink {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		border-radius: 10px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		color: var(--text);
		text-decoration: none;
		font-weight: 600;
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
