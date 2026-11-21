<script lang="ts">
	import { formatExactMoney } from '#lib/domain/market.ts';
	import type { Position } from '#lib/domain/positions.ts';
	import Button from '../Button.svelte';

	let { players, listed, toggle }: {
		players: { id: string; name: string; position: Position; overall: number; value?: number; loan?: unknown; pending?: boolean }[];
		listed: string[]; toggle: (id: string) => Promise<boolean>;
	} = $props();
	let saving = $state('');
	let error = $state('');
	const eligible = $derived(players.filter((p) => !p.pending && p.id !== 'eu' && !p.id.startsWith('human-')));
	async function change(id: string) {
		if (saving) return;
		saving = id;
		error = '';
		try {
			if (!(await toggle(id))) error = 'O servidor ainda não confirmou a mudança.';
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Não foi possível atualizar a lista de vendas.';
		} finally { saving = ''; }
	}
</script>

<section aria-label="Elenco negociável">
	{#if error}<p role="alert">{error}</p>{/if}
	{#each eligible as player (player.id)}
		<article>
			<div><strong>{player.name}</strong><small>{player.position} · Overall {player.overall}{player.value === undefined ? '' : ` · ${formatExactMoney(player.value)}`}</small></div>
			{#if player.loan}<small>Emprestado</small>
			{:else}
				<Button size="sm" variant={listed.includes(player.id) ? 'secondary' : 'ghost'} disabled={!!saving && saving !== player.id}
					loading={saving === player.id} onclick={() => change(player.id)}>{listed.includes(player.id) ? 'Retirar da venda' : 'Listar para venda'}</Button>
			{/if}
		</article>
	{:else}
		<p>Seu elenco ainda não tem atletas disponíveis para negociar.</p>
	{/each}
</section>

<style>
	section { display:grid; gap:.4rem; }
	article { display:flex; align-items:center; justify-content:space-between; gap:.5rem; flex-wrap:wrap; padding:.6rem .7rem; border:1px solid var(--line); background:var(--glass-hi); border-radius:10px; }
	article div { min-width:0; overflow-wrap:anywhere; }
	small { display:block; color:var(--text-2); }
</style>
