<script lang="ts">
	import type { Appearance } from '#lib/domain/appearance.ts';
	import { bodyGrid, bustGrid, palette, toRuns, wardrobeKit, type Kit } from '#lib/pixel/sprites.ts';
	import { clubKit } from '#lib/pixel/kits.ts';
	import Crest from './Crest.svelte';

	/**
	 * Personagem em pixel art (SVG nítido, escalável, sem imagens externas).
	 * variant "bust" para listas e cartões; "full" para apresentações.
	 */
	let {
		appearance,
		kit,
		variant = 'bust',
		size = 48,
		label,
		idle = false,
		ball = true,
		styled = false,
		clubId
	}: { appearance: Appearance; kit: Kit; variant?: 'bust' | 'full'; size?: number; label?: string; idle?: boolean; ball?: boolean; styled?: boolean; clubId?: string } = $props();

	const outfit = $derived(styled ? appearance.wardrobe : undefined);
	const crest = $derived(clubId && (outfit?.category === 'clube' || outfit?.top === 'uniforme') ? clubId : undefined);
	const grid = $derived(variant === 'full' ? bodyGrid(appearance.hairStyle, { ball: ball && (!outfit || outfit.category === 'esportivo'), details: appearance, outfit })
		: bustGrid(appearance.hairStyle, appearance));
	const runs = $derived(toRuns(grid, palette(appearance, outfit ? wardrobeKit(outfit, crest ? clubKit(crest) : kit) : kit, outfit)));
	const w = $derived(grid[0].length);
	const h = $derived(grid.length);
</script>

<svg
	class="pixel"
	class:idle
	viewBox="0 0 {w} {h}"
	width={(size * w) / h}
	height={size}
	shape-rendering="crispEdges"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	{#each runs as r, i (i)}
		<rect x={r.x} y={r.y} width={r.w} height="1" fill={r.color} />
	{/each}
	{#if crest && variant === 'full'}
		<g transform="translate(17, 17)" aria-hidden="true"><Crest clubId={crest} size={3.6} /></g>
	{/if}
</svg>

<style>
	.pixel {
		flex: none;
		image-rendering: pixelated;
	}
	.idle {
		animation: bob 1.1s steps(2, jump-none) infinite alternate;
		transform-origin: 50% 100%;
	}
	@media (prefers-reduced-motion: reduce) { .idle { animation: none; } }
	@keyframes bob {
		from {
			transform: translateY(0);
		}
		to {
			transform: translateY(-1.5%);
		}
	}
</style>
