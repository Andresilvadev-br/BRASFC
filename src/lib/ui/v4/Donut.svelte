<script lang="ts">
	/** Rosca de composição (despesas ou receitas por categoria). */
	let { parts, label }: { parts: Array<{ label: string; value: number; color: string }>; label: string } = $props();
	const total = $derived(parts.reduce((s, p) => s + Math.abs(p.value), 0) || 1);
	const R = 42;
	const C = 2 * Math.PI * R;
	const arcs = $derived.by(() => {
		let acc = 0;
		return parts.map((p) => {
			const len = (Math.abs(p.value) / total) * C;
			const a = { ...p, dash: `${len} ${C - len}`, offset: -acc };
			acc += len;
			return a;
		});
	});
	let hover = $state<number | null>(null);
</script>

<div class="donut">
	<svg viewBox="0 0 100 100" role="img" aria-label={label}>
		<circle cx="50" cy="50" r={R} class="track" />
		{#each arcs as a, i (a.label)}
			<circle cx="50" cy="50" r={R} stroke={a.color} stroke-dasharray={a.dash} stroke-dashoffset={a.offset} class:dim={hover !== null && hover !== i} transform="rotate(-90 50 50)" />
		{/each}
	</svg>
	<ul>
		{#each parts as p, i (p.label)}
			<li onmouseenter={() => (hover = i)} onmouseleave={() => (hover = null)}>
				<i style="background:{p.color}"></i><span>{p.label}</span><b>{Math.round((Math.abs(p.value) / total) * 100)}%</b>
			</li>
		{/each}
	</ul>
</div>

<style>
	.donut {
		display: grid;
		grid-template-columns: 120px 1fr;
		gap: var(--sp-4);
		align-items: center;
	}
	svg {
		width: 120px;
		height: 120px;
	}
	circle {
		fill: none;
		stroke-width: 14;
		transition: opacity 0.2s;
	}
	.track {
		stroke: rgb(231 237 240 / 0.06);
	}
	.dim {
		opacity: 0.25;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 6px;
		font-size: var(--fs-sm);
	}
	li {
		display: grid;
		grid-template-columns: 12px 1fr auto;
		gap: 8px;
		align-items: center;
		color: var(--text-2);
	}
	li i {
		width: 10px;
		height: 10px;
		border-radius: 3px;
	}
	li b {
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}
</style>
