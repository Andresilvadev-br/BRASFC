<script lang="ts">
	import { estimateRange } from '#lib/domain/academy.ts';
	import { scoutMargin } from '#lib/domain/club.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { DIVISION_LABELS, type DivisionId } from '#lib/domain/league.ts';
	import { expectedWage, formatMoney, rosterOf, ROLE_LABELS, type ContractRole, type RosterPlayer } from '#lib/domain/market.ts';
	import type { Position } from '#lib/domain/positions.ts';
	import { reveal } from '#lib/motion/actions.ts';
	import { celebrate } from '#lib/motion/motion.svelte.ts';
	import { clubAction } from '#lib/client/club.ts';
	import Button from '#lib/ui/Button.svelte';
	import Crest from '#lib/ui/Crest.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';
	import PlayerCard from '#lib/ui/v4/PlayerCard.svelte';
	import Sheet from '#lib/ui/v4/Sheet.svelte';

	let { data } = $props();
	const c = $derived(data.career);
	const m = $derived(data.manage);
	const v = $derived(data.view);

	type Tab = 'buscar' | 'propostas' | 'negociacoes' | 'venda' | 'observados' | 'livres';
	let tab = $state<Tab>('buscar');
	const POS: Position[] = ['GOL', 'LD', 'ZAG', 'LE', 'VOL', 'MC', 'MEI', 'PD', 'PE', 'ATA'];
	let pos = $state<Position | null>(null);
	let maxAge = $state(34);
	let maxValue = $state(0);
	let divFilter = $state<DivisionId>('serie-a');
	let sort = $state<'valor' | 'nivel' | 'idade'>('nivel');
	let limit = $state(36);

	const obs = $derived(m.club.infra.observacao.level);
	const reports = $derived(new Map(m.club.reports.map((r) => [r.playerId, r])));
	const divisions = $derived((Object.keys(v.league.divisions) as DivisionId[]).filter((d) => v.league.divisions[d]?.length));
	const myStrength = $derived(v.strength);

	/** O que o clube "enxerga": relatório de olheiro > estimativa pela estrutura de observação. */
	function known(p: RosterPlayer): { ovr: number | null; range: [number, number] | null; pot: [number, number] | null } {
		const r = reports.get(p.id);
		if (r) return { ovr: null, range: r.overall, pot: r.potential };
		return { ovr: null, range: estimateRange(p.overall, scoutMargin(obs, 6) + 2, `${c.id}:${p.id}`), pot: null };
	}

	const pool = $derived.by(() => {
		const ids = v.league.divisions[divFilter] ?? [];
		const out: RosterPlayer[] = [];
		for (const club of ids) if (club !== c.clubId) out.push(...rosterOf(m.ctx, club));
		return out;
	});
	const filtered = $derived.by(() => {
		let list = pool.filter((p) => (!pos || p.position === pos) && p.age <= maxAge && (!maxValue || p.value <= maxValue * 1_000_000) && !p.loan);
		list = [...list].sort((a, b) => (sort === 'valor' ? b.value - a.value : sort === 'idade' ? a.age - b.age : b.overall - a.overall));
		return list;
	});
	const free = $derived(m.freeAgents());
	const shortlisted = $derived.by(() => {
		const set = new Set(m.market.shortlist);
		const out: RosterPlayer[] = [];
		for (const d of divisions) for (const club of v.league.divisions[d] ?? []) for (const p of rosterOf(m.ctx, club)) if (set.has(p.id)) out.push(p);
		return out;
	});

	// ── negociação
	let sheet = $state(false);
	let target = $state<RosterPlayer | null>(null);
	let kind = $state<'compra' | 'emprestimo' | 'livre'>('compra');
	let fee = $state(0);
	let wage = $state(0);
	let years = $state(3);
	let role = $state<ContractRole>('rotacao');
	let share = $state(1);
	let busy = $state(false);
	let answer = $state<{ club: string; player: string | null; message: string; done: boolean } | null>(null);
	let errorMsg = $state('');

	function open(p: RosterPlayer, k: 'compra' | 'emprestimo' | 'livre' = 'compra') {
		target = p;
		kind = k;
		fee = Math.round(p.value * 1.1);
		wage = Math.round(Math.max(p.contract.wage, expectedWage(p.overall, m.tier, p.age)) * 1.05);
		years = p.age >= 30 ? 2 : 3;
		role = p.overall >= myStrength ? 'titular' : 'rotacao';
		share = 1;
		answer = null;
		errorMsg = '';
		sheet = true;
	}

	async function send(e?: MouseEvent) {
		if (!target) return;
		busy = true;
		errorMsg = '';
		answer = null;
		try {
			const r = await clubAction(c.id, c.version, { action: 'oferta', playerId: target.id, kind, fee: kind === 'compra' ? Math.round(fee) : 0, wage: Math.round(wage), years, role, wageShare: share });
			answer = r.negotiation ? { club: r.negotiation.club_answer, player: r.negotiation.player_answer, message: r.negotiation.message, done: r.negotiation.done } : { club: 'aceita', player: 'aceita', message: r.message, done: true };
			if (answer.done && e) celebrate(e.clientX, e.clientY);
		} catch (err) {
			errorMsg = (err as Error).message;
		} finally {
			busy = false;
		}
	}

	async function act(body: Record<string, unknown>) {
		busy = true;
		errorMsg = '';
		try {
			await clubAction(c.id, c.version, body);
		} catch (err) {
			errorMsg = (err as Error).message;
		} finally {
			busy = false;
		}
	}
	const windowLabel = $derived(m.window === 'pre-temporada' ? 'Janela aberta · pré-temporada' : m.window === 'meio-do-ano' ? 'Janela aberta · meio do ano' : 'Janela fechada');
	const stageOf = (s: string | null) => (s === 'aceita' ? 'ok' : s === 'contraproposta' ? 'mid' : s ? 'no' : 'idle');
