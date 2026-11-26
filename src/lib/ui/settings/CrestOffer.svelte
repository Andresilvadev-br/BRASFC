<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { LOCAL_CRESTS, type ReadLocalCrests } from '#lib/crests/context.ts';
	import Button from '../Button.svelte';
	import Modal from '../Modal.svelte';
	import CrestImporter from './CrestImporter.svelte';

	/**
	 * Oferta única: se nenhum escudo foi instalado ainda, o jogo pergunta uma vez se o jogador quer baixar
	 * os escudos do Brasfoot Next. "Depois" não pergunta de novo; o botão continua em Configurações › Escudos.
	 */
	const KEY = 'brasfc.crests-offer';
	const readLocalCrests = getContext<ReadLocalCrests | undefined>(LOCAL_CRESTS);
	let open = $state(false);
	let installing = $state(false);

	onMount(() => {
		let seen = 'seen';
		try { seen = localStorage.getItem(KEY) ?? ''; } catch { /* armazenamento indisponível: não incomoda */ }
		if (seen || Object.keys(readLocalCrests?.() ?? {}).length) return;
		const timer = setTimeout(() => (open = true), 900);
		return () => clearTimeout(timer);
	});

	function remember() {
		try { localStorage.setItem(KEY, new Date().toISOString()); } catch { /* sem armazenamento: só fecha */ }
	}
	function later() {
		remember();
		open = false;
	}
</script>

<Modal bind:open title="Escudos dos clubes" description="Quer instalar os escudos dos clubes? O jogo baixa o banco oficial do Brasfoot Next (cerca de 17 MB), padroniza e instala tudo sozinho. Depois disso, continua 100% offline." size="md">
	<CrestImporter compact onstart={() => { installing = true; remember(); }} ondone={() => setTimeout(() => (open = false), 1200)} />
	<p class="muted small note">Cobertura atual do Brasfoot Next: cerca de 90% dos clubes estrangeiros e os 39 maiores do Brasil. Os demais seguem com o escudo gerado pelas cores. Você também encontra esta opção em Configurações › Escudos.</p>
	{#snippet footer()}
		<Button variant="ghost" onclick={later} disabled={installing && open}>{installing ? 'Instalando…' : 'Depois'}</Button>
	{/snippet}
</Modal>

<style>
	.note { margin: var(--sp-3) 0 0; }
</style>
