<script lang="ts">
	import { onMount } from 'svelte';
	import { getClub } from '#lib/domain/clubs.ts';
	import { animate, motion } from '#lib/motion/motion.svelte.ts';
	import Crest from '../Crest.svelte';

	/**
	 * Entrada em campo: transição cinematográfica curta (≈1,3 s) entre a prévia e a partida.
	 * Pode ser pulada (clique/tecla); com movimento reduzido, termina imediatamente.
	 */
	let { home, away, label, ondone }: { home: string; away: string; label: string; ondone: () => void } = $props();
	let root = $state<HTMLElement | null>(null);
	let left = $state<HTMLElement | null>(null);
	let right = $state<HTMLElement | null>(null);
	let title = $state<HTMLElement | null>(null);
	let done = false;
	function finish() {
		if (done) return;
		done = true;
		ondone();
	}
	onMount(() => {
		if (motion.reduced) return finish();
		void animate(root, { opacity: 1 }, { spring: 'critical', from: { opacity: 0 } });
		void animate(left, { x: 0, opacity: 1, scale: 1 }, { spring: 'expressive', from: { x: -160, opacity: 0, scale: 0.8 } });
		void animate(right, { x: 0, opacity: 1, scale: 1 }, { spring: 'expressive', delay: 80, from: { x: 160, opacity: 0, scale: 0.8 } });
		void animate(title, { y: 0, opacity: 1 }, { spring: 'gentle', delay: 220, from: { y: 16, opacity: 0 } });
		const t = setTimeout(finish, 1350);
		return () => clearTimeout(t);
	});
</script>

<svelte:window onkeydown={finish} />
<div class="walk" bind:this={root} role="button" tabindex="0" aria-label="Entrada em campo — pular" onclick={finish} onkeydown={finish}>
	<div class="lights"></div>
	<div class="duel">
		<div bind:this={left} class="c"><Crest clubId={home} size={150} /><strong>{getClub(home)?.name}</strong></div>
		<span class="x display">×</span>
		<div bind:this={right} class="c"><Crest clubId={away} size={150} /><strong>{getClub(away)?.name}</strong></div>
	</div>
	<p bind:this={title} class="t">{label}</p>
	<small>Clique para pular</small>
</div>

<style>
	.walk {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: var(--sp-5);
		background: radial-gradient(60% 50% at 50% 45%, rgb(16 185 129 / 0.18), #05080a 75%);
		cursor: pointer;
		overflow: hidden;
	}
	.lights {
		position: absolute;
		inset: -20% -10% auto;
		height: 70%;
		background:
			conic-gradient(from 160deg at 15% 0%, transparent 0 40deg, rgb(255 255 255 / 0.08) 50deg, transparent 60deg),
			conic-gradient(from 160deg at 85% 0%, transparent 0 40deg, rgb(255 255 255 / 0.08) 50deg, transparent 60deg);
		pointer-events: none;
	}
	.duel {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: clamp(24px, 6vw, 96px);
	}
	.c {
		display: grid;
		justify-items: center;
		gap: 12px;
		filter: drop-shadow(0 18px 40px rgb(0 0 0 / 0.6));
	}
	.c strong {
		font-family: var(--font-display);
		font-size: clamp(1.4rem, 3vw, 2.4rem);
		text-transform: uppercase;
	}
	.x {
		font-size: clamp(3rem, 7vw, 6rem);
		color: var(--text-3);
	}
	.t {
		margin: 0;
		font-size: var(--fs-sm);
		letter-spacing: 0.24em;
		text-transform: uppercase;
		color: var(--gold);
		font-weight: 700;
	}
	small {
		position: absolute;
		bottom: 24px;
		color: var(--text-3);
	}
</style>