</script>

<svelte:head><title>Mercado · {v.club.name} · BRASFC</title></svelte:head>

<section class="hero glass" use:reveal>
	<div>
		<span class="eyebrow-gold">Mercado de transferências</span>
		<h1 class="display">Montar o elenco</h1>
		<p class="muted">Negociações reais: o clube dono responde pelo valor, o atleta e o empresário respondem pelo contrato. Tudo passa pelo servidor e respeita orçamento e teto salarial.</p>
	</div>
	<div class="kpis">
		<div class="kpi" class:open={!!m.window}><Icon name="clock" size={18} /><span>{windowLabel}</span></div>
		<div class="kpi"><span>Orçamento</span><strong>{formatMoney(m.club.transferBudget)}</strong></div>
		<div class="kpi wide">
			<span>Folha {formatMoney(m.payroll)} de {formatMoney(m.club.wageBudget || m.payroll)}</span>
			<div class="meter"><i style="width:{Math.min(100, (m.payroll / Math.max(1, m.club.wageBudget || m.payroll)) * 100)}%"></i></div>
		</div>
	</div>
</section>

<div class="tabs">
	<Segmented
		label="Seção do mercado"
		bind:value={tab}
		options={[
			{ value: 'buscar', label: 'Buscar' },
			{ value: 'propostas', label: `Propostas (${m.club.incoming.length})` },
			{ value: 'negociacoes', label: 'Negociações' },
			{ value: 'venda', label: 'Meu elenco' },
			{ value: 'observados', label: `Observados (${m.market.shortlist.length})` },
			{ value: 'livres', label: `Livres (${free.length})` }
		]}
	/>
