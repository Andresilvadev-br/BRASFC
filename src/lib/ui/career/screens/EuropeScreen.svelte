<script lang="ts">
	import type { CareerScreenData } from '#lib/career/screen-data.ts';
	import { untrack } from 'svelte';
	import { getClub } from '#lib/domain/clubs.ts';
	import { formatDayMonth } from '#lib/domain/dates.ts';
	import { EUROPE_PRIZES, KO_STAGES, LEAGUE_MATCHDAYS, europeDate, europeFixtures, europeView, type EuropeCompId } from '#lib/domain/europe.ts';
	import { formatMoney } from '#lib/domain/market.ts';
	import { strengthMemo } from '#lib/domain/world.ts';
	import { reveal } from '#lib/motion/actions.ts';
	import Crest from '#lib/ui/Crest.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Trophy from '#lib/ui/v4/Trophy.svelte';
	import ParticipationBadge from '#lib/ui/world/ParticipationBadge.svelte';

	/** Champions League e Europa League: fase de liga (tabela única de 36), playoff e mata-mata até a final. */
	let { data }: { data: CareerScreenData } = $props();
	const c = $derived(data.career);
	const v = $derived(data.view);
	const europe = $derived(v.europe);
	const views = $derived(europe ? europeView(europe, v.results, c.seed, strengthMemo(data.manage.ctx)) : []);
	const inComp = (id: string) => v.europeParticipation.find((p) => p.competition === id);
	let selected = $state<EuropeCompId>(untrack(() => (data.view.europeParticipation[0]?.competition as EuropeCompId | undefined) ?? 'continental/ucl'));
	const comp = $derived(views.find((x) => x.id === selected) ?? views[0]);
	/** 0 = fase de liga; 1–5 = playoff, oitavas, quartas, semifinal, final */
	let phase = $state(untrack(() => {
		const first = views.find((x) => x.id === selected) ?? views[0];
		return first ? first.stages.findLastIndex((s) => s.ties.length > 0) + 1 : 0;
	}));
	const fixtures = $derived(europe ? europeFixtures(europe).filter((f) => f.competition === comp?.id && f.round <= LEAGUE_MATCHDAYS) : []);
	const played = $derived(comp ? Math.max(0, ...v.results.filter((r) => r.competition === comp.id && r.round <= LEAGUE_MATCHDAYS).map((r) => r.round)) : 0);
	let matchday = $state(untrack(() => 0));
	const shownMd = $derived(Math.min(LEAGUE_MATCHDAYS, Math.max(1, matchday || played || 1)));
	const games = $derived(fixtures.filter((f) => f.round === shownMd));
	const resultOf = (home: string, md: number) => v.results.find((r) => r.competition === comp?.id && r.round === md && r.home === home);
	const mine = (t: readonly string[]) => t.includes(c.clubId);
	const name = (id: string) => getClub(id)?.name ?? id;
	const zone = (pos: number) => (pos <= 8 ? 'up' : pos <= 24 ? 'qual' : 'down');
	const prizes = $derived(comp ? EUROPE_PRIZES[comp.id] : null);
	const sum = (t: { legs: Array<{ home: string; homeGoals: number; awayGoals: number } | null> }, id: string) => t.legs.reduce((acc, l) => acc + (l ? (l.home === id ? l.homeGoals : l.awayGoals) : 0), 0);
	function pick(id: EuropeCompId) {
		selected = id;
		const next = views.find((x) => x.id === id);
		phase = next ? next.stages.findLastIndex((s) => s.ties.length > 0) + 1 : 0;
		matchday = 0;
	}
</script>

<svelte:head><title>Copas europeias · BRASFC</title></svelte:head>

