<script lang="ts">
	import { desktop, setDesktopMode, toggleFullscreen } from '#lib/stores/desktop.svelte.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import { page } from '$app/state';

	const section = $derived.by(() => {
		const p = page.url.pathname;
		if (p.startsWith('/carreira')) return 'Carreira';
		if (p.startsWith('/configuracoes')) return 'Configurações';
		if (p.startsWith('/novidades')) return 'Atualizações';
		if (p.startsWith('/multiplayer')) return 'Multiplayer';
		if (p.startsWith('/laboratorio')) return 'Laboratório';
		if (p.startsWith('/nova-carreira')) return 'Nova carreira';
		return '';
	});
</script>

{#if desktop.active}
	{#if !desktop.fullscreen}
		<header class="bar" aria-label="Janela do BRASFC">
			<span class="brand">BRAS<b>FC</b></span>
			{#if section}<span class="sep" aria-hidden="true">/</span><span class="sec">{section}</span>{/if}
			<span class="grow"></span>
			{#if desktop.offlineAvailable || desktop.mode === 'offline'}
				<button
					type="button"
					class="mode"
					data-mode={desktop.mode}
					onclick={() => {
						const next = desktop.mode === 'offline' ? 'online' : 'offline';
						const msg = next === 'offline' ? 'Jogar OFFLINE? O jogo passa a rodar no seu computador e mostra as carreiras salvas nele (as carreiras online continuam na nuvem).' : 'Voltar a jogar ONLINE? Você verá as carreiras salvas no servidor (as offline continuam no computador).';
						if (confirm(msg)) void setDesktopMode(next);
					}}
					title={desktop.mode === 'offline' ? 'Jogando offline: carreiras salvas neste computador. Clique para jogar online.' : 'Jogando online: carreiras salvas no servidor. Clique para jogar offline.'}
				>
					<i aria-hidden="true"></i><span>{desktop.mode === 'offline' ? 'Modo local' : 'Modo online'}</span>
				</button>
			{/if}
			<button type="button" class="full" onclick={toggleFullscreen} title="Tela cheia (F11)" aria-label="Entrar em tela cheia (F11)">
				<Icon name="expand" size={15} /><span>Tela cheia</span><kbd>F11</kbd>
			</button>
		</header>
	{:else}
		<div class="edge" aria-hidden="true"></div>
		<button type="button" class="exit" onclick={toggleFullscreen} aria-label="Sair da tela cheia (F11)">
			<Icon name="shrink" size={15} /><span>Sair da tela cheia</span><kbd>F11</kbd>
		</button>
	{/if}
{/if}

<style>
	.bar {
		position: fixed;
		inset: 0 0 auto 0;
		height: 36px;
		z-index: 1000;
		display: flex;
		align-items: center;
		gap: 8px;
		/* área à direita reservada aos botões nativos (minimizar, maximizar, fechar) */
		padding: 0 150px 0 14px;
		background: color-mix(in srgb, #101418 94%, transparent);
		backdrop-filter: blur(10px);
		border-bottom: 1px solid color-mix(in srgb, #e7edf0 7%, transparent);
		-webkit-app-region: drag;
		user-select: none;
		font-size: 12.5px;
		color: #aab6bd;
	}
	.brand {
		font-family: 'Barlow Condensed', sans-serif;
		font-weight: 800;
		letter-spacing: 0.08em;
		color: #e7edf0;
		font-size: 15px;
	}
	.brand b {
		color: #10b981;
	}
	.sep {
		opacity: 0.4;
	}
	.grow {
		flex: 1;
	}
	.mode i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #10b981;
	}
	.mode[data-mode='offline'] i {
		background: #e8b86a;
	}
	.mode[data-mode='offline'] {
		color: #e8b86a;
	}
	button {
		-webkit-app-region: no-drag;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border: 1px solid transparent;
		background: transparent;
		color: inherit;
		font: inherit;
		border-radius: 8px;
		padding: 4px 9px;
		cursor: pointer;
		transition:
			background 0.18s,
			color 0.18s,
			border-color 0.18s;
	}
	button:hover,
	button:focus-visible {
		background: color-mix(in srgb, #10b981 14%, transparent);
		color: #e7edf0;
		border-color: color-mix(in srgb, #10b981 35%, transparent);
		outline: none;
	}
	kbd {
		font: 600 10.5px/1 ui-monospace, monospace;
		padding: 2px 5px;
		border-radius: 4px;
		background: color-mix(in srgb, #e7edf0 9%, transparent);
	}
	/* Em tela cheia: o botão de saída aparece ao levar o cursor ao topo (ou pelo teclado). */
	.edge {
		position: fixed;
		inset: 0 0 auto 0;
		height: 10px;
		z-index: 1000;
	}
	.exit {
		position: fixed;
		top: 10px;
		left: 50%;
		z-index: 1001;
		translate: -50% -140%;
		opacity: 0;
		background: color-mix(in srgb, #101418 90%, transparent);
		backdrop-filter: blur(10px);
		border-color: color-mix(in srgb, #e7edf0 12%, transparent);
		color: #e7edf0;
		padding: 7px 12px;
		border-radius: 999px;
		font-size: 13px;
		transition:
			translate 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.2),
			opacity 0.2s;
	}
	.edge:hover + .exit,
	.exit:hover,
	.exit:focus-visible {
		translate: -50% 0;
		opacity: 1;
	}
	@media (prefers-reduced-motion: reduce) {
		.exit {
			transition: opacity 0.15s;
		}
	}
</style>