</div>
{#if errorMsg && !sheet}<p class="error" role="alert">{errorMsg}</p>{/if}

{#if tab === 'buscar'}
	<div class="filters glass">
		<div class="row" role="group" aria-label="Posição">
			<button class="chip" aria-pressed={pos === null} onclick={() => (pos = null)}>Todas</button>
			{#each POS as p (p)}<button class="chip" aria-pressed={pos === p} onclick={() => (pos = pos === p ? null : p)}>{p}</button>{/each}
		</div>
		<div class="row controls">
			<label>Divisão <select bind:value={divFilter}>{#each divisions as d (d)}<option value={d}>{DIVISION_LABELS[d]}</option>{/each}</select></label>
			<label>Idade até <strong>{maxAge}</strong><input type="range" min="17" max="38" bind:value={maxAge} /></label>
			<label>Valor até <input type="number" min="0" step="0.5" bind:value={maxValue} placeholder="sem limite" /> mi</label>
			<label>Ordenar <select bind:value={sort}><option value="nivel">Nível</option><option value="valor">Valor</option><option value="idade">Idade</option></select></label>
			<span class="muted count">{filtered.length} atletas</span>
		</div>
	</div>
	<div class="grid-auto" style="--min:220px">
		{#each filtered.slice(0, limit) as p, i (p.id)}
			{@const k = known(p)}
			<div use:reveal={{ index: i % 12 }}>
				<PlayerCard
					name={p.name}
					position={p.position}
					age={p.age}
					overall={k.ovr}
					overallRange={k.range}
					potential={k.pot}
					value={p.value}
					clubId={p.club}
					contract="Contrato até {p.contract.until}"
					tags={[...(reports.has(p.id) ? ['Relatório'] : []), ...(m.market.shortlist.includes(p.id) ? ['Observado'] : [])]}
					onclick={() => open(p)}
				/>
			</div>
		{/each}
	</div>
	{#if filtered.length > limit}<div class="more"><Button variant="secondary" onclick={() => (limit += 36)}>Mostrar mais</Button></div>{/if}
{:else if tab === 'propostas'}
	{#if !m.club.incoming.length}<p class="empty glass">Nenhuma proposta em aberto. Atletas colocados à venda atraem mais interessados durante a janela.</p>{/if}
	<div class="grid-auto" style="--min:300px">
		{#each m.club.incoming as o (o.id)}
			{@const p = m.roster.find((x) => x.id === o.playerId)}
			<article class="offer glass" use:reveal>
				<div class="spread"><Crest clubId={o.club} size={36} /><span class="chip">{o.kind === 'emprestimo' ? 'Empréstimo' : 'Compra'}</span></div>
				<h3>{getClub(o.club)?.name ?? o.club}</h3>
				<p>quer <strong>{p?.name ?? 'atleta'}</strong> ({p?.position}, {p?.age} anos)</p>
				<p class="num-xl">{o.fee ? formatMoney(o.fee) : 'Sem custo'}</p>
				<p class="muted">Valor estimado: {p ? formatMoney(p.value) : '—'} · expira na rodada {o.expiresRound}</p>
				<div class="row">
					<Button variant="primary" loading={busy} disabled={!m.window} onclick={() => act({ action: 'responder', offerId: o.id, accept: true })}>Aceitar</Button>
					<Button variant="ghost" disabled={busy} onclick={() => act({ action: 'responder', offerId: o.id, accept: false })}>Recusar</Button>
				</div>
			</article>
		{/each}
	</div>
{:else if tab === 'negociacoes'}
	<ol class="timeline">
		{#each [...m.club.negotiations].reverse() as n (n.id)}
			<li class="glass" use:reveal>
				<span class="dot" data-s={n.done ? 'ok' : 'no'}></span>
				<div>
					<strong>{n.offer.kind === 'emprestimo' ? 'Empréstimo' : n.offer.kind === 'livre' ? 'Jogador livre' : 'Compra'} · {n.playerId}</strong>
					<p class="muted">Temporada {n.season}, rodada {n.round} · {n.club ? (getClub(n.club)?.name ?? n.club) : 'sem clube'}{n.offer.fee ? ` · ${formatMoney(n.offer.fee)}` : ''}</p>
					<p>{n.message}</p>
				</div>
			</li>
		{:else}
			<p class="empty glass">Nenhuma negociação ainda.</p>
		{/each}
	</ol>
{:else if tab === 'venda'}
	<div class="grid-auto" style="--min:220px">
		{#each [...m.roster].sort((a, b) => b.value - a.value) as p, i (p.id)}
			<div use:reveal={{ index: i % 12 }}>
				<PlayerCard name={p.name} position={p.position} age={p.age} overall={p.overall} value={p.value} contract="{ROLE_LABELS[p.contract.role]} · {formatMoney(p.contract.wage)}/mês · até {p.contract.until}" tags={[...(m.market.listed.includes(p.id) ? ['À venda'] : []), ...(p.loan ? ['Emprestado'] : [])]}>
					{#snippet actions()}
						<Button size="sm" variant={m.market.listed.includes(p.id) ? 'secondary' : 'ghost'} disabled={busy || p.id === 'eu'} onclick={() => act({ action: 'listar', playerId: p.id })}>{m.market.listed.includes(p.id) ? 'Retirar da venda' : 'Pôr à venda'}</Button>
					{/snippet}
				</PlayerCard>
			</div>
		{/each}
	</div>
{:else if tab === 'observados'}
	<div class="grid-auto" style="--min:220px">
		{#each shortlisted as p (p.id)}
			{@const k = known(p)}
			<PlayerCard name={p.name} position={p.position} age={p.age} overall={k.ovr} overallRange={k.range} potential={k.pot} value={p.value} clubId={p.club} onclick={() => open(p)} />
		{:else}
			<p class="empty glass">Use “Observar” na negociação para acompanhar atletas aqui.</p>
		{/each}
	</div>
{:else}
	<div class="grid-auto" style="--min:220px">
		{#each free as p (p.id)}
			{@const k = known(p)}
			<PlayerCard name={p.name} position={p.position} age={p.age} overall={k.ovr} overallRange={k.range} potential={k.pot} value={null} contract="Sem clube · pede cerca de {formatMoney(expectedWage(p.overall, m.tier, p.age))}/mês" onclick={() => open(p, 'livre')} />
		{:else}
			<p class="empty glass">Nenhum jogador livre no momento. Contratos que terminam sem renovação liberam atletas aqui.</p>
		{/each}
	</div>
{/if}

<Sheet bind:open={sheet} title={target?.name ?? ''} subtitle={target ? `${target.position} · ${target.age} anos · ${target.club ? (getClub(target.club)?.name ?? '') : 'sem clube'}` : ''}>
	{#if target}
		{@const k = known(target)}
		<div class="facts">
			<div><span>Nível estimado</span><strong>{k.range ? `${k.range[0]}–${k.range[1]}` : '?'}</strong></div>
			<div><span>Potencial</span><strong>{k.pot ? `${k.pot[0]}–${k.pot[1]}` : 'precisa de olheiro'}</strong></div>
			<div><span>Valor</span><strong>{target.value ? formatMoney(target.value) : '—'}</strong></div>
			<div><span>Salário atual</span><strong>{formatMoney(target.contract.wage)}</strong></div>
		</div>
		<p class="muted small">Perfil: {target.archetype || 'não informado'}. Relatório de olheiro {reports.has(target.id) ? 'disponível' : 'ainda não feito'}.</p>

		{#if kind !== 'livre'}
			<Segmented label="Tipo de proposta" bind:value={kind} options={[{ value: 'compra', label: 'Compra' }, { value: 'emprestimo', label: 'Empréstimo' }]} />
		{/if}
		<div class="form">
			{#if kind === 'compra'}
				<label>Valor ao clube <span class="out">{formatMoney(fee)}</span><input type="range" min={Math.round(target.value * 0.5)} max={Math.round(target.value * 2.2)} step="5000" bind:value={fee} /></label>
			{/if}
			{#if kind === 'emprestimo'}
				<label>Você paga {Math.round(share * 100)}% do salário<input type="range" min="0.3" max="1" step="0.05" bind:value={share} /></label>
			{:else}
				<label>Salário mensal <span class="out">{formatMoney(wage)}</span><input type="range" min={Math.round(wage * 0.5)} max={Math.round(Math.max(wage, 10000) * 2.5)} step="500" bind:value={wage} /></label>
				<label>Contrato <span class="out">{years} temporada{years > 1 ? 's' : ''}</span><input type="range" min="1" max="5" bind:value={years} /></label>
				<label>Participação prometida <select bind:value={role}>{#each Object.entries(ROLE_LABELS) as [k2, l] (k2)}<option value={k2}>{l}</option>{/each}</select></label>
			{/if}
		</div>

		<ol class="stages" aria-live="polite">
			<li data-s={kind === 'livre' ? 'skip' : stageOf(answer?.club ?? null)}><span>1</span>Clube</li>
			<li data-s={stageOf(answer?.player ?? null)}><span>2</span>Atleta e empresário</li>
			<li data-s={answer?.done ? 'ok' : 'idle'}><span>3</span>Assinatura</li>
		</ol>
		{#if answer}<p class="answer" class:ok={answer.done}>{answer.message}</p>{/if}
		{#if errorMsg}<p class="error" role="alert">{errorMsg}</p>{/if}
		{#if !m.window && kind !== 'livre'}<p class="muted small">A janela está fechada: compras e empréstimos só na pré-temporada (até a 8ª rodada) e no meio do ano (rodadas 22 a 27). Jogadores livres podem ser contratados a qualquer momento.</p>{/if}
	{/if}
	{#snippet footer()}
		{#if target}
			<Button variant="ghost" icon="eye" disabled={busy} onclick={() => act({ action: 'observar', playerId: target!.id })}>{m.market.shortlist.includes(target.id) ? 'Deixar de observar' : 'Observar'}</Button>
			<Button variant="primary" loading={busy} disabled={answer?.done || (!m.window && kind !== 'livre')} onclick={(e: MouseEvent) => send(e)}>Enviar proposta</Button>
		{/if}
	{/snippet}
</Sheet>

<style>
	.hero {
		display: grid;
		grid-template-columns: 1.4fr 1fr;
		gap: var(--sp-6);
		padding: var(--sp-6);
		margin-bottom: var(--sp-5);
		background:
			radial-gradient(80% 120% at 100% 0%, rgb(232 184 106 / 0.12), transparent 60%),
			var(--glass);
	}
	h1 {
		font-size: var(--fs-3xl);
		margin: 6px 0 8px;
	}
	.kpis {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-3);
		align-content: center;
	}
	.kpi {
		display: grid;
		gap: 4px;
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-m);
		background: rgb(10 13 16 / 0.4);
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.kpi:first-child {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--text-2);
		font-weight: 700;
	}
	.kpi.open {
		color: var(--emerald-strong);
	}
	.kpi strong {
		font-family: var(--font-display);
		font-size: var(--fs-xl);
		color: var(--text);
	}
	.kpi.wide {
		grid-column: 1 / -1;
	}
	.meter {
		height: 8px;
		border-radius: 8px;
		background: rgb(231 237 240 / 0.08);
		overflow: hidden;
	}
	.meter i {
		display: block;
		height: 100%;
		background: linear-gradient(90deg, var(--emerald), var(--gold));
		transition: width 0.6s var(--ease-out);
	}
	.tabs {
		margin-bottom: var(--sp-4);
		overflow-x: auto;
	}
	.filters {
		padding: var(--sp-4);
		margin-bottom: var(--sp-4);
		display: grid;
		gap: var(--sp-3);
	}
	.controls label {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.controls input[type='number'] {
		width: 80px;
	}
	select,
	input[type='number'] {
		background: var(--surface-sunken);
		color: var(--text);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-s);
		padding: 6px 8px;
	}
	.count {
		margin-left: auto;
	}
	.more {
		display: grid;
		place-items: center;
		margin-top: var(--sp-4);
	}
	.offer {
		padding: var(--sp-5);
		display: grid;
		gap: 6px;
	}
	.offer h3 {
		margin: 6px 0 0;
		font-family: var(--font-display);
		text-transform: uppercase;
		font-size: var(--fs-xl);
	}
	.offer p {
		margin: 0;
	}
	.empty {
		padding: var(--sp-6);
		text-align: center;
		color: var(--text-2);
	}
	.timeline {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--sp-3);
	}
	.timeline li {
		display: grid;
		grid-template-columns: 16px 1fr;
		gap: var(--sp-3);
		padding: var(--sp-4);
	}
	.timeline p {
		margin: 2px 0;
	}
	.dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		margin-top: 4px;
		background: var(--danger);
	}
	.dot[data-s='ok'] {
		background: var(--emerald);
	}
	.facts {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-3);
		margin-bottom: var(--sp-3);
	}
	.facts div {
		padding: var(--sp-3);
		border-radius: var(--radius-m);
		background: rgb(10 13 16 / 0.4);
		display: grid;
	}
	.facts span {
		font-size: 11px;
		color: var(--text-3);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-weight: 700;
	}
	.facts strong {
		font-size: var(--fs-lg);
	}
	.small {
		font-size: var(--fs-xs);
	}
	.form {
		display: grid;
		gap: var(--sp-3);
		margin: var(--sp-4) 0;
	}
	.form label {
		display: grid;
		gap: 6px;
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.out {
		float: right;
		color: var(--text);
		font-weight: 700;
	}
	input[type='range'] {
		accent-color: var(--emerald);
		width: 100%;
	}
	.stages {
		list-style: none;
		padding: 0;
		margin: var(--sp-4) 0 var(--sp-2);
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 6px;
		counter-reset: s;
	}
	.stages li {
		display: grid;
		justify-items: center;
		gap: 6px;
		font-size: var(--fs-xs);
		color: var(--text-3);
		text-align: center;
	}
	.stages span {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-weight: 800;
		background: rgb(231 237 240 / 0.07);
		color: var(--text-2);
		transition: background 0.3s var(--ease-out), transform 0.3s var(--ease-out);
	}
	.stages li[data-s='ok'] span {
		background: var(--emerald);
		color: #04140e;
		transform: scale(1.08);
	}
	.stages li[data-s='mid'] span {
		background: var(--gold);
		color: #1a1206;
	}
	.stages li[data-s='no'] span {
		background: var(--danger);
		color: #1a0606;
	}
	.stages li[data-s='skip'] {
		opacity: 0.4;
	}
	.answer {
		padding: var(--sp-3);
		border-radius: var(--radius-m);
		background: rgb(248 113 113 / 0.1);
		color: var(--text);
	}
	.answer.ok {
		background: var(--emerald-soft);
	}
	.error {
		color: var(--danger);
		font-weight: 600;
	}
	@media (max-width: 900px) {
		.hero {
			grid-template-columns: 1fr;
		}
	}
</style>