{#if !europe || !comp}
	<section class="glass pad empty">
		<h1 class="display">Copas europeias</h1>
		<p class="muted">Esta temporada não tem Champions League nem Europa League. Elas existem nas carreiras do mundo europeu criadas a partir da versão 0.15; carreiras anteriores seguem só com a liga.</p>
	</section>
{:else}
	<section class="hero glass" class:uel={comp.id === 'continental/uel'} use:reveal>
		<div>
			<span class="eyebrow-gold">{europe.season}/{String(europe.season + 1).slice(2)} · {comp.edition === 'oficial' ? 'participantes reais da edição' : 'edição projetada pelo BRASFC'}</span>
			<h1 class="display">{comp.name}</h1>
			<p class="muted">36 clubes numa fase de liga: 8 jogos contra adversários diferentes (dois de cada pote, 4 em casa e 4 fora). Do 1º ao 8º vão às oitavas, do 9º ao 24º disputam o playoff. Mata-mata em ida e volta; final única em campo neutro.</p>
		</div>
		<div class="run">
			<div class="tabs" role="tablist" aria-label="Competição">
				{#each views as x (x.id)}
					<button role="tab" aria-selected={x.id === comp.id} onclick={() => pick(x.id)}>{x.name}{#if inComp(x.id)}<i class="dot" aria-label="seu clube disputa"></i>{/if}</button>
				{/each}
			</div>
			{#if inComp(comp.id)}<ParticipationBadge participation={inComp(comp.id)!} />{:else}<span class="muted small">Seu clube não disputa esta copa nesta temporada.</span>{/if}
		</div>
	</section>

	<nav class="phases" aria-label="Fases">
		<button class="ph" aria-current={phase === 0 ? 'step' : undefined} class:done={comp.leagueDone} onclick={() => (phase = 0)}>
			<span>Fase de liga</span><small>{formatDayMonth(europeDate(comp.id, europe.season, 1))} a {formatDayMonth(europeDate(comp.id, europe.season, LEAGUE_MATCHDAYS))}</small>
		</button>
		{#each KO_STAGES as s, i (s.name)}
			<button class="ph" aria-current={phase === i + 1 ? 'step' : undefined} class:done={comp.stages[i].ties.length > 0 && comp.stages[i].ties.every((t) => t.outcome)} onclick={() => (phase = i + 1)} disabled={!comp.stages[i].ties.length}>
				<span>{s.name}</span><small>{formatDayMonth(europeDate(comp.id, europe.season, s.matchdays[0]))}{s.matchdays.length === 2 ? ' · ida e volta' : ''}</small>
			</button>
		{/each}
	</nav>

	{#if phase === 0}
		<div class="layout">
			<section class="glass table" use:reveal>
				<table>
					<thead><tr><th>#</th><th>Clube</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th><th class="pts">Pts</th></tr></thead>
					<tbody>
						{#each comp.table as r (r.clubId)}
							<tr class:me={r.clubId === c.clubId} data-z={zone(r.position)}>
								<td class="num">{r.position}</td>
								<td><span class="club"><Crest clubId={r.clubId} size={20} /><span>{name(r.clubId)}</span>
									{#if comp.substitutes[r.clubId]}<span class="sub" title="Vaga de {comp.substitutes[r.clubId]}, clube que não existe no banco do Brasfoot Next">vaga do {comp.substitutes[r.clubId]}</span>{/if}
									{#if r.clubId === c.clubId}<span class="you">Você</span>{/if}</span></td>
								<td class="num">{r.played}</td><td class="num">{r.won}</td><td class="num">{r.drawn}</td><td class="num">{r.lost}</td><td class="num">{r.goalDiff > 0 ? '+' : ''}{r.goalDiff}</td><td class="num pts">{r.points}</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<div class="legend">
					<span><i data-z="up"></i>Oitavas de final</span><span><i data-z="qual"></i>Playoff</span><span><i data-z="down"></i>Eliminado</span>
				</div>
			</section>
			<section class="rounds glass" use:reveal={{ index: 1 }}>
				<div class="spread">
					<button class="nav" onclick={() => (matchday = shownMd - 1)} disabled={shownMd <= 1} aria-label="Rodada anterior"><Icon name="chevronLeft" /></button>
					<h2 class="display">{shownMd}ª rodada</h2>
					<button class="nav" onclick={() => (matchday = shownMd + 1)} disabled={shownMd >= LEAGUE_MATCHDAYS} aria-label="Próxima rodada"><Icon name="chevronRight" /></button>
				</div>
				<p class="muted small center">{formatDayMonth(europeDate(comp.id, europe.season, shownMd))}</p>
				<ul class="games">
					{#each [...games].sort((a, b) => Number(mine([b.home, b.away])) - Number(mine([a.home, a.away]))) as g (g.home)}
						{@const r = resultOf(g.home, shownMd)}
						<li class:me={mine([g.home, g.away])}>
							<span class="t home"><span>{getClub(g.home)?.short ?? g.home}</span><Crest clubId={g.home} size={18} /></span>
							<b class="sc">{r ? `${r.homeGoals} × ${r.awayGoals}` : '×'}</b>
							<span class="t"><Crest clubId={g.away} size={18} /><span>{getClub(g.away)?.short ?? g.away}</span></span>
						</li>
					{/each}
				</ul>
			</section>
		</div>
	{:else if phase === 5}
		{@const f = comp.stages[4].ties[0]}
		<section class="final glass" use:reveal>
			<span class="eyebrow-gold">Final · {formatDayMonth(europeDate(comp.id, europe.season, 17))} · campo neutro</span>
			{#if f}
				<div class="duel">
					<div class="side" class:win={f.outcome?.winner === f.tie[0]}><Crest clubId={f.tie[0]} size={88} /><strong>{name(f.tie[0])}</strong></div>
					<div class="score display">
						{#if f.legs[0]}{f.legs[0].homeGoals}<span>×</span>{f.legs[0].awayGoals}{:else}<span class="vs">×</span>{/if}
						{#if f.outcome?.penalties}<small>pênaltis {f.outcome.penalties.home}–{f.outcome.penalties.away}</small>{/if}
					</div>
					<div class="side" class:win={f.outcome?.winner === f.tie[1]}><Crest clubId={f.tie[1]} size={88} /><strong>{name(f.tie[1])}</strong></div>
				</div>
			{/if}
			<Trophy kind="taca" size={120} muted={!comp.champion} label="Troféu (representação genérica)" />
			{#if comp.champion}<h2 class="display champ"><span class="shimmer-gold">{name(comp.champion)} campeão!</span></h2>{/if}
		</section>
	{:else}
		{@const s = comp.stages[phase - 1]}
		<div class="spread phase-head">
			<h2 class="display">{s.name}</h2>
			<span class="muted">{s.ties.length} confrontos · ida e volta · o mais bem colocado na fase de liga decide em casa{prizes ? ` · premiação ${formatMoney(prizes.stages[phase - 1])} por clube` : ''}</span>
		</div>
		<div class="grid-auto" style="--min:230px;--gap:10px">
			{#each [...s.ties].sort((a, b) => Number(mine(b.tie)) - Number(mine(a.tie))) as t, i (t.tie.join('-'))}
				<article class="tie glass" class:me={mine(t.tie)} use:reveal={{ index: i % 12 }}>
					{#each [0, 1] as k (k)}
						{@const id = t.tie[k]}
						<div class="team" class:win={t.outcome?.winner === id} class:out={t.outcome && t.outcome.winner !== id}>
							<Crest clubId={id} size={22} /><span>{name(id)}</span><b>{t.legs.some((l) => l) ? sum(t, id) : ''}</b>
						</div>
					{/each}
					{#if t.outcome?.penalties}<small class="pens">pênaltis {t.outcome.penalties.home}–{t.outcome.penalties.away}</small>{/if}
				</article>
			{/each}
		</div>
	{/if}
	<p class="small muted foot"><Icon name="info" size={14} /> Participantes de 2026/27 conferidos na UEFA. Sorteio da fase de liga feito pelo BRASFC a partir dos potes reais (a UEFA usa software próprio). Datas no padrão UEFA: Champions às terças, Europa League às quintas. Premiação na escala de dinheiro do jogo (estimativa).{#if Object.keys(comp.substitutes).length} Clubes marcados com “vaga do…” substituem participantes que não existem no banco do Brasfoot Next.{/if}</p>
{/if}

<style>
	.pad { padding: var(--sp-5); }
	.hero { display: grid; grid-template-columns: 1.4fr 1fr; gap: var(--sp-5); padding: var(--sp-6); margin-bottom: var(--sp-4); background: radial-gradient(70% 120% at 100% 0%, rgb(96 165 250 / 0.16), transparent 60%), var(--glass); }
	.hero.uel { background: radial-gradient(70% 120% at 100% 0%, rgb(245 158 11 / 0.16), transparent 60%), var(--glass); }
	h1 { font-size: var(--fs-3xl); margin: 6px 0; }
	.run { align-self: center; display: grid; gap: 10px; justify-items: start; }
	.tabs { display: flex; flex-wrap: wrap; gap: 6px; }
	.tabs button { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text-2); font: inherit; font-weight: 700; cursor: pointer; }
	.tabs button[aria-selected='true'] { background: var(--emerald-soft); border-color: var(--emerald-line); color: var(--text); }
	.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--gold); }
	.small { font-size: var(--fs-xs); }
	.center { text-align: center; margin: 0 0 var(--sp-2); }
	.phases { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 6px; margin-bottom: var(--sp-4); }
	.ph { flex: none; display: grid; gap: 2px; padding: 10px 14px; border-radius: var(--radius-m); border: 1px solid var(--line); background: rgb(231 237 240 / 0.03); color: var(--text-2); cursor: pointer; text-align: left; font: inherit; }
	.ph span { font-weight: 700; }
	.ph small { font-size: 11px; color: var(--text-3); }
	.ph.done { border-color: rgb(16 185 129 / 0.3); }
	.ph[aria-current='step'] { background: var(--emerald-soft); border-color: var(--emerald-line); color: var(--text); }
	.ph:disabled { opacity: 0.4; cursor: default; }
	.layout { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: var(--sp-4); align-items: start; }
	.table { padding: var(--sp-3); overflow-x: auto; }
	table { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
	th { text-align: left; font-size: 11px; color: var(--text-3); font-weight: 600; padding: 6px; }
	td { padding: 5px 6px; border-top: 1px solid var(--line); }
	.num { text-align: right; font-variant-numeric: tabular-nums; width: 2.4em; }
	.pts { font-weight: 800; }
	tr[data-z='up'] td:first-child { box-shadow: inset 3px 0 0 #46df93; }
	tr[data-z='qual'] td:first-child { box-shadow: inset 3px 0 0 #f5c451; }
	tr[data-z='down'] td:first-child { box-shadow: inset 3px 0 0 rgb(248 113 113 / 0.6); }
	tr.me td { background: var(--emerald-soft); }
	.club { display: flex; align-items: center; gap: 8px; min-width: 0; }
	.club > span:not(.sub):not(.you) { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.sub { font-size: 10px; padding: 1px 6px; border-radius: 99px; border: 1px dashed var(--line-strong); color: var(--text-3); white-space: nowrap; }
	.you { font-size: 10px; padding: 1px 6px; border-radius: 99px; background: var(--gold); color: #111; font-weight: 800; }
	.legend { display: flex; flex-wrap: wrap; gap: 12px; padding: 8px 6px 2px; font-size: 11px; color: var(--text-3); }
	.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
	.legend i[data-z='up'] { background: #46df93; }
	.legend i[data-z='qual'] { background: #f5c451; }
	.legend i[data-z='down'] { background: rgb(248 113 113 / 0.6); }
	.rounds { padding: var(--sp-4); }
	.rounds h2 { margin: 0; font-size: var(--fs-xl); }
	.nav { border: 1px solid var(--line); background: var(--surface-2); color: var(--text); border-radius: 999px; width: 34px; height: 34px; display: grid; place-items: center; cursor: pointer; }
	.nav:disabled { opacity: 0.3; cursor: default; }
	.games { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
	.games li { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center; padding: 5px 6px; border-radius: var(--radius-s); font-size: var(--fs-sm); }
	.games li.me { background: var(--emerald-soft); }
	.t { display: flex; align-items: center; gap: 6px; min-width: 0; }
	.t span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.t.home { justify-content: flex-end; }
	.sc { font-variant-numeric: tabular-nums; min-width: 3.2em; text-align: center; }
	.phase-head { margin-bottom: var(--sp-3); gap: var(--sp-3); flex-wrap: wrap; }
	.phase-head h2 { margin: 0; font-size: var(--fs-2xl); }
	.tie { padding: 10px 12px; display: grid; gap: 6px; }
	.tie.me { box-shadow: 0 0 0 1.5px var(--gold), var(--glow-gold); }
	.team { display: grid; grid-template-columns: 22px 1fr auto; gap: 8px; align-items: center; font-size: var(--fs-sm); }
	.team span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.team b { font-variant-numeric: tabular-nums; }
	.team.win { font-weight: 800; color: var(--text); }
	.team.out { opacity: 0.45; }
	.pens { color: var(--gold); font-size: 11px; }
	.final { padding: var(--sp-7) var(--sp-6); display: grid; justify-items: center; text-align: center; gap: var(--sp-3); background: radial-gradient(60% 80% at 50% 0%, rgb(232 184 106 / 0.22), transparent 70%), var(--glass); }
	.duel { display: grid; grid-template-columns: 1fr auto 1fr; gap: var(--sp-6); align-items: center; width: min(760px, 100%); }
	.side { display: grid; justify-items: center; gap: 8px; opacity: 0.85; }
	.side.win { opacity: 1; filter: drop-shadow(0 0 22px rgb(232 184 106 / 0.45)); }
	.side strong { font-family: var(--font-display); font-size: var(--fs-xl); text-transform: uppercase; }
	.score { font-size: clamp(3rem, 7vw, 5rem); font-weight: 800; display: grid; justify-items: center; }
	.score span { color: var(--text-3); margin: 0 0.2em; }
	.score small { font-size: var(--fs-sm); color: var(--gold); font-family: var(--font-ui); text-transform: none; }
	.champ { font-size: var(--fs-3xl); margin: 0; }
	.foot { margin-top: var(--sp-5); display: flex; align-items: flex-start; gap: 6px; }
	.empty h1 { margin-top: 0; }
	@media (max-width: 900px) {
		.hero, .layout { grid-template-columns: minmax(0, 1fr); }
		.duel { gap: var(--sp-3); }
	}
</style>
