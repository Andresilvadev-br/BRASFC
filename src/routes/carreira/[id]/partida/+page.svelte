<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { beforeNavigate } from '$app/navigation';
	import { ApiError, api } from '#lib/api.ts';
	import type { Career } from '#lib/domain/career.ts';
	import { getClub, LEAGUE } from '#lib/domain/clubs.ts';
	import { formatLong } from '#lib/domain/dates.ts';
	import { CAREER_PLAYER_ID, fixtureSetup, type MatchSummary } from '#lib/domain/matchday.ts';
	import type { MatchResult as RoundResult } from '#lib/domain/season.ts';
	import { MENTALITY_LABELS, STYLE_LABELS } from '#lib/domain/tactics.ts';
	import type { MatchResult } from '#lib/engine/types.ts';
	import { notify, setIslandContext } from '#lib/stores/island.svelte.ts';
	import { markClean, markDirty } from '#lib/stores/unsaved.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Crest from '#lib/ui/Crest.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import MatchCenter from '#lib/ui/match/MatchCenter.svelte';

	let { data } = $props();
	const c = $derived(data.career);
	const v = $derived(data.view);
	const base = $derived(`/carreira/${c.id}`);
	$effect(() => setIslandContext('Dia de jogo'));

	type Stage = 'pre' | 'live' | 'saving' | 'saved' | 'error';
	let stage = $state<Stage>('pre');
	let errorMsg = $state('');
	// A partida é montada uma vez, quando o usuário entra em campo (tática congelada).
	let setup = $state.raw<ReturnType<typeof fixtureSetup> | null>(null);
	let local = $state.raw<MatchResult | null>(null);
	let saved = $state.raw<{ match: { homeGoals: number; awayGoals: number; summary: MatchSummary }; round: RoundResult[] } | null>(null);

	const fixture = $derived(v.next);
	const opp = $derived(fixture ? getClub(fixture.home === c.clubId ? fixture.away : fixture.home) : undefined);
	const meInLineup = $derived.by(() => {
		if (c.mode !== 'player' || !fixture) return null;
		const s = fixtureSetup(c, fixture, v.tactic);
		const t = s.mySide === 'home' ? s.home : s.away;
		return t.tactic.lineup.includes(CAREER_PLAYER_ID) ? 'titular' : t.tactic.bench.includes(CAREER_PLAYER_ID) ? 'reserva' : 'fora';
	});

	function kickOff() {
		if (!fixture) return;
		setup = fixtureSetup(c, fixture, v.tactic);
		stage = 'live';
		markDirty('partida', 'Partida em andamento (o resultado só vale quando for registrado)');
	}

	async function finished(result: MatchResult) {
		local = result;
		await save();
	}

	async function save() {
		if (!fixture || !local || !setup) return;
		stage = 'saving';
		try {
			const res = await api<{ career: Career; match: { homeGoals: number; awayGoals: number; summary: MatchSummary }; round: RoundResult[] }>(
				`/api/careers/${c.id}/matches`,
				{ body: { version: c.version, round: fixture.round, decisions: local.decisions.filter((d) => d.side === setup!.control) } }
			);
			saved = res;
			stage = 'saved';
			markClean('partida');
			if (res.match.homeGoals !== local.homeGoals || res.match.awayGoals !== local.awayGoals) {
				notify({ icon: 'alert', tone: 'warning', title: 'Resultado conferido pelo servidor', detail: 'O placar oficial difere do exibido; vale o do servidor.' });
			} else {
				notify({ icon: 'check', tone: 'success', title: 'Resultado registrado', detail: `Rodada ${fixture.round} salva na sua carreira.` });
			}
		} catch (e) {
			stage = 'error';
			errorMsg = e instanceof ApiError ? e.message : 'Não foi possível registrar o resultado.';
		}
	}

	async function backToClub() {
		await invalidate('app:career');
		stage = 'pre';
		setup = null;
		saved = null;
		local = null;
	}

	beforeNavigate((nav) => {
		if (stage === 'live' && !confirm('A partida está em andamento. Sair agora descarta este jogo (ele não será registrado). Sair mesmo assim?')) nav.cancel();
		else if (stage === 'live') markClean('partida');
	});

	const name = (id: string) => setup?.home.players.find((p) => p.id === id)?.shortName ?? setup?.away.players.find((p) => p.id === id)?.shortName ?? id;
	const myStats = $derived(saved?.match.summary.me ?? null);
</script>

<svelte:head><title>Dia de jogo · {v.club.name} · BRASFC</title></svelte:head>

