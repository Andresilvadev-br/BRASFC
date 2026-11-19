<script lang="ts">
	import { DRILLS, DRILL_DEFS, INTENSITY, type DrillId, type TrainingPlan } from '#lib/domain/drills.ts';
	import { enter } from '#lib/motion/actions.ts';
	import Button from '../Button.svelte';
	import Icon from '../Icon.svelte';
	import type { IconName } from '../icons.ts';
	import Panel from '../Panel.svelte';
	import Segmented from '../Segmented.svelte';
	import Crest from '../Crest.svelte';

	let { plan = $bindable(), opponent, round, changed, saving, onsave }: {
		plan: TrainingPlan; opponent?: { id: string; short: string }; round?: number; changed: boolean; saving: boolean;
		onsave: () => void | Promise<void>;
	} = $props();

	const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
	const icons: Record<DrillId, IconName> = {
		formacao: 'tactics', posse: 'link', pressao: 'arrowRight', defesa: 'lock', 'contra-ataque': 'sparkle', movimentacao: 'field',
		construcao: 'chart', 'bolas-paradas': 'star', entrosamento: 'squad', funcoes: 'user', adversario: 'eye', descanso: 'clock'
	};
	let picking = $state<number | null>(null);
	function setDrill(index: number, drill: DrillId) {
		const slots = [...plan.sessions];
		slots[index] = drill;
		plan = { ...plan, sessions: slots };
		picking = null;
	}
</script>

<Panel title="Semana de treinos" icon="calendar">
	<div class="planner">
		{#each DAYS as day, index (day)}
			{@const drill = plan.sessions[index]}
			<div class="pday">
				<span>{day}</span>
				<button type="button" class="drill" data-umx-press aria-expanded={picking === index} onclick={() => picking = picking === index ? null : index}>
					<Icon name={icons[drill]} size={20} /><strong>{DRILL_DEFS[drill].short}</strong>
					<small>{drill === 'descanso' ? 'Recuperação' : `Carga ${Math.round(DRILL_DEFS[drill].load * INTENSITY[plan.intensity].load)}`}</small>
				</button>
			</div>
		{/each}
		<div class="pday"><span>Sáb</span><div class="drill"><Icon name="clock" size={20} /><strong>Véspera</strong><small>Carga leve</small></div></div>
		<div class="pday"><span>Dom</span><div class="drill">
			{#if opponent}<Crest clubId={opponent.id} size={24} /><strong>vs {opponent.short}</strong><small>Rodada {round}</small>
			{:else}<Icon name="whistle" size={20} /><strong>Sem confronto definido</strong>{/if}
		</div></div>
	</div>
	{#if picking !== null}
		<div class="palette" use:enter aria-label={`Treino de ${DAYS[picking]}`}>
			{#each DRILLS as drill (drill)}
				<button type="button" aria-pressed={plan.sessions[picking] === drill} onclick={() => setDrill(picking!, drill)}>
					<Icon name={icons[drill]} size={16} /><strong>{DRILL_DEFS[drill].label}</strong><small>{DRILL_DEFS[drill].what}</small>
				</button>
			{/each}
		</div>
	{/if}
	<div class="actions">
		<Segmented label="Intensidade" value={plan.intensity} onchange={(intensity) => plan = { ...plan, intensity }} options={[{ value: 'leve', label: 'Leve' }, { value: 'normal', label: 'Normal' }, { value: 'intensa', label: 'Intensa' }]} />
		<div class="actions">{#if changed}<small>Plano não salvo</small>{/if}<Button variant="primary" icon="save" loading={saving} disabled={!changed} onclick={onsave}>Salvar semana</Button></div>
	</div>
</Panel>

<style>
	.planner { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:8px; }
	.pday { display:grid; grid-template-rows:auto 1fr; gap:6px; color:var(--text-2); font-size:var(--fs-sm); min-width:0; }
	.drill { display:grid; align-content:center; justify-items:start; gap:6px; padding:9px; width:100%; min-width:0; min-height:90px; text-align:start; color:var(--text);
		border:1px solid var(--line); border-radius:10px; background:var(--surface-sunken); overflow-wrap:anywhere; }
	.drill :global(.icon) { color:var(--emerald-strong); }
	.drill[aria-expanded='true'], .palette button[aria-pressed='true'] { border-color:var(--emerald); background:var(--emerald-soft); }
	.drill small,.palette small,.actions small { color:var(--text-2); font-size:var(--fs-xs); }
	.palette { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr)); gap:7px; margin-top:10px; }
	.palette button { display:grid; gap:5px; text-align:start; border:1px solid var(--line); padding:9px; border-radius:8px; color:var(--text); }
	.actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:space-between; margin-top:8px; }
	@media(max-width:820px) { .planner { grid-template-columns:repeat(4,minmax(0,1fr)); } }
	@media(max-width:480px) { .planner { grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>
