<script lang="ts">
	import type { CareerScreenData } from '#lib/career/screen-data.ts';
	import { untrack } from 'svelte';
	import { ITALIAN_SECOND, ITALIAN_STAGE_NAMES } from '#lib/domain/italian-postseason.ts';
	import { SPAIN_RESERVES, SPAIN_SECOND } from '#lib/domain/world-league.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { formatShort } from '#lib/domain/dates.ts';
	import { activeDivisions, D_STAGE_NAMES, DIVISION_LABELS, dStageRounds, effectiveRule, groupStandings, phaseOneLength, phaseOneTables, resolveTie, italianPlayoffs, spanishPlayoffOutcome, type BrasilDivision, type DivisionId, type Tie, divisionLabel } from '#lib/domain/league.ts';
	import { computeStandings } from '#lib/domain/season.ts';
	import { strengthMemo } from '#lib/domain/world.ts';
	import { reveal } from '#lib/motion/actions.ts';
	import Crest from '#lib/ui/Crest.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import { careerPort } from '#lib/career/port.ts';
	import CompetitionNav from '#lib/ui/world/CompetitionNav.svelte';
	import TournamentScreen from './TournamentScreen.svelte';
	import ParticipationBadge from '#lib/ui/world/ParticipationBadge.svelte';
	import { nativeCompetitions } from '#lib/world/competitions.ts';

	let { data }: { data: CareerScreenData } = $props();
	const port = careerPort();
	const c = $derived(data.career);
	const v = $derived(data.view);
	const st = $derived(strengthMemo(data.manage.ctx));

	let selected = $state<string>(untrack(() => data.view.division));
	const divisions = $derived(activeDivisions(v.league));
	const div = $derived(divisions.find((id) => id === selected) ?? divisions[0] ?? v.division);
	const tournament = $derived(v.tournaments.find((tournament) => tournament.competition.id === selected));
	const brasil = $derived(v.world === 'brasil' && div !== 'liga-brasfc');
	const worldRule = $derived(v.world === 'mundo' ? v.league.rules?.[div] : undefined);
	const italian = $derived(String(div) === ITALIAN_SECOND ? italianPlayoffs(v.league, v.results) : null);
	const spanish = $derived(String(div) === SPAIN_SECOND && !!v.league.spanishPlayoff);
	const bPlayoffs = $derived(div === 'serie-b' && v.league.bPromotionPlayoff !== undefined);
	const competitions = $derived([...nativeCompetitions(v.league, !!v.cup), ...v.tournaments.map(({ competition }) => competition)]);
	const rule = $derived(brasil ? effectiveRule(v.league, div as BrasilDivision) : null);
	const p1 = $derived(div === 'liga-brasfc' ? 38 : phaseOneLength(v.league, div));
	const tables = $derived(phaseOneTables(v.league, div, v.results));
	const divResults = $derived(v.results.filter((r) => (r.competition ?? 'liga-brasfc') === div));
	const lastRound = $derived(Math.max(0, ...divResults.filter((r) => r.round <= p1).map((r) => r.round)));
	/** Posição na rodada anterior (setas de movimento). */
	const prevPos = $derived.by(() => {
		const map = new Map<string, number>();
		if (lastRound < 2) return map;
		const prev = divResults.filter((r) => r.round < lastRound);
		for (const g of tables) for (const r of computeStandings(g.map((x) => x.clubId), prev)) map.set(r.clubId, r.position);
		return map;
	});
	const zone = (pos: number, size: number, club: string): 'up' | 'qual' | 'down' | '' => {
		// World Database: só a zona de rebaixamento do regulamento (vagas europeias chegam com as continentais).
		if (worldRule) {
			if (italian) {
				if (pos >= 18) return 'down';
				if (pos >= 16) return italian.complete && !italian.playout ? (pos === 17 ? 'down' : '') : 'qual';
				if (pos <= 2 || (pos === 3 && italian.complete && !italian.promotion)) return 'up';
				return pos <= 8 && (!italian.complete || italian.promotion) ? 'qual' : '';
			}
			if (pos > size - worldRule.relegated) return 'down';
			if (!spanish || SPAIN_RESERVES.has(club)) return '';
			const place = tables[0]?.filter((row) => row.position <= pos && !SPAIN_RESERVES.has(row.clubId)).length ?? pos;
			return place <= 2 ? 'up' : place <= 6 ? 'qual' : '';
		}
		if (!rule) return pos <= 4 ? 'up' : pos > size - 4 ? 'down' : '';
		if (div === 'serie-d') return pos <= 4 ? 'qual' : '';
		if (div === 'serie-c') {
			const per = rule.phase2?.kind === 'quadrangulares' ? rule.phase2.qualifiers : 8;
			if (pos <= per) return 'qual';
			const down = rule.relegatedPerGroup ?? rule.relegated;
			return pos > size - down ? 'down' : '';
		}
		if (bPlayoffs && pos <= 6) return pos <= 2 ? 'up' : 'qual';
		if (pos <= rule.promoted) return 'up';
		return pos > size - rule.relegated ? 'down' : '';
	};
	const fixtures = $derived(v.fixtures.filter((f) => f.competition === div));
	const maxRound = $derived(Math.max(1, ...fixtures.map((f) => f.round)));
	let round = $state(untrack(() => Math.max(1, data.view.nextRound)));
	const shown = $derived(Math.min(Math.max(1, round), maxRound));
	const games = $derived(fixtures.filter((f) => f.round === shown));
	const resultOf = (home: string, rd: number) => divResults.find((r) => r.round === rd && r.home === home);
	const quads = $derived(div === 'serie-c' ? groupStandings(v.league, v.results) : []);
	const dRounds = (k: number) => dStageRounds(v.league, k);
	const tieOut = (t: Tie, rounds: number[], byCampaign = false) => resolveTie(t, v.results, 'serie-d', rounds, c.seed, st, { byCampaign });
	const name = (id: string) => getClub(id)?.name ?? id;
	const ruleText = $derived(spanish ? '22 clubes em 42 rodadas. Dois clubes sobem direto, quatro disputam o playoff de acesso e quatro descem. Filiais ficam fora da disputa pelo acesso.' : italian ?
			'20 clubes em 38 rodadas. Dois acessos diretos e um pelo playoff se a diferença entre 3º e 4º for de até 14 pontos. A diferença entre 16º e 17º define o play-out.' : worldRule ? `${v.league.divisions[div]?.length ?? 0} clubes em ${worldRule.legs === 2 ? 'turno e returno' : 'turno único'} · ${worldRule.relegated} rebaixados · desempate por ${worldRule.tiebreak === 'confronto-direto' ? 'confronto direto' : 'saldo de gols'}. Inscritos 2026/27 conferidos em fonte oficial.` : bPlayoffs ? 'Dois clubes sobem direto. Do 3º ao 6º, os clubes disputam duas vagas nos playoffs. Quatro são rebaixados.'
		: !rule ? 'Liga fictícia: 20 clubes em turno e returno.' : `${rule.size} clubes · ${rule.status === 'oficial' ? 'regra oficial' : rule.status === 'anunciado' ? 'regra anunciada pela CBF' : 'regra projetada pelo BRASFC'}. ${rule.nota ?? ''}`);
