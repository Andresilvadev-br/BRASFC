<script lang="ts">
	import { onMount } from 'svelte';
	import { desktop, setFullscreen } from '#lib/stores/desktop.svelte.ts';
	import Icon from '#lib/ui/Icon.svelte';

	type Release = { available: true; version: string; url: string; sizeMb: number; publishedAt: string } | { available: false; reason: string };
	let { compact = false }: { compact?: boolean } = $props();
	let release = $state<Release | null>(null);
	let failed = $state(false);

	onMount(() => {
		if (desktop.active) return;
		fetch('/api/desktop')
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
			.then((r: Release) => (release = r))
			.catch(() => (failed = true));
	});
</script>

<section class="dl" class:compact aria-label="BRASFC para Windows">
	<span class="logo" aria-hidden="true"><Icon name="windows" size={compact ? 20 : 28} /></span>
	<div class="txt">
		<strong>BRASFC para Windows</strong>
		{#if desktop.active}
			<small>Você está no aplicativo{desktop.version ? ` · versão ${desktop.version}` : ''}. Ele se atualiza sozinho.</small>
		{:else if release?.available}
			<small>Versão {release.version} · {release.sizeMb} MB · Windows 10 e 11 (64 bits) · janela própria, tela cheia (F11) e atualização automática</small>
		{:else if release && !release.available}
			<small>{release.reason}</small>
		{:else if failed}
			<small>Não foi possível verificar o instalador agora.</small>
		{:else}
			<small>Verificando o instalador…</small>
		{/if}
	</div>
	{#if desktop.active}
		<button type="button" class="btn" onclick={() => setFullscreen(!desktop.fullscreen)}>
			<Icon name={desktop.fullscreen ? 'shrink' : 'expand'} size={16} />{desktop.fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
		</button>
	{:else if release?.available}
		<a class="btn" href={release.url} rel="noopener">
			<Icon name="download" size={16} />Baixar instalador
		</a>
	{/if}
	{#if !desktop.active && release?.available && !compact}
		<p class="note">
			O instalador ainda não tem assinatura digital paga. Se aparecer “O Windows protegeu o computador”, clique em <b>Mais informações</b> e depois em <b>Executar assim mesmo</b>.
		</p>
	{/if}
</section>

<style>
	.dl {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 14px;
		padding: 16px 18px;
		border-radius: 16px;
		background:
			radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, #10b981 16%, transparent), transparent 60%),
			#1c252b;
		border: 1px solid color-mix(in srgb, #10b981 22%, transparent);
	}
	.compact {
		padding: 10px 12px;
		gap: 10px;
	}
	.logo {
		display: grid;
		place-items: center;
		width: 52px;
		height: 52px;
		border-radius: 14px;
		background: color-mix(in srgb, #10b981 18%, transparent);
		color: #34d399;
	}
	.compact .logo {
		width: 38px;
		height: 38px;
		border-radius: 10px;
	}
	.txt {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	small {
		color: #aab6bd;
	}
	.btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		border-radius: 999px;
		background: #10b981;
		color: #06140f;
		font: inherit;
		font-weight: 700;
		text-decoration: none;
		border: 0;
		cursor: pointer;
		white-space: nowrap;
		transition:
			transform 0.18s,
			box-shadow 0.18s;
	}
	.btn:hover,
	.btn:focus-visible {
		transform: translateY(-1px);
		box-shadow: 0 6px 20px color-mix(in srgb, #10b981 40%, transparent);
		outline: 2px solid #e8b86a;
		outline-offset: 2px;
	}
	.btn:hover {
		outline: none;
	}
	.note {
		grid-column: 1 / -1;
		margin: 0;
		font-size: 12.5px;
		color: #aab6bd;
	}
	@media (max-width: 640px) {
		.dl {
			grid-template-columns: auto 1fr;
		}
		.btn {
			grid-column: 1 / -1;
			justify-content: center;
		}
	}
</style>
