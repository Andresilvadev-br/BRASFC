<script lang="ts">
	import { animate } from '#lib/motion/motion.svelte.ts';
	import { count } from '#lib/motion/actions.ts';

	/**
	 * Progress Card — um indicador com contexto (valor, escala, variação e leitura).
	 * A barra só anima quando o valor muda; sem `max` mostra apenas o número.
	 */
	let {
		label,
		value,
		max,
		suffix = '',
		delta,
		hint,
		tone = 'auto',
		decimals = 0,
		display
	}: {
		label: string;
		value: number;
		max?: number;
		suffix?: string;
		/** Variação real desde a referência indicada no `hint`. */
		delta?: number | null;
		hint?: string;
		tone?: 'auto' | 'emerald' | 'gold' | 'danger' | 'info';
		decimals?: number;
		/** Texto exibido no lugar do número (ex.: valores em reais já formatados). */
		display?: string;
	} = $props();
	let bar = $state<HTMLElement>();
	const ratio = $derived(max ? Math.max(0, Math.min(1, value / max)) : 0);
	const resolved = $derived(tone !== 'auto' ? tone : !max ? 'emerald' : ratio >= 0.66 ? 'emerald' : ratio >= 0.4 ? 'gold' : 'danger');
	const fmt = $derived((v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
	$effect(() => {
		if (bar) void animate(bar, { scaleX: ratio }, { spring: 'gentle' });
	});
</script>

<div class="stat {resolved}">
	<span class="label">{label}</span>
	<span class="value">{#if display}<b>{display}</b>{:else}<b use:count={{ value, format: fmt }}>{fmt(value)}</b>{/if}{#if suffix}<small>{suffix}</small>{/if}{#if max}<small class="of">/{max}</small>{/if}</span>
	{#if max}
		<span class="track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}><span class="fill" bind:this={bar} style:transform="scaleX({ratio})"></span></span>
	{/if}
	{#if delta != null || hint}
		<span class="foot">
			{#if delta != null && delta !== 0}<span class="delta" class:up={delta > 0}>{delta > 0 ? '▲' : '▼'} {Math.abs(delta).toLocaleString('pt-BR', { maximumFractionDigits: decimals })}</span>{:else if delta === 0}<span class="delta flat">= sem variação</span>{/if}
			{#if hint}<span class="hint">{hint}</span>{/if}
		</span>
	{/if}
</div>

<style>
	.stat {
		--tone: var(--emerald-strong);
		display: grid;
		gap: 6px;
		min-width: 0;
		padding: 14px;
		border-radius: var(--radius-m);
		background: linear-gradient(170deg, var(--surface-2), var(--surface-sunken));
		border: 1px solid var(--line);
	}
	.gold { --tone: var(--gold); }
	.danger { --tone: var(--danger); }
	.info { --tone: var(--info); }
	.label { font-size: var(--fs-xs); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-3); }
	.value { display: flex; align-items: baseline; gap: 3px; font-family: var(--font-display); line-height: 1; }
	.value b { font-size: clamp(1.6rem, 3vw, 2.1rem); font-weight: 800; color: var(--text); font-variant-numeric: tabular-nums; }
	.value small { font-size: var(--fs-sm); color: var(--text-2); font-weight: 600; }
	.value .of { color: var(--text-3); }
	.track { display: block; height: 6px; border-radius: 99px; background: rgb(231 237 240 / 0.08); overflow: hidden; }
	.fill { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, color-mix(in srgb, var(--tone) 55%, transparent), var(--tone)); transform-origin: left center; }
	.foot { display: flex; flex-wrap: wrap; gap: 4px 8px; font-size: var(--fs-xs); color: var(--text-3); }
	.delta { font-weight: 700; color: var(--danger); }
	.delta.up { color: var(--good); }
	.delta.flat { color: var(--text-3); font-weight: 600; }
</style>
