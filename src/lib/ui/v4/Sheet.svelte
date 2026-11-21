<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { animate } from '#lib/motion/motion.svelte.ts';
	import { portal } from '#lib/motion/actions.ts';
	import Icon from '../Icon.svelte';
	/** Painel lateral com mola: abre detalhes sem perder o contexto da tela (Esc fecha). */
	let { open = $bindable(false), title, subtitle = '', children, footer, width = 460 }: { open?: boolean; title: string; subtitle?: string; children: Snippet; footer?: Snippet; width?: number } = $props();
	let panel = $state<HTMLElement | null>(null);
	let shown = $state(false);
	let opener: HTMLElement | null = null;
	let generation = 0;
	$effect(() => {
		const ticket = ++generation;
		if (open) {
			const focused = document.activeElement;
			if (focused instanceof HTMLElement && !untrack(() => panel?.contains(focused))) opener = focused;
			shown = true;
			const frame = requestAnimationFrame(() => {
				if (ticket !== generation) return;
				const bottom = matchMedia('(max-width: 640px)').matches;
				void animate(panel, { x: 0, y: 0, opacity: 1 }, { spring: 'capsule', from: bottom ? { y: 80, opacity: 0 } : { x: 60, opacity: 0 } });
				panel?.focus();
			});
			return () => cancelAnimationFrame(frame);
		}
		if (untrack(() => shown)) {
			const closing = untrack(() => panel);
			const front = closing?.contains(document.activeElement);
			void animate(closing, matchMedia('(max-width: 640px)').matches ? { y: 60, opacity: 0 } : { x: 40, opacity: 0 }, { spring: 'critical' }).then(() => {
				if (ticket !== generation) return;
				shown = false;
				if (front && (closing?.contains(document.activeElement) || document.activeElement === document.body)) opener?.focus();
			});
		}
	});
	function key(e: KeyboardEvent) {
		if (e.key === 'Escape') { e.stopPropagation(); open = false; }
		if (e.key !== 'Tab' || !panel || !open) return;
		const targets = [...panel.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, summary, [tabindex="0"]')]
			.filter((element) => !element.matches(':disabled') && element.getClientRects().length);
		const first = targets[0], last = targets.at(-1);
		if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
			e.preventDefault();
			last?.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first?.focus();
		}
	}
</script>

{#if shown}
	<div class="layer" use:portal>
	<div class="scrim" class:on={open} role="presentation" onclick={() => (open = false)}></div>
	<div class="sheet glass" bind:this={panel} style="--w:{width}px" inert={!open} role="dialog" aria-modal="true" aria-label={title} tabindex="-1" onkeydown={key}>
		<header>
			<div>
				<h2 class="display">{title}</h2>
				{#if subtitle}<p class="muted">{subtitle}</p>{/if}
			</div>
			<button class="close" onclick={() => (open = false)} aria-label="Fechar" data-umx-press><Icon name="x" /></button>
		</header>
		<div class="body">{@render children()}</div>
		{#if footer}<footer>{@render footer()}</footer>{/if}
	</div>
	</div>
{/if}

<style>
	.layer { display: contents; }
	.scrim {
		position: fixed;
		inset: 0;
		background: rgb(5 8 10 / 0.5);
		backdrop-filter: blur(3px);
		z-index: 60;
		opacity: 0;
		transition: opacity 0.25s;
	}
	@media (prefers-reduced-motion: reduce) { .scrim { transition: none; } }
	.scrim.on {
		opacity: 1;
	}
	.sheet {
		position: fixed;
		top: 12px;
		right: 12px;
		bottom: 12px;
		width: min(var(--w), calc(100vw - 24px));
		z-index: 61;
		display: flex;
		flex-direction: column;
		background: var(--glass-hi);
		box-shadow: var(--shadow-2);
		outline: none;
	}
	/* Celular: painel inferior que respeita a viewport dinâmica e as áreas seguras. */
	@media (max-width: 640px) {
		.sheet {
			top: auto;
			left: 0;
			right: 0;
			bottom: 0;
			width: 100%;
			max-height: min(92dvh, calc(var(--app-h, 100dvh) - env(safe-area-inset-top, 0px) - 12px));
			border-radius: var(--radius-xl) var(--radius-xl) 0 0;
		}
		.sheet::after {
			content: '';
			position: absolute;
			top: 7px;
			left: 50%;
			width: 40px;
			height: 4px;
			margin-left: -20px;
			border-radius: 4px;
			background: var(--line-strong);
		}
		.sheet header { padding-top: var(--sp-6); }
		footer > :global(*) { flex: 1 1 auto; }
	}
	header {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-3);
		padding: var(--sp-5) var(--sp-5) var(--sp-3);
	}
	h2 {
		margin: 0;
		font-size: var(--fs-2xl);
	}
	.close {
		background: rgb(231 237 240 / 0.06);
		border: 0;
		color: var(--text);
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		cursor: pointer;
		flex: none;
	}
	.body {
		flex: 1;
		min-height: 0;
		overflow: auto;
		overscroll-behavior: contain;
		padding: 0 var(--sp-5) var(--sp-5);
	}
	footer {
		padding: var(--sp-4) var(--sp-5) calc(var(--sp-4) + env(safe-area-inset-bottom, 0px));
		border-top: 1px solid var(--line);
		display: flex;
		gap: var(--sp-2);
		justify-content: flex-end;
		flex-wrap: wrap;
	}
</style>
