<script lang="ts">
	import type { Appearance } from '#lib/domain/appearance.ts';
	import { bodyGrid, bustGrid, palette, toRuns, type Kit } from '#lib/pixel/sprites.ts';

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
		ball = true
	}: { appearance: Appearance; kit: Kit; variant?: 'bust' | 'full'; size?: number; label?: string; idle?: boolean; ball?: boolean } = $props();

	const grid = $derived(variant === 'full' ? bodyGrid(appearance.hairStyle, { ball, details: appearance }) : bustGrid(appearance.hairStyle, appearance));
	const runs = $derived(toRuns(grid, palette(appearance, kit)));
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
	@keyframes bob {
		from {
			transform: translateY(0);
		}
		to {
			transform: translateY(-1.5%);
		}
	}
</style>
