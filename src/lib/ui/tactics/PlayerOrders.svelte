<script lang="ts">
	import { PLAYER_ORDERS, fitsOrder, isPlayerOrder, type PlayerOrder, type PlayerOrders as Orders } from '#lib/domain/player-orders.ts';
	import type { Position } from '#lib/domain/positions.ts';
	type Player = { id: string; name: string; position: Position };
	let { squad, lineup, order = [], instructions = {}, selected = '', disabled = false, oncaptains, oninstruction }: {
		squad: Player[]; lineup: string[]; order?: string[]; instructions?: Orders; selected?: string; disabled?: boolean;
		oncaptains?: (ids: string[]) => void; oninstruction: (id: string, instruction: PlayerOrder | null) => void;
	} = $props();
	let pick = $state('');
	let add = $state('');
	const starters = $derived(lineup.flatMap((id) => squad.find((p) => p.id === id) ?? []));
	const player = $derived(starters.find((p) => p.id === (selected || pick)) ?? starters[0]);
	const available = $derived(squad.filter((p) => !order.includes(p.id)));
	function move(index: number, shift: number) {
		const next = [...order];
		[next[index], next[index + shift]] = [next[index + shift], next[index]];
		oncaptains?.(next);
	}
</script>
<div class="controls">
	{#if player}
		{#if !selected}
			<label>Atleta<select value={player.id} onchange={(e) => pick = e.currentTarget.value}>
				{#each starters as item (item.id)}<option value={item.id}>{item.name} · {item.position}</option>{/each}
			</select></label>
		{/if}
		<label>Instrução individual<select {disabled} value={instructions[player.id] ?? ''} onchange={(e) => {
			const value = e.currentTarget.value;
			oninstruction(player.id, isPlayerOrder(value) ? value : null);
		}}>
			<option value="">Seguir função e tática coletiva</option>
			{#each Object.entries(PLAYER_ORDERS) as [id, item]}
				{#if isPlayerOrder(id) && fitsOrder(id, player.position)}<option value={id}>{item.label}</option>{/if}
			{/each}
		</select></label>
	{/if}
	{#if oncaptains}
		<details>
			<summary>Hierarquia de capitães</summary>
			{#each order as id, index (id)}
				<div class="rank"><span>{index === 0 ? 'Capitão' : index === 1 ? 'Vice' : index + 1} · {squad.find((p) => p.id === id)?.name ?? id}</span>
					<button type="button" aria-label="Subir na hierarquia" disabled={disabled || index === 0} onclick={() => move(index, -1)}>↑</button>
					<button type="button" aria-label="Descer na hierarquia" disabled={disabled || index === order.length - 1} onclick={() => move(index, 1)}>↓</button>
					<button type="button" aria-label="Remover da hierarquia" {disabled} onclick={() => oncaptains?.(order.filter((item) => item !== id))}>×</button>
				</div>
			{/each}
			<div class="rank">
				<select aria-label="Adicionar jogador à hierarquia" bind:value={add} {disabled}><option value="">Escolher jogador</option>
					{#each available as item (item.id)}<option value={item.id}>{item.name}{lineup.includes(item.id) ? '' : ' · fora do XI'}</option>{/each}
				</select>
				<button type="button" disabled={disabled || !add || order.length >= 11} onclick={() => { oncaptains?.([...order, add]); add = ''; }}>Adicionar</button>
			</div>
		</details>
	{/if}
</div>
<style>
	.controls{display:grid;gap:8px;margin-block:8px}.rank{display:flex;align-items:center;gap:4px;margin-top:6px;flex-wrap:wrap}.rank span{flex:1}label{display:grid;gap:3px}select,button{font:inherit;color:var(--text);background:var(--surface);border:1px solid var(--line);padding:6px;border-radius:7px;max-width:100%}button:disabled{opacity:.5}summary{cursor:pointer;color:var(--emerald-strong)}
</style>
