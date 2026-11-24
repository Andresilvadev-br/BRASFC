<script lang="ts">
	import { careerPort } from '#lib/career/port.ts';
	import type { CareerScreenData } from '#lib/career/screen-data.ts';
	import { untrack } from 'svelte';
	import { getClub } from '#lib/domain/clubs.ts';
	import { aiTeamPlan } from '#lib/domain/coaches.ts';
	import { formatDayMonth, weekday, weekdayShort } from '#lib/domain/dates.ts';
	import { DRILL_DEFS, INTENSITY, previewWeek, suggestPlan, weekLoad, type TrainingPlan } from '#lib/domain/drills.ts';
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
	import WeekPlanner from '#lib/ui/career/WeekPlanner.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';

	let { data }: { data: CareerScreenData } = $props();
	const port = careerPort();
	const c = $derived(data.career);
	const v = $derived(data.view);
	const isCoach = $derived(c.mode === 'coach');

	let saving = $state(false);

	const week = $derived(weekPlan(c.gameDate, 'equilibrado', v.clubFixtures));

	async function save(body: Record<string, unknown>, label: string) {
		if (saving) return;
		saving = true;
		try {
			const out = await port.saveTrainingPlan(body.trainingPlan as TrainingPlan);
			if (!out.ok) throw new Error(out.message ?? 'Não foi possível salvar o plano.');
			notify(out.queued ? { icon: 'save', tone: 'info', title: 'Treino salvo localmente', detail: out.message, duration: 6000 }
				: { icon: 'check', tone: 'success', title: 'Treino atualizado', detail: label });
		} catch (e) {
			notify({ icon: 'alert', tone: 'error', title: e instanceof Error ? e.message : 'Falha ao salvar' });
		} finally {
			saving = false;
		}
	}

	// ── Centro de Treinamento Tático (treinador)
	const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];

	let plan = $state<TrainingPlan>(untrack(() => structuredClone($state.snapshot(data.view.trainingPlan))));
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

	function useSuggestion() {
		plan = structuredClone(suggestion.plan);
	}
	async function savePlan() {
		await save({ trainingPlan: $state.snapshot(plan) }, `${plan.sessions.filter((d) => d !== 'descanso').length} sessões · ${INTENSITY[plan.intensity].label}`);
	}


</script>

<svelte:head><title>Treinos · {v.club.name} · BRASFC</title></svelte:head>

<div class="head" data-umx-enter>
	<span class="eyebrow">Semana de {formatDayMonth(week[0].date)} a {formatDayMonth(week[6].date)}</span>
	<h1>Treinos</h1>
	<p class="muted">
		Monte a semana: cada sessão melhora uma parte do domínio tático e cansa o elenco; descanso recupera. O efeito vale quando a rodada é disputada.
	</p>
</div>

{#if isCoach}
	{@const opponent = v.upcoming ? getClub(v.upcoming.home === c.clubId ? v.upcoming.away : v.upcoming.home) : undefined}
	<WeekPlanner bind:plan opponent={opponent && { id: opponent.id, short: opponent.short }} round={v.upcoming?.round}
		changed={planChanged} {saving} onsave={savePlan} />

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
	@media (max-width: 1000px) {
	}
	@media (max-width: 760px) {
		.grid2 {
			grid-template-columns: 1fr;
		}
		.pvrow {
			grid-template-columns: 110px 1fr 36px;
		}
	}
	@media (max-width: 600px) {
	}
</style>
