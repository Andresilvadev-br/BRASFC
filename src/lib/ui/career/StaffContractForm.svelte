<script lang="ts">
	import { ROLE_LABELS, type ContractRole } from '#lib/domain/market.ts';
	import type { FinanceGrant } from '#lib/domain/staff-finance.ts';
	import Button from '../Button.svelte';

	let { grant, submit, busy, label = 'Confirmar contrato' }: {
		grant: FinanceGrant;
		submit: (amounts: { wage: number; years: number; role: ContractRole }) => Promise<boolean>;
		busy: boolean;
		label?: string;
	} = $props();
	let wage = $state<number>();
	let years = $state(1);
	let role = $state<ContractRole>('rotacao');
	let saving = $state(false);
	async function confirm(event: SubmitEvent) {
		event.preventDefault();
		if (saving || busy || wage === undefined) return;
		saving = true;
		try { if (await submit({ wage, years, role })) wage = undefined; }
		finally { saving = false; }
	}
</script>

<form onsubmit={confirm}>
	<label>Salário mensal (R$)<input type="number" min="500" max={grant.maxWage} bind:value={wage} required /></label>
	<label>Temporadas<input type="number" min="1" max={grant.maxYears} bind:value={years} required /></label>
	<label>Papel no elenco<select bind:value={role}>
		{#each Object.entries(ROLE_LABELS) as [key, text] (key)}<option value={key}>{text}</option>{/each}
	</select></label>
	<Button type="submit" size="sm" variant="primary" disabled={busy} loading={saving}>{grant.mode === 'review' ? 'Encaminhar ao treinador' : label}</Button>
</form>

<style>
	form, label { display: grid; gap: 6px; }
	form { margin-block: .5rem; }
	input, select { width: 100%; min-width: 0; }
</style>
