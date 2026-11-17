<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons.ts';

	let {
		tone = 'neutral',
		icon,
		children
	}: { tone?: 'neutral' | 'emerald' | 'gold' | 'danger' | 'warning' | 'info'; icon?: IconName; children: Snippet } = $props();
</script>

<span class="badge {tone}">
	{#if icon}<Icon name={icon} size={14} stroke={2} />{/if}
	{@render children()}
</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		height: 24px;
		padding: 0 10px;
		border-radius: var(--radius-pill);
		font-size: var(--fs-xs);
		font-weight: 600;
		white-space: nowrap;
		background: var(--surface-3);
		color: var(--text-2);
	}
	.emerald {
		background: var(--emerald-soft);
		color: var(--emerald-strong);
	}
	.gold {
		background: var(--gold-soft);
		color: var(--gold);
	}
	.danger {
		background: var(--danger-soft);
		color: var(--danger);
	}
	.warning {
		background: var(--warning-soft);
		color: var(--warning);
	}
	.info {
		background: var(--info-soft);
		color: var(--info);
	}
</style>
