<script lang="ts">
	/** Marca BRASFC: escudo facetado com estrela dourada + logotipo condensado. */
	let { size = 36, wordmark = true, tagline = false }: { size?: number; wordmark?: boolean; tagline?: boolean } = $props();
</script>

<span class="logo" style="--s:{size}px">
	<svg width={size} height={size * 1.08} viewBox="0 0 100 108" aria-hidden="true">
		<defs>
			<linearGradient id="brasfc-g" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0" stop-color="#34D399" />
				<stop offset="1" stop-color="#0A7A56" />
			</linearGradient>
		</defs>
		<path d="M50 3 92 17 88 64C85 86 68 99 50 105 32 99 15 86 12 64L8 17Z" fill="#101418" stroke="url(#brasfc-g)" stroke-width="6" />
		<path d="M50 18 79 28 76 62C74 77 63 87 50 92Z" fill="url(#brasfc-g)" opacity="0.95" />
		<path d="M50 18 21 28 24 62C26 77 37 87 50 92Z" fill="#1C252B" />
		<path d="m50 37 4.7 9.6 10.6 1.5-7.7 7.4 1.8 10.5L50 61l-9.4 5 1.8-10.5-7.7-7.4 10.6-1.5Z" fill="#E8B86A" />
	</svg>
	{#if wordmark}
		<span class="text">
			<span class="word">BRAS<em>FC</em></span>
			{#if tagline}<span class="tag">Futebol brasileiro · Dev 0.1</span>{/if}
		</span>
	{/if}
</span>

<style>
	.logo {
		display: inline-flex;
		align-items: center;
		gap: calc(var(--s) * 0.28);
	}
	.text {
		display: flex;
		flex-direction: column;
		line-height: 1;
	}
	.word {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: calc(var(--s) * 0.78);
		letter-spacing: 0.04em;
		color: var(--text);
	}
	em {
		font-style: normal;
		color: var(--emerald-strong);
	}
	.tag {
		margin-top: 4px;
		font-size: 11px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--text-3);
		font-weight: 600;
	}
</style>
