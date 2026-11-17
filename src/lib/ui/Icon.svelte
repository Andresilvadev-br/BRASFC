<script lang="ts">
	import { ICONS, type IconName } from './icons.ts';

	let { name, size = 20, label, stroke = 1.8 }: { name: IconName; size?: number; label?: string; stroke?: number } = $props();
	const filled = $derived(name === 'play' || name === 'dot');
</script>

<svg
	class="icon"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill={filled ? 'currentColor' : 'none'}
	stroke={filled ? 'none' : 'currentColor'}
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	<path d={ICONS[name]} />
</svg>

<style>
	.icon {
		flex: none;
		display: inline-block;
		vertical-align: middle;
	}
</style>
