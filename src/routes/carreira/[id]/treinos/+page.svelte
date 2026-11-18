<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { api } from '#lib/api.ts';
	import type { Career } from '#lib/domain/career.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { aiTeamPlan } from '#lib/domain/coaches.ts';
	import { formatDayMonth, weekday, weekdayShort } from '#lib/domain/dates.ts';
	import { DRILL_DEFS, DRILLS, INTENSITY, previewWeek, suggestPlan, weekLoad, type DrillId, type TrainingPlan } from '#lib/domain/drills.ts';
	import { CAREER_PLAYER_ID, careerSquad } from '#lib/domain/matchday.ts';
	import { PLAYER_FOCUS, PLAYER_FOCUS_LABELS, SESSION_LABELS, weekPlan, type PlayerFocus, type SessionKind } from '#lib/domain/training.ts';
	import { recommendRoles } from '#lib/engine/roles.ts';
	import { notify } from '#lib/stores/island.svelte.ts';
	import { markClean, markDirty } from '#lib/stores/unsaved.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Crest from '#lib/ui/Crest.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import type { IconName } from '#lib/ui/icons.ts';
	import Panel from '#lib/ui/Panel.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';

	let { data } = $props();
	const c = $derived(data.career);
	const v = $derived(data.view);
	const isCoach = $derived(c.mode === 'coach');

	let playerFocus = $state<PlayerFocus>(untrack(() => data.career.data.playerFocus ?? 'fisico'));
	let saving = $state(false);

	const week = $derived(weekPlan(c.gameDate, 'equilibrado', v.clubFixtures));

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

	// ── Centro de Treinamento Tático (treinador)
	const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
	const DRILL_ICON: Record<DrillId, IconName> = {
		formacao: 'tactics', posse: 'link', pressao: 'arrowRight', defesa: 'lock', 'contra-ataque': 'sparkle', movimentacao: 'field',
		construcao: 'chart', 'bolas-paradas': 'star', entrosamento: 'squad', funcoes: 'user', descanso: 'clock'
	};
	let plan = $state<TrainingPlan>(untrack(() => structuredClone($state.snapshot(data.view.trainingPlan))));
	let picking = $state<number | null>(null);
	const planChanged = $derived(JSON.stringify(plan) !== JSON.stringify(v.trainingPlan));
	const ctxWeek = $derived({ formation: v.tactic.formation, style: v.tactic.style, lineup: v.tactic.lineup, roles: v.tactic.roles, squad: v.squad });
	const preview = $derived(previewWeek(v.tactical, plan, ctxWeek));
	const load = $derived(weekLoad(plan));
	const avgCondition = $derived(v.tactic.lineup.reduce((s, id) => s + (v.fitness[id] ?? 95), 0) / Math.max(1, v.tactic.lineup.length));
	const suggestion = $derived(suggestPlan(v.tactical, ctxWeek, avgCondition));
	const gains = $derived([
		{ label: `Formação ${v.tactic.formation}`, v: preview.formation },
		{ label: 'Estilo', v: preview.style },
		{ label: 'Instruções', v: preview.instructions },
		{ label: 'Entrosamento', v: preview.cohesion },
		{ label: 'Bolas paradas', v: preview.setPieces }
	]);
	$effect(() => {
		if (planChanged) markDirty('treino', 'Plano de treinos não salvo');
		else markClean('treino');
		return () => markClean('treino');
	});
	function setDrill(i: number, d: DrillId) {
		const sessions = [...plan.sessions];
		sessions[i] = d;
		plan.sessions = sessions;
		picking = null;
	}
	function useSuggestion() {
		plan = structuredClone(suggestion.plan);
	}
	async function savePlan() {
		await save({ trainingPlan: $state.snapshot(plan) }, `${plan.sessions.filter((d) => d !== 'descanso').length} sessões · ${INTENSITY[plan.intensity].label}`);
	}

	// ── Carreira de jogador
	const SESSION_ICON: Record<SessionKind, IconName> = { tatico: 'tactics', fisico: 'heart', tecnico: 'star', recuperacao: 'refresh', descanso: 'clock', jogo: 'whistle' };
	const PLAYER_ICON: Record<PlayerFocus, IconName> = { finalizacao: 'star', passe: 'link', drible: 'sparkle', marcacao: 'lock', fisico: 'heart', goleiro: 'field' };
	const PLAYER_HINT: Record<PlayerFocus, string> = {
		finalizacao: 'Chutes, cabeceio e frieza na área',
		passe: 'Visão de jogo e precisão',
		drible: 'Controle e um contra um',
		marcacao: 'Desarme e posicionamento',
		fisico: 'Resistência, força e velocidade',
		goleiro: 'Reflexos e saída do gol'
	};
	function choosePlayer(f: PlayerFocus) {
		if (f === playerFocus || saving) return;
		playerFocus = f;
		void save({ playerFocus: f }, PLAYER_FOCUS_LABELS[f]);
	}
	const coachPlan = $derived(isCoach ? null : aiTeamPlan(c.seed, c.clubId, c.season, v.firstSeason, careerSquad(c)));
	const me = $derived(v.squad.find((p) => p.id === CAREER_PLAYER_ID));
	const myRoles = $derived(me ? recommendRoles(me.attributes, me.position) : []);
	const myRole = $derived.by(() => {
		if (!me || !coachPlan) return null;
		const i = coachPlan.tactic.lineup.indexOf(CAREER_PLAYER_ID);
		const roleId = i >= 0 ? coachPlan.tactic.roles[i] : myRoles[0]?.role.id;
		const r = myRoles.find((x) => x.role.id === roleId) ?? myRoles[0];
		return r ? { ...r, inLineup: i >= 0 } : null;
	});
