<script lang="ts">
	import { STYLE_LABELS, STYLES, type PlayStyle } from '#lib/domain/tactics.ts';

	/** Estilo de jogo em cartões com mini-diagramas de campo (setas mostram a ideia). */
	let { value = $bindable(), compact = false }: { value: PlayStyle; compact?: boolean } = $props();

	const HINT: Record<PlayStyle, string> = {
		posse: 'Paciência e passes seguros',
		'tiki-taka': 'Toques curtos e rápidos',
		'contra-ataque': 'Recupera e acelera',
		'bola-longa': 'Lançamentos para o ataque',
		laterais: 'Amplitude e cruzamentos',
		pressao: 'Marca lá na frente',
		vertical: 'Passes para frente cedo'
	};
	type Arrow = { d: string; dashed?: boolean };
	const ART: Record<PlayStyle, { dots: Array<[number, number]>; arrows: Arrow[]; foe?: [number, number] }> = {
		posse: { dots: [[10, 26], [20, 16], [30, 26], [40, 16]], arrows: [{ d: 'M10 26 L20 16 L30 26 L40 16 L50 22' }] },
		'tiki-taka': { dots: [[24, 22], [30, 16], [36, 22], [30, 28]], arrows: [{ d: 'M24 22 L30 16 L36 22 L30 28 L24 22' }, { d: 'M36 22 L50 20' }] },
		'contra-ataque': { dots: [[10, 20]], arrows: [{ d: 'M12 20 C 28 30, 40 8, 54 18' }] },
		'bola-longa': { dots: [[10, 22], [52, 20]], arrows: [{ d: 'M12 21 Q 32 -4 50 18', dashed: true }] },
		laterais: { dots: [[20, 6], [46, 6], [44, 20]], arrows: [{ d: 'M20 6 L44 6' }, { d: 'M46 7 Q 50 14 45 19' }] },
		pressao: { dots: [[30, 12], [36, 24], [42, 30]], arrows: [{ d: 'M32 12 L48 12' }, { d: 'M38 24 L50 22' }], foe: [53, 14] },
		vertical: { dots: [[10, 20], [26, 20], [42, 20]], arrows: [{ d: 'M12 20 L24 20' }, { d: 'M28 20 L40 20' }, { d: 'M44 20 L55 20' }] }
	};
</script>

<div class="styles" class:compact role="radiogroup" aria-label="Estilo de jogo">
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
				{#each ART[s].arrows as a, i (i)}
					<path d={a.d} class="arrow" class:dashed={a.dashed} marker-end={i === ART[s].arrows.length - 1 ? `url(#arr-${s})` : undefined} />
				{/each}
				{#each ART[s].dots as [x, y] (`${x}-${y}`)}<circle cx={x} cy={y} r="2" class="dot" />{/each}
				{#if ART[s].foe}<circle cx={ART[s].foe[0]} cy={ART[s].foe[1]} r="2.4" class="foe" />{/if}
			</svg>
			<strong>{STYLE_LABELS[s]}</strong>
			{#if !compact}<small>{HINT[s]}</small>{/if}
		</button>
	{/each}
</div>

<style>
	.styles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
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
		transition:
			border-color 0.15s,
			background 0.15s;
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
		stroke-linejoin: round;
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
		line-height: 1.2;
	}
	small {
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.compact svg {
		margin-bottom: 2px;
	}
</style>
