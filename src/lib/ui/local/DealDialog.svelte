<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api, ApiError } from '#lib/api.ts';
	import type { Career } from '#lib/domain/career.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { formatMoney } from '#lib/domain/market.ts';
	import { localGroup } from '#lib/domain/turns.ts';
	import { notify } from '#lib/stores/island.svelte.ts';
	import Button from '../Button.svelte';
	import Crest from '../Crest.svelte';
	import Modal from '../Modal.svelte';

	/**
	 * Negociação entre treinadores humanos (no mesmo computador). Quem está com a vez de responder vê a
	 * proposta e pode aceitar, recusar ou contrapropor com o valor que quiser; quem iniciou vê o desfecho.
	 */
	let { career }: { career: Career } = $props();
	const group = $derived(localGroup(career));
	const deal = $derived(group?.deal?.status === 'aberta' && group.deal.turn === group.active ? group.deal : null);
	const result = $derived(!deal && group?.dealResult && group.dealResult.initiator === group.active ? group.dealResult : null);
	let busy = $state(false);
	let open = $state(true);
	// Uma proposta nova sempre abre a janela (fechar só adia a resposta; o aviso fica na tela).
	let lastDeal = '';
	$effect(() => {
		const key = deal ? `${deal.id}:${deal.history.length}` : '';
		if (key && key !== lastDeal) open = true;
		lastDeal = key;
	});
	let counter = $state(0);
	let error = $state('');
	$effect(() => {
		if (deal) counter = deal.fee;
	});
	const ROLE: Record<string, string> = { titular: 'Titular', rotacao: 'Rotação', reserva: 'Reserva', jovem: 'Jovem' };
	const name = (i: number) => group?.coaches[i]?.personName ?? '';
	const actions: Record<string, string> = { proposta: 'propôs', contraproposta: 'contrapropôs', aceita: 'aceitou', recusada: 'recusou' };

	async function send(action: 'aceitar' | 'recusar' | 'contraproposta') {
		if (!deal || busy) return;
		busy = true;
		error = '';
		try {
			const res = await api<{ message: string }>(`/api/careers/${career.id}/turno`, { body: { version: career.version, action: 'negociacao', dealId: deal.id, choice: action, ...(action === 'contraproposta' ? { fee: Math.round(counter) } : {}) } });
			notify({ icon: 'briefcase', tone: 'success', title: 'Negociação', detail: res.message });
			await invalidateAll();
		} catch (e) {
			error = e instanceof ApiError || e instanceof Error ? e.message : 'Não foi possível responder.';
		} finally {
			busy = false;
		}
	}
	async function seen() {
		if (busy) return;
		busy = true;
		try {
			await api(`/api/careers/${career.id}/turno`, { body: { version: career.version, action: 'negociacao-vista' } });
			await invalidateAll();
		} finally {
			busy = false;
		}
	}
</script>

{#if deal && group && !open}
	<button type="button" class="pending" onclick={() => (open = true)}>Proposta por {deal.playerName} aguardando a sua resposta · Responder</button>
{/if}
{#if deal && group}
	<Modal bind:open title="Proposta entre treinadores" description="{name(deal.initiator)} quer negociar com você. Responda para devolver o controle." size="md">
		<div class="deal">
			<div class="sides">
				<div><Crest clubId={deal.buyerClub} size={40} /><strong>{getClub(deal.buyerClub)?.short}</strong><small>Comprador · {name(deal.buyer)}</small></div>
				<span class="arrow" aria-hidden="true">⇄</span>
				<div><Crest clubId={deal.sellerClub} size={40} /><strong>{getClub(deal.sellerClub)?.short}</strong><small>Vendedor · {name(deal.seller)}</small></div>
			</div>
			<dl>
				<div><dt>Atleta</dt><dd>{deal.playerName}</dd></div>
				<div><dt>Tipo</dt><dd>{deal.kind === 'compra' ? 'Compra' : 'Empréstimo até o fim da temporada'}</dd></div>
				{#if deal.kind === 'compra'}
					<div><dt>Valor em jogo</dt><dd class="fee">{formatMoney(deal.fee)}</dd></div>
					<div><dt>Contrato oferecido ao atleta</dt><dd>{formatMoney(deal.wage)}/mês · {deal.years} temporada(s) · {ROLE[deal.role]}</dd></div>
				{:else}
					<div><dt>Salário pago pelo comprador</dt><dd>{Math.round(deal.wageShare * 100)}%</dd></div>
				{/if}
			</dl>
			<ol class="history" aria-label="Histórico da negociação">
				{#each deal.history as h, i (i)}<li><strong>{name(h.by)}</strong> {actions[h.action]} {deal.kind === 'compra' ? formatMoney(h.fee) : ''}</li>{/each}
			</ol>
			{#if deal.kind === 'compra'}
				<label class="counter">
					<span>Contraproposta (valor livre)</span>
					<input type="number" min="0" step="10000" bind:value={counter} disabled={busy} />
				</label>
			{/if}
			{#if error}<p class="err" role="alert">{error}</p>{/if}
		</div>
		{#snippet footer()}
			<Button variant="ghost" disabled={busy} onclick={() => send('recusar')}>Recusar</Button>
			{#if deal.kind === 'compra'}<Button disabled={busy || counter === deal.fee || !(counter >= 0)} onclick={() => send('contraproposta')}>Contrapropor {formatMoney(Math.round(counter || 0))}</Button>{/if}
			<Button variant="primary" icon="check" loading={busy} onclick={() => send('aceitar')}>Aceitar {deal.kind === 'compra' ? formatMoney(deal.fee) : 'empréstimo'}</Button>
		{/snippet}
	</Modal>
{:else if result}
	<Modal open={true} title={result.status === 'concluida' ? 'Negociação concluída' : 'Negociação encerrada'} size="sm">
		<p>{result.message}</p>
		{#snippet footer()}<Button variant="primary" loading={busy} onclick={seen}>Continuar o meu turno</Button>{/snippet}
	</Modal>
{/if}

<style>
	.deal { display: grid; gap: 12px; }
	.sides { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; text-align: center; }
	.sides div { display: grid; justify-items: center; gap: 2px; }
	.sides small { color: var(--text-3); }
	.arrow { font-size: 22px; color: var(--emerald-strong); }
	dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0; }
	dl div { padding: 8px 10px; border-radius: 10px; background: var(--surface-sunken); }
	dt { font-size: 12px; color: var(--text-3); }
	dd { margin: 0; font-weight: 600; }
	.fee { color: var(--gold, #e8b86a); font-size: var(--fs-lg); }
	.history { margin: 0; padding-left: 18px; color: var(--text-2); font-size: var(--fs-sm); }
	.counter { display: grid; gap: 4px; font-size: var(--fs-sm); }
	.counter input { height: 40px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line-strong); background: var(--surface-sunken); color: var(--text); font: inherit; }
	.err { color: var(--danger); margin: 0; }
	.pending { position: fixed; right: 20px; bottom: 20px; z-index: 700; padding: 10px 16px; border: 0; border-radius: 999px; background: #E8B86A; color: #101418; font: inherit; font-weight: 700; cursor: pointer; box-shadow: 0 10px 30px #0008; }
</style>
