<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import Logo from './Logo.svelte';

	/** Cabeçalho das telas fora da carreira: voltar ao menu, título e ações. */
	let { title, eyebrow, back = '/menu', actions }: { title: string; eyebrow?: string; back?: string; actions?: Snippet } = $props();
</script>

<header class="sh" data-umx-enter>
	<div class="row">
		<a class="back" href={back} data-umx-press><Icon name="arrowLeft" /> <span>Menu</span></a>
		<Logo size={28} />
	</div>
	<div class="title">
		<div>
			{#if eyebrow}<span class="eyebrow">{eyebrow}</span>{/if}
			<h1>{title}</h1>
		</div>
		{#if actions}<div class="actions">{@render actions()}</div>{/if}
	</div>
</header>

<style>
	.sh {
		display: flex;
		flex-direction: column;
		gap: var(--sp-6);
		margin-bottom: var(--sp-6);
	}
	.row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		height: 40px;
		padding: 0 14px 0 10px;
		border-radius: var(--radius-pill);
		border: 1px solid var(--line-strong);
		color: var(--text-2);
		font-weight: 600;
		font-size: var(--fs-sm);
	}
	.back:hover {
		color: var(--text);
		background: var(--surface);
	}
	.title {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: var(--sp-4);
		flex-wrap: wrap;
	}
	h1 {
		font-size: calc(clamp(2.25rem, 3.4vw, 3.25rem) * var(--text-scale));
		text-transform: uppercase;
		font-weight: 800;
	}
	.actions {
		display: flex;
		gap: var(--sp-2);
	}
</style>
