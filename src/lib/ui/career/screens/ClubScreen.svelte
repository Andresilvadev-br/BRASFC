<script lang="ts">
	import { careerPort } from '#lib/career/port.ts';
	import type { CareerScreenData } from '#lib/career/screen-data.ts';
	import { isOfferOpen } from '#lib/domain/employment.ts';
	import { goto } from '$app/navigation';
	import { BOARD_PROFILES, FACILITIES, FACILITY_INFO, upgradeCost } from '#lib/domain/club.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { DIVISION_LABELS, type DivisionId } from '#lib/domain/league.ts';
	import { formatMoney } from '#lib/domain/market.ts';
	import { reveal } from '#lib/motion/actions.ts';
	import Button from '#lib/ui/Button.svelte';
	import Crest from '#lib/ui/Crest.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Gauge from '#lib/ui/v4/Gauge.svelte';
	import Trophy from '#lib/ui/v4/Trophy.svelte';

	let { data }: { data: CareerScreenData } = $props();
	const port = careerPort();
	const c = $derived(data.career);
	const m = $derived(data.manage);
	const club = $derived(m.club);
	const coach = $derived(c.mode === 'coach');
	let busy = $state(false);
	let msg = $state('');

	async function act(body: Record<string, unknown>, ok?: string) {
		busy = true;
		msg = '';
		try {
			const r = await port.clubAction(body);
			msg = ok ?? r.message;
			if (body.action === 'emprego') await goto(port.href('central'), { invalidateAll: true });
		} catch (e) {
			msg = (e as Error).message;
		} finally {
			busy = false;
		}
	}
	const objectiveState = (kind: string, target: number) => {
		const row = data.view.standings.find((r) => r.clubId === c.clubId);
		if (!row) return 'aberto';
		if (kind === 'liga-posicao' || kind === 'acesso') return row.position <= target ? 'no-alvo' : 'abaixo';
		if (kind === 'permanencia') return row.position <= target ? 'no-alvo' : 'abaixo';
		if (kind === 'saldo') return club.balance >= target * 1e6 ? 'no-alvo' : 'abaixo';
		if (kind === 'base') return club.youthMinutes >= target ? 'no-alvo' : 'em-andamento';
		return 'em-andamento';
	};
	const levelName = ['', 'Básica', 'Regular', 'Boa', 'Excelente', 'Referência'];
	const openJobOffers = $derived(club.jobOffers.filter((o) => isOfferOpen(o, c.season, Math.max(0, data.view.nextRound - 1))));
</script>

<svelte:head><title>{coach ? 'Clube' : 'Minha carreira'} · {data.view.club.name} · BRASFC</title></svelte:head>

