<script lang="ts">
	import { api } from '#lib/api.ts';
	import Button from '../Button.svelte';
	import Sheet from '../v4/Sheet.svelte';

	let { code, name, removed }: { code: string; name: string; removed: () => void | Promise<void> } = $props();
	let open = $state(false);
	let confirmation = $state('');
	let failure = $state('');
	let busy = $state(false);
	const confirmed = $derived(confirmation.trim().toUpperCase() === code);
	const formId = $derived(`delete-league-${code}`);
	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy || !confirmed) return;
		busy = true;
		failure = '';
		try {
			await api(`/api/rooms/${code}/delete`, { body: { confirmation: code } });
			open = false;
			await removed();
		} catch (e) {
			failure = e instanceof Error ? e.message : 'Não foi possível excluir a liga.';
		} finally { busy = false; }
	}
</script>

<Button size="sm" variant="danger" onclick={() => { open = true; confirmation = ''; failure = ''; }}>Excluir liga</Button>

<Sheet bind:open title="Excluir liga online" subtitle={name}>
	<form id={formId} onsubmit={submit}>
		<p>A exclusão é permanente para todos os participantes. Ela apaga o progresso, as partidas, as negociações, os convites e o chat desta liga. As contas e as outras ligas são preservadas.</p>
		<label>Digite <strong>{code}</strong> para confirmar
			<input bind:value={confirmation} autocomplete="off" autocapitalize="characters" required maxlength={6} />
		</label>
		{#if failure}<p role="alert">{failure}</p>{/if}
	</form>
	{#snippet footer()}
		<Button disabled={busy} onclick={() => open = false}>Cancelar</Button>
		<Button type="submit" form={formId} variant="danger" disabled={!confirmed} loading={busy}>Excluir definitivamente</Button>
	{/snippet}
</Sheet>

<style>
	form, label { display: grid; gap: 10px; }
	input { min-width: 0; }
</style>
