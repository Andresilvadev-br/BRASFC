<script lang="ts">
	import { currentActivity, dismissTransient, island } from '#lib/stores/island.svelte.ts';
	import Icon from './Icon.svelte';

	/**
	 * Aviso discreto no canto inferior: aparece só quando há algo a dizer
	 * (salvou, erro, nova versão) e some sozinho. Sem elemento fixo na tela.
	 */
	let { hidden = false }: { hidden?: boolean } = $props();
	const activity = $derived(currentActivity());
	const isTransient = $derived(!!island.transient && activity?.id === island.transient.id);
</script>

{#if activity && !hidden}
	<div class="toast" data-tone={activity.tone ?? 'neutral'} role="status" aria-live="polite">
		<Icon name={activity.icon} />
		<div class="txt">
			<strong>{activity.title}</strong>
			{#if activity.detail}<span>{activity.detail}</span>{/if}
		</div>
		{#if activity.action}
			<button class="act" onclick={activity.action.run}>{activity.action.label}</button>
		{/if}
		{#if isTransient}
			<button class="x" onclick={dismissTransient} aria-label="Fechar aviso"><Icon name="x" /></button>
		{/if}
	</div>
{/if}

<style>
	.toast {
		position: fixed;
		right: 16px;
		bottom: 16px;
		z-index: 60;
		display: flex;
		align-items: center;
		gap: 10px;
		max-width: min(420px, calc(100vw - 32px));
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--surface-2);
		color: var(--text);
		box-shadow: 0 10px 30px rgb(0 0 0 / 0.45), inset 0 0 0 1px var(--line-strong);
		font-size: var(--fs-sm);
		animation: in 0.22s ease-out;
	}
	.toast[data-tone='success'] :global(svg:first-child) {
		color: var(--emerald-strong);
	}
	.toast[data-tone='error'] :global(svg:first-child) {
		color: var(--danger);
	}
	.toast[data-tone='warning'] :global(svg:first-child),
	.toast[data-tone='gold'] :global(svg:first-child) {
		color: var(--gold);
	}
	.txt {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.txt span {
		color: var(--text-3);
		font-size: var(--fs-xs);
	}
	.act {
		margin-left: auto;
		border: 0;
		border-radius: 8px;
		padding: 6px 10px;
		background: var(--emerald);
		color: #06281c;
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}
	.x {
		margin-left: auto;
		border: 0;
		background: none;
		color: var(--text-3);
		cursor: pointer;
		padding: 2px;
	}
	@keyframes in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.toast {
			animation: none;
		}
	}
</style>
