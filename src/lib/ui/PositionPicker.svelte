<script lang="ts">
	import { POSITION_INFO, POSITIONS, type Position } from '#lib/domain/positions.ts';

	/**
	 * Escolha de posição direto no campo: cada posição é um ponto onde o
	 * jogador atua. Teclado: setas percorrem as posições, Enter/Espaço escolhe.
	 */
	let { value = $bindable(), onchange }: { value: Position; onchange?: (p: Position) => void } = $props();

	const SPOTS: Record<Position, { x: number; y: number }> = {
		GOL: { x: 50, y: 90 },
		ZAG: { x: 50, y: 74 },
		LE: { x: 15, y: 66 },
		LD: { x: 85, y: 66 },
		VOL: { x: 50, y: 56 },
		MC: { x: 30, y: 45 },
		MEI: { x: 62, y: 36 },
		PE: { x: 16, y: 24 },
		PD: { x: 84, y: 24 },
		ATA: { x: 50, y: 14 }
	};

	function pick(p: Position) {
		value = p;
		onchange?.(p);
	}

	function onKey(e: KeyboardEvent) {
		const i = POSITIONS.indexOf(value);
		let next = -1;
		if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = (i + 1) % POSITIONS.length;
		if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = (i - 1 + POSITIONS.length) % POSITIONS.length;
		if (next < 0) return;
		e.preventDefault();
		pick(POSITIONS[next]);
		requestAnimationFrame(() => (e.currentTarget as HTMLElement)?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
	}
</script>

<div class="picker">
	<div class="pitch" role="radiogroup" aria-label="Posição em campo" tabindex="-1" onkeydown={onKey}>
		<svg viewBox="0 0 68 88" preserveAspectRatio="none" aria-hidden="true">
			<rect x="1" y="1" width="66" height="86" />
			<line x1="1" y1="1" x2="67" y2="1" />
			<path d="M24 1 A10 10 0 0 0 44 1" />
			<rect x="14" y="70" width="40" height="17" />
			<rect x="25" y="81" width="18" height="6" />
			<path d="M27 70 A8 8 0 0 1 41 70" />
		</svg>
		{#each POSITIONS as p (p)}
			<button
				type="button"
				role="radio"
				aria-checked={value === p}
				aria-label={POSITION_INFO[p].label}
				tabindex={value === p ? 0 : -1}
				class="spot"
				data-sector={POSITION_INFO[p].sector}
				style="left:{SPOTS[p].x}%; top:{SPOTS[p].y}%"
				onclick={() => pick(p)}
			>
				<span class="dot"></span>
				<span class="code">{p}</span>
			</button>
		{/each}
	</div>
	<div class="caption" aria-live="polite">
		<strong>{POSITION_INFO[value].label}</strong>
		<span class="muted">{value === 'GOL' ? 'Defende o gol e organiza a defesa' : POSITION_INFO[value].sector === 'defesa' ? 'Marca, desarma e inicia jogadas' : POSITION_INFO[value].sector === 'meio' ? 'Conecta defesa e ataque' : 'Cria chances e finaliza'}</span>
	</div>
</div>

<style>
	.picker {
		display: flex;
		gap: var(--sp-4);
		align-items: flex-end;
	}
	.pitch {
		position: relative;
		width: 240px;
		aspect-ratio: 68 / 88;
		flex: none;
		border-radius: var(--radius-m);
		background: repeating-linear-gradient(180deg, #134231 0 12.5%, #10392a 12.5% 25%);
		box-shadow:
			inset 0 0 40px rgb(0 0 0 / 0.4),
			0 0 0 1px var(--line-strong);
		overflow: hidden;
	}
	svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		fill: none;
		stroke: rgb(231 237 240 / 0.3);
		stroke-width: 0.5;
	}
	.spot {
		position: absolute;
		translate: -50% -50%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 4px;
		border: 0;
		background: transparent;
		border-radius: var(--radius-s);
	}
	.dot {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: rgb(231 237 240 / 0.18);
		border: 2px solid rgb(231 237 240 / 0.55);
		transition:
			transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1),
			background 0.15s,
			border-color 0.15s;
	}
	.code {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.04em;
		color: rgb(231 237 240 / 0.75);
		text-shadow: 0 1px 2px rgb(0 0 0 / 0.6);
	}
	.spot:hover .dot {
		transform: scale(1.15);
		border-color: var(--text);
	}
	.spot[aria-checked='true'] .dot {
		transform: scale(1.3);
		background: var(--emerald);
		border-color: #fff;
		box-shadow: 0 0 0 5px rgb(16 185 129 / 0.3);
	}
	.spot[aria-checked='true'] .code {
		color: #fff;
	}
	.caption {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding-bottom: var(--sp-2);
	}
	.caption strong {
		font-family: var(--font-display);
		font-size: var(--fs-2xl);
		text-transform: uppercase;
		line-height: 1;
	}
	.caption span {
		font-size: var(--fs-sm);
		max-width: 22ch;
	}
</style>
