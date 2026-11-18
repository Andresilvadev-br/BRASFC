<script lang="ts">
	import { count } from '#lib/motion/actions.ts';
	/** Medidor radial 0–100 (confiança, saúde financeira, humor da torcida). */
	let { value, label, caption = '', size = 132, suffix = '%' }: { value: number; label: string; caption?: string; size?: number; suffix?: string } = $props();
	const v = $derived(Math.max(0, Math.min(100, value)));
	const tone = $derived(v >= 66 ? 'var(--emerald-strong)' : v >= 40 ? 'var(--gold)' : 'var(--danger)');
	const R = 52;
	const C = Math.PI * R * 1.5; // arco de 270°
</script>

<figure class="gauge" style="--size:{size}px">
	<svg viewBox="0 0 120 120" role="img" aria-label="{label}: {Math.round(v)}{suffix}">
		<g transform="rotate(135 60 60)">
			<circle cx="60" cy="60" r={R} class="track" stroke-dasharray="{C} 999" />
			<circle cx="60" cy="60" r={R} class="fill" style="stroke:{tone}" stroke-dasharray="{(C * v) / 100} 999" />
		</g>
	</svg>
	<div class="center">
		<span class="val"><span use:count={{ value: Math.round(v) }}>{Math.round(v)}</span><small>{suffix}</small></span>
		<span class="lab">{label}</span>
	</div>
	{#if caption}<figcaption>{caption}</figcaption>{/if}
</figure>

<style>
	.gauge {
		position: relative;
		margin: 0;
		width: var(--size);
		display: grid;
		justify-items: center;
	}
	svg {
		width: var(--size);
		height: var(--size);
		overflow: visible;
	}
	circle {
		fill: none;
		stroke-width: 9;
		stroke-linecap: round;
	}
	.track {
		stroke: rgb(231 237 240 / 0.08);
	}
	.fill {
		transition: stroke-dasharray 0.9s var(--ease-out), stroke 0.4s;
	}
	.center {
		position: absolute;
		inset: 0 0 auto 0;
		height: var(--size);
		display: grid;
		place-content: center;
		text-align: center;
	}
	.val {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: calc(var(--size) * 0.27);
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	.val small {
		font-size: 0.45em;
		color: var(--text-3);
		margin-left: 2px;
	}
	.lab {
		font-size: 11px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-3);
		font-weight: 700;
	}
	figcaption {
		margin-top: -6px;
		font-size: var(--fs-xs);
		color: var(--text-2);
		text-align: center;
		max-width: calc(var(--size) * 1.4);
	}
</style>
