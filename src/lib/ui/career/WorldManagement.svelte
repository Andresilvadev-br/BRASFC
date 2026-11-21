<script lang="ts">
	import type { worldSnapshot } from '#lib/server/connected-world.ts';
	import { REGIONS, REGION_LABELS, YOUTH_PLANS } from '#lib/domain/academy.ts';
	import { type SponsorOffer } from '#lib/domain/club.ts';
	import { formatShort } from '#lib/domain/dates.ts';
	import { formatExactMoney } from '#lib/domain/market.ts';
	import { POSITIONS } from '#lib/domain/positions.ts';
	import { STAFF_INFO, STAFF_ROLES, type StaffRole, type StaffState } from '#lib/domain/staff.ts';
	import { count, enter } from '#lib/motion/actions.ts';
	import Button from '../Button.svelte';
	import Meter from '../Meter.svelte';
	import Panel from '../Panel.svelte';
	import SponsorContracts from './SponsorContracts.svelte';

	type Management = NonNullable<Awaited<ReturnType<typeof worldSnapshot>>['management']>;
	let { section, data, sponsors, staff, balance, busy, notices, onaction }: {
		section: string; data: Management; sponsors: SponsorOffer[]; staff: StaffState; balance: number; busy: boolean;
		notices: Array<{ id: string; date: string; subject: string; body: string; sender?: string }>;
		onaction: (request: Record<string, unknown>) => Promise<boolean>;
	} = $props();

	let role = $state<StaffRole>('auxiliar');
	let pressAnswers = $state<Record<string, string>>({});
	let region = $state<keyof typeof REGIONS>('sudeste');
	let position = $state<(typeof POSITIONS)[number]>('ATA');
	const meeting = $derived(data.office.meeting);
	const press = $derived(data.office.press);
	const localeMoney = (value: number) => formatExactMoney(value);
</script>