{#if coach}
	{#if club.board.dismissed}
		<section class="fired glass gold" use:reveal>
			<Icon name="alert" size={28} />
			<div>
				<h1 class="display">Fim de ciclo</h1>
				<p>A diretoria decidiu pela sua saída. Escolha uma das propostas para continuar a carreira em outro clube.</p>
			</div>
		</section>
	{/if}

	<section class="board">
		<div class="glass pad who" use:reveal>
			<span class="eyebrow-gold">Diretoria</span>
			<h1 class="display">{BOARD_PROFILES[club.board.profile].label}</h1>
			<p class="muted">{BOARD_PROFILES[club.board.profile].summary}</p>
			<div class="weights">
				{#each [['Resultados', BOARD_PROFILES[club.board.profile].results], ['Finanças', BOARD_PROFILES[club.board.profile].money], ['Base', BOARD_PROFILES[club.board.profile].youth], ['Paciência', BOARD_PROFILES[club.board.profile].patience]] as [label, w] (label)}
					<div><span>{label}</span><i style="--w:{Math.min(100, (Number(w) / 1.6) * 100)}%"></i></div>
				{/each}
			</div>
		</div>
		<div class="glass pad center" use:reveal={{ index: 1 }}>
			<Gauge value={club.board.confidence} label="Confiança" caption={club.board.confidence < 30 ? 'Pressão alta: resultados urgentes.' : club.board.confidence < 50 ? 'A diretoria observa de perto.' : 'Trabalho respaldado.'} size={170} />
		</div>
		<div class="glass pad" use:reveal={{ index: 2 }}>
			<h2 class="display">Objetivos de {c.season}</h2>
			<ul class="goals">
				{#each club.board.objectives as o (o.label)}
					{@const st = objectiveState(o.kind, o.target)}
					<li data-s={st}><span class="dot"></span><span>{o.label}</span><small>{st === 'no-alvo' ? 'no alvo' : st === 'abaixo' ? 'abaixo' : 'em andamento'}</small></li>
				{:else}
					<li class="muted">Os objetivos são definidos na primeira semana da temporada.</li>
				{/each}
			</ul>
			<p class="muted small">Reputação do treinador: {Math.round(club.coachReputation)}/100</p>
		</div>
	</section>

	{#if openJobOffers.length}
		<a class="jobs glass" href={port.href('gabinete', 'propostas')} use:reveal data-umx-press>
			<Icon name="briefcase" size={22} />
			<span><strong>{openJobOffers.length} {openJobOffers.length === 1 ? 'clube interessado' : 'clubes interessados'} em você</strong><small class="muted">Avalie elenco, finanças e projeto na Central de Propostas, no Gabinete.</small></span>
			<Icon name="arrowRight" size={18} />
		</a>
	{/if}

	<h2 class="display section">Estrutura</h2>
	<div class="grid-auto" style="--min:250px">
		{#each FACILITIES as f, i (f)}
			{@const info = FACILITY_INFO[f]}
			{@const st = club.infra[f]}
			{@const up = upgradeCost(f, st.level, m.tier)}
			<article class="fac glass" data-umx-surface use:reveal={{ index: i }}>
				<div class="spread"><h3>{info.label}</h3><span class="lvl">{levelName[st.level]}</span></div>
				<div class="pips" aria-label="Nível {st.level} de 5">{#each [1, 2, 3, 4, 5] as l (l)}<i class:on={l <= st.level} class:next={st.project && l === st.project.target}></i>{/each}</div>
				<p class="muted">{info.effect(st.level)}</p>
				{#if st.project}
					{@const left = Math.max(0, st.project.readyWeek - club.week)}
					<div class="building"><Icon name="clock" size={16} /> Obra para o nível {st.project.target}: {left} semana{left === 1 ? '' : 's'}</div>
				{:else if st.level < 5}
					<p class="next">Próximo nível: {info.effect(st.level + 1)}</p>
					<Button size="sm" variant="secondary" loading={busy} disabled={up.cost > club.balance} onclick={() => act({ action: 'obra', facility: f }, `Obra iniciada: ${info.label}.`)}>Investir {formatMoney(up.cost)} · {up.weeks} semanas</Button>
				{:else}
					<p class="next">Nível máximo.</p>
				{/if}
			</article>
		{/each}
	</div>

	<section class="fans glass pad" use:reveal>
		<Gauge value={club.fanMood} label="Torcida" size={130} caption="Reage a vitórias, clássicos, títulos e ao preço do ingresso." />
		<div>
			<h2 class="display">Estádio e torcida</h2>
			<p class="muted">Capacidade atual: <strong>{m.capacity.toLocaleString('pt-BR')}</strong> lugares · ingresso médio R$ {club.ticketPrice}.</p>
			<p class="muted">Público maior aumenta a bilheteria e a pressão sobre o visitante. Ajuste o preço em Finanças.</p>
		</div>
	</section>
{/if}
{#if msg}<p class="msg" role="status">{msg}</p>{/if}

<style>
	.jobs { display: flex; gap: var(--sp-3); align-items: center; padding: var(--sp-4); border-radius: 16px; text-decoration: none; color: inherit; border: 1px solid rgb(234 179 8 / 0.3); }
	.jobs span { display: grid; flex: 1; gap: 2px; }
	.pad {
		padding: var(--sp-5);
	}
	.fired {
		display: flex;
		gap: var(--sp-4);
		align-items: center;
		padding: var(--sp-5);
		margin-bottom: var(--sp-5);
		color: var(--gold);
	}
	.fired h1 {
		margin: 0;
	}
	.fired p {
		margin: 4px 0 0;
		color: var(--text);
	}
	.board {
		display: grid;
		grid-template-columns: 1.2fr auto 1.2fr;
		gap: var(--sp-4);
	}
	h1 {
		font-size: var(--fs-3xl);
		margin: 6px 0;
	}
	h2 {
		font-size: var(--fs-xl);
		margin: 0 0 var(--sp-3);
	}
	.section {
		margin: var(--sp-6) 0 var(--sp-3);
		font-size: var(--fs-2xl);
	}
	.center {
		display: grid;
		place-items: center;
	}
	.weights {
		display: grid;
		gap: 8px;
		margin-top: var(--sp-3);
	}
	.weights div {
		display: grid;
		grid-template-columns: 90px 1fr;
		align-items: center;
		gap: 8px;
		font-size: var(--fs-xs);
		color: var(--text-2);
	}
	.weights i {
		height: 6px;
		border-radius: 6px;
		background: linear-gradient(90deg, var(--emerald) var(--w), rgb(231 237 240 / 0.08) var(--w));
	}
	.goals {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
	}
	.goals li {
		display: grid;
		grid-template-columns: 12px 1fr auto;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: var(--radius-m);
		background: rgb(10 13 16 / 0.4);
	}
	.goals small {
		color: var(--text-3);
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--text-3);
	}
	li[data-s='no-alvo'] .dot {
		background: var(--emerald);
	}
	li[data-s='abaixo'] .dot {
		background: var(--danger);
	}
	li[data-s='em-andamento'] .dot {
		background: var(--gold);
	}
	.small {
		font-size: var(--fs-xs);
	}
	.fac {
		padding: var(--sp-5);
		display: grid;
		gap: 10px;
		align-content: start;
	}
	.fac h3 {
		margin: 0;
		font-size: var(--fs-md);
	}
	.lvl {
		font-size: var(--fs-xs);
		color: var(--gold);
		font-weight: 700;
	}
	.pips {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 4px;
	}
	.pips i {
		height: 8px;
		border-radius: 4px;
		background: rgb(231 237 240 / 0.08);
	}
	.pips i.on {
		background: linear-gradient(90deg, var(--emerald), var(--emerald-strong));
	}
	.pips i.next {
		background: repeating-linear-gradient(45deg, var(--gold) 0 4px, transparent 4px 8px);
	}
	.fac p {
		margin: 0;
		font-size: var(--fs-sm);
	}
	.next {
		color: var(--text-2);
	}
	.building {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--gold);
		font-weight: 600;
		font-size: var(--fs-sm);
	}
	.fans {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--sp-5);
		align-items: center;
		margin-top: var(--sp-5);
	}
	.msg {
		margin-top: var(--sp-4);
		color: var(--text-2);
	}
	@media (max-width: 1100px) {
		.board {
			grid-template-columns: 1fr;
		}
	}
</style>
