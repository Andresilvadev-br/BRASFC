<script lang="ts">
	import { nativeUpdateAction } from '#lib/stores/desktop.svelte.ts';
	import { connectionText } from '#lib/api.ts';
	import { pendingWrites } from '#lib/stores/unsaved.svelte.ts';
	import '#lib/data/brasil.ts'; // registra os clubes reais (escudos/nomes em qualquer tela)
	import '@fontsource-variable/inter';
	import '@fontsource/barlow-condensed/600.css';
	import '@fontsource/barlow-condensed/700.css';
	import '@fontsource/barlow-condensed/800.css';
	import '../app.css';

	import { onMount, tick } from 'svelte';
	import { beforeNavigate, onNavigate, preloadData } from '$app/navigation';
	import { page, updated } from '$app/state';
	import { markHydrated } from '#lib/motion/actions.ts';
	import { getMotion, loadMotion, motion } from '#lib/motion/motion.svelte.ts';
	import { setPersistent } from '#lib/stores/island.svelte.ts';
	import { loadPrefs } from '#lib/stores/prefs.svelte.ts';
	import { hasUnsaved, unsavedLabels } from '#lib/stores/unsaved.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Toast from '#lib/ui/Toast.svelte';
	import Modal from '#lib/ui/Modal.svelte';
	import WhatsNew from '#lib/ui/v4/WhatsNew.svelte';
	import DesktopBar from '#lib/ui/desktop/DesktopBar.svelte';
	import { initNativeUpdates, initDesktop } from '#lib/stores/desktop.svelte.ts';
	import { goto } from '$app/navigation';
	import { applyUpdate, initUpdates, shouldShowWhatsNew, updates } from '#lib/stores/updates.svelte.ts';

	let { children } = $props();

	let updateModal = $state(false);
	let whatsNew = $state(false);
	let navigationId = 0;
	let navigationFeedback = $state<{ href: string; message: string; pending: boolean } | null>(null);
	// '/' é a landing page (site) e '/jogar' é a abertura do jogo: nenhuma das duas mostra avisos do jogo.
	const onSplash = $derived(page.url.pathname === '/' || page.url.pathname === '/jogar');

	$effect(() => { void nativeUpdateAction('busy', hasUnsaved() || pendingWrites.count > 0); });
	onMount(initNativeUpdates);
	onMount(() => {
		loadPrefs();
		void loadMotion();
		const stopUpdates = initUpdates({ registerWorker: !import.meta.env.DEV });
		const stopDesktop = initDesktop();
		// Depois de uma atualização confirmada: "O que há de novo" (uma vez por versão).
		setTimeout(() => (whatsNew = !onSplash && shouldShowWhatsNew()), 600);
		void tick().then(() => requestAnimationFrame(markHydrated));
		const warn = (e: BeforeUnloadEvent) => {
			if (hasUnsaved()) e.preventDefault();
		};
		window.addEventListener('beforeunload', warn);
		return () => {
			window.removeEventListener('beforeunload', warn);
			stopUpdates();
			stopDesktop();
		};
	});

	// Nova versão publicada: aviso discreto e contextual, sem interromper nada.
	$effect(() => {
		if (!updated.current && updates.status !== 'disponivel') return;
		setPersistent('update', {
			icon: 'sparkle',
			tone: 'gold',
			title: updates.required ? 'Atualização necessária' : 'Nova versão do BRASFC',
			detail: updates.remote ? `Versão ${updates.remote.version}` : 'Atualize quando quiser',
			action: { label: 'Ver novidades', run: () => goto('/novidades') }
		});
	});

	async function requestUpdate() {
		const r = await applyUpdate();
		if (!r.ok && 'blocked' in r) updateModal = true;
	}

	// Com versão nova e nada pendente, a próxima navegação recarrega a página
	// inteira (carrega o código novo com segurança). Com algo pendente, espera.
	beforeNavigate(({ willUnload, to }) => {
		if (updated.current && !willUnload && to?.url && !hasUnsaved()) {
			location.href = to.url.href;
		}
	});

	// Keep the current career mounted until the next page loads successfully.
	async function openCareerPage(href: string) {
		const attempt = ++navigationId;
		navigationFeedback = { href, message: 'Carregando seção…', pending: true };
		try {
			const result = await preloadData(href);
			if (attempt !== navigationId) return;
			if (result.status >= 500 || result.status === 429) {
				const ref = result.type === 'error' && result.error.id ? ` Código: ${result.error.id}` : '';
				const reason = !navigator.onLine ? connectionText.offline : result.status === 429 ? connectionText.limited : connectionText.server;
				navigationFeedback = { href, message: reason + ref, pending: false };
				return;
			}
			navigationFeedback = null;
			await goto(result.type === 'redirect' ? result.location : href);
		} catch {
			if (attempt === navigationId) navigationFeedback = { href, message: navigator.onLine ? connectionText.reconnecting : connectionText.offline, pending: false };
		}
	}

	beforeNavigate(({ type, to, willUnload, cancel }) => {
		if (type === 'link' && !willUnload && !updated.current && to?.url.pathname.startsWith('/carreira/')) {
			cancel();
			if (navigationFeedback?.pending && navigationFeedback.href === to.url.href) return;
			void openCareerPage(to.url.href);
		} else {
			navigationId++;
			navigationFeedback = null;
		}
	});

	// Transições entre páginas: elementos compartilhados (data-umx-shared) fazem
	// morphing e o conteúdo novo entra escalonado — Ultra Motion X.
	onNavigate((nav) => {
		const umx = getMotion();
		const main = document.getElementById('page');
		if (!umx || motion.reduced || !main || nav.type === 'form') return;
		umx.transitions.prewarm(main);
		const direction = nav.type === 'popstate' && nav.delta < 0 ? -1 : 1;
		return () => {
			const next = document.getElementById('page');
			if (next) umx.transitions.navigate({ from: null, to: next, swap: () => {}, direction });
		};
	});
</script>

<DesktopBar />
<Toast hidden={onSplash} />
<WhatsNew bind:open={whatsNew} />

{#if navigationFeedback}
	<div class="nav-feedback" role="status">
		{navigationFeedback.message}
		{#if !navigationFeedback.pending}
			<Button size="sm" onclick={() => navigationFeedback && void openCareerPage(navigationFeedback.href)}>Tentar novamente</Button>
		{/if}
	</div>
{/if}
<div id="page">
	{@render children()}
</div>

<Modal bind:open={updateModal} title="Atualizar agora?" description="Há uma nova versão do BRASFC disponível." size="sm">
	<p class="muted">Você tem alterações não salvas:</p>
	<ul class="pending">
		{#each unsavedLabels() as label (label)}<li>{label}</li>{/each}
	</ul>
	<p class="muted">Salve antes de atualizar para não perder nada.</p>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (updateModal = false)}>Voltar e salvar</Button>
		<Button variant="danger" onclick={() => applyUpdate({ force: true })}>Atualizar mesmo assim</Button>
	{/snippet}
</Modal>

<style>
	.nav-feedback { position: fixed; z-index: 999; inset-inline-end: 16px; inset-block-end: 16px; display: flex; gap: 10px;
		align-items: center; max-width: calc(100% - 32px); padding: 10px 12px; border-radius: var(--radius); border: 1px solid var(--line);
		background: var(--surface-2); color: var(--text); font-size: var(--fs-sm); }

	#page {
		min-height: var(--app-h, 100vh);
	}
	.pending {
		margin: var(--sp-3) 0;
		padding-left: var(--sp-5);
		color: var(--text);
	}
</style>
