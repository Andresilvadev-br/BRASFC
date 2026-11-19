<script lang="ts">
	import { INSTRUCTION_KEYS, INSTRUCTION_LABELS, optionIndex, valueAt, type InstructionKey, type TacticalInstructions } from '#lib/engine/instructions.ts';
	import Icon from '../Icon.svelte';

	/**
	 * Instruções avançadas em três seções (uma aberta por vez). Cada controle mostra as
	 * opções como degraus; o ponto dourado indica o que difere do preset do modo simples.
	 */
	let { value = $bindable(), preset }: { value: TacticalInstructions; preset: TacticalInstructions } = $props();

	type Group = 'ataque' | 'defesa' | 'transicao';
	const GROUPS: Array<{ id: Group; label: string; icon: 'arrowRight' | 'lock' | 'refresh' }> = [
		{ id: 'ataque', label: 'Com a bola', icon: 'arrowRight' },
		{ id: 'defesa', label: 'Sem a bola', icon: 'lock' },
		{ id: 'transicao', label: 'Transições', icon: 'refresh' }
	];
	let open = $state<Group>('ataque');
	let help = $state<InstructionKey | null>(null);

	const keysOf = (g: Group) => INSTRUCTION_KEYS.filter((k) => INSTRUCTION_LABELS[k].group === g);
	const changedIn = (g: Group) => keysOf(g).filter((k) => value[k] !== preset[k]).length;

	function set(k: InstructionKey, idx: number) {
		value = { ...value, [k]: valueAt(k, idx) } as TacticalInstructions;
	}
</script>

<div class="ie">
	<div class="tabs" role="tablist" aria-label="Seções de instruções">
		{#each GROUPS as g (g.id)}
			<button role="tab" aria-selected={open === g.id} class:on={open === g.id} onclick={() => (open = g.id)}>
				<Icon name={g.icon} size={14} />
				{g.label}
				{#if changedIn(g.id)}<span class="count">{changedIn(g.id)}</span>{/if}
			</button>
		{/each}
	</div>
	<div class="rows">
		{#each keysOf(open) as k (k)}
			{@const def = INSTRUCTION_LABELS[k]}
			{@const idx = optionIndex(k, value[k])}
			<div class="row">
				<div class="lbl">
					<span>{def.label}</span>
					{#if value[k] !== preset[k]}<i class="mod" title="Diferente do padrão do estilo"></i>{/if}
					<button class="q" onclick={() => (help = help === k ? null : k)} aria-label="O que faz: {def.label}" aria-expanded={help === k}><Icon name="info" size={14} /></button>
				</div>
				<div class="steps" role="radiogroup" aria-label={def.label}>
					{#each def.options as opt, i (opt)}
						<button role="radio" aria-checked={i === idx} class:on={i === idx} class:def={i === optionIndex(k, preset[k])} onclick={() => set(k, i)} title={opt}>
							<span>{opt}</span>
						</button>
					{/each}
				</div>
				{#if help === k}<p class="hint">{def.hint}</p>{/if}
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
		display: flex;
		gap: 4px;
		padding: 3px;
		border-radius: 10px;
		background: var(--surface-sunken);
	}
	.tabs button {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 7px 8px;
		border: 0;
		border-radius: 8px;
		background: none;
		color: var(--text-3);
		font: inherit;
		font-size: var(--fs-sm);
		font-weight: 600;
		cursor: pointer;
	}
	.tabs button.on {
		background: var(--surface-3);
		color: var(--text);
	}
	.count {
		min-width: 18px;
		padding: 0 5px;
		border-radius: 9px;
		background: var(--gold);
		color: #2a1d06;
		font-size: 11px;
		font-weight: 800;
	}
	.rows {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.lbl {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--fs-sm);
		font-weight: 600;
		color: var(--text-2);
		margin-bottom: 4px;
	}
	.mod {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--gold);
	}
	.q {
		margin-left: auto;
		border: 0;
		background: none;
		color: var(--text-3);
		cursor: pointer;
		padding: 2px;
	}
	.steps {
		display: flex;
		gap: 3px;
	}
	.steps button {
		flex: 1;
		min-width: 0;
		padding: 6px 2px;
		border: 0;
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--text-3);
		font: inherit;
		font-size: 11.5px;
		cursor: pointer;
		position: relative;
		transition: background 0.15s ease;
	}
	.steps button span {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.steps button.def::after {
		content: '';
		position: absolute;
		left: 50%;
		bottom: 2px;
		width: 4px;
		height: 4px;
		margin-left: -2px;
		border-radius: 50%;
		background: var(--text-3);
	}
	.steps button.on {
		background: var(--emerald);
		color: #06281c;
		font-weight: 700;
	}
	.hint {
		margin: 6px 0 0;
		font-size: var(--fs-xs);
		color: var(--text-2);
		padding: 6px 8px;
		border-radius: 6px;
		background: var(--surface-2);
	}
</style>