</script>

<svelte:head><title>Competições · {v.club.name} · BRASFC</title></svelte:head>

<div class="head" use:reveal>
	<div>
		<span class="eyebrow">Temporada {v.world === 'mundo' ? `${c.season}/${String(c.season + 1).slice(2)}` : c.season}{v.world === 'brasil' && c.season > 2026 ? ' · projeção do BRASFC a partir da base 2026' : ''}</span>
		<h1 class="display">{tournament?.competition.name ?? divisionLabel(v.league, div)}</h1>
		{#if !tournament}<p class="muted rule">{ruleText}</p>{/if}
	</div>
	{#if competitions.length > 1}
		<CompetitionNav {competitions} active={tournament?.competition.id ?? div} onselect={(id) => (selected = id)} href={(comp) => (comp.id === 'copa-do-brasil' ? port.href('copa') : null)} />
	{/if}
</div>

{#if tournament}
	<TournamentScreen {tournament} results={v.results} clubId={c.clubId} />
{:else}
{#each v.continentalParticipation as entry (entry.competition)}
	<p class="muted" use:reveal>{entry.competition === 'continental/libertadores' ? 'Libertadores' : 'Sul-Americana'} <ParticipationBadge participation={entry} /> · Calendário pendente</p>
{/each}

{#if tables.length === 1}
	{@const t = tables[0]}
	<div class="layout">
		<section class="glass table" use:reveal>
			<table>
				<thead><tr><th></th><th>#</th><th>Clube</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th><th class="pts">Pts</th></tr></thead>
				<tbody>
					{#each t as r (r.clubId)}
						{@const z = zone(r.position, t.length, r.clubId)}
						{@const prev = prevPos.get(r.clubId)}
						<tr class:me={r.clubId === c.clubId} data-z={z}>
							<td class="mv">{#if prev && prev > r.position}<span class="upa">▲</span>{:else if prev && prev < r.position}<span class="dna">▼</span>{/if}</td>
							<td class="num">{r.position}</td>
							<td><span class="club"><Crest clubId={r.clubId} size={22} /><span>{name(r.clubId)}</span>{#if r.clubId === c.clubId}<span class="you">Você</span>{/if}</span></td>
							<td class="num">{r.played}</td><td class="num">{r.won}</td><td class="num">{r.drawn}</td><td class="num">{r.lost}</td><td class="num">{r.goalDiff > 0 ? '+' : ''}{r.goalDiff}</td><td class="num pts">{r.points}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<div class="legend">
				{#if rule && rule.promoted && div !== 'serie-c'}<span><i data-z="up"></i>Acesso</span>{/if}
				{#if spanish || italian}<span><i data-z="up"></i>Acesso direto</span>{/if}
				{#if italian}<span><i data-z="qual"></i>Playoff e play-out</span>{/if}
				{#if bPlayoffs || spanish}<span><i data-z="qual"></i>Playoff de acesso</span>{/if}
				{#if div === 'serie-c'}<span><i data-z="qual"></i>2ª fase (quadrangulares)</span>{/if}
				{#if !rule}<span><i data-z="up"></i>Topo</span>{/if}
				<span><i data-z="down"></i>Rebaixamento</span>
			</div>
		</section>
		<section class="rounds glass" use:reveal={{ index: 1 }}>
			<div class="spread">
				<button class="nav" onclick={() => (round = shown - 1)} disabled={shown <= 1} aria-label="Rodada anterior"><Icon name="chevronLeft" /></button>
				<h2 class="display">Rodada {shown}</h2>
				<button class="nav" onclick={() => (round = shown + 1)} disabled={shown >= maxRound} aria-label="Próxima rodada"><Icon name="chevronRight" /></button>
			</div>
			<div class="games">
				{#each games as f (f.home)}
					{@const r = resultOf(f.home, f.round)}
					<div class="game" class:me={f.home === c.clubId || f.away === c.clubId}>
						<span class="t h">{getClub(f.home)?.short}<Crest clubId={f.home} size={20} /></span>
						<span class="sc">{r ? `${r.homeGoals} × ${r.awayGoals}` : formatShort(f.date)}</span>
						<span class="t a"><Crest clubId={f.away} size={20} />{getClub(f.away)?.short}</span>
					</div>
				{:else}
					<p class="muted">Sem jogos nesta rodada{shown > p1 ? ' (fase final ainda não definida)' : ''}.</p>
				{/each}
			</div>
		</section>
	</div>
{:else}
	<h2 class="display section">1ª fase · {tables.length} grupos</h2>
	<div class="groups">
		{#each tables as t, gi (gi)}
			<section class="glass group" class:mine={t.some((r) => r.clubId === c.clubId)} use:reveal={{ index: gi % 8 }}>
				<h3>Grupo {div === 'serie-d' ? `A${gi + 1}` : gi + 1}</h3>
				{#each t as r (r.clubId)}
					<div class="grow" data-z={zone(r.position, t.length, r.clubId)} class:me={r.clubId === c.clubId}>
						<span class="num">{r.position}</span><Crest clubId={r.clubId} size={18} /><span class="nm">{name(r.clubId)}</span><b>{r.points}</b>
					</div>
				{/each}
			</section>
		{/each}
	</div>
{/if}

{#if italian?.series.length}
	<h2 class="display section">Playoff e play-out</h2>
	<div class="quads">
		{#each italian.series as series (series.days[0] + ':' + series.tie.join(':'))}
			<section class="glass group">
				<h3>{ITALIAN_STAGE_NAMES[series.stage]}</h3>
				{#each series.tie as id, i (id)}
					<div class="grow" class:win={series.outcome?.winner === id}><span></span><Crest clubId={id} size={18} /><span class="nm">{name(id)}</span><b>{series.outcome?.aggregate[i] ?? ''}</b></div>
				{/each}
				{#if series.outcome?.penalties}<small class="muted">Decisão nos pênaltis · {series.outcome.penalties.home}–{series.outcome.penalties.away}</small>{/if}
				{#if series.outcome?.decidedBy === 'prorrogacao'}<small class="muted">Decisão na prorrogação</small>{/if}
				{#if series.outcome?.decidedBy === 'campanha'}<small class="muted">Melhor campanha</small>{/if}
			</section>
		{/each}
	</div>
{/if}

{#if spanish && v.league.spanishPlayoff?.length}
	<h2 class="display section">Playoff de acesso</h2>
	<div class="quads">
		{#each v.league.spanishPlayoff as ties, i (i)}
			<section class="glass group">
				<h3>{i === 0 ? 'Semifinal' : 'Final'}</h3>
				{#each ties as tie (tie[0])}
					{@const outcome = spanishPlayoffOutcome(v.league, tie, p1 + (i + 1) * 2, v.results)}
					<div class="tie">
						{#each tie as id, j (id)}<div class="tm" class:win={outcome?.winner === id}><Crest clubId={id} size={18} /><span>{name(id)}</span><b>{outcome?.aggregate[j] ?? ''}</b></div>{/each}
						{#if outcome?.decidedBy === 'campanha'}<small class="muted">Melhor campanha após a prorrogação</small>{/if}
						{#if outcome?.decidedBy === 'prorrogacao'}<small class="muted">Decisão na prorrogação</small>{/if}
					</div>
				{/each}
			</section>
		{/each}
	</div>
{/if}

{#if div === 'serie-c' && quads.length}
	<h2 class="display section">Quadrangulares{v.league.cFinal ? ' e final' : ''}</h2>
	<div class="quads">
		{#each quads as q, qi (qi)}
			<section class="glass group" use:reveal={{ index: qi }}>
				<h3>Grupo {qi + 1} · dois primeiros sobem</h3>
				{#each q as r (r.clubId)}
					<div class="grow" data-z={r.position <= 2 ? 'up' : ''} class:me={r.clubId === c.clubId}><span class="num">{r.position}</span><Crest clubId={r.clubId} size={18} /><span class="nm">{name(r.clubId)}</span><b>{r.points}</b></div>
				{/each}
			</section>
		{/each}
		{#if v.league.cFinal}
			{@const f = v.league.cFinal}
			{@const out = resolveTie(f, v.results, 'serie-c', [p1 + 7, p1 + 8], c.seed, st)}
			<section class="glass gold final">
				<h3>Final (ida e volta)</h3>
				{#each f as id, s (id)}<div class="grow" class:win={out?.winner === id}><span></span><Crest clubId={id} size={22} /><span class="nm">{name(id)}</span><b>{out ? out.aggregate[s] : ''}</b></div>{/each}
				{#if out?.penalties}<small class="pens">pênaltis {out.penalties.home}–{out.penalties.away}</small>{/if}
			</section>
		{/if}
	</div>
{/if}

{#if div === 'serie-d' && v.league.dBracket}
	{@const br = v.league.dBracket}
	<h2 class="display section">Mata-mata · sobem os semifinalistas e os vencedores dos playoffs</h2>
	<div class="bracket">
		{#each br.stages as ties, k (k)}
			<section class="col">
				<h3>{D_STAGE_NAMES[k]}</h3>
				{#each ties as t (t.join('-'))}
					{@const o = tieOut(t, dRounds(k))}
					<div class="tie glass" class:me={t.includes(c.clubId)}>
						{#each t as id, s (id)}<div class="tm" class:win={o?.winner === id} class:out={o && o.winner !== id}><Crest clubId={id} size={18} /><span>{getClub(id)?.short}</span><b>{o ? o.aggregate[s] : ''}</b></div>{/each}
						{#if o?.penalties}<small class="pens">pên. {o.penalties.home}–{o.penalties.away}</small>{/if}
					</div>
				{/each}
			</section>
		{/each}
		{#if br.playoff}
			<section class="col">
				<h3>Playoffs de acesso</h3>
				{#each br.playoff as t (t.join('-'))}
					{@const o = tieOut(t, dRounds(4), true)}
					<div class="tie glass gold">{#each t as id, s (id)}<div class="tm" class:win={o?.winner === id}><Crest clubId={id} size={18} /><span>{getClub(id)?.short}</span><b>{o ? o.aggregate[s] : ''}</b></div>{/each}</div>
				{/each}
			</section>
		{/if}
	</div>
{/if}

{/if}

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: var(--sp-4);
		flex-wrap: wrap;
		margin-bottom: var(--sp-4);
	}
	h1 {
		font-size: var(--fs-3xl);
		margin: 4px 0;
	}
	.rule {
		max-width: 80ch;
		margin: 0;
	}
	.layout {
		display: grid;
		grid-template-columns: 1.4fr 1fr;
		gap: var(--sp-4);
		align-items: start;
	}
	.table {
		padding: var(--sp-3);
		overflow: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--fs-sm);
	}
	th {
		text-align: left;
		color: var(--text-3);
		font-size: 11px;
		letter-spacing: 0.1em;
		padding: 8px 6px;
	}
	td {
		padding: 7px 6px;
		border-top: 1px solid var(--line);
	}
	tr[data-z='up'] td:nth-child(2) {
		box-shadow: inset 3px 0 0 var(--emerald);
	}
	tr[data-z='qual'] td:nth-child(2) {
		box-shadow: inset 3px 0 0 var(--gold);
	}
	tr[data-z='down'] td:nth-child(2) {
		box-shadow: inset 3px 0 0 var(--danger);
	}
	tr.me {
		background: linear-gradient(90deg, rgb(16 185 129 / 0.14), transparent);
	}
	.mv {
		width: 16px;
		font-size: 11px;
	}
	.upa {
		color: var(--emerald-strong);
	}
	.dna {
		color: var(--danger);
	}
	.club {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.you {
		font-size: 11px;
		font-weight: 800;
		padding: 2px 6px;
		border-radius: 6px;
		background: var(--emerald-soft);
		color: var(--emerald-strong);
	}
	.pts {
		font-weight: 800;
		text-align: right;
	}
	.legend {
		display: flex;
		gap: var(--sp-4);
		padding: var(--sp-3) var(--sp-2) 0;
		font-size: var(--fs-xs);
		color: var(--text-2);
	}
	.legend i {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 3px;
		margin-right: 6px;
		vertical-align: -1px;
	}
	i[data-z='up'] {
		background: var(--emerald);
	}
	i[data-z='qual'] {
		background: var(--gold);
	}
	i[data-z='down'] {
		background: var(--danger);
	}
	.rounds {
		padding: var(--sp-4);
		display: grid;
		gap: var(--sp-3);
	}
	.rounds h2 {
		margin: 0;
		font-size: var(--fs-xl);
	}
	.nav {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: 1px solid var(--line-strong);
		background: none;
		color: var(--text);
		display: grid;
		place-items: center;
		cursor: pointer;
	}
	.nav:disabled {
		opacity: 0.3;
	}
	.games {
		display: grid;
		gap: 6px;
	}
	.game {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		gap: 10px;
		align-items: center;
		padding: 8px 10px;
		border-radius: var(--radius-m);
		background: rgb(10 13 16 / 0.4);
		font-size: var(--fs-sm);
	}
	.game.me {
		box-shadow: inset 0 0 0 1px var(--emerald-line);
	}
	.t {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-weight: 600;
	}
	.t.h {
		justify-content: flex-end;
	}
	.sc {
		font-family: var(--font-display);
		font-weight: 800;
		min-width: 64px;
		text-align: center;
	}
	.section {
		margin: var(--sp-6) 0 var(--sp-3);
		font-size: var(--fs-xl);
	}
	.groups {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
		gap: var(--sp-3);
	}
	.quads {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: var(--sp-3);
	}
	.group {
		padding: var(--sp-3);
		display: grid;
		gap: 3px;
		align-content: start;
	}
	.group.mine {
		box-shadow: 0 0 0 1px var(--emerald-line);
	}
	.group h3,
	.col h3,
	.final h3 {
		margin: 0 0 6px;
		font-size: 11px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.grow {
		display: grid;
		grid-template-columns: 18px 20px 1fr auto;
		gap: 6px;
		align-items: center;
		font-size: var(--fs-xs);
		padding: 4px 6px;
		border-radius: 6px;
	}
	.grow[data-z='qual'],
	.grow[data-z='up'] {
		background: rgb(16 185 129 / 0.08);
	}
	.grow.me {
		box-shadow: inset 0 0 0 1px var(--emerald-line);
	}
	.grow.win {
		font-weight: 800;
		color: var(--gold);
	}
	.nm {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.final {
		padding: var(--sp-4);
	}
	.pens {
		color: var(--gold);
		font-size: 11px;
	}
	.bracket {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(160px, 1fr);
		gap: var(--sp-3);
		overflow-x: auto;
		padding-bottom: var(--sp-3);
	}
	.col {
		display: grid;
		gap: 6px;
		align-content: start;
	}
	.tie {
		padding: 6px 8px;
		display: grid;
		gap: 2px;
	}
	.tie.me {
		box-shadow: 0 0 0 1px var(--gold);
	}
	.tm {
		display: grid;
		grid-template-columns: 18px 1fr auto;
		gap: 6px;
		align-items: center;
		font-size: var(--fs-xs);
	}
	.tm.win {
		font-weight: 800;
	}
	.tm.out {
		opacity: 0.45;
	}
	@media (max-width: 1000px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}
</style>
