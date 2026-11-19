<script lang="ts">
	import { INSTRUCTION_KEYS, INSTRUCTION_LABELS, optionIndex, valueAt, type InstructionKey, type TacticalInstructions } from '#lib/engine/instructions.ts';
	import { indicator } from '#lib/motion/actions.ts';
	import { animate } from '#lib/motion/motion.svelte.ts';
	import Icon from '../Icon.svelte';

	/**
	 * Instruções avançadas em três categorias. Ajustes graduais (5 níveis) usam uma régua;
	 * escolhas (2–3 opções) usam um seletor segmentado. O valor escolhido aparece sempre por
	 * inteiro, a marca "padrão" mostra o que o estilo sugere e o ponto dourado indica o que mudou.
	 * Os valores são exatamente os mesmos que o motor lê (paramsFromInstructions).
	 */
	let { value = $bindable(), preset }: { value: TacticalInstructions; preset: TacticalInstructions } = $props();

	type Group = 'ataque' | 'defesa' | 'transicao';
	const GROUPS: Array<{ id: Group; label: string; icon: 'arrowRight' | 'lock' | 'refresh'; desc: string }> = [
		{ id: 'ataque', label: 'Com a bola', icon: 'arrowRight', desc: 'Como o time constrói, ocupa o campo e chega à área.' },
		{ id: 'defesa', label: 'Sem a bola', icon: 'lock', desc: 'Altura da linha, pressão e organização defensiva.' },
		{ id: 'transicao', label: 'Transições', icon: 'refresh', desc: 'O que fazer nos segundos após ganhar ou perder a bola.' }
	];
	let open = $state<Group>('ataque');
	let help = $state<InstructionKey | null>(null);
	let rowsEl = $state<HTMLElement>();

	const keysOf = (g: Group) => INSTRUCTION_KEYS.filter((k) => INSTRUCTION_LABELS[k].group === g);
	const changedIn = (g: Group) => keysOf(g).filter((k) => value[k] !== preset[k]).length;
	const group = $derived(GROUPS.find((g) => g.id === open)!);

	function set(k: InstructionKey, idx: number, el?: Element | null) {
		const opts = INSTRUCTION_LABELS[k].options;
		const i = Math.max(0, Math.min(opts.length - 1, idx));
		if (optionIndex(k, value[k]) === i) return;
		value = { ...value, [k]: valueAt(k, i) } as TacticalInstructions;
		if (el) void animate(el, { scale: 1 }, { spring: 'snappy', from: { scale: 0.94 } });
	}
	function resetOne(k: InstructionKey) {
		value = { ...value, [k]: preset[k] } as TacticalInstructions;
	}
	function onSliderKey(e: KeyboardEvent, k: InstructionKey) {
		const idx = optionIndex(k, value[k]);
		const last = INSTRUCTION_LABELS[k].options.length - 1;
		const next = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? idx + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? idx - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? last : null;
		if (next === null) return;
		e.preventDefault();
		set(k, next, e.currentTarget as Element);
	}
	function switchGroup(g: Group) {
		if (g === open) return;
		open = g;
		requestAnimationFrame(() => {
			if (rowsEl) void animate(rowsEl, { opacity: 1, y: 0 }, { spring: 'gentle', from: { opacity: 0, y: 8 } });
		});
	}
</script>

