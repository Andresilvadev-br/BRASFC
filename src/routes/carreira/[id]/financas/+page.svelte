<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { TICKET_REF } from '#lib/domain/club.ts';
	import { LEDGER_LABELS } from '#lib/domain/management.ts';
	import { formatMoney } from '#lib/domain/market.ts';
	import { count, reveal } from '#lib/motion/actions.ts';
	import { clubAction, clubHistory } from '#lib/client/club.ts';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';
	import Bars from '#lib/ui/v4/Bars.svelte';
	import Donut from '#lib/ui/v4/Donut.svelte';
	import Gauge from '#lib/ui/v4/Gauge.svelte';
	import SponsorContracts from '#lib/ui/career/SponsorContracts.svelte';

	let { data } = $props();
	const c = $derived(data.career);
	const m = $derived(data.manage);
	const club = $derived(m.club);
	let mode = $state<'resumo' | 'detalhado'>('resumo');
	let ledger = $state<Array<{ season: number; gameDate: string; category: string; amount: number; description: string }>>([]);
	let busy = $state(false);
	let msg = $state('');
	let price = $state(untrack(() => data.manage.club.ticketPrice));

	onMount(() => {
		clubHistory(c.id).then((h) => (ledger = h.ledger)).catch(() => (msg = 'Não foi possível carregar o extrato agora.'));
	});

	const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
	const seasonMonths = $derived(club.months.filter((x) => x.season === c.season).sort((a, b) => a.month - b.month));
	const series = $derived(seasonMonths.map((month) => {
		const relativeMonth = month.month - seasonMonths[0].month;
		return { ...month, label: MONTHS[relativeMonth] ?? `M${relativeMonth + 1}` };
	}));
	const byCat = $derived.by(() => {
		const acc: Record<string, number> = {};
		for (const month of seasonMonths) for (const [k, val] of Object.entries(month.byCategory)) acc[k] = (acc[k] ?? 0) + val;
		return acc;
	});
	const COLORS: Record<string, string> = { tv: '#34d399', patrocinio: '#60a5fa', bilheteria: '#e8b86a', premiacao: '#f5d08a', transferencias: '#a78bfa', bonus: '#fbbf24', salarios: '#f87171', estrutura: '#fb923c', obras: '#f472b6', base: '#22d3ee', comissao: '#94a3b8', rescisoes: '#ef4444' };
	const expenses = $derived(Object.entries(byCat).filter(([, val]) => val < 0).map(([k, val]) => ({ label: LEDGER_LABELS[k] ?? k, value: val, color: COLORS[k] ?? '#64748b' })));
	const incomes = $derived(Object.entries(byCat).filter(([, val]) => val > 0).map(([k, val]) => ({ label: LEDGER_LABELS[k] ?? k, value: val, color: COLORS[k] ?? '#64748b' })));
	const seasonIncome = $derived(incomes.reduce((s, x) => s + x.value, 0));
	const seasonExpense = $derived(expenses.reduce((s, x) => s + x.value, 0));
	const weeksLeft = $derived(Math.max(0, data.view.rounds - data.view.nextRound + 1));
	const projection = $derived(Math.round(club.balance + (m.monthlyResult / 4.33) * weeksLeft));
	const health = $derived(Math.max(0, Math.min(100, 55 + (club.balance / Math.max(1, m.eco.tvAnnual)) * 120 + (m.monthlyResult > 0 ? 12 : -12))));
	const healthText = $derived(health >= 66 ? 'Saudável: receitas cobrem a operação com folga.' : health >= 40 ? 'Atenção: margem apertada; evite novos salários altos.' : 'Risco: despesas acima das receitas. Venda ou corte custos.');

	async function act(body: Record<string, unknown>, ok: string) {
		busy = true;
		msg = '';
		try {
			await clubAction(c.id, c.version, body);
			msg = ok;
		} catch (e) {
			msg = (e as Error).message;
		} finally {
			busy = false;
		}
	}
	const ref = $derived(TICKET_REF[m.tier]);

