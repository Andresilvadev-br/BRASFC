<script lang="ts">
	import { onMount } from 'svelte';
	import type { Appearance } from '#lib/domain/appearance.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { animate, celebrate, motion } from '#lib/motion/motion.svelte.ts';
	import type { Kit } from '#lib/pixel/sprites.ts';
	import Crest from './Crest.svelte';
	import Pixel from './Pixel.svelte';

	/**
	 * Apresentação cinematográfica de um momento importante (ex.: chegada ao clube).
	 * Curta (~2,8 s), sempre pulável por clique, Enter, Espaço ou Esc.
	 */
	let {
		clubId,
		eyebrow,
		title,
		subtitle,
		appearance,
		kit,
		ball = true,
		ondone
	}: {
		clubId: string;
		eyebrow: string;
		title: string;
		subtitle: string;
		appearance: Appearance;
		kit: Kit;
		ball?: boolean;
		ondone: () => void;
	} = $props();

	const club = $derived(getClub(clubId));
	let root: HTMLDivElement;
	let sweep: HTMLDivElement;
	let crest: HTMLDivElement;
	let figure: HTMLDivElement;
	let text: HTMLDivElement;
	let finished = false;

	function done() {
		if (finished) return;
		finished = true;
		ondone();
	}

	onMount(() => {
		root.focus();
		if (motion.reduced) {
			const t = setTimeout(done, 1800);
			return () => clearTimeout(t);
		}
		const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
		let cancelled = false;
		void (async () => {
			void animate(sweep, { x: 0, opacity: 1 }, { spring: 'page', from: { x: -window.innerWidth, opacity: 1 } });
			await wait(180);
			if (cancelled) return;
			await animate(crest, { scale: 1, opacity: 1, rotate: 0 }, { spring: 'expressive', from: { scale: 0.4, opacity: 0, rotate: -12 } });
			if (cancelled) return;
			const r = crest.getBoundingClientRect();
			celebrate(r.left + r.width / 2, r.top + r.height / 2);
			void animate(figure, { x: 0, opacity: 1 }, { spring: 'page', from: { x: 80, opacity: 0 } });
			void animate(text, { y: 0, opacity: 1 }, { spring: 'gentle', from: { y: 24, opacity: 0 } });
			await wait(2000);
			if (!cancelled) done();
		})();
		return () => (cancelled = true);
	});

	function onKey(e: KeyboardEvent) {
		if (['Enter', ' ', 'Escape'].includes(e.key)) {
			e.preventDefault();
			done();
		}
	}
</script>

<div
	class="presentation"
	bind:this={root}
	role="dialog"
	aria-modal="true"
	aria-label={title}
	tabindex="-1"
	onclick={done}
	onkeydown={onKey}
	style="--c1:{club?.colors.primary ?? '#10B981'}; --c2:{club?.colors.secondary ?? '#E7EDF0'}"
>
	<div class="sweep" bind:this={sweep}></div>
	<div class="stripes" aria-hidden="true"></div>
	<div class="content">
		<div class="crest" bind:this={crest}><Crest {clubId} size={168} /></div>
		<div class="text" bind:this={text}>
			<span class="eyebrow">{eyebrow}</span>
			<h1>{title}</h1>
			<p>{subtitle}</p>
		</div>
	</div>
	<div class="figure" bind:this={figure} aria-hidden="true">
		<Pixel variant="full" {appearance} {kit} size={440} {ball} />
	</div>
	<span class="skip">Clique ou Enter para continuar</span>
</div>

<style>
	.presentation {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: center;
		padding: 0 8vw;
		background: var(--bg-deep);
		overflow: hidden;
		outline: none;
		cursor: pointer;
	}
	.sweep {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(80% 90% at 75% 60%, color-mix(in srgb, var(--c1) 55%, transparent), transparent 70%),
			linear-gradient(115deg, #070a0d 30%, color-mix(in srgb, var(--c1) 40%, #070a0d) 100%);
	}
	.stripes {
		position: absolute;
		inset: -20%;
		background: repeating-linear-gradient(115deg, transparent 0 80px, rgb(255 255 255 / 0.025) 80px 160px);
	}
	.content {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--sp-7);
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		max-width: 620px;
	}
	.eyebrow {
		font-family: var(--font-display);
		font-weight: 700;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--gold);
	}
	h1 {
		font-size: calc(clamp(2.75rem, 5vw, 4.5rem) * var(--text-scale));
		font-weight: 800;
		text-transform: uppercase;
		line-height: 0.95;
		text-shadow: 0 6px 30px rgb(0 0 0 / 0.5);
	}
	p {
		font-size: var(--fs-xl);
		color: var(--text-2);
	}
	.figure {
		position: relative;
		align-self: end;
		filter: drop-shadow(0 30px 40px rgb(0 0 0 / 0.6));
	}
	.figure :global(svg) {
		height: min(62vh, 440px);
		width: auto;
	}
	.skip {
		position: absolute;
		bottom: var(--sp-6);
		left: 50%;
		translate: -50% 0;
		font-size: var(--fs-sm);
		color: var(--text-3);
	}
	@media (max-width: 900px) {
		.presentation {
			grid-template-columns: 1fr;
		}
		.figure {
			display: none;
		}
		.content {
			flex-direction: column;
			text-align: center;
		}
	}
</style>
