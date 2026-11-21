<script lang="ts">
	import { formatExactMoney } from '#lib/domain/market.ts';
	import { ratingText, type Rating, type MarketProfile } from '#lib/domain/market-search.ts';
	import { ATTRIBUTE_LABELS, ALL_ATTRIBUTES } from '#lib/engine/attributes.ts';
	import Crest from '../Crest.svelte';

	let { players }: { players: MarketProfile[] } = $props();
	const numeric = (value: number | null, money = false) => value === null ? '—' : money ? formatExactMoney(value) : String(value);
	function leading(values: (Rating | null)[]) {
		if (!values[0] || !values[1]) return -1;
		if (values[0].min > values[1].max) return 0;
		if (values[1].min > values[0].max) return 1;
		return -1;
	}
</script>

{#if players.length === 2}
	<div class="comparison">
		{#each players as p (p.id)}
			<div class="player"><Crest clubId={p.club} size={28} /><strong>{p.name}</strong><small>{p.clubName}</small></div>
		{/each}
		{#each [
			{ label: 'Posição', values: players.map((p) => [p.position, ...p.secondary].join(' / ')) },
			{ label: 'Idade', values: players.map((p) => numeric(p.age)) },
			{ label: 'Valor', values: players.map((p) => numeric(p.value, true)) },
			{ label: 'Salário por mês', values: players.map((p) => numeric(p.wage, true)) }
		] as metric (metric.label)}
			<span class="metric">{metric.label}</span>
			{#each metric.values as value}<b>{value}</b>{/each}
		{/each}
		{#each [
			{ label: 'Overall', values: players.map((p) => p.overall) },
			{ label: 'Potencial', values: players.map((p) => p.potential) },
			...ALL_ATTRIBUTES.map((key) => ({ label: ATTRIBUTE_LABELS[key], values: players.map((p) => p.attributes[key] ?? null) })).filter((metric) => metric.values.some(Boolean))
		] as metric (metric.label)}
			<span class="metric">{metric.label}</span>
			{#each metric.values as value, i}
				<b class:leading={leading(metric.values) === i}>{ratingText(value)} {#if value && !players[i].isMine}<small>est.</small>{/if}</b>
			{/each}
		{/each}
	</div>
{:else}
	<p>Selecione dois atletas para comparar.</p>
{/if}

<style>
	.comparison { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .25rem .65rem; text-align: center; }
	.player { display: grid; justify-items: center; align-content: start; gap: .3rem; padding: .6rem; border: 1px solid var(--line); border-radius: 10px; overflow-wrap: anywhere; }
	small, .metric { color: var(--text-2); }.metric { grid-column: 1/-1; font-size: var(--fs-xs); border-top: 1px solid var(--line); padding-top: .4rem; margin-top: .2rem; }
	b { overflow-wrap: anywhere; }.leading { color: var(--emerald-strong); }
</style>
