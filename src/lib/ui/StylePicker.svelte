<script lang="ts">
	import { STYLE_LABELS, STYLES, type PlayStyle } from '#lib/domain/tactics.ts';

	/** Estilo de jogo em cartões com mini-diagramas de campo (setas mostram a ideia). */
	let { value = $bindable() }: { value: PlayStyle } = $props();

	const HINT: Record<PlayStyle, string> = {
		posse: 'Passes curtos, paciência',
		'contra-ataque': 'Recupera e sai rápido',
		pressao: 'Marca lá na frente',
		'jogo-direto': 'Bola longa no ataque'
	};
</script>

<div class="styles" role="radiogroup" aria-label="Estilo de jogo">
	{#each STYLES as s (s)}
		<button type="button" role="radio" aria-checked={value === s} class="card" onclick={() => (value = s)}>
			<svg viewBox="0 0 60 40" aria-hidden="true">
				<rect x="1" y="1" width="58" height="38" rx="3" class="field" />
				<line x1="30" y1="1" x2="30" y2="39" class="mark" />
				<defs>
					<marker id="arr-{s}" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto">
						<path d="M0 0 6 3 0 6Z" class="head" />
					</marker>
				</defs>
				{#if s === 'posse'}
					<polyline points="10,28 18,18 26,26 34,16 42,24 50,14" class="arrow" marker-end="url(#arr-{s})" />
					{#each [[10, 28], [18, 18], [26, 26], [34, 16], [42, 24]] as [x, y] (x)}<circle cx={x} cy={y} r="2" class="dot" />{/each}
				{:else if s === 'contra-ataque'}
					<circle cx="10" cy="20" r="2.2" class="dot" />
					<path d="M12 20 C 28 30, 40 8, 54 18" class="arrow" marker-end="url(#arr-{s})" />
				{:else if s === 'pressao'}
					{#each [36, 44, 52] as x (x)}<circle cx={x - 8} cy={x / 2 - 4} r="2" class="dot" /><line x1={x - 6} y1={x / 2 - 4} x2={x} y2={x / 2 - 4} class="arrow" marker-end="url(#arr-{s})" />{/each}
					<circle cx="54" cy="14" r="2.5" class="foe" />
				{:else}
					<circle cx="10" cy="22" r="2" class="dot" />
					<path d="M12 21 Q 32 -4 52 16" class="arrow dashed" marker-end="url(#arr-{s})" />
					<circle cx="52" cy="20" r="2" class="dot" />
				{/if}
			</svg>
			<strong>{STYLE_LABELS[s]}</strong>
			<small>{HINT[s]}</small>
		</button>
	{/each}
</div>

<style>
	.styles {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--sp-2);
	}
	.card {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		padding: var(--sp-2);
		border-radius: var(--radius-m);
		border: 1px solid var(--line);
		background: var(--surface-2);
		text-align: left;
		transition: border-color 0.15s, background 0.15s;
	}
	.card:hover {
		border-color: var(--line-strong);
	}
	.card[aria-checked='true'] {
		border-color: var(--emerald);
		background: linear-gradient(160deg, rgb(16 185 129 / 0.14), var(--surface-2));
	}
	svg {
		width: 100%;
		height: auto;
		margin-bottom: 4px;
	}
	.field {
		fill: #10392a;
		stroke: rgb(231 237 240 / 0.25);
		stroke-width: 0.6;
	}
	.mark {
		stroke: rgb(231 237 240 / 0.25);
		stroke-width: 0.6;
	}
	.arrow {
		fill: none;
		stroke: var(--gold);
		stroke-width: 1.4;
		stroke-linecap: round;
	}
	.dashed {
		stroke-dasharray: 2 2;
	}
	.head {
		fill: var(--gold);
	}
	.dot {
		fill: var(--text);
	}
	.foe {
		fill: var(--danger);
	}
	strong {
		font-size: var(--fs-sm);
	}
	small {
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
</style>
