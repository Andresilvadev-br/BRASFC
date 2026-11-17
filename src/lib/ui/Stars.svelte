<script lang="ts">
	/** Avaliação em estrelas (0–5, aceita meia estrela). */
	let { value, max = 5, size = 14 }: { value: number; max?: number; size?: number } = $props();
	const full = $derived(Math.floor(value));
	const half = $derived(value - full >= 0.5);
</script>

<span class="stars" role="img" aria-label="{value.toLocaleString('pt-BR')} de {max} estrelas">
	{#each Array(max) as _, i (i)}
		<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
			<defs>
				<linearGradient id="half-{i}-{size}">
					<stop offset="50%" stop-color="var(--gold)" />
					<stop offset="50%" stop-color="var(--surface-3)" />
				</linearGradient>
			</defs>
			<path
				d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"
				fill={i < full ? 'var(--gold)' : i === full && half ? `url(#half-${i}-${size})` : 'var(--surface-3)'}
			/>
		</svg>
	{/each}
</span>

<style>
	.stars {
		display: inline-flex;
		gap: 1px;
	}
</style>
