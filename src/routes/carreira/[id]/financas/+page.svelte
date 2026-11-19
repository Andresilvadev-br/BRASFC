<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { SPONSOR_SLOTS, TICKET_REF } from '#lib/domain/club.ts';
	import { LEDGER_LABELS } from '#lib/domain/management.ts';
	import { formatExactMoney, formatMoney } from '#lib/domain/market.ts';
	import { count, reveal } from '#lib/motion/actions.ts';
	import { clubAction, clubHistory } from '#lib/client/club.ts';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';
	import Bars from '#lib/ui/v4/Bars.svelte';
	import Donut from '#lib/ui/v4/Donut.svelte';
	import Gauge from '#lib/ui/v4/Gauge.svelte';

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
	const series = $derived(club.months.filter((x) => x.season === c.season).map((x) => ({ label: MONTHS[Math.min(11, x.month)] ?? `M${x.month + 1}`, income: x.income, expense: x.expense, balance: x.balance })));
	const byCat = $derived.by(() => {
		const acc: Record<string, number> = {};
		for (const x of club.months.filter((y) => y.season === c.season)) for (const [k, val] of Object.entries(x.byCategory)) acc[k] = (acc[k] ?? 0) + val;
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

	// Patrocínios: filtro por categoria, ordenação e comparação lado a lado (até 3).
	type SlotFilter = 'todas' | keyof typeof SPONSOR_SLOTS;
	let slotFilter = $state<SlotFilter>('todas');
	let sortBy = $state<'valor' | 'duracao'>('valor');
	let compareIds = $state<string[]>([]);
	let openOffer = $state<string | null>(null);
	const takenSlots = $derived(new Set(club.sponsors.map((s) => s.slot)));
	const offerList = $derived(
		club.sponsorOffers
			.filter((o) => slotFilter === 'todas' || o.slot === slotFilter)
			.slice()
			.sort((a, b) => (sortBy === 'valor' ? b.monthly - a.monthly : b.seasons - a.seasons || b.monthly - a.monthly))
	);
	const bestBySlot = $derived(
		Object.fromEntries(Object.keys(SPONSOR_SLOTS).map((sl) => [sl, Math.max(0, ...club.sponsorOffers.filter((o) => o.slot === sl).map((o) => o.monthly))]))
	);
	const compared = $derived(club.sponsorOffers.filter((o) => compareIds.includes(o.id)));
	function toggleCompare(id: string) {
		compareIds = compareIds.includes(id) ? compareIds.filter((x) => x !== id) : [...compareIds, id].slice(-3);
	}
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
	<section class="glass pad sp" use:reveal={{ index: 1 }}>
		<div class="sph">
			<h2 class="display">Patrocínios</h2>
			<span class="muted small">{club.sponsors.length}/{Object.keys(SPONSOR_SLOTS).length} espaços ocupados</span>
		</div>
		{#if club.sponsors.length}
			<div class="active">
				{#each club.sponsors as s (s.id)}
					<div class="sponsor on">
						<span class="slotl">{SPONSOR_SLOTS[s.slot].label}</span>
						<strong>{s.brand}</strong>
						<span class="money">{formatExactMoney(s.monthly)}<small>/mês</small></span>
						<small class="muted">até {s.untilSeason}{s.bonus ? ` · bônus ${s.bonus.label}: +${formatExactMoney(s.bonus.amount)}` : ''}</small>
					</div>
				{/each}
			</div>
		{:else}
			<p class="muted">Nenhum contrato assinado. Compare as propostas abaixo.</p>
		{/if}
		{#if club.sponsorOffers.length}
			<div class="sptools">
				<h3>Propostas na mesa</h3>
				<div class="filters" role="radiogroup" aria-label="Categoria">
					<button role="radio" aria-checked={slotFilter === 'todas'} onclick={() => (slotFilter = 'todas')}>Todas <b>{club.sponsorOffers.length}</b></button>
					{#each Object.entries(SPONSOR_SLOTS) as [slot, info] (slot)}
						{@const n = club.sponsorOffers.filter((o) => o.slot === slot).length}
						{#if n}<button role="radio" aria-checked={slotFilter === slot} onclick={() => (slotFilter = slot as SlotFilter)}>{info.label} <b>{n}</b></button>{/if}
					{/each}
				</div>
				<label class="sort">Ordenar
					<select bind:value={sortBy}><option value="valor">Maior valor mensal</option><option value="duracao">Maior duração</option></select>
				</label>
			</div>

			{#if compared.length}
				<div class="cmp" use:reveal>
					<div class="cmph"><strong>Comparação</strong><button class="link" onclick={() => (compareIds = [])}>Limpar</button></div>
					<div class="cmptable" style="--n:{compared.length}">
						<span class="h"></span>{#each compared as o (o.id)}<strong class="h">{o.brand}</strong>{/each}
						<span class="lb">Categoria</span>{#each compared as o (o.id)}<span>{SPONSOR_SLOTS[o.slot].label}</span>{/each}
						<span class="lb">Mensal</span>{#each compared as o (o.id)}<b class="money">{formatExactMoney(o.monthly)}</b>{/each}
						<span class="lb">Duração</span>{#each compared as o (o.id)}<span>{o.seasons} temporada{o.seasons > 1 ? 's' : ''}</span>{/each}
						<span class="lb">Bônus</span>{#each compared as o (o.id)}<span>{o.bonus ? `${o.bonus.label}: ${formatExactMoney(o.bonus.amount)}` : '—'}</span>{/each}
						<span class="lb">Exigência</span>{#each compared as o (o.id)}<span class:warn={!!o.requirement}>{o.requirement?.label ?? 'Nenhuma'}</span>{/each}
					</div>
				</div>
			{/if}

			<div class="offers">
				{#each offerList as o (o.id)}
					{@const best = o.monthly === bestBySlot[o.slot]}
					<article class="offer" class:sel={compareIds.includes(o.id)} data-umx-surface>
						<div class="ot">
							<span class="slotl">{SPONSOR_SLOTS[o.slot].label}</span>
							{#if best}<span class="tag">Maior valor</span>{/if}
						</div>
						<strong class="brand">{o.brand}</strong>
						<span class="money big">{formatExactMoney(o.monthly)}<small>/mês</small></span>
						<div class="facts">
							<span>{o.seasons} temporada{o.seasons > 1 ? 's' : ''}</span>
							{#if o.bonus}<span class="bonus">Bônus {o.bonus.label}: {formatExactMoney(o.bonus.amount)}</span>{/if}
							{#if o.requirement}<span class="warn">Exige: {o.requirement.label}</span>{/if}
						</div>
						<div class="det" class:open={openOffer === o.id}>
							<div>
								<p class="small">
									{#if o.requirement}Se a exigência não for cumprida ao fim da temporada, a marca encerra o contrato.{:else}Sem exigência de desempenho: o contrato vale até o fim do prazo.{/if}
									{#if o.bonus} O bônus é pago uma vez se a meta "{o.bonus.label}" for alcançada.{/if}
									{#if takenSlots.has(o.slot)} Atenção: você já tem um contrato nesta categoria.{/if}
								</p>
							</div>
						</div>
						<div class="oa">
							<Button size="sm" variant="primary" loading={busy} onclick={() => act({ action: 'patrocinio', offerId: o.id }, `Contrato com ${o.brand} assinado.`)}>Assinar</Button>
							<button class="mini" aria-pressed={compareIds.includes(o.id)} onclick={() => toggleCompare(o.id)}>{compareIds.includes(o.id) ? 'Comparando' : 'Comparar'}</button>
							<button class="mini" aria-expanded={openOffer === o.id} onclick={() => (openOffer = openOffer === o.id ? null : o.id)}>Detalhes</button>
						</div>
					</article>
				{/each}
			</div>
			<p class="muted small">Marcas fictícias do universo BRASFC.</p>
		{/if}
	</section>
</div>
{#if msg}<p class="msg" role="status">{msg}</p>{/if}

<style>
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
	.sph,
	.sptools {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}
	.sptools {
		margin-top: var(--sp-4);
	}
	.sptools h3 {
		margin: 0;
	}
	.active {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr));
		gap: var(--sp-2);
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		padding: 4px;
		border-radius: 12px;
		background: var(--surface-sunken);
	}
	.filters button {
		border: 0;
		border-radius: 9px;
		padding: 6px 10px;
		background: none;
		color: var(--text-3);
		font: inherit;
		font-size: var(--fs-xs);
		font-weight: 700;
		cursor: pointer;
		transition: background 0.2s, color 0.2s;
	}
	.filters button[aria-checked='true'] {
		background: var(--surface-3);
		color: var(--text);
	}
	.filters b {
		margin-left: 2px;
		color: var(--text-3);
	}
	.sort {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.sort select {
		padding: 5px 8px;
		border-radius: 8px;
		background: #1c252b;
		color: var(--text);
		border: 1px solid var(--line-strong);
	}
	.money {
		font-family: var(--font-display);
		font-weight: 800;
		white-space: nowrap;
	}
	.money small {
		font-size: 0.6em;
		color: var(--text-3);
	}
	.slotl {
		font-size: 10.5px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-3);
	}
	.offers {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 230px), 1fr));
		gap: var(--sp-3);
		margin-top: var(--sp-3);
	}
	.ot {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 6px;
	}
	.tag {
		font-size: 10px;
		font-weight: 800;
		padding: 1px 6px;
		border-radius: 6px;
		background: var(--emerald-soft);
		color: var(--emerald-strong);
	}
	.brand {
		font-size: var(--fs-md, 17px);
		line-height: 1.2;
	}
	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.facts span {
		font-size: 11px;
		padding: 2px 7px;
		border-radius: 6px;
		background: var(--surface-3);
		color: var(--text-2);
	}
	.facts .warn {
		background: color-mix(in srgb, var(--warning) 14%, transparent);
	}
	.facts .bonus {
		background: color-mix(in srgb, var(--gold) 14%, transparent);
		color: var(--gold);
	}
	.det {
		display: grid;
		grid-template-rows: 0fr;
		transition: grid-template-rows 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	.det.open {
		grid-template-rows: 1fr;
	}
	.det > div {
		overflow: hidden;
	}
	.det p {
		margin: 6px 0 0;
		color: var(--text-2);
		line-height: 1.45;
	}
	.oa {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin-top: 4px;
	}
	.mini {
		border: 1px solid var(--line-strong);
		border-radius: 999px;
		padding: 5px 10px;
		background: none;
		color: var(--text-2);
		font: inherit;
		font-size: var(--fs-xs);
		font-weight: 700;
		cursor: pointer;
	}
	.mini[aria-pressed='true'] {
		border-color: var(--emerald);
		color: var(--emerald-strong);
	}
	.offer.sel {
		border-color: var(--emerald);
	}
	.cmp {
		margin-top: var(--sp-3);
		padding: var(--sp-3);
		border-radius: var(--radius-m);
		background: rgb(10 13 16 / 0.45);
		border: 1px solid var(--line);
		overflow-x: auto;
	}
	.cmph {
		display: flex;
		justify-content: space-between;
		margin-bottom: 8px;
	}
	.cmptable {
		display: grid;
		grid-template-columns: 90px repeat(var(--n), minmax(130px, 1fr));
		gap: 6px 12px;
		font-size: var(--fs-xs);
		color: var(--text-2);
	}
	.cmptable .h {
		font-size: var(--fs-sm);
		color: var(--text);
	}
	.cmptable .lb {
		color: var(--text-3);
	}
	.link {
		border: 0;
		background: none;
		color: var(--emerald-strong);
		font: inherit;
		font-size: var(--fs-xs);
		text-decoration: underline;
		cursor: pointer;
	}
	.sponsor {
		display: grid;
		gap: 2px;
		padding: var(--sp-3);
		border-radius: var(--radius-m);
		background: rgb(10 13 16 / 0.4);
		margin: var(--sp-2) 0;
	}
	.offer {
		position: relative;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
		transition: border-color 0.2s, transform 0.2s;
		border-radius: var(--radius-m);
		background: rgb(10 13 16 / 0.45);
		border: 1px solid var(--line);
	}
	.big {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: var(--fs-lg);
	}
	.big small {
		font-size: 0.55em;
		color: var(--text-3);
	}
	.warn {
		color: var(--warning);
	}
	.small {
		font-size: var(--fs-xs);
	}
	.msg {
		margin-top: var(--sp-4);
		color: var(--text-2);
	}
	@media (max-width: 1100px) {
		.top,
		.charts,
		.lower {
			grid-template-columns: 1fr;
		}
	}
</style>
