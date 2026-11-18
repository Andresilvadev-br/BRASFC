<script lang="ts">
	/** Minigráfico de linha (evolução de jovens, forma recente, saldo). */
	let { values, width = 120, height = 32, tone = 'var(--emerald-strong)', label = '' }: { values: number[]; width?: number; height?: number; tone?: string; label?: string } = $props();
	const coords = $derived.by(() => {
		if (values.length < 2) return [] as Array<[number, number]>;
		const min = Math.min(...values);
		const max = Math.max(...values);
		const span = max - min || 1;
		return values.map((v, i) => [(i / (values.length - 1)) * width, height - 3 - ((v - min) / span) * (height - 6)] as [number, number]);
	});
</script>

<svg {width} {height} viewBox="0 0 {width} {height}" role="img" aria-label={label || 'Tendência'}>
	{#if coords.length}
		<polyline points={coords.map((c) => c.join(',')).join(' ')} fill="none" stroke={tone} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
		<circle cx={coords.at(-1)![0]} cy={coords.at(-1)![1]} r="3" fill={tone} />
	{:else}
		<line x1="0" x2={width} y1={height / 2} y2={height / 2} stroke="var(--line-strong)" stroke-dasharray="3 4" />
	{/if}
</svg>
