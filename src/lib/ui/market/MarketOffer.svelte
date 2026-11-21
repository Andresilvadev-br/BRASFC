<script lang="ts">
	import { formatExactMoney, ROLE_LABELS, type ContractRole } from '#lib/domain/market.ts';
	import type { NegotiationLog } from '#lib/domain/management.ts';
	import type { MarketProfile } from '#lib/domain/market-search.ts';
	import Button from '../Button.svelte';
	import Sheet from '../v4/Sheet.svelte';

	let { open = $bindable(false), player, kind, resume, commit, budget, windowOpen, review = false, wageLimit = 1e8, yearsLimit = 5 }: {
		open?: boolean; player: MarketProfile; kind: 'compra' | 'emprestimo' | 'livre'; resume?: NegotiationLog;
		commit: (action: Record<string, unknown>, human?: string) => Promise<{ ok: boolean; log?: NegotiationLog | null }>;
		budget: number; windowOpen: boolean; review?: boolean; wageLimit?: number; yearsLimit?: number;
	} = $props();
	const defaults = () => ({
		fee: resume?.asking ?? resume?.offer.fee ?? Math.round(player.value * 1.15),
		wage: resume?.demand ?? resume?.offer.wage ?? Math.max(500, Math.round((player.wage ?? 5000) * 1.15)),
		years: resume?.offer.years ?? 3,
		role: resume?.offer.role ?? 'rotacao' as ContractRole,
		share: Math.round(100 * (resume?.offer.wageShare ?? 1))
	});
	let form = $state(defaults());
	let busy = $state(false);
	let sent = $state(false);
	let failure = $state('');
	let log = $state<NegotiationLog>();
	let lastCommand = '';
	let lastOperation = '';
	const human = $derived(player.humanSeller);
	const valid = $derived((kind !== 'compra' || Number.isInteger(form.fee) && form.fee >= 0 && form.fee <= budget)
		&& (human || (kind === 'emprestimo' ? Number.isInteger(form.share) && form.share >= 50 && form.share <= 100 :
			Number.isInteger(form.wage) && form.wage >= 500 && form.wage <= wageLimit && Number.isInteger(form.years) && form.years >= 1 && form.years <= yearsLimit)));
	const blocked = $derived(player.isMine || !!player.loanFrom || (!windowOpen && kind !== 'livre'));
	const stage = $derived(log?.done || sent ? 'confirmada' : log?.club_answer === 'contraproposta' ? 'contraproposta' :
		log?.player_answer === 'recusada' ? 'contrato' : log ? 'recusada' : 'preparada');

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy || sent || log?.done || !valid || blocked) return;
		const body = { action: 'oferta', playerId: player.id, kind, fee: form.fee, wage: form.wage,
			years: form.years, role: form.role, wageShare: form.share / 100 };
		const signature = JSON.stringify(body);
		if (signature !== lastCommand) {
			lastCommand = signature;
			lastOperation = crypto.randomUUID();
		}
		busy = true;
		failure = '';
		try {
			const outcome = await commit({ ...body, operation: lastOperation }, human);
			if (!outcome.ok) { failure = 'O servidor ainda não confirmou a proposta. Confira o aviso da carreira antes de tentar novamente.'; return; }
			log = outcome.log ?? undefined;
			sent = Boolean(human) || review;
			lastCommand = '';
		} catch (error) {
			failure = error instanceof Error ? error.message : 'Não foi possível enviar a proposta.';
		} finally {
			busy = false;
		}
	}
</script>

<Sheet bind:open title={player.name} subtitle={`${player.clubName} · ${kind === 'compra' ? 'Compra' : kind === 'emprestimo' ? 'Empréstimo' : 'Contrato de atleta livre'}`}>
	<form id="market-offer" onsubmit={submit}>
		{#if blocked}
			<p role="status">A situação do atleta ou da janela mudou. Confira a ficha antes de negociar.</p>
		{:else}
			{#if kind === 'compra'}
				<label>Valor ao clube (R$)<input type="number" min="0" max={Math.min(budget, 2e9)} step="1" bind:value={form.fee} required disabled={busy || sent || log?.done} /></label>
				<small>Orçamento disponível {formatExactMoney(budget)}</small>
			{/if}
			{#if human}
				<p>O treinador vendedor precisa aprovar a proposta. A situação do contrato aparece na Central de negociações.</p>
			{:else if kind === 'emprestimo'}
				<label>Parte do salário paga pelo seu clube (%)<input type="number" min="50" max="100" bind:value={form.share} required disabled={busy || log?.done} /></label>
				{#if player.wage !== null}<small>Parcela mensal {formatExactMoney(Math.round(player.wage * form.share / 100))}</small>{/if}
			{:else}
				<label>Salário mensal (R$)<input type="number" min="500" max={wageLimit} step="1" bind:value={form.wage} required disabled={busy || log?.done} /></label>
				<div class="pair">
					<label>Temporadas<input type="number" min="1" max={yearsLimit} bind:value={form.years} required disabled={busy || log?.done} /></label>
					<label>Participação<select bind:value={form.role} disabled={busy || log?.done}>
						{#each Object.entries(ROLE_LABELS) as [value, label] (value)}<option {value}>{label}</option>{/each}
					</select></label>
				</div>
			{/if}
			<ol class="progress" aria-label="Etapas da negociação">
				<li class:active={stage === 'preparada'}>Preparar</li>
				<li class:active={stage === 'contraproposta' || stage === 'recusada'}>Clube</li>
				<li class:active={stage === 'contrato'}>Contrato</li>
				<li class:active={stage === 'confirmada'}>{human ? 'Aguardando resposta' : 'Assinatura'}</li>
			</ol>
			{#if sent}<p role="status">{review ? 'Solicitação enviada ao treinador para aprovação.' : 'Proposta enviada. Acompanhe a decisão na Central de negociações.'}</p>{/if}
			{#if log}
				<p role="status">{log.message}</p>
				{#if log.asking !== undefined}<Button size="sm" variant="secondary" onclick={() => form.fee = log!.asking!}>Preencher contraproposta</Button>{/if}
				{#if log.demand !== undefined}<Button size="sm" variant="secondary" onclick={() => form.wage = log!.demand!}>Usar salário solicitado</Button>{/if}
			{/if}
			{#if failure}<p class="error" role="alert">{failure}</p>{/if}
		{/if}
	</form>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => open = false}>{log?.done || sent ? 'Fechar' : 'Voltar'}</Button>
		{#if !sent && !log?.done}<Button type="submit" form="market-offer" variant="primary" loading={busy} disabled={!valid || blocked}>{review ? 'Encaminhar ao treinador' : 'Enviar proposta'}</Button>{/if}
	{/snippet}
</Sheet>

<style>
	form { display: grid; gap: .7rem; }
	label { display: grid; gap: .3rem; color: var(--text-2); font-size: var(--fs-sm); }
	select { width: 100%; min-width: 0; min-height: 44px; }
	input { min-width: 0; width: 100%; padding: .5rem; color: var(--text); background: var(--surface-sunken); border: 1px solid var(--line-strong); border-radius: 9px; }
	small { color: var(--text-2); }
	p { margin: 0; }
	.pair { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1.6fr); gap: .65rem; }
	.progress { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: .4rem; font-size: var(--fs-xs); color: var(--text-2); text-align: center; list-style: none; padding: 0; margin: .5rem 0; }
	.progress li { border-top: 3px solid var(--line-strong); padding: .35rem .2rem; }
	.progress li.active { border-color: var(--emerald); color: var(--emerald-strong); font-weight: 700; }
	.error { color: var(--red); }
</style>
