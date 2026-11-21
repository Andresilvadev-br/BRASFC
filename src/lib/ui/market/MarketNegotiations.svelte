<script lang="ts">
	import { getClub } from '#lib/domain/clubs.ts';
	import { formatShort } from '#lib/domain/dates.ts';
	import type { NegotiationLog } from '#lib/domain/management.ts';
	import { formatExactMoney } from '#lib/domain/market.ts';
	import { enter } from '#lib/motion/actions.ts';
	import Badge from '../Badge.svelte';
	import Button from '../Button.svelte';
	import Crest from '../Crest.svelte';

	type Status = 'Aguardando resposta' | 'Contraproposta recebida' | 'Acordo com clube' | 'Negociação contratual' | 'Transferência concluída' | 'Recusada' | 'Expirada' | 'Encerrada';
	export interface MarketDealRow {
		id: string; player: string; name: string; club: string; fee: number; date?: string; deadline?: number; description?: string;
		status: Status; kind: string; log?: NegotiationLog; action?: 'ia' | 'human' | 'human-counter';
	}

	let { entries, busy, windowOpen, action, resume, browse }: {
		entries: MarketDealRow[]; busy: boolean; windowOpen: boolean;
		action: (row: MarketDealRow, kind: 'accept' | 'reject' | 'counter', value?: number) => Promise<boolean>;
		resume: (log: NegotiationLog) => unknown; browse: () => void;
	} = $props();
	let view = $state<'all' | 'active' | 'history'>('all');
	let counterId = $state('');
	let counter = $state<number | undefined>();
	const terminal = new Set<Status>(['Transferência concluída', 'Recusada', 'Expirada', 'Encerrada']);
	const filtered = $derived(entries.filter((row) => view === 'all' || terminal.has(row.status) === (view === 'history')));
	const canResume = (log?: NegotiationLog) => log && !log.done && (log.asking !== undefined || log.demand !== undefined);
	async function submitCounter(row: MarketDealRow) {
		if (busy || counter === undefined || counter < 0 || !Number.isInteger(counter)) return;
		if (await action(row, 'counter', counter)) counterId = '';
	}
</script>

<section class="central" aria-label="Central de negociações">
	<header><h2 class="display">Central de negociações</h2>
		<div class="filters" role="group" aria-label="Situação das negociações">
			<button type="button" aria-pressed={view === 'all'} onclick={() => view = 'all'}>Todas</button>
			<button type="button" aria-pressed={view === 'active'} onclick={() => view = 'active'}>Em andamento</button>
			<button type="button" aria-pressed={view === 'history'} onclick={() => view = 'history'}>Histórico</button>
		</div>
	</header>
	{#if filtered.length}
		<ol>
			{#each filtered as row (row.id)}
				<li use:enter={{ y: 4 }}>
					<div class="mark" class:finished={terminal.has(row.status)} aria-hidden="true"></div>
					<article>
						<div class="heading"><div class="team"><Crest clubId={row.club} size={30} /><div><strong>{row.name}</strong><small>{getClub(row.club)?.name ?? (row.club || 'Sem clube')} · {row.kind}</small></div></div>
							<Badge tone={row.status === 'Transferência concluída' ? 'emerald' : terminal.has(row.status) ? 'neutral' : 'gold'}>{row.status}</Badge>
						</div>
						<p class="terms">{formatExactMoney(row.fee)}{row.log && row.log.offer.wage > 0 ? ` · ${formatExactMoney(row.log.offer.wage)}/mês` : ''}{row.date ? ` · ${formatShort(row.date)}` : ''}{row.deadline ? ` · Até a rodada ${row.deadline}` : ''}</p>
						{#if row.description}<p>{row.description}</p>{/if}
						{#if row.action}
							<div class="actions">
								<Button size="sm" variant="primary" disabled={busy || !windowOpen} onclick={() => action(row, 'accept')}>{row.action === 'human-counter' ? 'Aceitar contraproposta' : 'Aceitar proposta'}</Button>
								<Button size="sm" variant="ghost" disabled={busy || (row.action !== 'ia' && !windowOpen)} onclick={() => action(row, 'reject')}>Recusar</Button>
								{#if row.action === 'human'}<Button size="sm" variant="secondary" disabled={busy || !windowOpen} onclick={() => { counterId = row.id; counter = row.fee; }}>Contrapropor</Button>{/if}
							</div>
							{#if counterId === row.id}
								<form onsubmit={(event) => { event.preventDefault(); void submitCounter(row); }}>
									<label>Contraproposta (R$)<input type="number" min="0" max="2000000000" step="1" required bind:value={counter} /></label>
									<Button size="sm" variant="primary" type="submit" disabled={busy || !windowOpen || counter === undefined}>Enviar contraproposta</Button>
									<Button size="sm" variant="ghost" onclick={() => counterId = ''}>Cancelar</Button>
								</form>
							{/if}
						{:else if canResume(row.log)}
							<Button size="sm" variant="secondary" disabled={busy || (!windowOpen && row.log?.offer.kind !== 'livre')} onclick={() => resume(row.log!)}>Revisar proposta</Button>
						{/if}
					</article>
				</li>
			{/each}
		</ol>
	{:else}
		<div class="empty">
			<p>{view === 'history' ? 'Nenhuma negociação concluída, recusada ou expirada.' : 'Sem negociações nesta lista. Encontre um jogador no mercado para preparar a primeira proposta.'}</p>
			<Button size="sm" variant="secondary" onclick={browse}>Buscar jogadores</Button>
		</div>
	{/if}
</section>

<style>
	.central { padding: .8rem; border: 1px solid var(--line); border-radius: 15px; background: var(--glass-hi); min-width: 0; }
	header, .heading, .team, .filters, .actions, form { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
	header, .heading { justify-content: space-between; }
	h2 { font-size: var(--fs-xl); margin: 0; }
	ol { list-style: none; padding: 0; margin: .7rem 0 0; display: grid; gap: .4rem; }
	li { display: grid; grid-template-columns: auto minmax(0,1fr); gap: .5rem; }
	.mark { width: 9px; height: 9px; margin: .85rem 0 0 .15rem; background: var(--gold); border-radius: 50%; box-shadow: 0 0 0 3px var(--line); }
	.mark.finished { background: var(--emerald); }
	article { display: grid; gap: .4rem; padding: .65rem; border: 1px solid var(--line); background: var(--surface-sunken); border-radius: 10px; overflow-wrap: anywhere; }
	.team small { display: block; }
	.filters button { background: var(--surface-sunken); color: var(--text-2); border-radius: 7px; padding: .4rem .55rem; min-height: 35px; border: 1px solid var(--line); }
	.filters button[aria-pressed='true'] { color: var(--text); background: var(--emerald-soft); border-color: var(--emerald); }
	label { display: grid; gap: .25rem; font-size: var(--fs-xs); flex: 1 1 9rem; }
	input { min-width: 0; background: var(--glass); border: 1px solid var(--line); border-radius: 8px; padding: .4rem; color: var(--text); }
	form { align-items: end; }
	p { margin: 0; font-size: var(--fs-sm); }
	small, .terms, .empty { color: var(--text-2); }
	.empty { display: grid; gap: .65rem; justify-items: center; padding: 1.25rem .6rem; text-align: center; }
</style>
