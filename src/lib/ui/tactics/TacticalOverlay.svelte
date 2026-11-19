<script lang="ts">
	import { FORMATIONS, type FormationId, type Mentality, type PlayStyle } from '#lib/domain/tactics.ts';
	import { paramsFromInstructions, type TacticalInstructions } from '#lib/engine/instructions.ts';
	import type { RoleId } from '#lib/engine/roles.ts';

	/**
	 * Comportamento tático desenhado sobre o campo, DERIVADO dos mesmos parâmetros que o motor usa
	 * (paramsFromInstructions): linha defensiva, comprimento do bloco, zona de pressão, amplitude e as
	 * corridas típicas de cada função. Nada é decorativo: mudar uma instrução muda o desenho.
	 * Campo em pé (viewBox 68×105): ataque no topo, próprio gol embaixo.
	 */
	let { formation, mentality, style, instructions, roles, legend = true }: { formation: FormationId; mentality: Mentality; style: PlayStyle; instructions: TacticalInstructions; roles: RoleId[]; legend?: boolean } = $props();
	const p = $derived(paramsFromInstructions(mentality, style, instructions));
	const shape = $derived(FORMATIONS[formation]);
	const defY = $derived(105 - p.defLine);
	const topY = $derived(Math.max(8, 105 - p.defLine - p.blockLength));
	const pressRy = $derived(Math.min(22, p.pressDistance * 0.75));
	const pressRx = $derived(Math.min(30, 8 + p.pressers * 5));
	const pressY = $derived(Math.max(10, topY - pressRy * 0.5));
	const widthSpan = $derived(Math.min(62, 34 * p.width + 18));
	type Arrow = { x1: number; y1: number; x2: number; y2: number; kind: 'run' | 'support' | 'box' };
	const arrows = $derived.by(() => {
		const out: Arrow[] = [];
		shape.forEach((s, i) => {
			const x = (s.x / 100) * 68;
			const y = (s.y / 100) * 105;
			const role = roles[i];
			if (s.position === 'LD' || s.position === 'LE') {
				const len = 6 + p.support * 26 + (role === 'ala' ? 10 : role === 'lat-defensivo' ? -8 : 0);
				if (len > 8) out.push({ x1: x, y1: y - 3, x2: x, y2: Math.max(10, y - len), kind: 'support' });
			} else if (s.position === 'PD' || s.position === 'PE') {
				const inward = role === 'pt-invertido' || role === 'pt-interior';
				const tx = inward ? 34 + (x < 34 ? -8 : 8) : x < 34 ? 5 : 63;
				out.push({ x1: x, y1: y - 2, x2: tx, y2: Math.max(6, y - 10 - p.runDepth * 6), kind: inward ? 'box' : 'run' });
			} else if (s.position === 'ATA') {
				const len = 3 + p.runDepth * 12 + (role === 'ata-movel' ? 4 : role === 'ata-referencia' ? -3 : 0);
				if (len > 3) out.push({ x1: x, y1: y - 2, x2: x + (x < 34 ? -2 : x > 34 ? 2 : 0), y2: Math.max(4, y - len), kind: 'run' });
			} else if ((s.position === 'MC' || s.position === 'MEI') && (p.boxRunners > 0 || role === 'mc-infiltrador' || role === 'mei-infiltrador' || role === 'mc-area-a-area')) {
				out.push({ x1: x, y1: y - 2, x2: 34 + (x - 34) * 0.4, y2: 14, kind: 'box' });
			}
		});
		return out;
	});
	const labels = $derived([
		`Linha a ${Math.round(p.defLine)} m do gol`,
		`Bloco de ${Math.round(p.blockLength)} m`,
		`Pressão: ${p.pressers} atleta${p.pressers > 1 ? 's' : ''} a ${Math.round(p.pressDistance)} m`,
		p.counterPress ? 'Contrapressão após perder' : null,
		p.manMarking ? 'Marcação individual' : 'Marcação por zona'
	].filter(Boolean) as string[]);
</script>

<svg class="overlay" viewBox="0 0 68 105" preserveAspectRatio="none" aria-hidden="true">
	<defs>
		<marker id="ov-run" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#e8b86a" /></marker>
		<marker id="ov-sup" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#60a5fa" /></marker>
		<marker id="ov-box" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#f472b6" /></marker>
	</defs>
	<!-- bloco defensivo (sem a bola) -->
	<rect class="block" x="1" y={topY} width="66" height={Math.max(0, defY - topY)} />
	<!-- zona de pressão -->
	<ellipse class="press" cx="34" cy={pressY} rx={pressRx} ry={pressRy} style="--a:{0.08 + p.pressers * 0.05}" />
	<!-- linha defensiva -->
	<line class="defline" x1="2" x2="66" y1={defY} y2={defY} />
	<!-- amplitude em posse -->
	<line class="width" x1={34 - widthSpan / 2} x2={34 + widthSpan / 2} y1="30" y2="30" marker-start="url(#ov-sup)" marker-end="url(#ov-sup)" />
	{#each arrows as a, i (i)}
		<line class="arr {a.kind}" x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} marker-end={a.kind === 'run' ? 'url(#ov-run)' : a.kind === 'support' ? 'url(#ov-sup)' : 'url(#ov-box)'} />
	{/each}
</svg>
{#if legend}
	<div class="legend" aria-label="Leitura do comportamento">
		{#each labels as l (l)}<span>{l}</span>{/each}
		<span class="k"><i class="run"></i>corrida</span><span class="k"><i class="sup"></i>apoio/amplitude</span><span class="k"><i class="box"></i>chegada à área</span>
	</div>
{/if}

<style>
	.overlay {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 1;
	}
	.block {
		fill: rgb(16 185 129 / 0.09);
		stroke: rgb(16 185 129 / 0.3);
		stroke-width: 0.3;
		stroke-dasharray: 1 1;
		transition: y 0.5s, height 0.5s;
	}
	.press {
		fill: rgb(248 113 113 / var(--a));
		stroke: rgb(248 113 113 / 0.45);
		stroke-width: 0.3;
		transition: cy 0.5s, rx 0.5s, ry 0.5s;
	}
	.defline {
		stroke: #34d399;
		stroke-width: 0.6;
		stroke-dasharray: 2 1.2;
	}
	.width {
		stroke: rgb(96 165 250 / 0.55);
		stroke-width: 0.45;
	}
	.arr {
		stroke-width: 0.7;
		stroke-linecap: round;
	}
	.arr.run {
		stroke: #e8b86a;
	}
	.arr.support {
		stroke: #60a5fa;
	}
	.arr.box {
		stroke: #f472b6;
		stroke-dasharray: 1.6 1;
	}
	:global(:root[data-motion='full']) .arr {
		animation: flow 1.6s linear infinite;
	}
	@keyframes flow {
		to {
			stroke-dashoffset: -5;
		}
	}
	.legend {
		position: absolute;
		left: 10px;
		right: 10px;
		bottom: 10px;
		z-index: 2;
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		pointer-events: none;
	}
	.legend span {
		font-size: 10px;
		font-weight: 700;
		padding: 3px 7px;
		border-radius: 999px;
		background: rgb(8 12 15 / 0.75);
		color: var(--text-2);
	}
	.k i {
		display: inline-block;
		width: 10px;
		height: 2px;
		margin-right: 4px;
		vertical-align: 2px;
	}
	i.run {
		background: #e8b86a;
	}
	i.sup {
		background: #60a5fa;
	}
	i.box {
		background: #f472b6;
	}
</style>