<div class="management" use:enter>
{#if section === 'financas'}
	<Panel title="Finanças do clube" icon="chart" class="wide">
		<div class="kpis">
			<span>Caixa<strong use:count={{ value: balance, format: localeMoney }}>{localeMoney(balance)}</strong></span>
			<span>Orçamento de transferências<strong>{localeMoney(data.budget)}</strong></span>
			<span>Folha mensal<strong>{localeMoney(data.wages)}</strong><small>Teto {localeMoney(data.wageBudget)}</small></span>
		</div>
	</Panel>
	<div class="wide"><SponsorContracts contracts={data.sponsors} offers={sponsors} {busy}
		onsign={(offer) => onaction({ action: 'patrocinio', offerId: offer.id })} /></div>
	<Panel title="Receitas e despesas">
		{#each [...data.months].reverse() as month (month.season + ':' + month.month)}
			<div class="row"><strong>{month.month}/{month.season}</strong><span>{localeMoney(month.income)} de receitas</span><span>{localeMoney(month.expense)} de despesas</span></div>
		{:else}<p>O primeiro mês ainda está em andamento.</p>{/each}
	</Panel>
{:else if section === 'clube' || section === 'gabinete'}
	<Panel title="Diretoria" icon="crown">
		<Meter value={Math.round(data.board.confidence)} label="Confiança da diretoria" />
		{#each data.board.objectives as objective}<p>{objective.label}</p>{:else}<p>Sem metas pendentes da diretoria.</p>{/each}
		{#if meeting}<div class="deal"><small>Reunião</small><strong>{meeting.title}</strong><p>{meeting.context}</p>
			{#each meeting.options as option (option.id)}<div><Button size="sm" disabled={busy} onclick={() => onaction({ action: 'reuniao', meetingId: meeting.id, choice: option.id })}>{option.label}</Button><small>{option.hint}</small></div>{/each}
		</div>{/if}
	</Panel>
	<Panel title="Gabinete e imprensa" icon="mail">
		{#if press}
			<h3>{press.title}</h3>
			{#each press.questions as question (question.id)}
				<label>{question.text}<select value={pressAnswers[question.id] ?? ''} onchange={(event) => pressAnswers[question.id] = event.currentTarget.value}>
					<option value="">Escolher resposta</option>
					{#each question.options as option (option.id)}<option value={option.id}>{option.label}</option>{/each}
				</select></label>
			{/each}
			<Button disabled={busy || press.questions.some((question) => !pressAnswers[question.id])} onclick={() => onaction({ action: 'coletiva', pressId: press.id, answers: $state.snapshot(pressAnswers) })}>Concluir coletiva</Button>
		{:else}<p>Não há coletiva pendente.</p>{/if}
		{#each [...notices].reverse() as notice (notice.id)}
			<details><summary>{notice.subject}</summary><small>{notice.sender ?? 'Gabinete'} · {formatShort(notice.date)}</small><p>{notice.body}</p></details>
		{/each}
	</Panel>
{:else if section === 'comissao'}
	<Panel title="Comissão técnica" icon="whistle">
		{#each STAFF_ROLES as position (position)}
			<div class="row"><strong>{STAFF_INFO[position].label}</strong><span>{staff[position]?.name ?? 'Vaga aberta'}</span>
				{#if staff[position]}<Button size="sm" variant="ghost" disabled={busy} onclick={() => { if (confirm('Dispensar este profissional?')) void onaction({ action: 'comissao-dispensar', role: position }); }}>Dispensar</Button>{/if}
			</div>
		{/each}
	</Panel>
	<Panel title="Candidatos disponíveis">
		<label>Cargo<select bind:value={role}>{#each STAFF_ROLES as position (position)}<option value={position}>{STAFF_INFO[position].label}</option>{/each}</select></label>
		{#each data.staffCandidates[role] ?? [] as candidate (candidate.id)}
			<div class="deal"><strong>{candidate.name}</strong><span>{candidate.competence} de competência · {localeMoney(candidate.wage)}/mês</span>
				<Button size="sm" disabled={busy || !!staff[role]} onclick={() => onaction({ action: 'comissao-contratar', role, candidateId: candidate.id })}>Contratar</Button>
			</div>
		{/each}
	</Panel>
{:else if section === 'base'}
	<Panel title="Categorias de base" icon="sparkle">
		{#each data.academy as youth (youth.id)}
			<div class="deal"><strong>{youth.name}</strong><span>{youth.position} · {youth.age} anos · {youth.overall} geral</span>
				<label>Plano<select disabled={busy} value={youth.plan ?? 'equilibrado'} onchange={(event) => onaction({ action: 'base-plano', youthId: youth.id, plan: event.currentTarget.value })}>
					{#each YOUTH_PLANS as plan (plan)}<option value={plan}>{plan}</option>{/each}
				</select></label>
				<Button size="sm" disabled={busy} onclick={() => onaction({ action: 'base-promover', youthId: youth.id })}>Promover ao elenco</Button>
			</div>
		{:else}<p>Não há atletas na base.</p>{/each}
	</Panel>
	<Panel title="Olheiros">
		{#if data.scouts.length}
			<div class="kpis"><label>Região<select bind:value={region}>{#each Object.entries(REGION_LABELS) as [key, label]}<option value={key}>{label}</option>{/each}</select></label>
				<label>Posição<select bind:value={position}>{#each POSITIONS as item}<option value={item}>{item}</option>{/each}</select></label></div>
		{/if}
		{#each data.scouts as scout (scout.id)}
			<div class="deal"><strong>{scout.name}</strong><span>{localeMoney(scout.wage)}/mês · {scout.mission ? `${scout.mission.found} observações na missão` : 'Sem missão'}</span>
				<Button size="sm" disabled={busy} onclick={() => onaction({ action: 'olheiro-missao', scoutId: scout.id, region, position, maxAge: 24, weeks: 4 })}>Enviar para missão</Button>
			</div>
		{/each}
		{#each data.scoutCandidates.filter((candidate) => !data.scouts.some((scout) => scout.id === candidate.id)) as candidate (candidate.id)}
			<div class="row"><strong>{candidate.name}</strong><span>{localeMoney(candidate.wage)}/mês</span><Button size="sm" disabled={busy} onclick={() => onaction({ action: 'olheiro-contratar', scoutId: candidate.id })}>Contratar</Button></div>
		{/each}
		{#each data.reports.slice(-8).reverse() as report}<p>{report.note} · {report.verdict}</p>{/each}
	</Panel>
{/if}
</div>

<style>
	.management { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; align-items:start; }
	.management :global(.wide) { grid-column:1/-1; }
	.kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr)); gap:12px; }
	.kpis > span,.deal { display:grid; gap:5px; padding:12px; border:1px solid var(--line); border-radius:var(--radius-l); margin-block:3px; }
	.kpis strong { font-family:var(--font-display); font-size:var(--fs-xl); }
	.deal { background:var(--surface-sunken); }
	.deal small,.row span,details small { color:var(--text-2); }
	.deal strong { font-size:var(--fs-lg); }
	.row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; border-top:1px solid var(--line); padding:9px 0; }
	label { display:grid; gap:4px; margin:6px 0; }
	details { padding:8px 0; border-top:1px solid var(--line); }
	@media(max-width:1050px) { .management { grid-template-columns:minmax(0,1fr); } }
</style>