<div class="ie">
	<div class="tabs" role="tablist" aria-label="Categorias de instruções">
		<span class="ind" use:indicator={{ axis: 'x', key: open }}></span>
		{#each GROUPS as g (g.id)}
			<button role="tab" aria-selected={open === g.id} class:on={open === g.id} onclick={() => switchGroup(g.id)}>
				<Icon name={g.icon} size={15} />
				<span>{g.label}</span>
				{#if changedIn(g.id)}<span class="count" title="{changedIn(g.id)} ajuste(s) diferente(s) do padrão">{changedIn(g.id)}</span>{/if}
			</button>
		{/each}
	</div>
	<p class="gdesc">{group.desc}</p>

	<div class="rows" bind:this={rowsEl} role="tabpanel" aria-label={group.label}>
		{#each keysOf(open) as k (k)}
			{@const def = INSTRUCTION_LABELS[k]}
			{@const idx = optionIndex(k, value[k])}
			{@const pIdx = optionIndex(k, preset[k])}
			{@const n = def.options.length}
			{@const modified = value[k] !== preset[k]}
			<div class="card" class:mod={modified}>
				<div class="top">
					<span class="name">{def.label}</span>
					<button class="q" onclick={() => (help = help === k ? null : k)} aria-label="O que faz: {def.label}" aria-expanded={help === k}><Icon name="info" size={14} /></button>
					<span class="val" class:mod={modified}>{def.options[idx]}</span>
				</div>

				{#if n >= 5}
					<!-- ajuste gradual: régua de níveis -->
					<div
						class="slider"
						role="slider"
						tabindex="0"
						aria-label={def.label}
						aria-valuemin="1"
						aria-valuemax={n}
						aria-valuenow={idx + 1}
						aria-valuetext={def.options[idx]}
						onkeydown={(e) => onSliderKey(e, k)}
						style="--p:{idx / (n - 1)}; --d:{pIdx / (n - 1)}"
					>
						<span class="rail"><span class="fill"></span></span>
						<span class="def" title="Padrão do estilo: {def.options[pIdx]}"></span>
						{#each def.options as opt, i (opt)}
							<button type="button" tabindex="-1" class="notch" class:on={i <= idx} class:cur={i === idx} style="--i:{i / (n - 1)}" aria-label={opt} title={opt} onclick={(e) => set(k, i, e.currentTarget)}></button>
						{/each}
					</div>
					<div class="ends"><span>{def.options[0]}</span><span>{def.options[n - 1]}</span></div>
				{:else}
					<!-- escolha: seletor segmentado, rótulos completos -->
					<div class="seg" role="radiogroup" aria-label={def.label} style="--n:{n}">
						<span class="ind" use:indicator={{ axis: 'x', key: idx }}></span>
						{#each def.options as opt, i (opt)}
							<button type="button" role="radio" aria-checked={i === idx} data-active={i === idx} class:def={i === pIdx} onclick={(e) => set(k, i, e.currentTarget)}>{opt}</button>
						{/each}
					</div>
				{/if}

				{#if help === k || modified}
					<div class="foot">
						{#if help === k}<p class="hint">{def.hint}</p>{/if}
						{#if modified}
							<span class="was">Padrão do estilo: <strong>{def.options[pIdx]}</strong></span>
							<button class="reset" onclick={() => resetOne(k)}>Voltar ao padrão</button>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.ie {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.tabs {
		position: relative;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 4px;
		padding: 4px;
		border-radius: 12px;
		background: var(--surface-sunken);
	}
	.tabs .ind {
		position: absolute;
		top: 4px;
		bottom: 4px;
		left: 0;
		border-radius: 9px;
		background: var(--surface-3);
		box-shadow: 0 1px 0 rgb(255 255 255 / 0.05) inset, 0 4px 14px rgb(0 0 0 / 0.25);
		pointer-events: none;
	}
	.tabs button {
		position: relative;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 38px;
		padding: 6px 8px;
		border: 0;
		border-radius: 9px;
		background: none;
		color: var(--text-3);
		font: inherit;
		font-size: var(--fs-sm);
		font-weight: 700;
		cursor: pointer;
		transition: color 0.2s;
	}
	.tabs button.on {
		color: var(--text);
	}
	.tabs button:hover {
		color: var(--text-2);
	}
	.count {
		min-width: 18px;
		padding: 0 5px;
		border-radius: 9px;
		background: var(--gold);
		color: #2a1d06;
		font-size: 11px;
		font-weight: 800;
		line-height: 18px;
	}
	.gdesc {
		margin: 0;
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.rows {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr));
		gap: 10px;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px 12px 10px;
		border-radius: 12px;
		background: var(--surface-2);
		border: 1px solid var(--line);
		transition: border-color 0.2s, box-shadow 0.2s;
	}
	.card:hover {
		border-color: var(--line-strong);
	}
	.card.mod {
		border-color: color-mix(in srgb, var(--gold) 45%, transparent);
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--gold) 12%, transparent) inset;
	}
	.top {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}
	.name {
		font-size: var(--fs-sm);
		font-weight: 650;
		color: var(--text-2);
	}
	.q {
		display: grid;
		place-items: center;
		border: 0;
		background: none;
		color: var(--text-3);
		cursor: pointer;
		padding: 2px;
		border-radius: 6px;
	}
	.q:hover,
	.q[aria-expanded='true'] {
		color: var(--emerald-strong);
	}
	.val {
		margin-left: auto;
		font-family: var(--font-display);
		font-size: var(--fs-md, 17px);
		font-weight: 800;
		color: var(--emerald-strong);
		text-align: right;
		white-space: nowrap;
	}
	.val.mod {
		color: var(--gold);
	}

	/* régua */
	.slider {
		position: relative;
		height: 26px;
		margin: 0 9px;
		outline: none;
		cursor: pointer;
	}
	.slider:focus-visible .rail {
		box-shadow: 0 0 0 2px var(--emerald);
	}
	.rail {
		position: absolute;
		left: 0;
		right: 0;
		top: 50%;
		height: 6px;
		margin-top: -3px;
		border-radius: 3px;
		background: var(--surface-3);
		overflow: hidden;
	}
	.fill {
		position: absolute;
		inset: 0 auto 0 0;
		width: calc(var(--p) * 100%);
		background: linear-gradient(90deg, color-mix(in srgb, var(--emerald) 55%, transparent), var(--emerald));
		transition: width 0.35s cubic-bezier(0.2, 0.9, 0.25, 1.15);
	}
	.mod .fill {
		background: linear-gradient(90deg, color-mix(in srgb, var(--gold) 50%, transparent), var(--gold));
	}
	.def {
		position: absolute;
		top: -3px;
		left: calc(var(--d) * 100%);
		width: 2px;
		height: 7px;
		margin-left: -1px;
		border-radius: 1px;
		background: var(--text-3);
	}
	.notch {
		position: absolute;
		top: 50%;
		left: calc(var(--i) * 100%);
		width: 18px;
		height: 18px;
		margin: -9px 0 0 -9px;
		padding: 0;
		border-radius: 50%;
		border: 2px solid var(--surface-3);
		background: var(--surface-2);
		cursor: pointer;
		transition: transform 0.2s cubic-bezier(0.2, 0.9, 0.25, 1.4), background 0.2s, border-color 0.2s;
	}
	.notch::before {
		/* área de toque maior */
		content: '';
		position: absolute;
		inset: -8px;
	}
	.notch.on {
		border-color: var(--emerald);
		background: var(--emerald);
	}
	.mod .notch.on {
		border-color: var(--gold);
		background: var(--gold);
	}
	.notch.cur {
		transform: scale(1.3);
		background: #fff;
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--emerald) 25%, transparent);
	}
	.mod .notch.cur {
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--gold) 25%, transparent);
	}
	.notch:hover:not(.cur) {
		transform: scale(1.15);
	}
	.ends {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		margin-top: -4px;
		font-size: 11px;
		color: var(--text-3);
	}

	/* seletor segmentado */
	.seg {
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--n), minmax(0, 1fr));
		gap: 3px;
		padding: 3px;
		border-radius: 10px;
		background: var(--surface-sunken);
	}
	.seg .ind {
		position: absolute;
		top: 3px;
		bottom: 3px;
		left: 0;
		border-radius: 8px;
		background: var(--emerald);
		pointer-events: none;
	}
	.mod .seg .ind {
		background: var(--gold);
	}
	.seg button {
		position: relative;
		z-index: 1;
		min-height: 34px;
		padding: 5px 6px;
		border: 0;
		border-radius: 8px;
		background: none;
		color: var(--text-2);
		font: inherit;
		font-size: 12.5px;
		font-weight: 600;
		line-height: 1.2;
		text-align: center;
		cursor: pointer;
		transition: color 0.2s;
	}
	.seg button[aria-checked='true'] {
		color: #06281c;
		font-weight: 800;
	}
	.mod .seg button[aria-checked='true'] {
		color: #2a1d06;
	}
	.seg button.def:not([aria-checked='true'])::after {
		content: '';
		position: absolute;
		left: 50%;
		bottom: 3px;
		width: 4px;
		height: 4px;
		margin-left: -2px;
		border-radius: 50%;
		background: var(--text-3);
	}
	.seg button:hover:not([aria-checked='true']) {
		color: var(--text);
	}

	.foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 10px;
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.hint {
		flex-basis: 100%;
		margin: 0;
		padding: 7px 9px;
		border-radius: 8px;
		background: var(--surface-3);
		color: var(--text-2);
		line-height: 1.45;
	}
	.was strong {
		color: var(--text-2);
	}
	.reset {
		margin-left: auto;
		border: 0;
		background: none;
		padding: 0;
		color: var(--emerald-strong);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}
	.reset:hover {
		text-decoration: underline;
	}
	@media (prefers-reduced-motion: reduce) {
		.fill,
		.notch {
			transition: none;
		}
	}
</style>
