<script lang="ts">
	import Walkout from '#lib/ui/v4/Walkout.svelte';
	import { beforeNavigate, invalidate } from '$app/navigation';
	import { ApiError, api } from '#lib/api.ts';
	import type { Career } from '#lib/domain/career.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { formatLong } from '#lib/domain/dates.ts';
	import { DIVISION_LABELS, type DivisionId, type SeasonSummary } from '#lib/domain/league.ts';
	import { CAREER_PLAYER_ID, fixtureSetup, type MatchdayContext, type MatchSummary } from '#lib/domain/matchday.ts';
	import { MASTERY_LABEL } from '#lib/domain/tactical.ts';
	import { MENTALITY_LABELS, STYLE_LABELS } from '#lib/domain/tactics.ts';
	import type { MatchResult } from '#lib/engine/types.ts';
	import { notify, setIslandContext } from '#lib/stores/island.svelte.ts';
	import { markClean, markDirty } from '#lib/stores/unsaved.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Crest from '#lib/ui/Crest.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import MatchCenter from '#lib/ui/match/MatchCenter.svelte';
	import Meter from '#lib/ui/Meter.svelte';

	let { data } = $props();
	const c = $derived(data.career);
	const v = $derived(data.view);
	const base = $derived(`/carreira/${c.id}`);
	$effect(() => setIslandContext('Dia de jogo'));

	type Stage = 'pre' | 'live' | 'saving' | 'saved' | 'error';
	type RoundResponse = {
		career: Career;
		round: number;
		match: { homeGoals: number; awayGoals: number; summary: MatchSummary } | null;
		results: Array<{ home: string; away: string; homeGoals: number; awayGoals: number; competition: string }>;
	};
	let stage = $state<Stage>('pre');
	let errorMsg = $state('');
	let busy = $state(false);
	// A partida é montada uma vez, quando o usuário entra em campo (tática congelada).
	let setup = $state.raw<ReturnType<typeof fixtureSetup> | null>(null);
	let playedFixture = $state.raw<typeof v.next>(null);
	let local = $state.raw<MatchResult | null>(null);
	let saved = $state.raw<RoundResponse | null>(null);
	let seasonEnd = $state.raw<{ summary: SeasonSummary; moves: Array<{ clubId: string; from: DivisionId; to: DivisionId; reason: string }> } | null>(null);

	const ctx = $derived<MatchdayContext>({ season: c.season, firstSeason: v.firstSeason, tactical: v.tactical, fitness: c.data.fitness, observed: data.observed });
	const fixture = $derived(v.next);
	const preview = $derived(fixture ? fixtureSetup(c, fixture, v.tactic, ctx) : null);
	const myTeam = $derived(preview ? (preview.mySide === 'home' ? preview.home : preview.away) : null);
	const meInLineup = $derived.by(() => {
		if (c.mode !== 'player' || !myTeam) return null;
		const i = myTeam.tactic.lineup.indexOf(CAREER_PLAYER_ID);
		return i >= 0 ? 'titular' : myTeam.tactic.bench.includes(CAREER_PLAYER_ID) ? 'reserva' : 'fora';
	});

	let walkout = $state(false);
	function kickOff() {
		if (!fixture) return;
		walkout = true;
	}
	function startMatch() {
		walkout = false;
		if (!fixture) return;
		setup = fixtureSetup(c, fixture, v.tactic, ctx);
		playedFixture = fixture;
		stage = 'live';
		markDirty('partida', 'Partida em andamento (o resultado só vale quando for registrado)');
	}

	async function finished(result: MatchResult) {
		local = result;
		await save();
	}

	async function save() {
		stage = 'saving';
		try {
			const res = await api<RoundResponse>(`/api/careers/${c.id}/matches`, {
				body: { version: c.version, step: v.step?.key, decisions: local && setup ? local.decisions.filter((d) => d.side === setup!.control) : [] }
			});
			saved = res;
			stage = 'saved';
			markClean('partida');
			if (local && res.match && (res.match.homeGoals !== local.homeGoals || res.match.awayGoals !== local.awayGoals)) {
				notify({ icon: 'alert', tone: 'warning', title: 'Resultado conferido pelo servidor', detail: 'O placar oficial difere do exibido; vale o do servidor.' });
			} else notify({ icon: 'check', tone: 'success', title: 'Rodada registrada', detail: `Rodada ${res.round} salva na sua carreira.` });
		} catch (e) {
			stage = 'error';
			errorMsg = e instanceof ApiError ? e.message : 'Não foi possível registrar a rodada.';
		}
	}

	async function skipWeek() {
		busy = true;
		await save();
		busy = false;
	}

	async function closeSeason() {
		busy = true;
		try {
			const res = await api<{ summary: SeasonSummary; moves: Array<{ clubId: string; from: DivisionId; to: DivisionId; reason: string }> }>(`/api/careers/${c.id}/season`, { body: { version: c.version } });
			seasonEnd = res;
			notify({ icon: 'trophy', tone: 'gold', title: `Temporada ${res.summary.season} encerrada`, detail: `${res.summary.position}º lugar na ${DIVISION_LABELS[res.summary.division]}` });
		} catch (e) {
			notify({ icon: 'alert', tone: 'error', title: 'Não foi possível encerrar', detail: e instanceof ApiError ? e.message : 'Tente de novo.' });
		}
		busy = false;
	}

	async function next() {
		await invalidate('app:career');
		stage = 'pre';
		setup = null;
		saved = null;
		local = null;
		seasonEnd = null;
		playedFixture = null;
	}

	beforeNavigate((nav) => {
		if (stage === 'live' && !confirm('A partida está em andamento. Sair agora descarta este jogo (ele não será registrado). Sair mesmo assim?')) nav.cancel();
		else if (stage === 'live') markClean('partida');
	});

	const name = (id: string) => setup?.home.players.find((p) => p.id === id)?.shortName ?? setup?.away.players.find((p) => p.id === id)?.shortName ?? id;
	const OUTCOME: Record<string, string> = { campeao: 'Campeão!', acesso: 'Acesso garantido', rebaixado: 'Rebaixado', permanece: 'Permanência' };
	const myResults = $derived(saved ? saved.results.filter((r) => r.competition === v.division) : []);
	const otherCount = $derived(saved ? saved.results.length - myResults.length : 0);
