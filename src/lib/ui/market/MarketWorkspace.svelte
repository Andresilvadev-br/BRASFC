<script lang="ts">
	import { api } from '#lib/api.ts';
	import type { IncomingOffer, NegotiationLog } from '#lib/domain/management.ts';
	import { formatExactMoney, formatMoney } from '#lib/domain/market.ts';
	import type { MarketProfile } from '#lib/domain/market-search.ts';
	import type { Snippet } from 'svelte';
	import { enter } from '#lib/motion/actions.ts';
	import Button from '../Button.svelte';
	import Icon from '../Icon.svelte';
	import Search from './MarketSearch.svelte';
	import Offer from './MarketOffer.svelte';
	import Negotiations, { type MarketDealRow } from './MarketNegotiations.svelte';

	export type HumanDeal = { id: string; from: string; to: string; player: string; name: string; fee: number; proposedAt?: string; date?: string; expiresRound?: number; counter?: boolean; status?: 'aceita' | 'recusada' | 'encerrada' | 'expirada' };

	let { endpoint, storageKey, revision, clubId, budget, wages, wageBudget, window, incoming, logs, humanDeals = [], names, commit, humanReply, own }: {
		endpoint: string; storageKey: string; revision: number; clubId: string; budget: number; wages: number; wageBudget: number;
		window: string | null; incoming: IncomingOffer[]; logs: NegotiationLog[]; humanDeals?: HumanDeal[];
		names: (id: string) => string | undefined;
		commit: (action: Record<string, unknown>, human?: string) => Promise<{ ok: boolean; log?: NegotiationLog | null }>;
		humanReply?: (action: string, body: Record<string, unknown>) => Promise<boolean>;
		own?: Snippet;
	} = $props();

	type Tab = 'buscar' | 'observados' | 'negociacoes' | 'elenco';
	let tab = $state<Tab>('buscar');
	let selected = $state<string>();
	let notice = $state('');
	let failed = $state(false);
	let busy = $state(false);
	let offerOpen = $state(false);
	let offer = $state<{ player: MarketProfile; kind: 'compra' | 'emprestimo' | 'livre'; resume?: NegotiationLog }>();
	let offerKey = $state(0);
	const windowLabel = $derived(window === 'pre-temporada' ? 'Aberta · pré-temporada' : window === 'meio-do-ano' ? 'Aberta · meio do ano' : 'Fechada');
	const pending = $derived(incoming.length + humanDeals.filter((deal) => !deal.status && (deal.counter ? deal.to : deal.from) === clubId).length);
	const sections = $derived< { id: Tab; label: string }[]>([
		{ id: 'buscar', label: 'Buscar' }, { id: 'observados', label: 'Observados' },
		{ id: 'negociacoes', label: pending ? `Negociações (${pending})` : 'Negociações' },
		...(own ? [{ id: 'elenco' as const, label: 'Meu elenco' }] : [])
	]);
	const moves = $derived.by((): MarketDealRow[] => [
		...incoming.map((p): MarketDealRow => ({ id: p.id, player: p.playerId, name: names(p.playerId) ?? 'Atleta do elenco', club: p.club, fee: p.fee,
			status: 'Aguardando resposta', action: 'ia', kind: p.kind === 'compra' ? 'Compra' : 'Empréstimo', deadline: p.expiresRound,
			description: 'O clube aguarda a sua decisão.' })),
		...humanDeals.map((p): MarketDealRow => ({
			id: p.id, player: p.player, name: p.name, club: p.to === clubId ? p.from : p.to, fee: p.fee,
			kind: 'Compra entre treinadores', date: p.date ?? p.proposedAt, deadline: p.status ? undefined : p.expiresRound,
			status: p.status === 'aceita' ? 'Transferência concluída' : p.status === 'recusada' ? 'Recusada' : p.status === 'expirada' ? 'Expirada' :
				p.status === 'encerrada' ? 'Encerrada' : p.counter && p.to === clubId ? 'Contraproposta recebida' : 'Aguardando resposta',
			action: p.status ? undefined : p.counter ? p.to === clubId ? 'human-counter' : undefined : p.from === clubId ? 'human' : undefined,
			description: p.status ? undefined : (p.counter ? p.to : p.from) === clubId ? 'Sua decisão é necessária.' : 'A proposta está com o outro treinador.'
		})),
		...[...logs].reverse().map((p): MarketDealRow => ({ id: p.id, player: p.playerId, name: p.playerName ?? names(p.playerId) ?? 'Atleta negociado', club: p.club,
			fee: p.offer.fee, date: p.gameDate, description: p.message, log: p,
			kind: p.offer.kind === 'livre' ? 'Atleta livre' : p.offer.kind === 'compra' ? 'Compra' : 'Empréstimo',
			status: p.done ? 'Transferência concluída' : p.expired ? 'Expirada' : p.club_answer === 'contraproposta' ? 'Contraproposta recebida' :
				p.demand !== undefined ? 'Negociação contratual' : 'Recusada' }))
	]);

	function propose(player: MarketProfile, kind: 'compra' | 'emprestimo' | 'livre', resume?: NegotiationLog) {
		offer = { player, kind, resume };
		offerKey += 1;
		offerOpen = true;
	}

	async function watch(player: MarketProfile) {
		await run(async () => {
			const reply = await commit({ action: 'observar', playerId: player.id, value: !player.observed });
			if (!reply.ok) return false;
			notice = player.observed ? 'Atleta retirado da observação.' : 'Atleta adicionado à observação.';
			return true;
		});
	}

	async function run(action: () => Promise<boolean>) {
		if (busy) return false;
		busy = true;
		failed = false;
		notice = '';
		try {
			const ok = await action();
			if (!ok) { notice = 'A ação ainda não foi confirmada pelo servidor.'; failed = true; }
			return ok;
		} catch (error) {
			failed = true;
			notice = error instanceof Error ? error.message : 'Não foi possível completar a ação.';
			return false;
		} finally {
			busy = false;
		}
	}

	async function resume(log: NegotiationLog) {
		await run(async () => {
			const player = await api<MarketProfile>(endpoint + (endpoint.includes('?') ? '&' : '?') + new URLSearchParams({ player: log.playerId }));
			propose(player, log.offer.kind, log);
			return true;
		});
	}

	async function reply(row: MarketDealRow, kind: 'accept' | 'reject' | 'counter', fee?: number) {
		return run(async () => {
			const ok = row.action === 'ia'
				? (await commit({ action: 'responder', offerId: row.id, accept: kind === 'accept' })).ok
				: await humanReply?.(`${kind}-deal`, { id: row.id, ...(fee !== undefined ? { fee } : {}) });
			if (ok) notice = 'Negociação atualizada.';
			return Boolean(ok);
		});
	}
