<script lang="ts">
	import type { Match } from '#lib/engine/match.ts';
	import { PITCH, type Side } from '#lib/engine/types.ts';

	/**
	 * Campo 2D desenhado em canvas a partir do estado do motor.
	 * O desenho NUNCA altera a simulação: só lê posições (interpoladas entre ticks).
	 *  - "classico": visão tática com círculos numerados (estilo prancheta)
	 *  - "pixel": prévia em baixa resolução, com bonecos em blocos
	 */
	let {
		match,
		mode = 'classico',
		colors,
		highlight = null,
		version = 0
	}: {
		match: Match;
		mode?: 'classico' | 'pixel';
		colors: Record<Side, { primary: string; secondary: string }>;
		highlight?: string | null;
		version?: number;
	} = $props();

	let canvas: HTMLCanvasElement;
	let box: HTMLDivElement;
	let width = $state(640);
	const height = $derived(Math.round((width * PITCH.width) / PITCH.length));

	let alpha = 1;
	/** chamado pelo laço de animação a cada quadro, com a fração entre dois ticks */
	export function draw(a = alpha) {
		alpha = a;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		if (mode === 'pixel') drawPixel(ctx);
		else drawClassic(ctx);
	}

	$effect(() => {
		void version;
		void mode;
		void width;
		draw();
	});

	$effect(() => {
		const ro = new ResizeObserver(([entry]) => {
			width = Math.max(280, Math.floor(entry.contentRect.width));
		});
		ro.observe(box);
		return () => ro.disconnect();
	});

	const lerp = (a: number, b: number) => a + (b - a) * alpha;

	function contrast(hex: string): string {
		const n = parseInt(hex.slice(1), 16);
		const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
		return l > 0.6 ? '#101418' : '#F5F7FA';
	}

	function lines(ctx: CanvasRenderingContext2D, sx: number, sy: number, lw: number, color: string) {
		ctx.strokeStyle = color;
		ctx.lineWidth = lw;
		const rect = (x: number, y: number, w: number, h: number) => ctx.strokeRect(x * sx, y * sy, w * sx, h * sy);
		rect(0, 0, PITCH.length, PITCH.width);
		ctx.beginPath();
		ctx.moveTo((PITCH.length / 2) * sx, 0);
		ctx.lineTo((PITCH.length / 2) * sx, PITCH.width * sy);
		ctx.stroke();
		ctx.beginPath();
		ctx.arc((PITCH.length / 2) * sx, (PITCH.width / 2) * sy, 9.15 * sx, 0, Math.PI * 2);
		ctx.stroke();
		const by = (PITCH.width - PITCH.boxWidth) / 2;
		rect(0, by, PITCH.boxDepth, PITCH.boxWidth);
		rect(PITCH.length - PITCH.boxDepth, by, PITCH.boxDepth, PITCH.boxWidth);
		const sy6 = (PITCH.width - 18.32) / 2;
		rect(0, sy6, 5.5, 18.32);
		rect(PITCH.length - 5.5, sy6, 5.5, 18.32);
		ctx.fillStyle = color;
		const gy = (PITCH.width - PITCH.goalWidth) / 2;
		ctx.fillRect(-1.2 * sx, gy * sy, 1.2 * sx, PITCH.goalWidth * sy);
		ctx.fillRect(PITCH.length * sx, gy * sy, 1.2 * sx, PITCH.goalWidth * sy);
	}

	function drawClassic(ctx: CanvasRenderingContext2D) {
		const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
		canvas.width = width * dpr;
		canvas.height = height * dpr;
		canvas.style.width = `${width}px`;
		canvas.style.height = `${height}px`;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		const pad = 10;
		const sx = (width - pad * 2) / PITCH.length;
		const sy = (height - pad * 2) / PITCH.width;
		// gramado em faixas
		ctx.fillStyle = '#0f3a2a';
		ctx.fillRect(0, 0, width, height);
		ctx.save();
		ctx.translate(pad, pad);
		for (let i = 0; i < 12; i++) {
			ctx.fillStyle = i % 2 ? '#124432' : '#103d2d';
			ctx.fillRect((i * PITCH.length * sx) / 12, 0, (PITCH.length * sx) / 12 + 1, PITCH.width * sy);
		}
		lines(ctx, sx, sy, 1.2, 'rgba(231,237,240,0.55)');

		const r = Math.max(5, Math.min(11, width / 70));
		for (const s of match.states.values()) {
			if (!s.onPitch) continue;
			const x = lerp(s.px, s.x) * sx;
			const y = lerp(s.py, s.y) * sy;
			const isGk = match.teams[s.side].gkId === s.id;
			const c = colors[s.side];
			const fill = isGk ? (s.side === 'home' ? '#E8B86A' : '#7CB6F8') : c.primary;
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fillStyle = fill;
			ctx.fill();
			ctx.lineWidth = s.id === highlight || s.id === match.ball.owner ? 2.4 : 1.2;
			ctx.strokeStyle = s.id === match.ball.owner ? '#FFFFFF' : isGk ? '#101418' : c.secondary;
			ctx.stroke();
			if (s.injured) {
				ctx.fillStyle = '#F87171';
				ctx.fillRect(x + r * 0.6, y - r * 1.1, 3, 3);
			}
			if (r >= 7) {
				const num = match.player(s.id)?.number ?? 0;
				ctx.fillStyle = contrast(fill);
				ctx.font = `700 ${Math.round(r * 1.05)}px 'Barlow Condensed', system-ui, sans-serif`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText(String(num), x, y + 0.5);
			}
		}
		// bola (com sombra; em voo ela "sobe")
		const b = match.ball;
		const bx = lerp(b.px, b.x) * sx;
		const byy = lerp(b.py, b.y) * sy;
		const lift = b.flight ? 4 : 0;
		ctx.fillStyle = 'rgba(0,0,0,0.35)';
		ctx.beginPath();
		ctx.ellipse(bx, byy + 2, r * 0.45, r * 0.25, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = '#FFFFFF';
		ctx.beginPath();
		ctx.arc(bx, byy - lift, Math.max(3, r * 0.42), 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}

	/** Prévia pixel: desenha em resolução baixa e amplia sem suavização. */
	function drawPixel(ctx: CanvasRenderingContext2D) {
		const W = 220;
		const H = Math.round((W * PITCH.width) / PITCH.length) + 8;
		canvas.width = W;
		canvas.height = H;
		canvas.style.width = `${width}px`;
		canvas.style.height = `${Math.round((width * H) / W)}px`;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.imageSmoothingEnabled = false;
		const pad = 4;
		const sx = (W - pad * 2) / PITCH.length;
		const sy = (H - pad * 2) / PITCH.width;
		ctx.fillStyle = '#1d5a2e';
		ctx.fillRect(0, 0, W, H);
		ctx.save();
		ctx.translate(pad, pad);
		for (let i = 0; i < 14; i++) {
			ctx.fillStyle = i % 2 ? '#22663a' : '#1f5f34';
			ctx.fillRect(Math.floor((i * PITCH.length * sx) / 14), 0, Math.ceil((PITCH.length * sx) / 14), Math.round(PITCH.width * sy));
		}
		lines(ctx, sx, sy, 1, 'rgba(240,244,246,0.7)');
		const list = [...match.states.values()].filter((s) => s.onPitch).sort((a, b) => a.y - b.y);
		for (const s of list) {
			const x = Math.round(lerp(s.px, s.x) * sx);
			const y = Math.round(lerp(s.py, s.y) * sy);
			const isGk = match.teams[s.side].gkId === s.id;
			const c = colors[s.side];
			const shirt = isGk ? (s.side === 'home' ? '#E8B86A' : '#7CB6F8') : c.primary;
			// sombra
			ctx.fillStyle = 'rgba(0,0,0,0.3)';
			ctx.fillRect(x - 2, y + 1, 5, 1);
			// pernas, short, camisa, cabeça (bloco 3×7 com cabeça larga)
			ctx.fillStyle = '#3a2a20';
			ctx.fillRect(x - 1, y - 1, 1, 2);
			ctx.fillRect(x + 1, y - 1, 1, 2);
			ctx.fillStyle = isGk ? '#101418' : c.secondary;
			ctx.fillRect(x - 1, y - 2, 3, 1);
			ctx.fillStyle = shirt;
			ctx.fillRect(x - 2, y - 5, 5, 3);
			ctx.fillStyle = '#c98e5d';
			ctx.fillRect(x - 1, y - 8, 3, 3);
			ctx.fillStyle = '#2b1d14';
			ctx.fillRect(x - 1, y - 8, 3, 1);
			if (s.id === match.ball.owner) {
				ctx.fillStyle = '#FFFFFF';
				ctx.fillRect(x, y - 10, 1, 1);
			}
		}
		const b = match.ball;
		const bx = Math.round(lerp(b.px, b.x) * sx);
		const byy = Math.round(lerp(b.py, b.y) * sy);
		ctx.fillStyle = 'rgba(0,0,0,0.35)';
		ctx.fillRect(bx - 1, byy + 1, 3, 1);
		ctx.fillStyle = '#FFFFFF';
		ctx.fillRect(bx - 1, byy - (b.flight ? 3 : 1), 2, 2);
		ctx.restore();
	}
</script>

<div class="pitch" bind:this={box} data-mode={mode}>
	<canvas bind:this={canvas} aria-label="Campo da partida em 2D"></canvas>
	{#if mode === 'pixel'}<span class="tag">Prévia pixel</span>{/if}
</div>

<style>
	.pitch {
		position: relative;
		width: 100%;
		border-radius: var(--radius-md, 12px);
		overflow: hidden;
		background: #0f3a2a;
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	canvas {
		display: block;
	}
	.pitch[data-mode='pixel'] canvas {
		image-rendering: pixelated;
	}
	.tag {
		position: absolute;
		top: 8px;
		right: 8px;
		font-size: var(--fs-xs);
		padding: 2px 8px;
		border-radius: 999px;
		background: rgb(16 20 24 / 0.75);
		color: var(--gold);
	}
</style>
