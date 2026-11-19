<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, preloadCode, preloadData } from '$app/navigation';
	import { api } from '#lib/api.ts';
	import { loadMotion, motion } from '#lib/motion/motion.svelte.ts';
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

	let bar: HTMLDivElement | undefined = $state();
	let finished = false;
	let releaseIntro: (() => void) | undefined;
	let introTimer: ReturnType<typeof setTimeout> | undefined;

	async function load() {
		failed = null;
		progress = 0;
		let complete = 0;
		const count = async (step: Step) => {
			await step.run();
			progress = ++complete / steps.length;
		};
		try {
			current = 'Preparando o BRASFC';
			await Promise.all([
				count(steps[0]), count(steps[1]),
				count(steps[2]).then(() => count(steps[3]))
			]);
			current = 'Pronto';
			loaded = true;
			return true;
		} catch (e) {
			failed = e instanceof Error ? e.message : 'Falha ao carregar.';
			return false;
		}
	}

	async function finish() {
		if (finished) return;
		finished = true;
		markIntroSeen();
		await goto(new URLSearchParams(location.search).has('rever') ? '/configuracoes' : '/menu', { replaceState: true });
	}

	function skip() {
		if (skipping) return;
		skipping = true;
		releaseIntro?.();
		if (loaded) void finish();
	}

	onMount(() => {
		showIntro = !motion.reduced && !matchMedia('(prefers-reduced-motion: reduce)').matches && (new URLSearchParams(location.search).has('rever') || shouldPlayIntro());
		mounted = true;
		void (async () => {
			const introPromise = showIntro ? new Promise<void>((resolve) => {
				releaseIntro = resolve;
				introTimer = setTimeout(resolve, 4700);
			}) : Promise.resolve();
			const ok = await load();
			if (!ok) return;
			if (!skipping) await introPromise;
			await finish();
		})();
		return () => { clearTimeout(introTimer); releaseIntro?.(); };
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
	{#if showIntro && !skipping}
	<div class="stadium" aria-hidden="true">
		<div class="flood left"></div><div class="flood right"></div>
		<div class="turf"></div><div class="trail"></div>
		<svg class="ball" viewBox="0 0 120 120" aria-hidden="true">
			<defs><radialGradient id="ball-light" cx="31%" cy="24%" r="68%"><stop stop-color="#fff9e7"/><stop offset=".57" stop-color="#b8cabf"/><stop offset="1" stop-color="#1a2f27"/></radialGradient>
			<clipPath id="ball-edge"><circle cx="60" cy="60" r="56"/></clipPath></defs>
			<circle cx="60" cy="60" r="56" fill="url(#ball-light)"/>
			<g clip-path="url(#ball-edge)" stroke="#243934" stroke-width="2" stroke-linejoin="round">
				<path fill="#0c1714" d="M60 32 83 47 75 74 47 76 37 50Z M10 27 32 14 34 32 19 51 2 46Z M94 15 111 30 119 54 98 53 89 32Z M27 96 46 91 60 116 33 119Z M83 88 104 79 116 90 96 112 77 110Z"/>
				<path fill="none" d="M60 32 58 4 M83 47 98 53 M75 74 83 88 M47 76 46 91 M37 50 19 51 M19 51 12 69 27 96 M98 53 104 79 M60 116 77 110 M34 32 60 32 89 32"/>
			</g>
		</svg>
		<div class="converge"></div>
	</div>
	{/if}
	<div class="brand" class:cinematic={mounted && showIntro && !skipping}>
		<div class="mark"><Logo size={120} wordmark={false} /></div>
		<div class="word">BRAS<span>FC</span></div>
		<p class="tagline">Seu clube. Sua carreira. Seu futebol.</p>
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
	.stadium { position: absolute; inset: 0; overflow: hidden; pointer-events: none; perspective: 650px; }
	.flood { position: absolute; width: 68vw; height: 80vh; top: -18vh; background: radial-gradient(ellipse at 12% 10%, #ffedd3 0, #ded7aa4a 8%, #10b98118 26%, transparent 62%); transform-origin: top left; animation: lights 4.6s both; }
	.left { left: 4vw; rotate: 24deg; }
	.right { right: 4vw; transform: scaleX(-1); rotate: -24deg; transform-origin: top center; }
	.turf { position: absolute; inset: 55% -24% -50%; transform: rotateX(62deg); background: repeating-linear-gradient(90deg, #0c2b22 0 12%, #143a30 12% 24%); mask-image: radial-gradient(ellipse, #000, transparent 65%); animation: lights 4.6s both; }
	.ball { position: absolute; width: clamp(100px, 20vw, 220px); left: 50%; top: 46%; transform-origin: center; filter: drop-shadow(0 16px 18px #000b); animation: flight 4.6s cubic-bezier(.32,.02,.25,1) both; }
	.trail, .converge { position: absolute; left: 50%; top: 45%; translate: -50% -50%; width: min(75vw, 650px); aspect-ratio: 1; border: 1px solid #57ffd2; border-radius: 45%; box-shadow: 0 0 18px #10b981; animation: converge 4.6s both; }
	.trail { border-radius: 15%; animation-delay: 80ms; }
	.cinematic { animation: signature 4.7s cubic-bezier(.16,.8,.21,1) both; }
	.cinematic .word { animation: typography 4.7s both; }
	@keyframes lights { 0% { opacity: 0; } 23%,58% { opacity: .8; } 100% { opacity: .16; } }
	@keyframes flight {
		0% { opacity: 0; transform: translate(-75%,-35%) scale(.4) rotate(-40deg); }
		27% { opacity: 1; transform: translate(-50%,-45%) scale(.96) rotate(0deg); }
		52% { transform: translate(-15%,-65%) scale(1.25) rotate(130deg); }
		68% { opacity: 1; transform: translate(-50%,-50%) scale(.45) rotate(285deg); }
		76%,100% { opacity: 0; transform: translate(-50%,-50%) scale(.02) rotate(340deg); }
	}
	@keyframes converge { 0%,37%,100% { opacity: 0; } 49% { opacity: .8; transform: scale(1.4) rotate(22deg); } 73% { transform: scale(.16) rotate(135deg); opacity: .8; } 82% { opacity: 0; } }
	@keyframes signature { 0%,64% { opacity: 0; transform: scale(.72); } 84%,100% { opacity: 1; transform: scale(1); } }
	@keyframes typography { 0%,72% { opacity: 0; translate: 0 12px; letter-spacing: .2em; } 96%,100% { opacity: 1; translate: 0 0; letter-spacing: .08em; } }
	@media (prefers-reduced-motion: reduce) { .splash * { animation: none !important; } }
	.word {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: min(calc(4.5rem * var(--text-scale)), 16vw);
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
