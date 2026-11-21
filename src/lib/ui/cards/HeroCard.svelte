<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getClub } from '#lib/domain/clubs.ts';

	/**
	 * Hero Card — o destaque principal de uma tela (próxima partida, carreira, convite).
	 * Usa as cores do clube como luz de fundo; o conteúdo vem por snippets.
	 */
	let {
		clubId,
		eyebrow,
		title,
		subtitle,
		children,
		aside,
		actions,
		tone = 'emerald'
	}: {
		clubId?: string;
		eyebrow?: string;
		title: string;
		subtitle?: string;
		children?: Snippet;
		aside?: Snippet;
		actions?: Snippet;
		tone?: 'emerald' | 'gold';
	} = $props();
	const club = $derived(clubId ? getClub(clubId) : undefined);
</script>

<section class="hero {tone}" style:--club={club?.colors.primary ?? 'var(--emerald-deep)'} style:--club-2={club?.colors.secondary ?? 'var(--surface-3)'} data-umx-surface>
	<span class="stripes" aria-hidden="true"></span>
	<div class="main">
		{#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
		<h2 class="display">{title}</h2>
		{#if subtitle}<p class="sub">{subtitle}</p>{/if}
		{#if children}<div class="body">{@render children()}</div>{/if}
		{#if actions}<div class="actions">{@render actions()}</div>{/if}
	</div>
	{#if aside}<div class="aside">{@render aside()}</div>{/if}
</section>

<style>
	.hero {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 18px;
		min-width: 0;
		padding: clamp(18px, 3vw, 30px);
		border-radius: var(--radius-xl);
		border: 1px solid var(--line-strong);
		background:
			radial-gradient(120% 140% at 100% 100%, color-mix(in srgb, var(--club) 46%, transparent), transparent 58%),
			linear-gradient(160deg, #182127, var(--bg-deep));
		box-shadow: var(--shadow-2);
		overflow: hidden;
		isolation: isolate;
	}
	.gold { border-color: rgb(232 184 106 / 0.35); }
	.stripes {
		position: absolute;
		inset: 0;
		z-index: -1;
		background: repeating-linear-gradient(115deg, transparent 0 46px, rgb(255 255 255 / 0.025) 46px 92px);
		mask-image: linear-gradient(90deg, transparent, #000 60%);
		pointer-events: none;
	}
	.eyebrow { color: var(--emerald-strong); }
	.gold .eyebrow { color: var(--gold); }
	h2 { margin-top: 4px; font-size: clamp(2rem, 4.6vw, 3.4rem); overflow-wrap: anywhere; }
	.sub { margin-top: 8px; color: var(--text-2); }
	.body { margin-top: 14px; }
	.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
	.aside { display: grid; place-items: center; min-width: 0; }
	@media (max-width: 560px) {
		.hero { grid-template-columns: minmax(0, 1fr); }
		.aside { justify-self: start; }
	}
</style>
