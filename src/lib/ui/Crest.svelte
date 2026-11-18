<script lang="ts">
	import { getClub, type Club } from '#lib/domain/clubs.ts';

	/** Escudo genérico gerado a partir das cores do clube — nunca reproduz marcas reais. */
	let { clubId, club: given, size = 40, title }: { clubId?: string; club?: Club; size?: number; title?: string } = $props();

	const club = $derived(given ?? (clubId ? getClub(clubId) : undefined));
	const uid = $props.id();

	const SHAPES = {
		escudo: 'M50 4 L92 16 L90 58 C88 80 70 94 50 100 C30 94 12 80 10 58 L8 16 Z',
		circulo: 'M50 4 A46 46 0 1 1 49.9 4 Z',
		flamula: 'M10 6 H90 V62 C90 76 70 88 50 100 C30 88 10 76 10 62 Z',
		diamante: 'M50 2 L96 50 L50 100 L4 50 Z'
	} as const;
</script>

{#if club}
	<svg
		class="crest"
		width={size}
		height={size}
		viewBox="0 0 100 104"
		role="img"
		aria-label={title ?? `Escudo do ${club.name}`}
	>
		<defs>
			<clipPath id="clip-{uid}"><path d={SHAPES[club.crest.shape]} /></clipPath>
			<linearGradient id="shine-{uid}" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#fff" stop-opacity="0.22" />
				<stop offset="0.55" stop-color="#fff" stop-opacity="0" />
			</linearGradient>
		</defs>
		<g clip-path="url(#clip-{uid})">
			<rect width="100" height="104" fill={club.colors.primary} />
			{#if club.crest.pattern === 'listras'}
				{#each [18, 46, 74] as x (x)}<rect {x} y="0" width="12" height="104" fill={club.colors.secondary} />{/each}
			{:else if club.crest.pattern === 'faixa'}
				<rect x="0" y="40" width="100" height="22" fill={club.colors.secondary} />
			{:else if club.crest.pattern === 'metade'}
				<rect x="50" y="0" width="50" height="104" fill={club.colors.secondary} />
			{/if}
			<rect width="100" height="104" fill="url(#shine-{uid})" />
		</g>
		<path d={SHAPES[club.crest.shape]} fill="none" stroke="#0b0f12" stroke-opacity="0.55" stroke-width="5" />
		<path d={SHAPES[club.crest.shape]} fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="1.5" />
		<g font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="800" text-anchor="middle">
			<text x="50" y="64" font-size="30" fill="#0b0f12" fill-opacity="0.5" dx="1.5" dy="1.5">{club.short}</text>
			<text x="50" y="64" font-size="30" fill="#ffffff">{club.short}</text>
		</g>
	</svg>
{/if}

<style>
	.crest {
		flex: none;
		filter: drop-shadow(0 2px 4px rgb(0 0 0 / 0.35));
	}
</style>