</script>

{#if walkout && fixture}<Walkout home={fixture.home} away={fixture.away} label={fixture.competition === 'copa-do-brasil' ? `Copa do Brasil · ${fixture.phase ?? ''}` : `${DIVISION_LABELS[fixture.competition as DivisionId] ?? ''} · Rodada ${fixture.round}`} ondone={startMatch} />{/if}

<svelte:head><title>Dia de jogo · {v.club.name} · BRASFC</title></svelte:head>

{#if seasonEnd}
	<section class="card post" data-umx-enter>
		<Icon name="trophy" />
		<h1>Temporada {seasonEnd.summary.season} encerrada</h1>
		<p class="big">{seasonEnd.summary.position}º lugar · {seasonEnd.summary.points} pontos · {DIVISION_LABELS[seasonEnd.summary.division]}</p>
		<p class="outcome" data-o={seasonEnd.summary.outcome}>{OUTCOME[seasonEnd.summary.outcome]}</p>
		{#if seasonEnd.moves.length}
			<div class="moves">
				{#each seasonEnd.moves as m (m.clubId)}
					<span class:me={m.clubId === c.clubId} data-r={m.reason}><Crest clubId={m.clubId} size={22} /> {getClub(m.clubId)?.short} {m.reason === 'acesso' ? '↑' : '↓'} {DIVISION_LABELS[m.to]}</span>
				{/each}
			</div>
		{/if}
		<Button variant="primary" icon="arrowRight" onclick={next}>Começar a temporada {seasonEnd.summary.season + 1}</Button>
	</section>
{:else if v.seasonOver}
	<section class="card empty" data-umx-enter>
		<Icon name="trophy" />
		<h1>Todas as rodadas de {c.season} foram disputadas</h1>
		<p>Encerre a temporada para ver a classificação final, os acessos e os rebaixamentos.</p>
		<Button variant="primary" icon="check" loading={busy} onclick={closeSeason}>Encerrar temporada</Button>
	</section>
{:else if stage === 'pre' && !fixture}
	<section class="card empty" data-umx-enter>
		<Icon name="calendar" />
		<h1>{v.step?.kind === 'cup' ? 'Quarta de Copa do Brasil' : `Rodada ${v.nextRound}`}: seu time não joga</h1>
		<p>
			As outras partidas acontecem normalmente. Use a semana para treinar
			{#if v.upcoming}— o próximo jogo é em {formatLong(v.upcoming.date).toLowerCase()}{v.upcoming.competition === 'copa-do-brasil' ? ' (Copa do Brasil)' : ''}{/if}.
		</p>
		<div class="actions">
			<Button variant="primary" icon="arrowRight" loading={busy} onclick={skipWeek}>Avançar a semana</Button>
			<Button href="{base}/treinos" icon="training">Treinos</Button>
		</div>
	</section>
{:else if stage === 'pre' && fixture && preview}
	<section class="card pre" data-umx-enter>
		<span class="eyebrow">{fixture.competition === 'copa-do-brasil' ? `Copa do Brasil · ${fixture.phase ?? ''}` : `${DIVISION_LABELS[fixture.competition as DivisionId] ?? fixture.competition} · Rodada ${fixture.round}`} · {formatLong(fixture.date)} · {fixture.time}</span>
		<div class="vs">
			<div class="side"><Crest clubId={fixture.home} size={88} /><strong>{getClub(fixture.home)?.name}</strong></div>
			<span class="x">×</span>
			<div class="side"><Crest clubId={fixture.away} size={88} /><strong>{getClub(fixture.away)?.name}</strong></div>
		</div>
		<div class="intel">
			<div>
				<h3>Seu plano</h3>
				{#if c.mode === 'coach'}
					<p><strong>{v.tactic.formation}</strong> · {MENTALITY_LABELS[v.tactic.mentality]} · {STYLE_LABELS[v.tactic.style]}{#if !v.tacticSaved}<em> (padrão — ainda não salva)</em>{/if}</p>
				{:else}
					<p>
						{#if meInLineup === 'titular'}O técnico escalou você como <strong>titular</strong>.
						{:else if meInLineup === 'reserva'}Você começa no <strong>banco</strong> e pode entrar durante o jogo.
						{:else}Você não foi relacionado. Treine para ganhar espaço.{/if}
					</p>
				{/if}
				<div class="m"><span>Domínio tático</span><Meter value={Math.round(v.mastery.execution)} label="Domínio tático" /><b>{Math.round(v.mastery.execution)} · {MASTERY_LABEL(v.mastery.execution)}</b></div>
			</div>
			<div>
				<h3>Adversário</h3>
				<p>Técnico de perfil <strong>{preview.opponentCoach}</strong> (perfil de jogo; o técnico real ainda não está na base).</p>
				{#if preview.opponentPlan.length}
					{#each preview.opponentPlan as r (r)}<p class="warn"><Icon name="eye" /> {r}</p>{/each}
				{:else}
					<p class="muted">Sem ajustes específicos contra você — joga o próprio estilo.</p>
				{/if}
			</div>
		</div>
		<div class="actions">
			<Button variant="primary" size="lg" icon="whistle" onclick={kickOff}>Entrar em campo</Button>
			{#if c.mode === 'coach'}<Button href="{base}/taticas" icon="tactics">Ajustar tática</Button>{/if}
		</div>
	</section>
{:else}
	{#if stage === 'saving'}
		<p class="status"><Icon name="refresh" /> Registrando: o servidor confere a partida e simula a rodada nas outras séries…</p>
	{:else if stage === 'error'}
		<div class="status err"><Icon name="alert" /> {errorMsg} <Button size="sm" onclick={save}>Tentar de novo</Button></div>
	{:else if stage === 'saved' && saved}
		<section class="card post" aria-label="Rodada registrada">
			{#if saved.match && playedFixture}
				<div class="score">
					<Crest clubId={playedFixture.home} size={56} />
					<strong>{saved.match.homeGoals} × {saved.match.awayGoals}</strong>
					<Crest clubId={playedFixture.away} size={56} />
				</div>
				{#if saved.match.summary.goals.length}
					<ul class="goals">
						{#each saved.match.summary.goals as g (g.tick)}<li><span>{g.minute}</span> ⚽ {name(g.player)}{g.assist ? ` (assist. ${name(g.assist)})` : ''}</li>{/each}
					</ul>
				{/if}
				{#if saved.match.summary.me}
					{@const me = saved.match.summary.me}
					<p class="me">Sua atuação: nota <strong>{me.rating.toFixed(1)}</strong> · {me.minutes} min · {me.goals} gol(s) · {me.assists} assist. · {me.passesCompleted}/{me.passes} passes</p>
				{:else if c.mode === 'player'}
					<p class="me">Você não entrou em campo nesta partida.</p>
				{/if}
			{:else}
				<h2>Rodada {saved.round} disputada</h2>
			{/if}
			<div class="round">
				<h3>{v.divisionLabel} · rodada {saved.round}</h3>
				<ul>
					{#each myResults as r (r.home)}
						<li><span class="t">{getClub(r.home)?.short}</span><b>{r.homeGoals} × {r.awayGoals}</b><span class="t">{getClub(r.away)?.short}</span></li>
					{/each}
				</ul>
				{#if otherCount}<p class="muted">+ {otherCount} jogos nas outras séries.</p>{/if}
			</div>
			<div class="actions">
				<Button variant="primary" icon="arrowRight" onclick={next}>Continuar</Button>
				<Button href="{base}/competicoes" icon="trophy">Classificação</Button>
			</div>
		</section>
	{/if}
	{#if setup && stage !== 'pre'}
		<MatchCenter home={setup.home} away={setup.away} seed={setup.seed} control={setup.control} onfinish={finished} />
	{/if}
{/if}

<style>
	.card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		padding: 26px 16px;
		border-radius: 18px;
		background: linear-gradient(180deg, var(--surface-2), var(--surface));
		box-shadow: inset 0 0 0 1px var(--line);
		text-align: center;
		margin-bottom: 14px;
	}
	.card :global(> svg) {
		width: 36px;
		height: 36px;
		color: var(--gold);
	}
	.post {
		box-shadow: inset 0 0 0 1px var(--emerald-line);
	}
	h1 {
		font-family: var(--font-display);
		margin: 0;
	}
	.eyebrow {
		color: var(--gold);
		font-size: var(--fs-sm);
	}
	.vs {
		display: flex;
		align-items: center;
		gap: 28px;
	}
	.side {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		font-family: var(--font-display);
		font-size: var(--fs-xl);
	}
	.x {
		font-family: var(--font-display);
		font-size: var(--fs-3xl);
		color: var(--text-3);
	}
	.intel {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		width: min(860px, 100%);
		text-align: left;
	}
	.intel > div {
		padding: 12px 14px;
		border-radius: 12px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.intel h3 {
		margin: 0 0 6px;
		font-size: var(--fs-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-3);
	}
	.intel p {
		margin: 4px 0;
		font-size: var(--fs-sm);
	}
	.intel em {
		color: var(--warning);
		font-style: normal;
	}
	.warn {
		display: flex;
		gap: 6px;
		color: var(--gold);
	}
	.m {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 8px;
		align-items: center;
		font-size: var(--fs-xs);
		color: var(--text-3);
		margin-top: 8px;
	}
	.m b {
		color: var(--text);
	}
	.actions {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		justify-content: center;
	}
	.status {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		border-radius: 12px;
		background: var(--info-soft);
		margin: 0 0 12px;
	}
	.status.err {
		background: var(--danger-soft);
	}
	.score {
		display: flex;
		align-items: center;
		gap: 18px;
	}
	.score strong,
	.big {
		font-family: var(--font-display);
		font-size: var(--fs-3xl);
		margin: 0;
	}
	.big {
		font-size: var(--fs-xl);
	}
	.outcome {
		margin: 0;
		font-weight: 700;
		font-size: var(--fs-lg);
	}
	.outcome[data-o='campeao'],
	.outcome[data-o='acesso'] {
		color: var(--emerald-strong);
	}
	.outcome[data-o='rebaixado'] {
		color: var(--danger);
	}
	.moves {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		justify-content: center;
		max-width: 760px;
	}
	.moves span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 8px;
		border-radius: 999px;
		background: var(--surface);
		font-size: var(--fs-xs);
	}
	.moves span[data-r='acesso'] {
		color: var(--emerald-strong);
	}
	.moves span[data-r='rebaixamento'] {
		color: var(--danger);
	}
	.moves span.me {
		box-shadow: inset 0 0 0 1px var(--gold);
	}
	.goals {
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.goals span {
		color: var(--gold);
		margin-right: 6px;
	}
	.round {
		width: min(520px, 100%);
	}
	.round h3 {
		margin: 0 0 6px;
		font-size: var(--fs-sm);
		color: var(--text-3);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.round ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px 16px;
		font-size: var(--fs-sm);
	}
	.round li {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		gap: 8px;
	}
	.round .t:first-child {
		text-align: right;
	}
	.muted {
		color: var(--text-3);
	}
	.me {
		margin: 0;
	}
	@media (max-width: 640px) {
		.vs {
			gap: 12px;
		}
		.intel,
		.round ul {
			grid-template-columns: 1fr;
		}
	}
</style>
