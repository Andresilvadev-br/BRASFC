<script lang="ts">
	import { tick } from 'svelte';
	import type { CapsuleMorph } from 'ultra-motion-x';
	import { animate, loadMotion, motion } from '#lib/motion/motion.svelte.ts';
	import { currentActivity, dismissTransient, island } from '#lib/stores/island.svelte.ts';
	import Icon from './Icon.svelte';

	/**
	 * Dynamic Island contextual. A forma (largura/altura/raio) é uma CapsuleMorph
	 * da Ultra Motion X: molas independentes que preservam velocidade, então
	 * trocas rápidas de atividade nunca "saltam".
	 */
	let { hidden = false }: { hidden?: boolean } = $props();

	let shape: HTMLDivElement;
	let content: HTMLDivElement | undefined = $state();
	let capsule: CapsuleMorph | null = null;

	const activity = $derived(currentActivity());
	const key = $derived(activity?.id ?? `idle:${island.context}`);

	async function resize() {
		await tick();
		if (!content || !shape) return;
		const w = Math.ceil(content.offsetWidth) + 28;
		const h = activity?.detail || activity?.action ? 52 : 40;
		if (capsule && !motion.reduced) {
			void capsule.morphTo({ width: w, height: h, radius: h / 2 });
		} else {
			shape.style.width = `${w}px`;
			shape.style.height = `${h}px`;
			shape.style.borderRadius = `${h / 2}px`;
		}
		void animate(content, { opacity: 1, scale: 1 }, { spring: 'capsule', from: { opacity: 0, scale: 0.94 } });
	}

	$effect(() => {
		void key;
		void resize();
	});

	$effect(() => {
		void loadMotion().then((umx) => {
			if (!umx || !shape || capsule) return;
			capsule = umx.capsule(shape, { width: shape.offsetWidth || 160, height: shape.offsetHeight || 40, radius: 20 });
			void resize();
		});
		return () => capsule?.destroy();
	});

	const toneClass = $derived(activity?.tone ?? 'neutral');
</script>

<div class="wrap" class:hidden aria-hidden={hidden}>
	<div class="island {toneClass}" bind:this={shape} role="status" aria-live="polite">
		{#key key}
			<div class="content" bind:this={content}>
				{#if activity}
					<span class="ico"><Icon name={activity.icon} size={18} stroke={2} /></span>
					<span class="txt">
						<strong>{activity.title}</strong>
						{#if activity.detail}<small>{activity.detail}</small>{/if}
					</span>
					{#if activity.action}
						<button class="act" onclick={activity.action.run} data-umx-press>{activity.action.label}</button>
					{:else if island.transient}
						<button class="x" onclick={dismissTransient} aria-label="Dispensar aviso"><Icon name="x" size={14} /></button>
					{/if}
				{:else}
					<span class="mark" aria-hidden="true"></span>
					<span class="ctx">{island.context || 'BRASFC'}</span>
				{/if}
			</div>
		{/key}
	</div>
</div>

<style>
	.wrap {
		position: fixed;
		top: 12px;
		left: 50%;
		translate: -50% 0;
		z-index: 60;
		pointer-events: none;
		transition: opacity 0.25s;
	}
	.hidden {
		opacity: 0;
		visibility: hidden;
	}
	.island {
		position: relative;
		width: 160px;
		height: 40px;
		border-radius: 20px;
		background: #06090b;
		border: 1px solid rgb(231 237 240 / 0.1);
		box-shadow:
			0 10px 30px rgb(0 0 0 / 0.45),
			inset 0 1px 0 rgb(255 255 255 / 0.05);
		overflow: hidden;
		pointer-events: auto;
	}
	.content {
		position: absolute;
		left: 50%;
		top: 50%;
		translate: -50% -50%;
		display: flex;
		align-items: center;
		gap: 10px;
		white-space: nowrap;
	}
	.ico {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--surface-3);
		color: var(--text);
	}
	.success .ico {
		background: var(--emerald-soft);
		color: var(--emerald-strong);
	}
	.info .ico {
		background: var(--info-soft);
		color: var(--info);
	}
	.warning .ico {
		background: var(--warning-soft);
		color: var(--warning);
	}
	.error .ico {
		background: var(--danger-soft);
		color: var(--danger);
	}
	.gold .ico {
		background: var(--gold-soft);
		color: var(--gold);
	}
	.txt {
		display: flex;
		flex-direction: column;
		line-height: 1.2;
	}
	strong {
		font-size: var(--fs-sm);
		font-weight: 600;
	}
	small {
		font-size: 12px;
		color: var(--text-2);
	}
	.act {
		height: 30px;
		padding: 0 12px;
		border: 0;
		border-radius: 15px;
		background: var(--emerald);
		color: #04140e;
		font-size: var(--fs-xs);
		font-weight: 700;
	}
	.x {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--text-3);
	}
	.x:hover {
		color: var(--text);
		background: var(--surface-3);
	}
	.mark {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--emerald);
		box-shadow: 0 0 0 3px var(--emerald-soft);
	}
	.ctx {
		font-size: var(--fs-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		color: var(--text-2);
	}
</style>
