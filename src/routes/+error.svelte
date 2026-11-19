<script lang="ts">
	import { page } from '$app/state';
	import Button from '#lib/ui/Button.svelte';
	import Logo from '#lib/ui/Logo.svelte';
</script>

<svelte:head><title>{page.status} · BRASFC</title></svelte:head>

<main class="err">
	<Logo size={44} />
	<span class="code">{page.status}</span>
	<h1>{page.status === 404 ? 'Fora de campo' : 'Bola murcha'}</h1>
	<p class="muted">{page.error?.message ?? 'Algo deu errado.'}</p>
	{#if page.error?.id}<p class="subtle">Código do erro: {page.error.id}</p>{/if}
	<div class="actions">
		<Button variant="primary" icon="home" href="/menu">Menu principal</Button>
		<Button variant="ghost" icon="refresh" onclick={() => location.reload()}>Tentar de novo</Button>
	</div>
</main>

<style>
	.err {
		min-height: var(--app-h, 100vh);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--sp-3);
		padding: var(--sp-6);
		text-align: center;
	}
	.code {
		font-family: var(--font-display);
		font-size: 6rem;
		font-weight: 800;
		line-height: 1;
		color: var(--surface-3);
	}
	h1 {
		font-size: var(--fs-3xl);
		text-transform: uppercase;
	}
	.actions {
		display: flex;
		gap: var(--sp-3);
		margin-top: var(--sp-4);
	}
</style>
