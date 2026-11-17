<script lang="ts">
	import Icon from './Icon.svelte';
	import type { IconName } from './icons.ts';

	let {
		title,
		detail,
		icon = 'lock',
		stage = 'Próximas etapas'
	}: { title: string; detail?: string; icon?: IconName; stage?: string } = $props();
</script>

<div class="unavailable" role="note">
	<span class="ico"><Icon name={icon} size={18} /></span>
	<div class="txt">
		<strong>{title}</strong>
		{#if detail}<span>{detail}</span>{/if}
	</div>
	<span class="stage">{stage}</span>
</div>

<style>
	.unavailable {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-m);
		background: var(--surface-sunken);
		border: 1px dashed var(--line-strong);
		color: var(--text-2);
	}
	.ico {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 10px;
		background: var(--surface-2);
		color: var(--text-3);
		flex: none;
	}
	.txt {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}
	strong {
		color: var(--text);
		font-weight: 600;
		font-size: var(--fs-sm);
	}
	.txt span {
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.stage {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-weight: 600;
		color: var(--text-3);
		white-space: nowrap;
	}
</style>
