<script lang="ts">
	import type { Snippet } from 'svelte';
	import { pop } from '#lib/motion/actions.ts';
	import Icon from '../Icon.svelte';
	import type { IconName } from '../icons.ts';

	/**
	 * Interactive Selection Card — opção visual em um grupo (role="radiogroup" no pai).
	 * Navegável por teclado: setas movem entre as opções do mesmo grupo.
	 */
	let {
		selected = false,
		icon,
		title,
		description,
		disabled = false,
		onselect,
		children
	}: {
		selected?: boolean;
		icon?: IconName;
		title: string;
		description?: string;
		disabled?: boolean;
		onselect: () => void;
		children?: Snippet;
	} = $props();

	function key(e: KeyboardEvent) {
		if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
		const group = (e.currentTarget as HTMLElement).closest('[role="radiogroup"]');
		const items = [...(group?.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)') ?? [])];
		const i = items.indexOf(e.currentTarget as HTMLButtonElement);
		if (i < 0) return;
		e.preventDefault();
		const next = items[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
		next.focus();
		next.click();
	}
</script>

<button type="button" role="radio" class="select" aria-checked={selected} tabindex={selected ? 0 : -1} {disabled} onclick={onselect} onkeydown={key} data-umx-press>
	{#if icon}<span class="tile" aria-hidden="true"><Icon name={icon} size={20} /></span>{/if}
	<span class="text">
		<strong>{title}</strong>
		{#if description}<span class="desc">{description}</span>{/if}
		{#if children}<span class="extra">{@render children()}</span>{/if}
	</span>
	{#if selected}<span class="check" aria-hidden="true" use:pop><Icon name="check" size={14} stroke={2.6} /></span>{/if}
</button>

<style>
	.select {
		position: relative;
		display: flex;
		align-items: flex-start;
		gap: 12px;
		width: 100%;
		min-width: 0;
		padding: 14px;
		text-align: start;
		color: var(--text);
		background: var(--surface-sunken);
		border: 1px solid var(--line);
		border-radius: var(--radius-m);
		transition: border-color 0.18s var(--ease-out), background 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out);
	}
	.select:not(:disabled):hover { border-color: var(--line-strong); background: var(--surface); }
	.select[aria-checked='true'] {
		border-color: var(--emerald-line);
		background: linear-gradient(150deg, var(--emerald-soft), transparent 75%), var(--surface);
		box-shadow: 0 0 0 1px var(--emerald-line) inset, 0 10px 28px -16px rgb(16 185 129 / 0.6);
	}
	.select:disabled { opacity: 0.5; cursor: not-allowed; }
	.tile { flex: none; display: grid; place-items: center; width: 38px; height: 38px; border-radius: 10px; background: rgb(231 237 240 / 0.06); color: var(--text-2); }
	[aria-checked='true'] .tile { background: var(--emerald-soft); color: var(--emerald-strong); }
	.text { display: grid; gap: 3px; min-width: 0; padding-inline-end: 18px; }
	strong { font-weight: 700; line-height: 1.2; }
	.desc { color: var(--text-2); font-size: var(--fs-xs); line-height: 1.4; }
	.extra { display: block; margin-top: 6px; }
	.check { position: absolute; top: 10px; inset-inline-end: 10px; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--emerald); color: #04130d; }
</style>
