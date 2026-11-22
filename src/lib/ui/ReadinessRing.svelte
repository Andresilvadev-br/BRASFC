<script lang="ts">
	/** Anel de prontidão: quantos dos obrigatórios estão prontos (e online, quando informado pelo servidor). */
	let { done, total, apt = false, label }: { done: number; total: number; apt?: boolean; label: string } = $props();
</script>

<div class="ring" class:apt style:--p={total ? done / total : 0} role="img" aria-label={label}>
	<span>{done}<small>/{total}</small></span>
</div>

<style>
	.ring { --p: 0; flex: none; display: grid; place-items: center; width: 64px; height: 64px; border-radius: 50%;
		background: conic-gradient(var(--emerald-strong) calc(var(--p) * 360deg), rgb(231 237 240 / 0.1) 0); transition: background 0.5s var(--ease-out), box-shadow 0.3s var(--ease-out); }
	.ring span { display: grid; place-items: center; grid-auto-flow: column; align-items: baseline; width: 52px; height: 52px; border-radius: 50%;
		background: var(--surface); font-family: var(--font-display); font-weight: 800; font-size: 1.35rem; }
	small { font-size: 0.8rem; color: var(--text-3); }
	.apt { box-shadow: 0 0 0 4px var(--emerald-soft), 0 0 24px -4px rgb(52 211 153 / 0.6); }
</style>
