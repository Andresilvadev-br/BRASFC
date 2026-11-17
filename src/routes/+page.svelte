<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, preloadCode, preloadData } from '$app/navigation';
	import { api } from '#lib/api.ts';
	import { animate, loadMotion, motion } from '#lib/motion/motion.svelte.ts';
	import { markIntroSeen, shouldPlayIntro } from '#lib/stores/prefs.svelte.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import Logo from '#lib/ui/Logo.svelte';

	/**
	 * Abertura: carregamento REAL dos recursos (motor de animação, fontes,
	 * sessão no servidor, código e dados do menu) + apresentação curta e pulável.
	 */
	type Step = { label: string; run: () => Promise<unknown> };

	const steps: Step[] = [
		{ label: 'Preparando o motor de animação', run: () => loadMotion() },
		{
			label: 'Carregando tipografia',
			run: () =>
				Promise.all([
					document.fonts.load('700 32px "Barlow Condensed"'),
					document.fonts.load('800 32px "Barlow Condensed"'),
					document.fonts.load('500 16px "Inter Variable"')
				])
		},
		{ label: 'Conectando ao servidor', run: () => api('/api/session', { method: 'POST' }) },
		{ label: 'Preparando o menu', run: () => Promise.all([preloadCode('/menu'), preloadData('/menu')]) }
	];

	let progress = $state(0);
	let current = $state('Iniciando');
	let failed = $state<string | null>(null);
	let loaded = $state(false);
	let skipping = $state(false);
	let showIntro = $state(false);
	let mounted = $state(false);

	let mark: HTMLDivElement;
	let word: HTMLDivElement;
	let tagline: HTMLParagraphElement;
	let bar: HTMLDivElement | undefined = $state();

	async function load() {
		failed = null;
		progress = 0;
		for (const [i, step] of steps.entries()) {
			current = step.label;
			try {
				await step.run();
			} catch (e) {
				failed = e instanceof Error ? e.message : 'Falha ao carregar.';
				return false;
			}
			progress = (i + 1) / steps.length;
		}
		current = 'Pronto';
		loaded = true;
		return true;
	}

	async function intro() {
		if (motion.reduced) return;
		const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
		await animate(mark, { opacity: 1, scale: 1, rotate: 0 }, { spring: 'expressive', from: { opacity: 0, scale: 0.6, rotate: -8 } });
		void animate(word, { opacity: 1, x: 0 }, { spring: 'page', from: { opacity: 0, x: -24 } });
		await wait(260);
		void animate(tagline, { opacity: 1, y: 0 }, { spring: 'gentle', from: { opacity: 0, y: 10 } });
		await wait(900);
	}

	async function finish() {
		markIntroSeen();
		await goto('/menu', { replaceState: true, invalidateAll: true });
	}

	function skip() {
		if (skipping) return;
		skipping = true;
		if (loaded) void finish();
	}

	onMount(() => {
		showIntro = shouldPlayIntro();
		mounted = true;
		void (async () => {
			const introPromise = showIntro ? loadMotion().then(intro) : Promise.resolve();
			const ok = await load();
			if (!ok) return;
			if (!skipping) await introPromise;
			await finish();
		})();
	});

	function onKey(e: KeyboardEvent) {
		if (['Enter', 'Escape', ' '].includes(e.key)) {
			e.preventDefault();
			skip();
		}
	}

	$effect(() => {
		if (bar) bar.style.transform = `scaleX(${progress})`;
	});
</script>

<svelte:head><title>BRASFC</title></svelte:head>
<svelte:window onkeydown={onKey} />

<main class="splash" onclick={skip} role="presentation">
	<div class="glow" aria-hidden="true"></div>
	<div class="brand" class:static={mounted && (!showIntro || motion.reduced)}>
		<div class="mark" bind:this={mark}><Logo size={120} wordmark={false} /></div>
		<div class="word" bind:this={word}>BRAS<span>FC</span></div>
		<p class="tagline" bind:this={tagline}>Seu clube. Sua carreira. Seu futebol.</p>
	</div>

	<div class="loader" aria-live="polite">
		{#if failed}
			<div class="error" role="alert">
				<Icon name="alert" />
				<span>{failed}</span>
				<button onclick={(e) => { e.stopPropagation(); void load().then((ok) => { if (ok) void finish(); }); }}>Tentar de novo</button>
			</div>
		{:else}
			<div class="track"><div class="fill" bind:this={bar}></div></div>
			<span class="status">{current}{#if !loaded}…{/if}</span>
		{/if}
	</div>

	{#if showIntro && !failed}
		<button class="skip" onclick={(e) => { e.stopPropagation(); skip(); }}>
			{skipping && !loaded ? 'Carregando…' : 'Pular'} <kbd>Enter</kbd>
		</button>
	{/if}
</main>

<style>
	.splash {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		background: radial-gradient(70% 60% at 50% 45%, #0f1a17 0%, var(--bg-deep) 70%);
		overflow: hidden;
		cursor: default;
	}
	.glow {
		position: absolute;
		width: 720px;
		height: 720px;
		border-radius: 50%;
		background: radial-gradient(circle, rgb(16 185 129 / 0.16), transparent 62%);
		filter: blur(10px);
	}
	.brand {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-4);
	}
	.brand:not(.static) > * {
		opacity: 0;
	}
	.word {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: calc(4.5rem * var(--text-scale));
		letter-spacing: 0.08em;
		line-height: 1;
	}
	.word span {
		color: var(--emerald-strong);
	}
	.tagline {
		font-size: var(--fs-lg);
		color: var(--text-2);
		letter-spacing: 0.02em;
	}
	.loader {
		position: absolute;
		bottom: 12vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-3);
		width: min(360px, 80vw);
	}
	.track {
		width: 100%;
		height: 3px;
		border-radius: 3px;
		background: var(--surface-2);
		overflow: hidden;
	}
	.fill {
		height: 100%;
		background: linear-gradient(90deg, var(--emerald-deep), var(--emerald-strong));
		transform: scaleX(0);
		transform-origin: 0 50%;
		transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	.status {
		font-size: var(--fs-sm);
		color: var(--text-3);
	}
	.error {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-m);
		background: var(--danger-soft);
		color: #fecaca;
		font-size: var(--fs-sm);
	}
	.error button {
		border: 0;
		border-radius: var(--radius-s);
		padding: 6px 12px;
		background: var(--surface-3);
		font-weight: 600;
	}
	.skip {
		position: absolute;
		right: var(--sp-7);
		bottom: var(--sp-7);
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		padding: 8px 14px;
		border-radius: var(--radius-pill);
		border: 1px solid var(--line-strong);
		background: rgb(16 20 24 / 0.6);
		color: var(--text-2);
		font-size: var(--fs-sm);
		font-weight: 600;
	}
	.skip:hover {
		color: var(--text);
	}
	kbd {
		font-family: var(--font-ui);
		font-size: 11px;
		padding: 2px 6px;
		border-radius: 5px;
		background: var(--surface-3);
		color: var(--text-2);
	}
</style>
