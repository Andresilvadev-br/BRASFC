<script lang="ts">
	import type { Snippet } from 'svelte';
	import { animate } from '#lib/motion/motion.svelte.ts';
	import Icon from './Icon.svelte';

	let {
		open = $bindable(false),
		title,
		description,
		size = 'md',
		children,
		footer
	}: {
		open?: boolean;
		title: string;
		description?: string;
		size?: 'sm' | 'md' | 'lg';
		children?: Snippet;
		footer?: Snippet;
	} = $props();

	let dialog: HTMLDialogElement;
	let card: HTMLDivElement;
	let closing = false;

	$effect(() => {
		if (open && !dialog.open) {
			dialog.showModal();
			void animate(card, { opacity: 1, scale: 1, y: 0 }, { spring: 'capsule', from: { opacity: 0, scale: 0.94, y: 10 } });
		} else if (!open && dialog.open && !closing) {
			void close();
		}
	});

	async function close() {
		if (closing) return;
		closing = true;
		await Promise.race([
			animate(card, { opacity: 0, scale: 0.97, y: 6 }, { spring: 'critical' }),
			new Promise((r) => setTimeout(r, 220))
		]);
		dialog.close();
		closing = false;
		open = false;
	}

	function onCancel(e: Event) {
		e.preventDefault();
		void close();
	}

	function onBackdrop(e: MouseEvent) {
		if (e.target === dialog) void close();
	}
</script>

<dialog bind:this={dialog} class={size} oncancel={onCancel} onclick={onBackdrop} aria-labelledby="modal-title">
	<div class="card" bind:this={card}>
		<header>
			<div>
				<h2 id="modal-title">{title}</h2>
				{#if description}<p class="muted">{description}</p>{/if}
			</div>
			<button class="close" onclick={close} aria-label="Fechar" data-umx-press><Icon name="x" /></button>
		</header>
		{#if children}<div class="content">{@render children()}</div>{/if}
		{#if footer}<footer>{@render footer()}</footer>{/if}
	</div>
</dialog>

<style>
	dialog {
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		max-width: calc(100vw - 32px);
		max-height: calc(var(--app-h, 100vh) - 32px);
		overflow: visible;
	}
	dialog::backdrop {
		background: rgb(6 9 11 / 0.72);
		backdrop-filter: blur(3px);
	}
	.sm {
		width: 420px;
	}
	.md {
		width: 540px;
	}
	.lg {
		width: 760px;
	}
	.card {
		display: flex;
		flex-direction: column;
		max-height: calc(var(--app-h, 100dvh) - 32px);
		background: var(--surface-2);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-2);
		overflow: hidden;
	}
	header {
		flex-shrink: 0;
		display: flex;
		justify-content: space-between;
		gap: var(--sp-4);
		padding: var(--sp-6) var(--sp-6) var(--sp-3);
	}
	h2 {
		font-size: var(--fs-2xl);
		text-transform: uppercase;
	}
	header p {
		margin-top: var(--sp-1);
		font-size: var(--fs-sm);
	}
	.close {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 10px;
		border: 0;
		background: var(--surface-3);
		color: var(--text-2);
		flex: none;
	}
	.close:hover {
		color: var(--text);
	}
	.content {
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: var(--sp-2) var(--sp-6) var(--sp-5);
	}
	footer {
		display: flex;
		flex-shrink: 0;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--sp-3);
		padding: var(--sp-4) var(--sp-6);
		background: var(--surface-sunken);
		border-top: 1px solid var(--line);
	}
</style>
