<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '../Icon.svelte';
	import type { IconName } from '../icons.ts';

	/**
	 * Action Card — uma ação importante com contexto: o que faz, se está disponível e por quê.
	 * Substitui botões soltos em caixas vazias. Sem `onclick`/`href` vira um card informativo.
	 */
	let {
		icon,
		title,
		description,
		status,
		tone = 'emerald',
		disabled = false,
		busy = false,
		href,
		onclick,
		children
	}: {
		icon: IconName;
		title: string;
		description: string;
		/** Estado de disponibilidade mostrado no rodapé do card ("Disponível", "Janela fechada"…). */
		status?: string;
		tone?: 'emerald' | 'gold' | 'info' | 'danger' | 'neutral';
		disabled?: boolean;
		busy?: boolean;
		href?: string;
		onclick?: () => void;
		children?: Snippet;
	} = $props();
	const interactive = $derived(!disabled && (!!href || !!onclick));
</script>

{#snippet body()}
	<span class="tile" aria-hidden="true"><Icon name={icon} size={22} /></span>
	<span class="text">
		<strong>{title}</strong>
		<span class="desc">{description}</span>
		{#if children}<span class="extra">{@render children()}</span>{/if}
	</span>
	<span class="foot">
		{#if status}<span class="status" class:off={disabled}>{busy ? 'Enviando…' : status}</span>{/if}
		{#if interactive}<span class="go" aria-hidden="true"><Icon name="chevronRight" size={18} /></span>{/if}
	</span>
{/snippet}

{#if href && interactive}
	<a class="action {tone}" {href} data-umx-press>{@render body()}</a>
{:else if onclick}
	<button type="button" class="action {tone}" class:busy disabled={disabled || busy} aria-busy={busy || undefined} onclick={() => onclick?.()} data-umx-press>{@render body()}</button>
{:else}
	<div class="action {tone} static">{@render body()}</div>
{/if}

<style>
	.action {
		--tone: var(--emerald-strong);
		--tone-soft: var(--emerald-soft);
		position: relative;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		grid-template-rows: 1fr auto;
		gap: 10px 14px;
		width: 100%;
		min-width: 0;
		padding: 16px;
		text-align: start;
		color: var(--text);
		background: linear-gradient(155deg, color-mix(in srgb, var(--tone) 9%, var(--surface-2)), var(--surface) 62%);
		border: 1px solid var(--line);
		border-radius: var(--radius-l);
		box-shadow: var(--shadow-1);
		overflow: hidden;
		isolation: isolate;
		transition: border-color 0.2s var(--ease-out), background 0.2s var(--ease-out);
	}
	.action::after {
		content: '';
		position: absolute;
		inset: auto -30% -60% auto;
		width: 70%;
		aspect-ratio: 1;
		border-radius: 50%;
		background: radial-gradient(closest-side, color-mix(in srgb, var(--tone) 18%, transparent), transparent);
		z-index: -1;
		pointer-events: none;
	}
	.gold { --tone: var(--gold); --tone-soft: var(--gold-soft); }
	.info { --tone: var(--info); --tone-soft: var(--info-soft); }
	.danger { --tone: var(--danger); --tone-soft: var(--danger-soft); }
	.neutral { --tone: var(--text-2); --tone-soft: rgb(231 237 240 / 0.06); }
	a.action:hover, button.action:not(:disabled):hover { border-color: color-mix(in srgb, var(--tone) 45%, transparent); }
	button.action:disabled { cursor: not-allowed; }
	button.action:disabled:not(.busy) { opacity: 0.62; filter: saturate(0.5); }
	.tile {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: 12px;
		color: var(--tone);
		background: var(--tone-soft);
		border: 1px solid color-mix(in srgb, var(--tone) 30%, transparent);
	}
	.text { display: grid; gap: 4px; min-width: 0; }
	strong { font-family: var(--font-display); font-size: var(--fs-lg); text-transform: uppercase; letter-spacing: 0.02em; line-height: 1.1; }
	.desc { color: var(--text-2); font-size: var(--fs-sm); line-height: 1.4; }
	.extra { display: block; margin-top: 4px; }
	.foot { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 22px; }
	.status { font-size: var(--fs-xs); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--tone); }
	.status.off { color: var(--text-3); }
	.go { margin-inline-start: auto; color: var(--tone); transition: translate 0.2s var(--ease-out); }
	.action:hover .go { translate: 3px 0; }
</style>
