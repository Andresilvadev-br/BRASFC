<script lang="ts">
	import type { Match } from '#lib/engine/match.ts';
	import { PITCH, type Side } from '#lib/engine/types.ts';

	/**
	 * Campo 2D desenhado em canvas a partir do estado do motor.
	 * O desenho NUNCA altera a simulação: só lê posições (interpoladas entre ticks).
	 *  - "classico": visão tática com círculos numerados (estilo prancheta)
	 *  - "pixel": bonecos em pixel art animados (corrida, chute, carrinho, defesa do goleiro)
	 */
	let {
		match,
		mode = 'classico',
		colors,
		highlight = null,
		version = 0,
		onpick
	}: {
		match: Pick<Match, 'states' | 'player' | 'tick' | 'ball' | 'events'> & { teams: Record<Side, { gkId: string }> };
		mode?: 'classico' | 'pixel';
		colors: Record<Side, { primary: string; secondary: string }>;
		highlight?: string | null;
		version?: number;
		/** toque no campo: atleta mais próximo do ponto (ou null) */
		onpick?: (id: string | null, side: Side | null) => void;
	} = $props();

	function click(e: MouseEvent) {
		if (!onpick || !canvas) return;
		const rect = canvas.getBoundingClientRect();
		const pad = mode === 'pixel' ? 4 * (rect.width / 380) : 10;
		const mx = ((e.clientX - rect.left - pad) / (rect.width - pad * 2)) * PITCH.length;
		const my = ((e.clientY - rect.top - pad) / (rect.height - pad * 2)) * PITCH.width;
		let best: { id: string; side: Side } | null = null;
		let bd = 4;
		for (const s of match.states.values()) {
			if (!s.onPitch) continue;
			const d = Math.hypot(s.x - mx, s.y - my);
			if (d < bd) {
				bd = d;
				best = { id: s.id, side: s.side };
			}
		}
		onpick(best?.id ?? null, best?.side ?? null);
	}

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
		void highlight;
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
			if (s.id === highlight) {
				const nm = match.player(s.id)?.shortName ?? '';
				ctx.font = `600 12px 'Inter Variable', system-ui, sans-serif`;
				const w = ctx.measureText(nm).width + 10;
				ctx.fillStyle = 'rgba(16,20,24,0.9)';
				ctx.fillRect(x - w / 2, y + r + 3, w, 17);
				ctx.fillStyle = '#34D399';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText(nm, x, y + r + 12);
			}
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

	// ── Modo Pixel ─────────────────────────────────────────────────────────────
	// Tudo é LIDO do motor: posição (interpolada), velocidade (px→x) e os eventos do
	// último segundo definem a pose. Nenhuma lógica de jogo roda aqui.
	const SKIN = ['#f1c9a5', '#d9a07a', '#b97a52', '#8d5a3b', '#5e3a26'];
	const HAIR = ['#2b1d14', '#5a3a22', '#141414', '#c8a060', '#7a3b1e'];
	let flightStart = { arrive: -1, tick: 0 };
	let goalFlash = { tick: -100, side: 'home' as Side };
	type Pose = 'kick' | 'tackle' | 'jump' | 'dive' | 'card' | null;
	
	function hashId(id: string): number {
		let h = 0;
		for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
		return h;
	}
	
	/** Pose de cada atleta a partir dos eventos do último segundo e meio. */
	function recentPoses(): Map<string, { pose: Pose; card?: 'yellow' | 'red' }> {
		const out = new Map<string, { pose: Pose; card?: 'yellow' | 'red' }>();
		const ev = match.events;
		for (let i = ev.length - 1; i >= 0 && i > ev.length - 40; i--) {
			const e = ev[i];
			const age = match.tick - e.tick;
			if (e.type === 'goal' && age <= 4) goalFlash = { tick: e.tick, side: e.side ?? 'home' };
			if (age > 2 || !e.player) continue;
			if (out.has(e.player)) continue;
			if (e.type === 'shot' || e.type === 'pass' || e.type === 'cross' || e.type === 'clearance') out.set(e.player, { pose: 'kick' });
			else if (e.type === 'tackle' || e.type === 'interception') out.set(e.player, { pose: 'tackle' });
			else if (e.type === 'aerial') out.set(e.player, { pose: 'jump' });
			else if (e.type === 'shot_saved') out.set(e.player, { pose: 'dive' });
			else if (e.type === 'yellow' || e.type === 'red') out.set(e.player, { pose: 'card', card: e.type });
		}
		return out;
	}
	
	function px(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1) {
		ctx.fillStyle = color;
		ctx.fillRect(x, y, w, h);
	}
	
	/**
	 * Boneco 9×13 (cabeça grande, tronco da largura da cabeça, pernas curtas).
	 * `frame` alterna as pernas na corrida; `dir` espelha para o lado do movimento.
	 */
	function drawSprite(ctx: CanvasRenderingContext2D, x: number, y: number, o: { shirt: string; shorts: string; skin: string; hair: string; frame: number; dir: 1 | -1; moving: boolean; pose: Pose; gk: boolean }) {
		ctx.save();
		ctx.translate(x, y);
		ctx.scale(o.dir, 1);
		if (o.pose === 'dive') {
			// goleiro se atirando: corpo na horizontal
			px(ctx, 'rgba(0,0,0,0.3)', -6, 1, 12, 1);
			px(ctx, o.shirt, -4, -4, 7, 3);
			px(ctx, o.skin, 3, -5, 3, 3);
			px(ctx, o.hair, 3, -5, 3, 1);
			px(ctx, o.shorts, -6, -4, 2, 3);
			px(ctx, o.skin, 6, -4, 2, 1);
			ctx.restore();
			return;
		}
		const lift = o.pose === 'jump' ? 3 : 0;
		px(ctx, 'rgba(0,0,0,0.3)', -3, 1, 7, 1);
		const yy = -lift;
		// pernas (animação de corrida em 4 quadros)
		const step = o.moving ? [0, 1, 0, -1][o.frame % 4] : 0;
		if (o.pose === 'tackle') {
			px(ctx, '#2a1f18', 1, yy - 1, 4, 1); // carrinho: perna esticada
			px(ctx, o.shorts, -2, yy - 3, 4, 2);
		} else if (o.pose === 'kick') {
			px(ctx, '#2a1f18', -2, yy - 2, 1, 3);
			px(ctx, '#2a1f18', 1, yy - 2, 3, 1); // perna de chute à frente
			px(ctx, o.shorts, -2, yy - 4, 5, 2);
		} else {
			px(ctx, '#2a1f18', -2 + Math.max(0, step), yy - 2, 1, 3);
			px(ctx, '#2a1f18', 1 + Math.min(0, step), yy - 2, 1, 3);
			px(ctx, o.shorts, -2, yy - 4, 5, 2);
		}
		// tronco (largura da cabeça) e braços
		px(ctx, o.shirt, -3, yy - 8, 7, 4);
		px(ctx, o.gk ? o.shirt : o.skin, -4, yy - 7 + (o.moving ? step : 0), 1, 2);
		px(ctx, o.gk ? o.shirt : o.skin, 4, yy - 7 - (o.moving ? step : 0), 1, 2);
		if (o.gk) {
			px(ctx, '#f0f0f0', -4, yy - 5, 1, 1);
			px(ctx, '#f0f0f0', 4, yy - 5, 1, 1);
		}
		// cabeça grande + cabelo
		px(ctx, o.skin, -3, yy - 13, 7, 5);
		px(ctx, o.hair, -3, yy - 13, 7, 2);
		px(ctx, o.hair, -3, yy - 11, 1, 1);
		px(ctx, '#101418', 2, yy - 10, 1, 1); // olho (olha para frente)
		if (o.pose === 'card') px(ctx, '#ffffff', 5, yy - 14, 1, 1);
		ctx.restore();
	}
	
	/** Modo Pixel: cena em baixa resolução ampliada sem suavização (leve para qualquer PC). */
	function drawPixel(ctx: CanvasRenderingContext2D) {
	const W = 380;
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
		const poses = recentPoses();
		const t = match.tick + alpha;
		const list = [...match.states.values()].filter((s) => s.onPitch).sort((a, b) => a.y - b.y);
		for (const s of list) {
			const x = Math.round(lerp(s.px, s.x) * sx);
			const y = Math.round(lerp(s.py, s.y) * sy);
			const isGk = match.teams[s.side].gkId === s.id;
			const c = colors[s.side];
			const h = hashId(s.id);
			const vx = s.x - s.px;
			const speed = Math.hypot(vx, s.y - s.py);
			// direção: para onde corre; parado, olha para o gol adversário
			const dir: 1 | -1 = Math.abs(vx) > 0.15 ? (vx > 0 ? 1 : -1) : s.side === 'home' ? 1 : -1;
			// passada mais rápida quando o atleta corre mais (caminhada × corrida)
			const frame = Math.floor(t * (speed > 5 ? 8 : 5) + (h % 4));
			const p = poses.get(s.id);
			drawSprite(ctx, x, y, {
				shirt: isGk ? (s.side === 'home' ? '#E8B86A' : '#7CB6F8') : c.primary,
				shorts: isGk ? '#101418' : c.secondary,
				skin: SKIN[h % SKIN.length],
				hair: HAIR[(h >> 3) % HAIR.length],
				frame,
				dir,
				moving: speed > 0.6,
				pose: p?.pose ?? null,
				gk: isGk
			});
			if (p?.card) px(ctx, p.card === 'yellow' ? '#fbbf24' : '#f87171', x + 4, y - 20, 3, 4);
			if (s.id === highlight) {
				px(ctx, '#34D399', x - 1, y - 17, 3, 1);
				px(ctx, '#34D399', x, y - 16, 1, 1);
			}
		}
		// bola: sombra no chão e altura em arco durante os passes longos/chutes
		const b = match.ball;
		const bx = Math.round(lerp(b.px, b.x) * sx);
		const byy = Math.round(lerp(b.py, b.y) * sy);
		let hgt = 0;
		if (b.flight) {
			if (flightStart.arrive !== b.flight.arrive) flightStart = { arrive: b.flight.arrive, tick: match.tick };
			const total = Math.max(1, b.flight.arrive - flightStart.tick);
			const prog = Math.min(1, Math.max(0, (t - flightStart.tick) / total));
			hgt = Math.round(Math.sin(prog * Math.PI) * Math.min(9, total * 2.2));
		}
		px(ctx, 'rgba(0,0,0,0.35)', bx - 1, byy + 1, 3, 1);
		px(ctx, '#FFFFFF', bx - 1, byy - 2 - hgt, 3, 3);
		px(ctx, '#9aa4ab', bx, byy - 1 - hgt, 1, 1);
		ctx.restore();
		// gol: faixa com a cor do time por ~3 segundos de jogo
		if (match.tick - goalFlash.tick <= 3 && match.tick >= goalFlash.tick) {
			const col = colors[goalFlash.side].primary;
			px(ctx, 'rgba(16,20,24,0.75)', 0, H / 2 - 14, W, 28);
			px(ctx, col, 0, H / 2 - 14, W, 2);
			px(ctx, col, 0, H / 2 + 12, W, 2);
			ctx.fillStyle = '#ffffff';
			ctx.font = `700 18px 'Barlow Condensed', system-ui, sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText('GOOOL!', W / 2, H / 2);
		}
		}
</script>

<div class="pitch" bind:this={box} data-mode={mode}>
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
	<canvas bind:this={canvas} aria-label="Campo da partida em 2D — toque num jogador para destacá-lo" onclick={click} class:pickable={!!onpick}></canvas>
	
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
	canvas.pickable {
		cursor: pointer;
	}
	.pitch[data-mode='pixel'] canvas {
		image-rendering: pixelated;
	}
</style>