</script>

<div class="market">
	<header class="finance">
		<div class="title"><Icon name="briefcase" size={20} /><h1 class="display">Mercado de transferências</h1></div>
		<div class="figures">
			<div><span>Orçamento de transferências</span><strong title={formatExactMoney(budget)}>{formatMoney(budget)}</strong></div>
			<div><span>Folha mensal utilizada</span><strong title={formatExactMoney(wages)}>{formatMoney(wages)}</strong></div>
		</div>
		<div class="summary">
			<div><span>Teto salarial</span><strong>{formatMoney(wageBudget)}</strong></div>
			<div><span>Janela de transferências</span><strong class:active={window}>{windowLabel}</strong></div>
			<div><span>Propostas a responder</span><strong>{pending}</strong></div>
		</div>
		<details><summary>Janela, teto e propostas</summary>
			<p>Janela {windowLabel.toLowerCase()} · Teto mensal {formatExactMoney(wageBudget)} · {pending} a responder</p>
		</details>
	</header>
	<div class="tabs" role="group" aria-label="Seção do mercado">
		{#each sections as section (section.id)}
			<button type="button" data-umx-press aria-pressed={tab === section.id} onclick={() => tab = section.id}>{section.label}</button>
		{/each}
	</div>
	{#if notice}<p class="notice" class:failed role={failed ? 'alert' : 'status'}>{notice}</p>{/if}
	{#if tab === 'buscar' || tab === 'observados'}
		<Search {endpoint} {storageKey} {revision} {busy} {watch} {propose} bind:selected windowOpen={!!window} observedOnly={tab === 'observados'} />
	{:else if tab === 'negociacoes'}
		<div use:enter={{ y: 5 }}><Negotiations entries={moves} {busy} windowOpen={!!window} action={reply} {resume} browse={() => tab = 'buscar'} /></div>
	{:else if own}
		<div use:enter={{ y: 5 }}>{@render own()}</div>
	{/if}
</div>

{#if offer}
	{#key offerKey}<Offer bind:open={offerOpen} {...offer} {commit} {budget} windowOpen={!!window} />{/key}
{/if}

<style>
	.market { display: grid; gap: .7rem; min-width: 0; }
	.finance { display: grid; gap: .7rem; padding: clamp(.6rem,1.3vw,.95rem); border-radius: 14px; border: 1px solid var(--line); background: radial-gradient(130% 120% at 100% 0%, var(--emerald-soft), transparent 54%), var(--glass-hi); }
	.title { display: flex; align-items: center; gap: .5rem; color: var(--emerald-strong); }
	h1 { font-size: clamp(1.35rem,3vw,2rem); color: var(--text); margin: 0; line-height: 1; }
	.figures, .summary { display: grid; gap: .5rem; }
	.figures { grid-template-columns: repeat(2,minmax(0,1fr)); }.summary { grid-template-columns: repeat(3,minmax(0,1fr)); }
	.figures > div, .summary > div { min-width: 0; padding: .4rem .5rem; background: var(--surface-sunken); border: 1px solid var(--line); border-radius: 8px; display: grid; align-content: start; }
	.finance span { color: var(--text-2); font-size: var(--fs-xs); }
	.finance strong { font-size: var(--fs-md); overflow-wrap: anywhere; }
	.finance strong.active { color: var(--emerald-strong); }
	.tabs { display: flex; flex-wrap: wrap; gap: .4rem; }
	.tabs button { background: var(--surface-sunken); min-height: 38px; color: var(--text-2); border: 1px solid var(--line); padding: .4rem .7rem; border-radius: 8px; font-weight: 600; font-size: var(--fs-sm); }
	.tabs button[aria-pressed='true'] { color: var(--text); border-color: var(--emerald); background: var(--emerald-soft); }
	.notice { color: var(--emerald-strong); font-size: var(--fs-sm); margin: 0; }
	.notice.failed { color: var(--red); }
	details { display: none; color: var(--text-2); font-size: var(--fs-xs); }
	details summary { cursor: pointer; min-height: 24px; } details p { margin: .35rem 0; }
	@media (min-width: 1100px) {
		.finance { grid-template-columns: minmax(8rem,1fr) minmax(12rem,1.45fr) minmax(19rem,2.25fr); align-items: stretch; }
	}
	@media (max-width: 640px) {
		.summary { display: none; }details { display: block; }
		.tabs button { padding-inline: .5rem; }
	}
</style>