</script>

<svelte:head><title>Finanças · {data.view.club.name} · BRASFC</title></svelte:head>

<section class="top">
	<div class="balance glass" data-umx-surface use:reveal>
		<span class="eyebrow-gold">Caixa do clube</span>
		<strong class="num-xl" class:neg={club.balance < 0} use:count={{ value: club.balance, format: formatMoney }}>{formatMoney(club.balance)}</strong>
		<div class="row sub">
			<span>Temporada: <b class="pos">{formatMoney(seasonIncome)}</b> entraram · <b class="neg">{formatMoney(seasonExpense)}</b> saíram</span>
		</div>
		<div class="proj" class:neg={projection < 0}>
			<Icon name="chart" size={16} /> Projeção para o fim da temporada: <strong>{formatMoney(projection)}</strong>
			<small>(receitas fixas − folha atual × {weeksLeft} semanas; bilheteria e premiações somam a isso)</small>
		</div>
	</div>
	<div class="health glass" use:reveal={{ index: 1 }}>
		<Gauge value={health} label="Saúde" caption={healthText} size={150} />
	</div>
	<div class="budgets glass" use:reveal={{ index: 2 }}>
		<div><span>Orçamento de transferências</span><strong>{formatMoney(club.transferBudget)}</strong></div>
		<div>
			<span>Folha mensal</span><strong>{formatMoney(m.payroll)}</strong>
			<div class="meter" title="Teto da diretoria: {formatMoney(club.wageBudget)}"><i style="width:{Math.min(100, (m.payroll / Math.max(1, club.wageBudget || m.payroll)) * 100)}%"></i></div>
			<small class="muted">Teto da diretoria: {formatMoney(club.wageBudget || m.payroll)}</small>
		</div>
		<div><span>Receita fixa mensal</span><strong>{formatMoney(m.monthlyIncome)}</strong></div>
		<a class="board-link" href="/carreira/{data.career.id}/gabinete#orcamento">Negociar verba com a diretoria →</a>
	</div>
</section>

<div class="spread section-head">
	<h2 class="display">Movimento da temporada</h2>
	<Segmented label="Visão" bind:value={mode} options={[{ value: 'resumo', label: 'Resumo' }, { value: 'detalhado', label: 'Detalhado' }]} />
</div>

