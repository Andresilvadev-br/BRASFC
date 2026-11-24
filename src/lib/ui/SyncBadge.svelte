<script lang="ts">
	import { SYNC_LABEL, SYNC_TONE, type SyncChannel } from '#lib/stores/sync.svelte.ts';

	/** Indicador do Hybrid Save Engine: estado do save e da fila local. */
	let { channel, compact = false }: { channel: SyncChannel; compact?: boolean } = $props();
	const count = $derived(channel.pending.length);
	const label = $derived(SYNC_LABEL[channel.status]);
	const title = $derived([
		label,
		count ? `${count} ${count === 1 ? 'alteração na fila' : 'alterações na fila'}` : '',
		!channel.persisted ? 'armazenamento local indisponível: a fila vale só nesta janela' : '',
		channel.error
	].filter(Boolean).join(' · '));
</script>

<span class="sync {SYNC_TONE[channel.status]}" role="status" aria-live="polite" {title} data-sync={channel.status}>
	<i aria-hidden="true"></i>
	{#if !compact}<span class="label">{label}{count ? ` (${count})` : ''}</span>{:else}<span class="sr-only">{title}</span>{/if}
	{#if count && (channel.status === 'reconnecting' || channel.status === 'failed' || channel.status === 'pending')}
		<button type="button" onclick={() => void channel.flush(true)}>Tentar agora</button>
	{/if}
</span>

<style>
	.sync { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-xs, 0.78rem); color: var(--text-3, #a6b8b2); white-space: nowrap; min-width: 0; }
	.label { overflow: hidden; text-overflow: ellipsis; }
	i { width: 7px; height: 7px; border-radius: 50%; background: #46df93; flex: none; }
	.warn i { background: #f5c451; animation: pulse 1.4s ease-in-out infinite; }
	.bad i { background: #ef4444; }
	.warn, .bad { color: #f5d89a; }
	button { border: 0; padding: 2px 8px; border-radius: 999px; background: rgb(231 237 240 / 0.1); color: inherit; font: inherit; cursor: pointer; }
	button:hover, button:focus-visible { background: rgb(231 237 240 / 0.18); }
	.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
	@keyframes pulse { 50% { opacity: 0.35; } }
	@media (prefers-reduced-motion: reduce) { .warn i { animation: none; } }
</style>
