<script lang="ts">
	import { clubAction } from '#lib/client/club.ts';
	import { BUDGET_KIND_LABEL, JUSTIFICATIONS, OUTCOME_LABEL, type BudgetCounter, type BudgetKind, type BudgetTalk, type JustificationId } from '#lib/domain/board-talks.ts';
	import { formatMoney, roundMoney } from '#lib/domain/market.ts';
	import { enter, reveal } from '#lib/motion/actions.ts';
	import { notify } from '#lib/stores/island.svelte.ts';
	import Button from '../Button.svelte';
	import SelectCard from '../cards/SelectCard.svelte';
	import Icon from '../Icon.svelte';
	import Segmented from '../Segmented.svelte';

	let { careerId, version, season, round, transferBudget, wageBudget, balance, confidence, talks, counter, profileLabel }: {
		careerId: string; version: number; season: number; round: number; transferBudget: number; wageBudget: number; balance: number; confidence: number;
		talks: BudgetTalk[]; counter: BudgetCounter | null; profileLabel: string;
	} = $props();

	let kind = $state<BudgetKind>('transferencias');
	let pct = $state<'10' | '20' | '30'>('10');
	let justification = $state<JustificationId>('carencias');
	let busy = $state(false);
	let last = $state<BudgetTalk | null>(null);

	const base = $derived(kind === 'folha' ? wageBudget : transferBudget);
	const amount = $derived(roundMoney((base * Number(pct)) / 100));
	const seasonTalks = $derived(talks.filter((t) => t.season === season));
	const sameKind = $derived(seasonTalks.filter((t) => t.kind === kind));
	const lastSame = $derived(sameKind.at(-1));
	const wait = $derived(lastSame ? (lastSame.outcome === 'aguardar' ? 12 : 8) - (round - lastSame.round) : 0);
	const blocked = $derived(sameKind.length >= 3 ? 'Tema já discutido três vezes nesta temporada.' : wait > 0 ? `A diretoria volta a discutir este tema em ${wait} ${wait === 1 ? 'rodada' : 'rodadas'}.` : null);
	const counterOpen = $derived(counter && counter.season === season && round <= counter.expiresRound ? counter : null);
	const shown = $derived(last ?? talks.at(-1) ?? null);

	async function request() {
		busy = true;
		try {
			const r = await clubAction(careerId, version, { action: 'verba-solicitar', kind, percent: Number(pct), justification });
			last = r.career.data.office?.budgetTalks?.at(-1) ?? null;
			notify({ icon: 'briefcase', tone: last && (last.outcome === 'aprovado' || last.outcome === 'parcial') ? 'success' : 'info', title: last ? OUTCOME_LABEL[last.outcome] : 'Reunião encerrada', detail: r.message });
		} catch (e) {
			notify({ icon: 'alert', tone: 'error', title: 'A diretoria não recebeu o pedido', detail: (e as Error).message });
		} finally {
			busy = false;
		}
	}
	async function answer(accept: boolean) {
		busy = true;
		try {
			const r = await clubAction(careerId, version, { action: 'verba-contraproposta', accept });
			last = r.career.data.office?.budgetTalks?.at(-1) ?? null;
			notify({ icon: accept ? 'check' : 'x', tone: accept ? 'success' : 'info', title: accept ? 'Acordo fechado' : 'Contraproposta recusada', detail: r.message });
		} catch (e) {
			notify({ icon: 'alert', tone: 'error', title: 'Não foi possível responder', detail: (e as Error).message });
		} finally {
			busy = false;
		}
	}
	const KIND_ICON = { transferencias: 'briefcase', folha: 'chart', redistribuir: 'refresh' } as const;
	const KIND_HINT: Record<BudgetKind, string> = {
		transferencias: 'Mais verba para contratar. Exige caixa para cobrir o compromisso.',
		folha: 'Teto mensal maior para salários. Não coloca dinheiro no caixa.',
		redistribuir: 'Parte da verba de contratações vira 12 meses de folha maior. Sem dinheiro novo.'
	};
</script>

