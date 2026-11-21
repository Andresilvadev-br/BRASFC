<script lang="ts">
	import type { Snippet } from 'svelte';
	import { reposition } from './reposition.ts';
	let { children, move, touchOnly = false }: { children: Snippet; move?: (from: string, to: string) => void; touchOnly?: boolean } = $props();
</script>

<div class="pitch" use:reposition={{ move, touchOnly }} role="group" aria-label="Campo com titulares">
	<svg class="lines" viewBox="0 0 68 105" preserveAspectRatio="none" aria-hidden="true">
		<rect x="1" y="1" width="66" height="103" />
		<line x1="1" y1="52.5" x2="67" y2="52.5" />
		<circle cx="34" cy="52.5" r="9.15" />
		<rect x="13.85" y="1" width="40.3" height="16.5" />
		<rect x="13.85" y="87.5" width="40.3" height="16.5" />
		<rect x="24.85" y="1" width="18.3" height="5.5" />
		<rect x="24.85" y="98.5" width="18.3" height="5.5" />
	</svg>
		{@render children()}
</div>

<style>
	.pitch {
		position: relative;
		container-type: inline-size;
		/* proporção do campo sempre preservada; a altura cabe na tela */
		/* cabe na altura da tela, mas nunca menor que 470px (acompanha a coluna de reservas e estilo) */
		width: min(100%, 560px);
		aspect-ratio: 68 / 74;
		border-radius: var(--radius-l);
		background: repeating-linear-gradient(180deg, #123e2d 0 9%, #10372a 9% 18%);
		overflow: hidden;
		box-shadow: inset 0 0 60px rgb(0 0 0 / 0.45);
	}
	.pitch :global([data-reposition]) { touch-action: none; cursor: grab; }
	.pitch:global([data-dragging-position]) :global([data-reposition]) { cursor: grabbing; }
	.lines {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		fill: none;
		stroke: rgb(231 237 240 / 0.28);
		stroke-width: 0.35;
	}
	@media (max-width: 650px) { .pitch { aspect-ratio: 68 / 88; } }
</style>
