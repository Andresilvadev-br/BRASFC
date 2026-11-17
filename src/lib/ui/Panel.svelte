<script lang="ts">
	import type { Snippet } from 'svelte';
	import { enter } from '#lib/motion/actions.ts';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons.ts';
	import DemoTag from './DemoTag.svelte';

	let {
		title,
		icon,
		href,
		linkLabel = 'Ver tudo',
		demo = false,
		index = 0,
		pad = true,
		tone = 'default',
		actions,
		children,
		class: klass = ''
	}: {
		title?: string;
		icon?: IconName;
		href?: string;
		linkLabel?: string;
		demo?: boolean;
		index?: number;
		pad?: boolean;
		tone?: 'default' | 'raised' | 'highlight';
		actions?: Snippet;
		children: Snippet;
		class?: string;
	} = $props();
</script>

<section class="panel {tone} {klass}" use:enter={{ index }}>
	{#if title}
		<header>
			<h2>
				{#if icon}<Icon name={icon} size={18} />{/if}
				{title}
			</h2>
			<div class="tools">
				{#if demo}<DemoTag />{/if}
				{@render actions?.()}
				{#if href}
					<a class="more" {href} data-umx-press>{linkLabel}<Icon name="chevronRight" size={16} /></a>
				{/if}
			</div>
		</header>
	{/if}
	<div class="body" class:pad>
		{@render children()}
	</div>
</section>

<style>
	.panel {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-l);
		box-shadow: var(--shadow-1);
		display: flex;
		flex-direction: column;
		min-width: 0;
		overflow: hidden;
	}
	.raised {
		background: var(--surface-2);
	}
	.highlight {
		background:
			radial-gradient(120% 140% at 100% 0%, rgb(16 185 129 / 0.16), transparent 55%),
			linear-gradient(180deg, #1f2a31, var(--surface));
		border-color: var(--emerald-line);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		padding: var(--sp-4) var(--sp-5) 0;
		min-height: 52px;
	}
	h2 {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		font-size: var(--fs-xl);
		font-weight: 700;
		color: var(--text);
	}
	h2 :global(.icon) {
		color: var(--emerald-strong);
	}
	.tools {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.more {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		font-size: var(--fs-sm);
		font-weight: 600;
		color: var(--text-2);
		padding: 4px 6px 4px 10px;
		border-radius: var(--radius-s);
	}
	.more:hover {
		color: var(--emerald-strong);
		background: var(--emerald-soft);
	}
	.body {
		flex: 1;
		min-height: 0;
	}
	.body.pad {
		padding: var(--sp-4) var(--sp-5) var(--sp-5);
	}
</style>
