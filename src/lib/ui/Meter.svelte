<script lang="ts">
	/** Barra de valor 0–100 (condição física, familiaridade…). */
	let { value, label, compact = false }: { value: number; label?: string; compact?: boolean } = $props();
	const tone = $derived(value >= 90 ? 'good' : value >= 75 ? 'ok' : 'low');
</script>

<span class="meter {tone}" class:compact role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow={value} aria-label={label}>
	<span class="track"><span class="fill" style="width:{Math.max(0, Math.min(100, value))}%"></span></span>
	{#if !compact}<span class="val num">{value}%</span>{/if}
</span>

<style>
	.meter {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		min-width: 0;
	}
	.track {
		position: relative;
		width: 64px;
		height: 6px;
		border-radius: 99px;
		background: var(--surface-3);
		overflow: hidden;
	}
	.compact .track {
		width: 44px;
	}
	.fill {
		position: absolute;
		inset: 0 auto 0 0;
		border-radius: inherit;
		transition: width 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	.good .fill {
		background: var(--emerald);
	}
	.ok .fill {
		background: var(--warning);
	}
	.low .fill {
		background: var(--danger);
	}
	.val {
		font-size: var(--fs-xs);
		color: var(--text-2);
		min-width: 34px;
	}
</style>