<section class="meeting" id="orcamento" aria-labelledby="bm-title" use:reveal>
	<header>
		<div>
			<span class="eyebrow-gold">Reunião de orçamento · diretoria {profileLabel.toLowerCase()}</span>
			<h2 id="bm-title" class="display">Negociar verba com a diretoria</h2>
		</div>
		<dl class="now">
			<div><dt>Contratações</dt><dd>{formatMoney(transferBudget)}</dd></div>
			<div><dt>Teto da folha</dt><dd>{formatMoney(wageBudget)}/mês</dd></div>
			<div><dt>Caixa</dt><dd>{formatMoney(balance)}</dd></div>
			<div><dt>Confiança</dt><dd>{Math.round(confidence)}%</dd></div>
		</dl>
	</header>

	{#if counterOpen}
		<div class="counter" use:enter>
			<Icon name="briefcase" size={22} />
			<div>
				<strong>Contraproposta: +{counterOpen.percent}% em {BUDGET_KIND_LABEL[counterOpen.kind].toLowerCase()}</strong>
				<p class="muted">Válida até a rodada {counterOpen.expiresRound}. Aceitar fecha o acordo agora; recusar mantém os orçamentos.</p>
			</div>
			<div class="row">
				<Button size="sm" variant="ghost" disabled={busy} onclick={() => answer(false)}>Recusar</Button>
				<Button size="sm" variant="gold" icon="check" loading={busy} onclick={() => answer(true)}>Aceitar</Button>
			</div>
		</div>
	{/if}

	<div class="table">
		<div class="col">
			<h3>1. O que pedir</h3>
			<div class="kinds" role="radiogroup" aria-label="Tipo de pedido">
				{#each ['transferencias', 'folha', 'redistribuir'] as k (k)}
					<SelectCard selected={kind === k} icon={KIND_ICON[k as BudgetKind]} title={BUDGET_KIND_LABEL[k as BudgetKind]} description={KIND_HINT[k as BudgetKind]} onselect={() => (kind = k as BudgetKind)} />
				{/each}
			</div>
		</div>
		<div class="col">
			<h3>2. Quanto e por quê</h3>
			<Segmented label="Percentual" bind:value={pct} options={[{ value: '10', label: '+10%' }, { value: '20', label: '+20%' }, { value: '30', label: '+30%' }]} />
			<p class="ask">{kind === 'redistribuir' ? 'Mover' : 'Pedir'} <b>{formatMoney(amount)}</b>{kind === 'folha' ? ' por mês' : ''}{kind === 'redistribuir' ? ` (folha +${formatMoney(roundMoney(amount / 12))}/mês)` : ''}</p>
			<div class="just" role="radiogroup" aria-label="Justificativa">
				{#each Object.entries(JUSTIFICATIONS) as [id, text] (id)}
					<label class:on={justification === id}><input type="radio" name="justificativa" value={id} bind:group={justification} /> <span>“{text}”</span></label>
				{/each}
			</div>
			<Button variant="gold" icon="briefcase" loading={busy} disabled={busy || !!blocked} onclick={request}>Levar à diretoria</Button>
			{#if blocked}<p class="muted small"><Icon name="clock" size={14} /> {blocked}</p>{/if}
		</div>
		<div class="col answer" aria-live="polite">
			<h3>3. Resposta</h3>
			{#if shown}
				<div class="verdict {shown.outcome}" use:enter>
					<strong>{OUTCOME_LABEL[shown.outcome]}</strong>
					<small>{BUDGET_KIND_LABEL[shown.kind]} · +{shown.percent}% pedido{shown.granted ? ` · +${shown.granted}% concedido` : ''}</small>
					{#if shown.reasons.length}<ul>{#each shown.reasons.slice(0, 5) as r, i (i)}<li>{r}</li>{/each}</ul>{/if}
					{#if shown.granted}<p>Novos limites: contratações {formatMoney(shown.after.transferBudget)} · folha {formatMoney(shown.after.wageBudget)}/mês. O caixa não muda.</p>{/if}
				</div>
			{:else}
				<p class="muted">Pedidos razoáveis, com bons resultados e caixa para sustentar, têm mais chance. Pedidos repetidos desgastam a relação.</p>
			{/if}
		</div>
	</div>

	{#if talks.length}
		<details class="history">
			<summary>Histórico de negociações ({talks.length})</summary>
			<ol>
				{#each [...talks].reverse().slice(0, 12) as t, i (i)}
					<li><span class="tag {t.outcome}">{OUTCOME_LABEL[t.outcome]}</span> {t.season} · rodada {t.round} · {BUDGET_KIND_LABEL[t.kind]} +{t.percent}%{t.granted ? ` (concedido +${t.granted}%)` : ''} — “{JUSTIFICATIONS[t.justification]}”</li>
				{/each}
			</ol>
		</details>
	{/if}
</section>

<style>
	.meeting { display: grid; gap: var(--sp-4); padding: var(--sp-6); border-radius: 20px; background: linear-gradient(160deg, rgb(234 179 8 / 0.07), rgb(15 23 42 / 0.55) 55%); border: 1px solid rgb(234 179 8 / 0.18); }
	header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--sp-4); align-items: flex-end; }
	h2 { margin: 4px 0 0; }
	.now { display: flex; flex-wrap: wrap; gap: 10px; margin: 0; }
	.now div { padding: 8px 12px; border-radius: 10px; background: rgb(2 6 23 / 0.35); }
	.now dt { font-size: var(--fs-xs); color: var(--text-3); text-transform: uppercase; letter-spacing: 0.06em; }
	.now dd { margin: 2px 0 0; font-weight: 700; }
	.table { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.2fr) minmax(0, 1fr); gap: var(--sp-5); }
	@media (max-width: 1100px) { .table { grid-template-columns: minmax(0, 1fr); } }
	.col { display: grid; gap: 10px; align-content: start; min-width: 0; }
	h3 { margin: 0; font-size: var(--fs-sm); text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-3); }
	.kinds { display: grid; gap: 8px; }
	.ask { margin: 0; }
	.just { display: grid; gap: 6px; }
	.just label { display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px; border-radius: 10px; cursor: pointer; background: rgb(231 237 240 / 0.04); font-size: var(--fs-sm); transition: background var(--dur-1, 0.15s); }
	.just label.on { background: rgb(234 179 8 / 0.14); outline: 1px solid rgb(234 179 8 / 0.35); }
	.small { font-size: var(--fs-xs); display: flex; gap: 6px; align-items: center; margin: 0; }
	.verdict { display: grid; gap: 6px; padding: 14px; border-radius: 14px; background: rgb(231 237 240 / 0.05); border-left: 4px solid #64748b; }
	.verdict.aprovado { border-color: #10b981; } .verdict.parcial { border-color: #84cc16; } .verdict.contraproposta { border-color: #3b82f6; } .verdict.recusado { border-color: #ef4444; } .verdict.aguardar { border-color: #f59e0b; }
	.verdict small { color: var(--text-3); }
	.verdict ul { margin: 0; padding-left: 18px; color: var(--text-2); font-size: var(--fs-sm); }
	.verdict p { margin: 0; font-size: var(--fs-sm); }
	.counter { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; padding: 14px; border-radius: 14px; background: rgb(59 130 246 / 0.12); border: 1px solid rgb(59 130 246 / 0.3); }
	.counter p { margin: 2px 0 0; }
	.row { display: flex; gap: 8px; }
	.history summary { cursor: pointer; color: var(--text-3); }
	.history ol { margin: 8px 0 0; padding-left: 18px; display: grid; gap: 4px; font-size: var(--fs-sm); }
	.tag { padding: 1px 8px; border-radius: 999px; font-size: var(--fs-xs); background: rgb(231 237 240 / 0.08); }
	.tag.aprovado, .tag.parcial { background: rgb(16 185 129 / 0.16); } .tag.recusado { background: rgb(239 68 68 / 0.16); } .tag.aguardar { background: rgb(245 158 11 / 0.16); } .tag.contraproposta { background: rgb(59 130 246 / 0.16); }
</style>
