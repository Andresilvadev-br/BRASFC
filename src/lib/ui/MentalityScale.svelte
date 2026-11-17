<script lang="ts">
	import { MENTALITIES, MENTALITY_LABELS, type Mentality } from '#lib/domain/tactics.ts';

	/** Mentalidade como uma régua: da retranca ao ataque total. A linha do time sobe junto. */
	let { value = $bindable() }: { value: Mentality } = $props();
	const idx = $derived(MENTALITIES.indexOf(value));

	function onKey(e: KeyboardEvent) {
		if (e.key === 'ArrowRight' || e.key === 'ArrowUp') value = MENTALITIES[Math.min(MENTALITIES.length - 1, idx + 1)];
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') value = MENTALITIES[Math.max(0, idx - 1)];
		else return;
		e.preventDefault();
	}
</script>

<div class="scale">
	<div class="mini" aria-hidden="true">
		<div class="line" style="bottom:{14 + idx * 15}%"></div>
		<span class="goal"></span>
	</div>
	<div class="right">
		<div
			class="track"
			role="slider"
			tabindex="0"
			aria-label="Mentalidade"
			aria-valuemin="0"
			aria-valuemax={MENTALITIES.length - 1}
			aria-valuenow={idx}
			aria-valuetext={MENTALITY_LABELS[value]}
			onkeydown={onKey}
		>
			{#each MENTALITIES as m, i (m)}
				<button type="button" tabindex="-1" class="seg" class:on={i <= idx} class:cur={i === idx} style="--i:{i}" aria-label={MENTALITY_LABELS[m]} onclick={() => (value = m)}></button>
			{/each}
		</div>
		<div class="ends"><span>Defender</span><strong>{MENTALITY_LABELS[value]}</strong><span>Atacar</span></div>
	</div>
</div>

<style>
	.scale {
		display: flex;
		gap: var(--sp-4);
		align-items: center;
	}
	.mini {
		position: relative;
		width: 54px;
		height: 70px;
		flex: none;
		border-radius: 6px;
		background: repeating-linear-gradient(180deg, #134231 0 16%, #10392a 16% 32%);
		box-shadow: inset 0 0 0 1px rgb(231 237 240 / 0.2);
		overflow: hidden;
	}
	.line {
		position: absolute;
		left: 8px;
		right: 8px;
		height: 3px;
		border-radius: 2px;
		background: var(--emerald-strong);
		box-shadow: 0 0 10px var(--emerald);
		transition: bottom 0.35s cubic-bezier(0.2, 0.8, 0.2, 1.2);
	}
	.goal {
		position: absolute;
		bottom: 0;
		left: 50%;
		translate: -50% 0;
		width: 20px;
		height: 5px;
		border: 1px solid rgb(231 237 240 / 0.5);
		border-bottom: 0;
	}
	.right {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}
	.track {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 4px;
		padding: 4px;
		border-radius: var(--radius-m);
		background: var(--surface-sunken);
	}
	.seg {
		height: 22px;
		border: 0;
		border-radius: 6px;
		background: var(--surface-3);
		transition: background 0.2s;
	}
	.seg.on {
		background: color-mix(in srgb, #60a5fa calc(100% - var(--i) * 25%), #f97316);
		opacity: 0.85;
	}
	.seg.cur {
		opacity: 1;
		box-shadow: 0 0 0 2px #fff inset;
	}
	.ends {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.ends strong {
		font-family: var(--font-display);
		font-size: var(--fs-lg);
		text-transform: uppercase;
		color: var(--text);
	}
</style>
