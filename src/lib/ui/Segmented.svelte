<script lang="ts" generics="T extends string">
	import { indicator } from '#lib/motion/actions.ts';

	/** Controle segmentado com indicador líquido da Ultra Motion X. */
	let {
		options,
		value = $bindable(),
		label,
		onchange
	}: {
		options: Array<{ value: T; label: string }>;
		value: T;
		label: string;
		onchange?: (v: T) => void;
	} = $props();

	function select(v: T) {
		if (v === value) return;
		value = v;
		onchange?.(v);
	}

	function onKey(e: KeyboardEvent) {
		const i = options.findIndex((o) => o.value === value);
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
			e.preventDefault();
			select(options[(i + 1) % options.length].value);
		} else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
			e.preventDefault();
			select(options[(i - 1 + options.length) % options.length].value);
		} else return;
		const group = e.currentTarget as HTMLElement;
		requestAnimationFrame(() => group.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
	}
</script>

<div class="seg" role="radiogroup" aria-label={label} tabindex="-1" onkeydown={onKey}>
	<span class="ind" use:indicator={{ axis: 'x', key: value }}></span>
	{#each options as o (o.value)}
		<button
			type="button"
			role="radio"
			aria-checked={o.value === value}
			data-active={o.value === value}
			tabindex={o.value === value ? 0 : -1}
			onclick={() => select(o.value)}
		>
			{o.label}
		</button>
	{/each}
</div>

<style>
	.seg {
		position: relative;
		display: inline-flex;
		padding: 4px;
		gap: 2px;
		border-radius: var(--radius-m);
		background: var(--surface-sunken);
		border: 1px solid var(--line);
		max-width: 100%;
		overflow-x: auto;
	}
	.ind {
		position: absolute;
		top: 4px;
		bottom: 4px;
		left: 0;
		border-radius: 9px;
		background: var(--surface-3);
		box-shadow: inset 0 0 0 1px var(--line-strong);
		pointer-events: none;
	}
	button {
		position: relative;
		z-index: 1;
		height: 34px;
		padding: 0 14px;
		border: 0;
		border-radius: 9px;
		background: transparent;
		color: var(--text-2);
		font-size: var(--fs-sm);
		font-weight: 600;
		white-space: nowrap;
		transition: color 0.15s;
	}
	button:hover {
		color: var(--text);
	}
	button[aria-checked='true'] {
		color: var(--text);
	}
</style>