{#if !fixture}
	<section class="empty">
		<Icon name="trophy" />
		<h1>Temporada concluída</h1>
		<p>Todas as rodadas do {LEAGUE.name} foram disputadas. Confira a classificação final em Competições.</p>
		<Button variant="primary" href="{base}/competicoes">Ver classificação</Button>
	</section>
{:else if stage === 'pre' && opp}
	<section class="pre" data-umx-enter>
		<span class="eyebrow">{LEAGUE.name} · Rodada {fixture.round} · {formatLong(fixture.date)} · {fixture.time}</span>
		<div class="vs">
			<div class="side"><Crest clubId={fixture.home} size={96} /><strong>{getClub(fixture.home)?.name}</strong></div>
			<span class="x">×</span>
			<div class="side"><Crest clubId={fixture.away} size={96} /><strong>{getClub(fixture.away)?.name}</strong></div>
		</div>
		{#if c.mode === 'coach'}
			<p class="plan">
				Sua tática salva: <strong>{v.tactic.formation}</strong> · {MENTALITY_LABELS[v.tactic.mentality]} · {STYLE_LABELS[v.tactic.style]}
				{#if !v.tacticSaved}<em>(padrão — ainda não salva)</em>{/if}
			</p>
			<p class="hint">Durante o jogo você pode mudar mentalidade, estilo e formação e fazer até 5 substituições em 3 paradas.</p>
		{:else}
			<p class="plan">
				{#if meInLineup === 'titular'}O técnico escalou você como <strong>titular</strong>.
				{:else if meInLineup === 'reserva'}Você começa no <strong>banco de reservas</strong> — pode entrar durante o jogo.
				{:else}Você não foi relacionado para esta partida. Treine para ganhar espaço.{/if}
			</p>
		{/if}
		<div class="actions">
			<Button variant="primary" size="lg" icon="whistle" onclick={kickOff}>Entrar em campo</Button>
			{#if c.mode === 'coach'}<Button href="{base}/taticas" icon="tactics">Ajustar tática</Button>{/if}
		</div>
	</section>
{:else if setup}
	{#if stage === 'saving'}
		<p class="status"><Icon name="refresh" /> Registrando o resultado: o servidor está conferindo a partida…</p>
	{:else if stage === 'error'}
		<div class="status err">
			<Icon name="alert" /> {errorMsg}
			<Button size="sm" onclick={save}>Tentar de novo</Button>
		</div>
	{:else if stage === 'saved' && saved && fixture}
		<section class="post" aria-label="Resultado registrado">
			<div class="score">
				<Crest clubId={fixture.home} size={56} />
				<strong>{saved.match.homeGoals} × {saved.match.awayGoals}</strong>
				<Crest clubId={fixture.away} size={56} />
			</div>
			{#if saved.match.summary.goals.length}
				<ul class="goals">
					{#each saved.match.summary.goals as g (g.tick)}
						<li data-side={g.side}><span>{g.minute}</span> ⚽ {name(g.player)}{g.assist ? ` (assist. ${name(g.assist)})` : ''}</li>
					{/each}
				</ul>
			{/if}
			{#if myStats}
				<p class="me">
					Sua atuação: nota <strong>{myStats.rating.toFixed(1)}</strong> · {myStats.minutes} min · {myStats.goals} gol(s) · {myStats.assists} assistência(s) ·
					{myStats.passesCompleted}/{myStats.passes} passes
				</p>
			{:else if c.mode === 'player'}
				<p class="me">Você não entrou em campo nesta partida.</p>
			{/if}
			<div class="round">
				<h3>Outros jogos da rodada</h3>
				<ul>
					{#each saved.round as r (r.home)}
						<li><span class="t">{getClub(r.home)?.short}</span><b>{r.homeGoals} × {r.awayGoals}</b><span class="t">{getClub(r.away)?.short}</span></li>
					{/each}
				</ul>
			</div>
			<div class="actions">
				<Button variant="primary" icon="arrowRight" onclick={backToClub}>Próxima rodada</Button>
				<Button href="{base}/competicoes" icon="trophy">Classificação</Button>
			</div>
		</section>
	{/if}
	<MatchCenter home={setup.home} away={setup.away} seed={setup.seed} control={setup.control} onfinish={finished} />
{/if}

<style>
	.pre,
	.empty,
	.post {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		padding: 28px 16px;
		border-radius: 18px;
		background: linear-gradient(180deg, var(--surface-2), var(--surface));
		box-shadow: inset 0 0 0 1px var(--line);
		text-align: center;
	}
	.post {
		margin-bottom: 14px;
		box-shadow: inset 0 0 0 1px var(--emerald-line);
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
	.plan,
	.hint,
	.me {
		margin: 0;
	}
	.hint {
		color: var(--text-3);
		font-size: var(--fs-sm);
	}
	.plan em {
		color: var(--warning);
		font-style: normal;
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
	.score strong {
		font-family: var(--font-display);
		font-size: var(--fs-3xl);
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
	.round b {
		font-variant-numeric: tabular-nums;
	}
	.empty :global(svg) {
		width: 40px;
		height: 40px;
		color: var(--gold);
	}
	@media (max-width: 560px) {
		.vs {
			gap: 12px;
		}
		.round ul {
			grid-template-columns: 1fr;
		}
	}
</style>
