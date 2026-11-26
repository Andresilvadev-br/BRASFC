<script lang="ts">
	/** Bandeira local (static/flags, flag-icons MIT, rasterizada em 64×48). Sem rede e sem emoji: o Windows não desenha bandeiras emoji. */
	let { flag, size = 24, label }: { flag: string; size?: number; label?: string } = $props();
	let failed = $state(false);
</script>

{#if !failed}
	<img class="flag" src="/flags/{flag}.webp" width={size} height={Math.round((size * 3) / 4)} alt={label ?? ''} loading="lazy" decoding="async" onerror={() => (failed = true)} />
{:else}
	<span class="flag none" style="width:{size}px;height:{Math.round((size * 3) / 4)}px" aria-hidden={label ? undefined : 'true'} title={label}></span>
{/if}

<style>
	.flag { flex: none; display: inline-block; border-radius: 3px; object-fit: cover; box-shadow: 0 0 0 1px rgb(255 255 255 / 0.12), 0 1px 3px rgb(0 0 0 / 0.4); }
	.none { background: var(--surface-3); }
</style>
