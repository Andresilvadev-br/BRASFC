<script lang="ts">
	/** Comparação interativa entre temporadas: aproveitamento (barras) e posição final (marcador). */
	type S = { season: number; division: string; position: number; points: number; played: number; outcome: string };
	let { seasons, labels }: { seasons: S[]; labels: Record<string, string> } = $props();
	let active = $state<number | null>(null);
	const W = 640;
	const H = 200;
	const pad = 30;
	const bw = $derived(Math.min(56, (W - pad * 2) / Math.max(1, seasons.length) - 12));
	const pct = (s: S) => (s.played ? s.points / (s.played * 3) : 0);
	const sel = $derived(active !== null ? seasons[active] : seasons.at(-1));
</script>

<figure class="sc">
	<svg viewBox="0 0 {W} {H}" role="img" aria-label="Aproveitamento por temporada">
		{#each [0.25, 0.5, 0.75] as g (g)}
			<line x1={pad} x2={W - pad} y1={H - pad - g * (H - pad * 2)} y2={H - pad - g * (H - pad * 2)} class="g" />
			<text x="2" y={H - pad - g * (H - pad * 2) + 4} class="t">{g * 100}%</text>
		{/each}
		{#each seasons as s, i (s.season)}
			{@const x = pad + (i + 0.5) * ((W - pad * 2) / seasons.length) - bw / 2}
			{@const h = pct(s) * (H - pad * 2)}
			<rect
				{x}
				y={H - pad - h}
				width={bw}
				height={h}
				rx="6"
				class="b {s.outcome}"
				class:on={active === i}
				style="--d:{i * 70}ms"
				tabindex="0"
				role="button"
				aria-label="{s.season}: {Math.round(pct(s) * 100)}% de aproveitamento, {s.position}º"
				onpointerenter={() => (active = i)}
				onfocus={() => (active = i)}
				onpointerleave={() => (active = null)}
				onblur={() => (active = null)}
			/>
			<text x={x + bw / 2} y={H - 10} class="t c">{s.season}</text>
		{/each}
	</svg>
	{#if sel}
		<figcaption>
			<strong>{sel.season}</strong> · {labels[sel.division] ?? sel.division} · {sel.position}º · {sel.points} pts em {sel.played} jogos ({Math.round(pct(sel) * 100)}%)
		</figcaption>
	{/if}
</figure>

<style>
	.sc {
		margin: 0;
	}
	svg {
		width: 100%;
		height: auto;
	}
	.g {
		stroke: rgb(231 237 240 / 0.07);
	}
	.t {
		fill: var(--text-3);
		font-size: 10px;
	}
	.c {
		text-anchor: middle;
	}
	.b {
		fill: #10b981;
		opacity: 0.75;
		transform-box: fill-box;
		transform-origin: bottom;
		animation: up 0.7s cubic-bezier(0.2, 0.9, 0.3, 1.1) both;
		animation-delay: var(--d);
		cursor: pointer;
		transition: opacity 0.2s;
	}
	.b.campeao,
	.b.acesso {
		fill: #e8b86a;
	}
	.b.rebaixado {
		fill: #ef4444;
	}
	.b.on,
	.b:focus-visible {
		opacity: 1;
		outline: none;
	}
	@keyframes up {
		from {
			transform: scaleY(0);
		}
	}
	figcaption {
		font-size: var(--fs-sm);
		margin-top: 4px;
	}
	@media (prefers-reduced-motion: reduce) {
		.b {
			animation: none;
		}
	}
</style>