</script>

<svelte:head><title>Treinos · {v.club.name} · BRASFC</title></svelte:head>

<div class="head" data-umx-enter>
	<span class="eyebrow">Semana de {formatDayMonth(week[0].date)} a {formatDayMonth(week[6].date)}</span>
	<h1>Treinos</h1>
	<p class="muted">
		{isCoach
			? 'Monte a semana: cada sessão melhora uma parte do domínio tático e cansa o elenco; descanso recupera. O efeito vale quando a rodada é disputada.'
			: 'Escolha no que você quer evoluir. O treino do time segue o plano do treinador.'}
	</p>
</div>

{#if isCoach}
	<Panel title="Semana de treinos" icon="calendar" index={0}>
		<div class="planner">
			{#each DAYS as day, i (day)}
				<div class="pday">
					<span class="dname">{day}</span>
					<button class="drill" data-d={plan.sessions[i]} class:open={picking === i} onclick={() => (picking = picking === i ? null : i)} aria-expanded={picking === i}>
						<Icon name={DRILL_ICON[plan.sessions[i]]} size={20} />
						<span>{DRILL_DEFS[plan.sessions[i]].short}</span>
						<small>{plan.sessions[i] === 'descanso' ? 'recupera' : `carga ${Math.round(DRILL_DEFS[plan.sessions[i]].load * INTENSITY[plan.intensity].load)}`}</small>
					</button>
				</div>
			{/each}
			<div class="pday">
				<span class="dname">Sáb</span>
				<div class="drill static"><Icon name="clock" size={20} /><span>Véspera</span><small>leve</small></div>
			</div>
			<div class="pday">
				<span class="dname">Dom</span>
				<div class="drill static jogo">
					{#if v.upcoming}
						{@const opp = v.upcoming.home === c.clubId ? v.upcoming.away : v.upcoming.home}
						<Crest clubId={opp} size={26} /><span>vs {getClub(opp)?.short}</span><small>rodada {v.upcoming.round}</small>
					{:else}<Icon name="whistle" size={20} /><span>Sem jogo</span>{/if}
				</div>
			</div>
		</div>
		{#if picking !== null}
			<div class="palette" role="radiogroup" aria-label="Treino de {DAYS[picking]}">
				{#each DRILLS as d (d)}
					<button role="radio" aria-checked={plan.sessions[picking] === d} class:on={plan.sessions[picking] === d} onclick={() => setDrill(picking!, d)}>
						<Icon name={DRILL_ICON[d]} size={18} />
						<strong>{DRILL_DEFS[d].label}</strong>
						<small>{DRILL_DEFS[d].what}</small>
					</button>
				{/each}
			</div>
		{/if}
		<div class="pfoot">
			<Segmented label="Intensidade" bind:value={plan.intensity} options={[{ value: 'leve', label: 'Leve' }, { value: 'normal', label: 'Normal' }, { value: 'intensa', label: 'Intensa' }]} />
			<div class="saveplan">
				{#if planChanged}<span class="pending"><Icon name="dot" size={12} /> Plano não salvo</span>{/if}
				<Button variant="primary" icon="save" loading={saving} disabled={!planChanged} onclick={savePlan}>Salvar semana</Button>
			</div>
		</div>
	</Panel>

	<div class="grid2">
		<Panel title="Previsão da semana" icon="chart" index={1}>
			<div class="pv">
				<div class="pvrow"><span>Carga física</span><span class="track"><span class="fill load" style="width:{Math.min(100, load.load * 2.5)}%"></span></span><b>{load.load}</b></div>
				<div class="pvrow"><span>Recuperação até o jogo</span><span class="track"><span class="fill rec" style="width:{Math.max(0, Math.min(100, load.recovery * 3))}%"></span></span><b>+{load.recovery}</b></div>
				<p class="muted small">
					Condição média dos titulares hoje: <strong>{Math.round(avgCondition)}%</strong>. Previsão para o jogo: <strong>{Math.round(Math.min(100, avgCondition + load.recovery * 0.95))}%</strong>.
				</p>
				<ul class="gains">
					{#each gains as g (g.label)}<li class:zero={g.v <= 0}><span>{g.label}</span><b>{g.v > 0 ? `+${g.v.toFixed(1)}` : '—'}</b></li>{/each}
				</ul>
				<p class="muted small">Valores aproximados. O ganho cai conforme o domínio sobe, e repetir o mesmo treino na semana rende menos.</p>
			</div>
		</Panel>
		<Panel title="Sugestão do auxiliar" icon="whistle" index={2}>
			<ul class="reasons">{#each suggestion.reasons as r (r)}<li><Icon name="info" size={14} /> {r}</li>{/each}</ul>
			<div class="sugg">
				{#each suggestion.plan.sessions as d, i (i)}<span>{DAYS[i]}: {DRILL_DEFS[d].short}</span>{/each}
				<span>· {INTENSITY[suggestion.plan.intensity].label}</span>
			</div>
			<Button size="sm" icon="check" onclick={useSuggestion}>Usar sugestão</Button>
		</Panel>
	</div>
{:else}
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

	{#if coachPlan}
		<Panel title="Orientações do técnico" icon="tactics" index={1}>
			<p class="muted small">O técnico ({coachPlan.coach.profile.label}) usa o <strong>{coachPlan.tactic.formation}</strong>. Sua função esperada:</p>
			{#if myRole}
				<div class="orient">
					<strong>{myRole.role.label}</strong>
					<span>{myRole.role.summary}</span>
					<span class="muted small">Compatibilidade {myRole.score} · domínio {Math.round(v.tactical.roles[CAREER_PLAYER_ID]?.[myRole.role.id] ?? 20)} · {myRole.inLineup ? 'titular no momento' : 'disputando posição'}</span>
				</div>
			{/if}
			<p class="muted small">Funções possíveis na sua posição (o domínio cresce com minutos em campo):</p>
			<ul class="myroles">
				{#each myRoles as r (r.role.id)}<li><span>{r.role.label}</span><b>{r.score}</b><small>domínio {Math.round(v.tactical.roles[CAREER_PLAYER_ID]?.[r.role.id] ?? 20)}</small></li>{/each}
			</ul>
		</Panel>
	{/if}

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
	.planner {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 6px;
	}
	.pday {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.dname {
		font-size: var(--fs-xs);
		font-weight: 700;
		color: var(--text-3);
		text-align: center;
	}
	.drill {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		min-height: 96px;
		padding: 10px 4px;
		border: 0;
		border-radius: 10px;
		background: var(--surface-2);
		color: var(--text);
		font: inherit;
		font-size: var(--fs-sm);
		font-weight: 600;
		text-align: center;
		cursor: pointer;
	}
	.drill small {
		font-size: 10.5px;
		font-weight: 500;
		color: var(--text-3);
	}
	.drill.open {
		box-shadow: inset 0 0 0 2px var(--emerald);
	}
	.drill[data-d='descanso'] {
		background: var(--surface-sunken);
		color: var(--text-2);
	}
	.drill.static {
		cursor: default;
		background: var(--surface-sunken);
	}
	.drill.jogo {
		box-shadow: inset 0 0 0 1px var(--gold);
		color: var(--gold);
	}
	.palette {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
		gap: 6px;
		margin-top: 10px;
	}
	.palette button {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 2px 8px;
		align-items: center;
		padding: 8px;
		border: 0;
		border-radius: 8px;
		background: var(--surface-2);
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.palette button small {
		grid-column: 2;
		font-size: 11px;
		color: var(--text-3);
	}
	.palette button.on {
		box-shadow: inset 0 0 0 2px var(--emerald);
	}
	.pfoot {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		margin-top: 12px;
	}
	.saveplan {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.pending {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--gold);
		font-size: var(--fs-sm);
		font-weight: 600;
	}
	.grid2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-4);
		margin-top: var(--sp-4);
	}
	.pv {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.pvrow {
		display: grid;
		grid-template-columns: 150px 1fr 40px;
		gap: 8px;
		align-items: center;
		font-size: var(--fs-sm);
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
	.fill.load {
		background: var(--warning);
	}
	.fill.rec {
		background: var(--emerald);
	}
	.gains {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px 12px;
		font-size: var(--fs-sm);
	}
	.gains li {
		display: flex;
		justify-content: space-between;
	}
	.gains b {
		color: var(--emerald-strong);
	}
	.gains li.zero b {
		color: var(--text-3);
	}
	.small {
		font-size: var(--fs-xs);
		margin: 0;
	}
	.reasons {
		list-style: none;
		margin: 0 0 8px;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.reasons li {
		display: flex;
		gap: 6px;
	}
	.sugg {
		font-size: var(--fs-xs);
		color: var(--text-3);
		margin-bottom: 8px;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.orient {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px;
		border-radius: 10px;
		background: var(--surface-2);
		margin: 6px 0 10px;
	}
	.myroles {
		list-style: none;
		margin: 6px 0 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}
	.myroles li {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 10px;
		font-size: var(--fs-sm);
	}
	.myroles small {
		color: var(--text-3);
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
	.block.jogo {
		align-items: center;
		justify-content: center;
		background: var(--gold-soft);
		color: var(--gold);
		max-height: none;
	}
	.block.jogo small {
		font-weight: 600;
	}
	.cards {
		display: grid;
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
	@media (max-width: 1000px) {
		.board {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
		.cards.six {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 760px) {
		.planner {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
		.grid2 {
			grid-template-columns: 1fr;
		}
		.pvrow {
			grid-template-columns: 110px 1fr 36px;
		}
	}
	@media (max-width: 600px) {
		.board {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
