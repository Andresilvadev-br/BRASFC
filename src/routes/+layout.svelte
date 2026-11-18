<script lang="ts">
	import '#lib/data/brasil.ts'; // registra os clubes reais (escudos/nomes em qualquer tela)
	import '@fontsource-variable/inter';
	import '@fontsource/barlow-condensed/600.css';
	import '@fontsource/barlow-condensed/700.css';
	import '@fontsource/barlow-condensed/800.css';
	import '../app.css';

	import { onMount, tick } from 'svelte';
	import { beforeNavigate, onNavigate } from '$app/navigation';
	import { page, updated } from '$app/state';
	import { markHydrated } from '#lib/motion/actions.ts';
	import { getMotion, loadMotion, motion } from '#lib/motion/motion.svelte.ts';
	import { setPersistent } from '#lib/stores/island.svelte.ts';
	import { loadPrefs } from '#lib/stores/prefs.svelte.ts';
	import { hasUnsaved, unsavedLabels } from '#lib/stores/unsaved.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Island from '#lib/ui/Island.svelte';
	import Modal from '#lib/ui/Modal.svelte';

	let { children } = $props();

	let updateModal = $state(false);
	const onSplash = $derived(page.url.pathname === '/');

	onMount(() => {
		loadPrefs();
		void loadMotion();
		void tick().then(() => requestAnimationFrame(markHydrated));
		const warn = (e: BeforeUnloadEvent) => {
			if (hasUnsaved()) e.preventDefault();
		};
		window.addEventListener('beforeunload', warn);
		return () => window.removeEventListener('beforeunload', warn);
	});

	// Nova versão publicada: avisa na Dynamic Island, sem interromper nada.
	$effect(() => {
		if (!updated.current) return;
		setPersistent('update', {
			icon: 'sparkle',
			tone: 'gold',
			title: 'Nova versão do BRASFC',
			detail: 'Atualize quando quiser',
			action: { label: 'Atualizar', run: requestUpdate }
		});
	});

	function requestUpdate() {
		if (hasUnsaved()) updateModal = true;
		else location.reload();
	}

	// Com versão nova e nada pendente, a próxima navegação recarrega a página
	// inteira (carrega o código novo com segurança). Com algo pendente, espera.
	beforeNavigate(({ willUnload, to }) => {
		if (updated.current && !willUnload && to?.url && !hasUnsaved()) {
			location.href = to.url.href;
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

<Island hidden={onSplash} />

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
		<Button variant="danger" onclick={() => location.reload()}>Atualizar mesmo assim</Button>
	{/snippet}
</Modal>

<style>
	#page {
		min-height: 100vh;
	}
	.pending {
		margin: var(--sp-3) 0;
		padding-left: var(--sp-5);
		color: var(--text);
	}
</style>
