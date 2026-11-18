<script lang="ts">
	/** Troféu 2D com metal dourado e brilho que acompanha o cursor (sem marca de competição real). */
	let { kind = 'taca', size = 96, muted = false, label = '' }: { kind?: 'taca' | 'copa' | 'medalha' | 'estrela'; size?: number; muted?: boolean; label?: string } = $props();
	const id = `t${Math.random().toString(36).slice(2, 8)}`;
</script>

<svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={label || 'Troféu'} class:muted data-umx-magnet="0.25">
	<defs>
		<linearGradient id="{id}g" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#fff1cf" />
			<stop offset="0.35" stop-color="#e8b86a" />
			<stop offset="0.7" stop-color="#a87a33" />
			<stop offset="1" stop-color="#f3d79a" />
		</linearGradient>
		<radialGradient id="{id}s" cx="0.3" cy="0.25" r="0.6"><stop offset="0" stop-color="#fff" stop-opacity="0.55" /><stop offset="1" stop-color="#fff" stop-opacity="0" /></radialGradient>
	</defs>
	{#if kind === 'taca'}
		<path d="M30 14h40v18c0 14-9 25-20 25S30 46 30 32Z" fill="url(#{id}g)" />
		<path d="M30 20H18c0 12 6 19 14 20M70 20h12c0 12-6 19-14 20" fill="none" stroke="url(#{id}g)" stroke-width="5" />
		<rect x="45" y="56" width="10" height="16" fill="url(#{id}g)" />
		<path d="M32 86h36l-5-14H37Z" fill="url(#{id}g)" />
		<ellipse cx="42" cy="26" rx="8" ry="12" fill="url(#{id}s)" />
	{:else if kind === 'copa'}
		<path d="M26 12h48c0 26-8 40-24 46-16-6-24-20-24-46Z" fill="url(#{id}g)" />
		<path d="M50 58v14" stroke="url(#{id}g)" stroke-width="8" />
		<path d="M34 88h32l-4-16H38Z" fill="url(#{id}g)" />
		<path d="M50 22l4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1Z" fill="#101418" opacity="0.35" />
		<ellipse cx="40" cy="26" rx="7" ry="13" fill="url(#{id}s)" />
	{:else if kind === 'medalha'}
		<path d="M36 8h10l6 30H42ZM64 8H54l-6 30h10Z" fill="#10b981" />
		<circle cx="50" cy="62" r="26" fill="url(#{id}g)" />
		<circle cx="50" cy="62" r="18" fill="none" stroke="#101418" stroke-opacity="0.25" stroke-width="3" />
		<ellipse cx="42" cy="54" rx="7" ry="10" fill="url(#{id}s)" />
	{:else}
		<path d="M50 8l11 24 26 3-19 18 5 26-23-13-23 13 5-26-19-18 26-3Z" fill="url(#{id}g)" />
		<ellipse cx="44" cy="34" rx="8" ry="12" fill="url(#{id}s)" />
	{/if}
</svg>

<style>
	svg {
		filter: drop-shadow(0 10px 18px rgb(232 184 106 / 0.28));
		transition: filter 0.3s;
	}
	svg:hover {
		filter: drop-shadow(0 12px 26px rgb(232 184 106 / 0.5));
	}
	.muted {
		filter: grayscale(1) brightness(0.5);
		opacity: 0.45;
	}
</style>