{#if mode === 'resumo'}
	<div class="charts">
		<div class="glass pad" use:reveal>
			{#if series.length}<Bars months={series} />{:else}<p class="muted">O gráfico aparece depois da primeira semana da temporada.</p>{/if}
		</div>
		<div class="glass pad" use:reveal={{ index: 1 }}>
			<h3>Para onde vai o dinheiro</h3>
			{#if expenses.length}<Donut parts={expenses} label="Despesas por categoria" />{:else}<p class="muted">Sem despesas registradas ainda.</p>{/if}
			<h3>De onde vem</h3>
			{#if incomes.length}<Donut parts={incomes} label="Receitas por categoria" />{:else}<p class="muted">Sem receitas registradas ainda.</p>{/if}
		</div>
	</div>
{:else}
	<div class="glass pad ledger">
		<table>
			<thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th class="r">Valor</th></tr></thead>
			<tbody>
				{#each [...ledger].reverse().slice(0, 200) as l, i (i)}
					<tr><td class="num">{l.gameDate.split('-').reverse().join('/')}</td><td>{LEDGER_LABELS[l.category] ?? l.category}</td><td>{l.description}</td><td class="r num" class:pos={l.amount > 0} class:neg={l.amount < 0}>{formatMoney(l.amount)}</td></tr>
				{:else}
					<tr><td colspan="4" class="muted">Nenhum lançamento nesta temporada.</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<div class="lower">
	<section class="glass pad" use:reveal>
		<h2 class="display">Bilheteria</h2>
		<p class="muted">Preço de referência da divisão: R$ {ref}. Ingresso caro afasta o público e irrita a torcida; barato enche o estádio.</p>
		<label class="price">Ingresso médio <strong>R$ {price}</strong>
			<input type="range" min={Math.max(5, Math.round(ref * 0.3))} max={ref * 4} bind:value={price} />
		</label>
		<div class="row">
			<span class="chip">Capacidade {m.capacity.toLocaleString('pt-BR')}</span>
			<span class="chip">Humor da torcida {Math.round(club.fanMood)}/100</span>
			<Button size="sm" variant="primary" loading={busy} disabled={price === club.ticketPrice} onclick={() => act({ action: 'ingresso', price }, 'Preço atualizado.')}>Aplicar preço</Button>
		</div>
	</section>
	<SponsorContracts contracts={club.sponsors} offers={club.sponsorOffers} {busy}
		onsign={(o) => act({ action: 'patrocinio', offerId: o.id }, `Contrato com ${o.brand} assinado.`)} />
</div>
{#if msg}<p class="msg" role="status">{msg}</p>{/if}

<style>
	.board-link { font-size: var(--fs-sm); color: #f5c451; text-decoration: none; }
	.board-link:hover { text-decoration: underline; }
	.top {
		display: grid;
		grid-template-columns: 1.5fr auto 1fr;
		gap: var(--sp-4);
		margin-bottom: var(--sp-5);
	}
	.balance {
		padding: var(--sp-6);
		display: grid;
		gap: var(--sp-2);
		background:
			radial-gradient(90% 120% at 0% 0%, rgb(16 185 129 / 0.16), transparent 60%),
			var(--glass);
	}
	.balance .num-xl.neg {
		color: var(--danger);
	}
	.sub {
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.proj {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.proj strong {
		color: var(--emerald-strong);
	}
	.proj.neg strong {
		color: var(--danger);
	}
	.proj small {
		width: 100%;
		color: var(--text-3);
	}
	.health {
		padding: var(--sp-4) var(--sp-5);
		display: grid;
		place-items: center;
	}
	.budgets {
		padding: var(--sp-5);
		display: grid;
		gap: var(--sp-3);
		align-content: center;
	}
	.budgets span {
		display: block;
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-3);
		font-weight: 700;
	}
	.budgets strong {
		font-family: var(--font-display);
		font-size: var(--fs-xl);
	}
	.meter {
		height: 8px;
		border-radius: 8px;
		background: rgb(231 237 240 / 0.08);
		overflow: hidden;
		margin: 4px 0;
	}
	.meter i {
		display: block;
		height: 100%;
		background: linear-gradient(90deg, var(--emerald), var(--gold));
	}
	.section-head {
		margin: var(--sp-5) 0 var(--sp-3);
	}
	h2 {
		margin: 0;
		font-size: var(--fs-2xl);
	}
	h3 {
		margin: var(--sp-3) 0;
		font-size: var(--fs-sm);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--text-3);
	}
	.pad {
		padding: var(--sp-5);
	}
	.charts {
		display: grid;
		grid-template-columns: 1.6fr 1fr;
		gap: var(--sp-4);
	}
	.ledger {
		max-height: 520px;
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
		text-transform: uppercase;
		padding: 6px 8px;
		position: sticky;
		top: 0;
		background: var(--surface);
	}
	td {
		padding: 7px 8px;
		border-top: 1px solid var(--line);
	}
	.r {
		text-align: right;
	}
	.lower {
		display: grid;
		grid-template-columns: 1fr 2fr;
		gap: var(--sp-4);
		margin-top: var(--sp-5);
		align-items: start;
	}
	.price {
		display: grid;
		gap: 6px;
		margin: var(--sp-3) 0;
		color: var(--text-2);
	}
	.price input {
		accent-color: var(--gold);
	}
	.msg {
		margin-top: var(--sp-4);
		color: var(--text-2);
	}
	@media (max-width: 1100px) {
		.top,
		.charts,
		.lower {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
