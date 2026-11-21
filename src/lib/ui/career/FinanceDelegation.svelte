<script lang="ts">
	import { untrack } from 'svelte';
	import { DEFAULT_FINANCE_GRANT, type FinanceGrant } from '#lib/domain/staff-finance.ts';
	import Button from '../Button.svelte';

	let { grant, busy, save }: { grant?: FinanceGrant; busy: boolean; save: (grant: FinanceGrant) => Promise<boolean> } = $props();
	let draft = $state(untrack(() => ({ ...(grant ?? DEFAULT_FINANCE_GRANT) })));
	let localBusy = $state(false);
	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (localBusy || busy) return;
		localBusy = true;
		try { await save($state.snapshot(draft)); }
		finally { localBusy = false; }
	}
</script>

<details>
	<summary>Permissões de mercado e contratos</summary>
	<form onsubmit={submit}>
		<label class="check"><input type="checkbox" bind:checked={draft.offers} /> Enviar ofertas a clubes</label>
		<label class="check"><input type="checkbox" bind:checked={draft.contracts} /> Negociar contratos e renovações</label>
		<label>Modo de autorização<select bind:value={draft.mode}>
			<option value="review">Revisão do treinador a cada solicitação</option>
			<option value="direct">Ação direta dentro dos limites</option>
		</select></label>
		<label>Limite por proposta (R$)<input type="number" min="0" max="2000000000" bind:value={draft.maxFee} required /></label>
		<label>Limite salarial mensal (R$)<input type="number" min="500" max="100000000" bind:value={draft.maxWage} required /></label>
		<label>Duração máxima em temporadas<input type="number" min="1" max="5" bind:value={draft.maxYears} required /></label>
		<Button type="submit" size="sm" disabled={busy} loading={localBusy}>Salvar permissões</Button>
	</form>
</details>

<style>
	form, label { display: grid; gap: 6px; min-width: 0; }
	form { margin-top: .55rem; }
	.check { display: flex; gap: 7px; align-items: center; }
	summary { cursor: pointer; }
</style>
