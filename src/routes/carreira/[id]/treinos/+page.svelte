<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { api } from '#lib/api.ts';
	import type { Career } from '#lib/domain/career.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { formatDayMonth, weekday, weekdayShort } from '#lib/domain/dates.ts';
	import {
		PLAYER_FOCUS,
		PLAYER_FOCUS_LABELS,
		SESSION_LABELS,
		TEAM_FOCUS,
		TEAM_FOCUS_LABELS,
		weekPlan,
		type PlayerFocus,
		type SessionKind,
		type TeamFocus
	} from '#lib/domain/training.ts';
	import { notify } from '#lib/stores/island.svelte.ts';
	import Crest from '#lib/ui/Crest.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import type { IconName } from '#lib/ui/icons.ts';
	import Panel from '#lib/ui/Panel.svelte';
	import Unavailable from '#lib/ui/Unavailable.svelte';

	let { data } = $props();
	const c = $derived(data.career);
	const v = $derived(data.view);
	const isCoach = $derived(c.mode === 'coach');

	let teamFocus = $state<TeamFocus>(untrack(() => data.career.data.trainingFocus ?? 'equilibrado'));
	let playerFocus = $state<PlayerFocus>(untrack(() => data.career.data.playerFocus ?? 'fisico'));
	let saving = $state(false);

	const week = $derived(weekPlan(c.gameDate, teamFocus, v.clubFixtures));

	// Distribuição de carga de cada foco (soma das sessões da semana-modelo).
	const MIX: Record<TeamFocus, Record<'fisico' | 'tatico' | 'tecnico', number>> = {
		equilibrado: { fisico: 2, tatico: 4, tecnico: 2 },
		fisico: { fisico: 6, tatico: 2, tecnico: 1 },
		tatico: { fisico: 1, tatico: 7, tecnico: 1 },
		tecnico: { fisico: 1, tatico: 3, tecnico: 4 }
	};
	const SESSION_ICON: Record<SessionKind, IconName> = {
		tatico: 'tactics',
		fisico: 'heart',
		tecnico: 'star',
		recuperacao: 'refresh',
		descanso: 'clock',
		jogo: 'whistle'
	};
	const PLAYER_ICON: Record<PlayerFocus, IconName> = {
		finalizacao: 'star',
		passe: 'link',
		drible: 'sparkle',
		marcacao: 'lock',
		fisico: 'heart',
		goleiro: 'field'
	};
	const PLAYER_HINT: Record<PlayerFocus, string> = {
		finalizacao: 'Chutes, cabeceio e frieza na área',
		passe: 'Visão de jogo e precisão',
		drible: 'Controle e um contra um',
		marcacao: 'Desarme e posicionamento',
		fisico: 'Resistência, força e velocidade',
		goleiro: 'Reflexos e saída do gol'
	};

	async function save(body: Record<string, unknown>, label: string) {
		saving = true;
		try {
			await api<{ career: Career }>(`/api/careers/${c.id}`, { method: 'PATCH', body: { version: c.version, ...body } });
			await invalidate('app:career');
			notify({ icon: 'check', tone: 'success', title: 'Treino atualizado', detail: label });
		} catch (e) {
			notify({ icon: 'alert', tone: 'error', title: e instanceof Error ? e.message : 'Falha ao salvar' });
		} finally {
			saving = false;
		}
	}

	function chooseTeam(f: TeamFocus) {
		if (f === teamFocus || saving) return;
		teamFocus = f;
		void save({ trainingFocus: f }, TEAM_FOCUS_LABELS[f]);
	}
	function choosePlayer(f: PlayerFocus) {
		if (f === playerFocus || saving) return;
		playerFocus = f;
		void save({ playerFocus: f }, PLAYER_FOCUS_LABELS[f]);
	}
</script>

<svelte:head><title>Treinos · {v.club.name} · BRASFC</title></svelte:head>

<div class="head" data-umx-enter>
	<span class="eyebrow">Semana de {formatDayMonth(week[0].date)} a {formatDayMonth(week[6].date)}</span>
	<h1>Treinos</h1>
	<p class="muted">
		{isCoach ? 'Escolha a ênfase da semana: o quadro se reorganiza na hora.' : 'Escolha no que você quer evoluir. O treino do time segue o plano do treinador.'}
		A escolha fica salva; a evolução dos atletas será calculada pelo motor de simulação (Etapa 2).
	</p>
</div>

