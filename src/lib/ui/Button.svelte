<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons.ts';

	type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
	type Props = {
		variant?: Variant;
		size?: 'sm' | 'md' | 'lg';
		icon?: IconName;
		iconRight?: IconName;
		href?: string;
		loading?: boolean;
		full?: boolean;
		children?: Snippet;
	} & Omit<HTMLButtonAttributes, 'children'> &
		Omit<HTMLAnchorAttributes, 'children'>;

	let {
		variant = 'secondary',
		size = 'md',
		icon,
		iconRight,
		href,
		loading = false,
		full = false,
		disabled,
		children,
		type = 'button',
		...rest
	}: Props = $props();
</script>

{#if href && !disabled}
	<a {href} class="btn {variant} {size}" class:full data-umx-press {...rest as HTMLAnchorAttributes}>
		{#if icon}<Icon name={icon} size={size === 'lg' ? 22 : 18} />{/if}
		{#if children}<span>{@render children()}</span>{/if}
		{#if iconRight}<Icon name={iconRight} size={size === 'lg' ? 22 : 18} />{/if}
	</a>
{:else}
	<button
		{type}
		class="btn {variant} {size}"
		class:full
		class:loading
		disabled={disabled || loading}
		aria-busy={loading || undefined}
		data-umx-press
		{...rest as HTMLButtonAttributes}
	>
		{#if loading}
			<span class="spinner" aria-hidden="true"></span>
		{:else if icon}
			<Icon name={icon} size={size === 'lg' ? 22 : 18} />
		{/if}
		{#if children}<span>{@render children()}</span>{/if}
		{#if iconRight && !loading}<Icon name={iconRight} size={size === 'lg' ? 22 : 18} />{/if}
	</button>
{/if}

<style>
	.btn {
		--h: 42px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-2);
		height: var(--h);
		padding: 0 var(--sp-4);
		border-radius: var(--radius-m);
		border: 1px solid transparent;
		font-weight: 600;
		font-size: var(--fs-sm);
		letter-spacing: 0.01em;
		white-space: nowrap;
		user-select: none;
		transition:
			background-color 0.16s ease,
			border-color 0.16s ease,
			color 0.16s ease,
			box-shadow 0.16s ease;
	}
	.sm {
		--h: 34px;
		padding: 0 var(--sp-3);
		border-radius: var(--radius-s);
		font-size: var(--fs-xs);
	}
	.lg {
		--h: 54px;
		padding: 0 var(--sp-6);
		font-size: var(--fs-md);
		font-family: var(--font-display);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 700;
	}
	.full {
		width: 100%;
	}
	.primary {
		background: var(--emerald);
		color: #04140e;
		box-shadow: 0 6px 20px rgb(16 185 129 / 0.22);
	}
	.primary:hover:not(:disabled) {
		background: var(--emerald-strong);
	}
	.secondary {
		background: var(--surface-2);
		border-color: var(--line-strong);
		color: var(--text);
	}
	.secondary:hover:not(:disabled) {
		background: var(--surface-3);
	}
	.ghost {
		background: transparent;
		color: var(--text-2);
	}
	.ghost:hover:not(:disabled) {
		background: var(--surface-2);
		color: var(--text);
	}
	.danger {
		background: var(--danger-soft);
		border-color: rgb(248 113 113 / 0.35);
		color: #fecaca;
	}
	.danger:hover:not(:disabled) {
		background: rgb(248 113 113 / 0.22);
	}
	.gold {
		background: linear-gradient(180deg, #f0c987, var(--gold));
		color: #2a1c05;
	}
	.btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
		box-shadow: none;
	}
	.btn.loading {
		opacity: 0.85;
		cursor: progress;
	}
	.spinner {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		border: 2px solid currentColor;
		border-right-color: transparent;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
