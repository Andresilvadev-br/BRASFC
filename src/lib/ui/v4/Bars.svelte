<script lang="ts">
	import { formatMoney } from '#lib/domain/market.ts';
	/** Receitas × despesas por mês, com a linha do saldo — interativo (foco/cursor mostra o detalhe). */
	let { months }: { months: Array<{ season: number; month: number; label: string; income: number; expense: number; balance: number }> } = $props();
	let active = $state<number | null>(null);
	const W = 640;
	const H = 220;
	const pad = 28;
	const max = $derived(Math.max(1, ...months.map((m) => Math.max(m.income, Math.abs(m.expense)))));
	const bal = $derived.by(() => {
		const vals = months.map((m) => m.balance);
		return { lo: Math.min(0, ...vals), hi: Math.max(1, ...vals) };
	});
	const bw = $derived(months.length ? (W - pad * 2) / months.length : 0);
	const y = (v: number) => H / 2 - (v / max) * (H / 2 - 16);
	const yb = (v: number) => H - 10 - ((v - bal.lo) / (bal.hi - bal.lo || 1)) * (H - 30);
</script>

<div class="bars">
	<svg viewBox="0 0 {W} {H}" role="img" aria-label="Receitas e despesas por mês">
		<line x1={pad} x2={W - pad} y1={H / 2} y2={H / 2} class="axis" />
		{#each months as m, i (`${m.season}:${m.month}`)}
			{@const x = pad + i * bw + bw * 0.18}
			<g
				class="col"
				class:on={active === i}
				role="button"
				tabindex="0"
				aria-label="{m.label}: receitas {formatMoney(m.income)}, despesas {formatMoney(m.expense)}"
				onmouseenter={() => (active = i)}
				onfocus={() => (active = i)}
				onmouseleave={() => (active = null)}
				onblur={() => (active = null)}
			>
				<rect x={pad + i * bw} y="0" width={bw} height={H} class="hit" />
				<rect {x} y={y(m.income)} width={bw * 0.3} height={Math.max(1, H / 2 - y(m.income))} rx="3" class="in" />
				<rect x={x + bw * 0.34} y={H / 2} width={bw * 0.3} height={Math.max(1, y(m.expense) - H / 2)} rx="3" class="out" />
			</g>
		{/each}
		{#if months.length > 1}
			<polyline class="balance" points={months.map((m, i) => `${pad + i * bw + bw / 2},${yb(m.balance)}`).join(' ')} />
		{/if}
	</svg>
	<div class="legend">
		<span><i class="in"></i>Receitas</span><span><i class="out"></i>Despesas</span><span><i class="ln"></i>Saldo</span>
		{#if active !== null && months[active]}
			{@const m = months[active]}
			<strong class="detail">{m.label}: <span class="pos">{formatMoney(m.income)}</span> · <span class="neg">{formatMoney(m.expense)}</span> · saldo {formatMoney(m.balance)}</strong>
		{/if}
	</div>
</div>

<style>
	svg {
		width: 100%;
		height: auto;
		display: block;
	}
	.axis {
		stroke: var(--line-strong);
	}
	.hit {
		fill: transparent;
	}
	.col:focus-visible {
		outline: none;
	}
	.col.on .hit {
		fill: rgb(231 237 240 / 0.04);
	}
	.in {
		fill: var(--emerald);
	}
	.out {
		fill: var(--danger);
		opacity: 0.85;
	}
	.balance {
		fill: none;
		stroke: var(--gold);
		stroke-width: 2.5;
		stroke-linejoin: round;
	}
	.legend {
		display: flex;
		gap: var(--sp-4);
		flex-wrap: wrap;
		font-size: var(--fs-xs);
		color: var(--text-2);
		align-items: center;
	}
	.legend i {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 3px;
		margin-right: 6px;
		vertical-align: -1px;
	}
	.legend i.in {
		background: var(--emerald);
	}
	.legend i.out {
		background: var(--danger);
	}
	.legend i.ln {
		background: var(--gold);
		height: 3px;
	}
	.detail {
		margin-left: auto;
		font-weight: 600;
		color: var(--text);
	}
</style>