<Panel title="Quadro da semana" icon="calendar" index={0}>
	<div class="board">
		{#each week as d (d.date)}
			<div class="day" class:today={d.date === c.gameDate} class:match={!!d.fixture}>
				<div class="dh">
					<strong>{weekdayShort(weekday(d.date))}</strong>
					<span class="num">{formatDayMonth(d.date)}</span>
				</div>
				{#if d.fixture}
					{@const opp = d.fixture.home === c.clubId ? d.fixture.away : d.fixture.home}
					<div class="block jogo">
						<Crest clubId={opp} size={34} />
						<span>vs {getClub(opp)?.short}</span>
						<small>{d.fixture.time}</small>
					</div>
				{:else}
					{#each d.sessions as s, i (i)}
						<div class="block {s}">
							<Icon name={SESSION_ICON[s]} size={18} />
							<span>{SESSION_LABELS[s]}</span>
						</div>
					{/each}
				{/if}
			</div>
		{/each}
	</div>
</Panel>

{#if isCoach}
	<h2 class="section">Ênfase da semana</h2>
	<div class="cards" role="radiogroup" aria-label="Ênfase do treino do time">
		{#each TEAM_FOCUS as f (f)}
			<button type="button" role="radio" aria-checked={teamFocus === f} class="card" disabled={saving} onclick={() => chooseTeam(f)} data-umx-press="0.98">
				<strong>{TEAM_FOCUS_LABELS[f]}</strong>
				<div class="bars">
					{#each ['fisico', 'tatico', 'tecnico'] as const as k (k)}
						<div class="bar">
							<span>{SESSION_LABELS[k]}</span>
							<span class="track"><span class="fill {k}" style="width:{(MIX[f][k] / 8) * 100}%"></span></span>
						</div>
					{/each}
				</div>
			</button>
		{/each}
	</div>
	<div class="soon">
		<Unavailable title="Comissão técnica e preparadores" detail="Qualidade da comissão influencia o treino" icon="squad" />
		<Unavailable title="Treino individual por atleta" icon="user" />
	</div>
{:else}
	<h2 class="section">Seu foco individual</h2>
	<div class="cards six" role="radiogroup" aria-label="Foco do treino individual">
		{#each PLAYER_FOCUS as f (f)}
			<button type="button" role="radio" aria-checked={playerFocus === f} class="card pf" disabled={saving} onclick={() => choosePlayer(f)} data-umx-press="0.98">
				<span class="pfi"><Icon name={PLAYER_ICON[f]} size={26} /></span>
				<strong>{PLAYER_FOCUS_LABELS[f]}</strong>
				<small>{PLAYER_HINT[f]}</small>
			</button>
		{/each}
	</div>
{/if}

<style>
	.head {
		margin-bottom: var(--sp-5);
	}
	.head p {
		max-width: 70ch;
		font-size: var(--fs-sm);
	}
	h1 {
		font-size: var(--fs-3xl);
		text-transform: uppercase;
		font-weight: 800;
	}
	.section {
		margin: var(--sp-6) 0 var(--sp-3);
		font-size: var(--fs-xl);
		text-transform: uppercase;
	}
	.board {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: var(--sp-2);
	}
	.day {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		min-height: 190px;
		padding: var(--sp-2);
		border-radius: var(--radius-m);
		background: var(--surface-sunken);
		border: 1px solid var(--line);
	}
	.day.today {
		border-color: var(--emerald-line);
		box-shadow: inset 0 3px 0 var(--emerald);
	}
	.dh {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		font-size: var(--fs-sm);
	}
	.dh span {
		color: var(--text-3);
		font-size: var(--fs-xs);
	}
	.block {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-s);
		font-size: var(--fs-xs);
		font-weight: 700;
		flex: 1;
		max-height: 74px;
	}
	.tatico {
		background: rgb(124 182 248 / 0.16);
		color: var(--info);
	}
	.fisico {
		background: rgb(248 113 113 / 0.15);
		color: #fca5a5;
	}
	.tecnico {
		background: var(--emerald-soft);
		color: var(--emerald-strong);
	}
	.recuperacao {
		background: rgb(167 139 250 / 0.15);
		color: #c4b5fd;
	}
	.descanso {
		background: var(--surface-2);
		color: var(--text-3);
	}
	.jogo {
		align-items: center;
		justify-content: center;
		background: var(--gold-soft);
		color: var(--gold);
		max-height: none;
	}
	.jogo small {
		font-weight: 600;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--sp-3);
	}
	.cards.six {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		padding: var(--sp-4);
		text-align: left;
		border-radius: var(--radius-l);
		border: 1px solid var(--line);
		background: var(--surface);
		transition: border-color 0.15s, background 0.15s;
	}
	.card:hover:not(:disabled) {
		border-color: var(--line-strong);
		background: var(--surface-2);
	}
	.card[aria-checked='true'] {
		border-color: var(--emerald);
		background: linear-gradient(160deg, rgb(16 185 129 / 0.14), var(--surface));
		box-shadow: 0 0 0 1px var(--emerald);
	}
	.card strong {
		font-family: var(--font-display);
		font-size: var(--fs-xl);
		text-transform: uppercase;
	}
	.bars {
		display: grid;
		gap: 6px;
	}
	.bar {
		display: grid;
		grid-template-columns: 62px 1fr;
		align-items: center;
		gap: var(--sp-2);
		font-size: var(--fs-xs);
		color: var(--text-2);
	}
	.track {
		height: 8px;
		border-radius: 4px;
		background: var(--surface-3);
		overflow: hidden;
	}
	.fill {
		display: block;
		height: 100%;
		border-radius: inherit;
	}
	.fill.fisico {
		background: #f87171;
	}
	.fill.tatico {
		background: #7cb6f8;
	}
	.fill.tecnico {
		background: var(--emerald);
	}
	.pf {
		align-items: flex-start;
	}
	.pfi {
		display: grid;
		place-items: center;
		width: 48px;
		height: 48px;
		border-radius: 14px;
		background: var(--surface-3);
		color: var(--emerald-strong);
	}
	.pf small {
		color: var(--text-3);
		font-size: var(--fs-sm);
	}
	.soon {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-3);
		margin-top: var(--sp-4);
	}
	@media (max-width: 1000px) {
		.board {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
		.cards,
		.cards.six {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 600px) {
		.board {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.soon {
			grid-template-columns: 1fr;
		}
	}
</style>
