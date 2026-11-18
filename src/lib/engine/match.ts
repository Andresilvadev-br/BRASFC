import { positionFit, type Position } from '#lib/domain/positions.ts';
import { createRng, type Rng } from '#lib/domain/rng.ts';
import { FORMATIONS, type FormationId } from '#lib/domain/tactics.ts';
import type { Attributes } from './attributes.ts';
import { baseXg, clampToPitch, dist, inBox, segmentDistance, toAbs, toRel } from './geometry.ts';
import { computeResult } from './stats.ts';
import { tacticalParams, type TacticalParams } from './tactics.ts';
import {
	DEFAULT_RULES,
	PITCH,
	type AppliedDecision,
	type BallState,
	type Decision,
	type EnginePlayer,
	type EventType,
	type MatchEvent,
	type MatchResult,
	type MatchRules,
	type Phase,
	type PlayerState,
	type Side,
	type TeamSetup,
	type TeamTactic
} from './types.ts';

/**
 * BRASFC Football Engine — simulação orientada a estado e eventos.
 *
 * • Tempo discreto: 1 tick = 1 segundo de jogo.
 * • A bola e os 22 atletas têm posição contínua no campo (105 × 68 m).
 * • O portador da bola decide (passe, condução, drible, cruzamento, chute, afastar)
 *   avaliando o espaço, os companheiros, a pressão e os próprios atributos.
 * • Disputas (desarme, interceptação, bola aérea, finalização × goleiro) são resolvidas
 *   por probabilidades condicionadas aos atributos, ao cansaço e ao contexto.
 * • Nenhum placar é sorteado: gols só existem a partir de finalizações reais.
 * • Toda aleatoriedade vem de um gerador com semente: mesma semente + mesmas
 *   decisões nos mesmos ticks = mesma partida.
 */

const OTHER: Record<Side, Side> = { home: 'away', away: 'home' };
const HALF_LENGTH = PITCH.length / 2;

interface TeamRuntime {
	setup: TeamSetup;
	tactic: TeamTactic;
	params: TacticalParams;
	byId: Map<string, EnginePlayer>;
	subsUsed: number;
	windows: number[];
	usedBench: Set<string>;
	gkId: string;
	ai: boolean;
	/** último tick em que recuperou a bola (contra-ataque) */
	regainTick: number;
}

interface Restart {
	type: 'kickoff' | 'throw_in' | 'goal_kick' | 'corner' | 'free_kick' | 'penalty';
	side: Side;
	x: number;
	y: number;
}

export interface MatchOptions {
	home: TeamSetup;
	away: TeamSetup;
	seed: number;
	rules?: Partial<MatchRules>;
	/** quais lados o "treinador automático" controla (substituições e ajustes) */
	ai?: Partial<Record<Side, boolean>>;
	/** decisões já registradas (reprodução autoritativa no servidor) */
	replay?: AppliedDecision[];
}

export class Match {
	readonly rules: MatchRules;
	readonly seed: number;
	readonly teams: Record<Side, TeamRuntime>;
	readonly states = new Map<string, PlayerState>();
	readonly events: MatchEvent[] = [];
	readonly applied: AppliedDecision[] = [];
	readonly possession: Record<Side, number> = { home: 0, away: 0 };
	readonly score: Record<Side, number> = { home: 0, away: 0 };

	tick = 0;
	phase: Phase = 'first_half';
	half: 1 | 2 = 1;
	added: [number, number] = [0, 0];
	ball: BallState;

	private rng: Rng;
	private queue: Record<Side, Decision[]> = { home: [], away: [] };
	private replay: Map<number, AppliedDecision[]> | null = null;
	private restart: Restart | null = null;
	private deadUntil = 0;
	private actAt = 0;
	private lastTouch: { side: Side; player: string } | null = null;
	/** passe que deixou o atual portador com a bola (para assistências) */
	private lastPass: { from: string; to: string; tick: number; side: Side } | null = null;
	/** perdas de posse recentes (erros que levam a gol) */
	private recentLosses: Array<{ player: string; side: Side; tick: number }> = [];
	private halfEnd = HALF_LENGTH_TICKS;
	private stoppageSeconds = 0;
	private kickoffSide: Side = 'home';
	/** janela de contra-ataque: até que tick cada lado está em transição rápida */
	private counterUntil: Record<Side, number> = { home: -1, away: -1 };
	/** "dia" de cada equipe (0,93–1,07): o mais forte nem sempre vence */
	readonly form: Record<Side, number>;

	constructor(opts: MatchOptions) {
		this.rules = { ...DEFAULT_RULES, ...(opts.rules ?? {}) };
		this.seed = opts.seed >>> 0;
		this.rng = createRng(this.seed);
		const formRng = createRng((this.seed ^ 0x9e3779b9) >>> 0);
		this.form = { home: 0.93 + formRng.next() * 0.14, away: 0.93 + formRng.next() * 0.14 };
		this.teams = {
			home: this.makeTeam(opts.home, opts.ai?.home ?? true),
			away: this.makeTeam(opts.away, opts.ai?.away ?? true)
		};
		if (opts.replay) {
			this.replay = new Map();
			for (const d of opts.replay) {
				const list = this.replay.get(d.tick) ?? [];
				list.push(d);
				this.replay.set(d.tick, list);
			}
		}
		for (const side of ['home', 'away'] as const) {
			const t = this.teams[side];
			t.tactic.lineup.forEach((id, slot) => {
				const p = t.byId.get(id)!;
				const [x, y] = this.slotTarget(side, slot, false, HALF_LENGTH, PITCH.width / 2);
				this.states.set(id, {
					id, side, slot, x, y, px: x, py: y, condition: p.condition, onPitch: true,
					sentOff: false, injured: false, yellow: 0, minutesIn: 0, minuteOut: null
				});
			});
		}
		this.ball = { x: HALF_LENGTH, y: PITCH.width / 2, px: HALF_LENGTH, py: PITCH.width / 2, owner: null, flight: null };
		this.setRestart({ type: 'kickoff', side: 'home', x: HALF_LENGTH, y: PITCH.width / 2 }, 0);
		this.emit('kickoff', { side: 'home' });
	}

	private makeTeam(setup: TeamSetup, ai: boolean): TeamRuntime {
		const tactic = structuredClone(setup.tactic);
		const byId = new Map(setup.players.map((p) => [p.id, p]));
		if (tactic.lineup.length !== 11 || new Set(tactic.lineup).size !== 11 || tactic.lineup.some((id) => !byId.has(id))) {
			throw new Error(`Escalação inválida para ${setup.name}`);
		}
		if (!FORMATIONS[tactic.formation]) throw new Error(`Formação desconhecida: ${tactic.formation}`);
		tactic.bench = tactic.bench.filter((id) => byId.has(id) && !tactic.lineup.includes(id)).slice(0, 12);
		return {
			setup,
			tactic,
			params: tacticalParams(tactic.mentality, tactic.style),
			byId,
			subsUsed: 0,
			windows: [],
			usedBench: new Set(),
			gkId: tactic.lineup[0],
			ai,
			regainTick: -100
		};
	}

	// ──────────────────────────────────────────────── consultas

	get minute(): number {
		return Math.floor(this.tick / 60);
	}

	get finished(): boolean {
		return this.phase === 'finished';
	}

	/** Relógio de jogo no formato do placar ("45+2", "67"). */
	clock(): string {
		const regular = this.half === 1 ? 45 : 90;
		const elapsed = this.half === 1 ? this.tick : this.tick - this.halfEnd + 45 * 60;
		const m = Math.floor(elapsed / 60);
		const s = elapsed % 60;
		if (m >= regular && this.phase !== 'finished') return `${regular}+${m - regular + 1}`;
		return `${String(Math.min(m, regular)).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}

	/** Minuto "oficial" de um tick (ex.: 47 no 1º tempo vira "45+2"). */
	minuteLabel(tick: number): string {
		const half2 = tick >= this.halfEnd && this.halfEnd > 0 && (this.half === 2 || this.phase === 'finished');
		if (!half2) {
			const m = Math.floor(tick / 60) + 1;
			return m > 45 ? `45+${m - 45}` : `${m}'`;
		}
		const m = Math.floor((tick - this.halfEnd) / 60) + 46;
		return m > 90 ? `90+${m - 90}` : `${m}'`;
	}

	player(id: string): EnginePlayer | undefined {
		return this.teams.home.byId.get(id) ?? this.teams.away.byId.get(id);
	}

	onPitch(side: Side): PlayerState[] {
		const out: PlayerState[] = [];
		for (const s of this.states.values()) if (s.side === side && s.onPitch) out.push(s);
		return out;
	}

	bench(side: Side): EnginePlayer[] {
		const t = this.teams[side];
		return t.tactic.bench.filter((id) => !t.usedBench.has(id)).map((id) => t.byId.get(id)!);
	}

	subsLeft(side: Side): number {
		return this.rules.maxSubs - this.teams[side].subsUsed;
	}

	/** Recebe uma decisão do treinador; ela é aplicada no momento permitido pelas regras. */
	submit(side: Side, decision: Decision) {
		if (this.finished || this.replay) return;
		this.queue[side].push(decision);
	}

	pending(side: Side): Decision[] {
		return [...this.queue[side]];
	}

	// ──────────────────────────────────────────────── laço principal

	/** Avança um segundo de jogo. Retorna false quando a partida terminou. */
	step(): boolean {
		if (this.finished) return false;
		for (const s of this.states.values()) {
			s.px = s.x;
			s.py = s.y;
		}
		this.ball.px = this.ball.x;
		this.ball.py = this.ball.y;

		this.applyDecisions();
		if (this.phase === 'half_time') {
			this.startSecondHalf();
			return true;
		}

		const dead = this.restart !== null;
		if (dead && this.tick >= this.deadUntil) this.takeRestart();
		else if (!dead) this.live();
		this.movePlayers();
		this.fatigue();
		if (this.ball.owner || this.ball.flight) {
			const side = this.ball.owner ? this.states.get(this.ball.owner)!.side : this.lastTouch?.side;
			if (side) this.possession[side]++;
		}
		this.tick++;
		this.checkClock();
		return !this.finished;
	}

	/** Simula até o fim (modo resultado / servidor). */
	runToEnd(): MatchResult {
		let guard = 0;
		while (this.step() && guard++ < 20_000) {
			/* avança */
		}
		return this.result();
	}

	result(): MatchResult {
		return computeResult(this);
	}

	// ──────────────────────────────────────────────── tempo e fases

	private checkClock() {
		if (this.phase === 'first_half' && this.tick === HALF_LENGTH_TICKS) {
			this.added[0] = this.addedMinutes(1);
			this.halfEnd = HALF_LENGTH_TICKS + this.added[0] * 60;
		}
		if (this.phase === 'first_half' && this.tick >= this.halfEnd && this.tick >= HALF_LENGTH_TICKS) {
			this.phase = 'half_time';
			this.emit('half_time', {});
			return;
		}
		if (this.phase === 'second_half') {
			const regularEnd = this.halfEnd + HALF_LENGTH_TICKS;
			if (this.tick === regularEnd) this.added[1] = this.addedMinutes(2);
			if (this.tick >= regularEnd + this.added[1] * 60 && this.tick >= regularEnd) {
				this.phase = 'finished';
				this.ball.owner = null;
				this.ball.flight = null;
				this.emit('full_time', {});
			}
		}
	}

	private addedMinutes(half: 1 | 2): number {
		const extra = Math.round(this.stoppageSeconds / 60);
		this.stoppageSeconds = 0;
		return Math.max(half === 1 ? 1 : 2, Math.min(half === 1 ? 5 : 8, extra + 1));
	}

	private startSecondHalf() {
		this.half = 2;
		this.phase = 'second_half';
		for (const s of this.states.values()) if (s.onPitch) s.condition = Math.min(100, s.condition + 4);
		this.halfEnd = this.tick;
		this.kickoffSide = 'away';
		this.ball.owner = null;
		this.ball.flight = null;
		this.setRestart({ type: 'kickoff', side: 'away', x: HALF_LENGTH, y: PITCH.width / 2 }, 0);
		this.emit('second_half', {});
		this.tick++;
	}

	// ──────────────────────────────────────────────── decisões do treinador

	private applyDecisions() {
		if (this.replay) {
			for (const d of this.replay.get(this.tick) ?? []) this.applyDecision(d.side, d.decision, true);
			return;
		}
		for (const side of ['home', 'away'] as const) {
			if (this.teams[side].ai) this.aiManager(side);
			const keep: Decision[] = [];
			for (const d of this.queue[side]) {
				const needsStop = d.type === 'sub';
				const stopped = this.restart !== null || this.phase === 'half_time';
				if (needsStop && !stopped) keep.push(d);
				else this.applyDecision(side, d, false);
			}
			this.queue[side] = keep;
		}
	}

	private applyDecision(side: Side, d: Decision, fromReplay: boolean) {
		const t = this.teams[side];
		const record = (rejected?: string) => this.applied.push({ tick: this.tick, side, decision: d, ...(rejected ? { rejected } : {}) });
		if (d.type === 'mentality' || d.type === 'style') {
			if (d.type === 'mentality') t.tactic.mentality = d.value;
			else t.tactic.style = d.value;
			t.params = tacticalParams(t.tactic.mentality, t.tactic.style);
			record();
			this.emit('tactic', { side, data: { kind: d.type, value: d.value } });
			return;
		}
		if (d.type === 'formation') {
			const active = this.onPitch(side).map((s) => s.id);
			if (d.lineup.length !== FORMATIONS[d.value].length || [...d.lineup].sort().join() !== [...active].sort().join()) {
				// Com expulsões, mantemos os mesmos 10/9 e só trocamos o desenho.
				if (active.length === 11 || !d.lineup.every((id) => active.includes(id))) return record('Escalação não corresponde aos atletas em campo');
			}
			t.tactic.formation = d.value;
			d.lineup.forEach((id, slot) => {
				const st = this.states.get(id);
				if (st) st.slot = slot;
			});
			t.tactic.lineup = [...d.lineup];
			record();
			this.emit('tactic', { side, data: { kind: 'formation', value: d.value } });
			return;
		}
		// Substituição
		const out = this.states.get(d.outId);
		const incoming = t.byId.get(d.inId);
		const halfTime = this.phase === 'half_time';
		let reason: string | null = null;
		if (!out || out.side !== side || !out.onPitch) reason = 'Jogador que sai não está em campo';
		else if (!incoming || !t.tactic.bench.includes(d.inId) || t.usedBench.has(d.inId)) reason = 'Reserva indisponível';
		else if (t.subsUsed >= this.rules.maxSubs) reason = 'Limite de substituições atingido';
		else if (!halfTime && !t.windows.includes(this.tick) && t.windows.length >= this.rules.maxWindows) reason = 'Janelas de substituição esgotadas';
		if (reason) {
			if (!fromReplay) record(reason);
			return;
		}
		if (!halfTime && !t.windows.includes(this.tick)) t.windows.push(this.tick);
		t.subsUsed++;
		t.usedBench.add(d.inId);
		out!.onPitch = false;
		out!.minuteOut = this.tick;
		const slot = out!.slot;
		this.states.set(d.inId, {
			id: d.inId, side, slot, x: out!.x, y: out!.y, px: out!.x, py: out!.y, condition: incoming!.condition, onPitch: true,
			sentOff: false, injured: false, yellow: 0, minutesIn: this.tick, minuteOut: null
		});
		t.tactic.lineup[slot] = d.inId;
		if (t.gkId === d.outId) t.gkId = d.inId;
		if (this.ball.owner === d.outId) this.ball.owner = d.inId;
		this.stoppageSeconds += 30;
		record();
		this.emit('sub', { side, player: d.inId, other: d.outId });
	}

	/** Treinador automático: substitui lesionados e cansados, ajusta a mentalidade conforme o placar. */
	private aiManager(side: Side) {
		const t = this.teams[side];
		if (this.queue[side].length) return;
		const stopped = this.restart !== null || this.phase === 'half_time';
		if (stopped && t.subsUsed < this.rules.maxSubs) {
			const minute = this.minute;
			const candidates = this.onPitch(side)
				.filter((s) => s.injured || (minute >= 58 && s.condition < 66) || (minute >= 70 && s.condition < 72 && s.yellow > 0))
				.sort((a, b) => Number(b.injured) - Number(a.injured) || a.condition - b.condition);
			const newWindow = !t.windows.includes(this.tick) && this.phase !== 'half_time';
			const canOpen = !newWindow || t.windows.length < this.rules.maxWindows;
			if (candidates.length && canOpen) {
				const maxNow = candidates[0].injured ? 2 : t.windows.length >= this.rules.maxWindows - 1 ? 3 : 2;
				for (const out of candidates.slice(0, Math.min(maxNow, this.rules.maxSubs - t.subsUsed))) {
					const slotPos = FORMATIONS[t.tactic.formation][out.slot]?.position ?? this.player(out.id)!.position;
					const best = this.bench(side)
						.filter((p) => !this.queue[side].some((q) => q.type === 'sub' && q.inId === p.id))
						.sort((a, b) => fitScore(b, slotPos) - fitScore(a, slotPos))[0];
					if (best) this.queue[side].push({ type: 'sub', outId: out.id, inId: best.id });
				}
			}
		}
		// Ajuste de mentalidade no fim do jogo (no máximo uma vez por fase do placar).
		if (this.half === 2 && this.tick % 60 === 0) {
			const diff = this.score[side] - this.score[OTHER[side]];
			const minute = this.minute;
			if (minute >= 70 && diff < 0 && diff >= -2 && t.tactic.mentality !== 'ofensiva') this.queue[side].push({ type: 'mentality', value: 'ofensiva' });
			else if (minute >= 80 && diff > 0 && t.tactic.mentality === 'ofensiva') this.queue[side].push({ type: 'mentality', value: 'equilibrada' });
		}
	}

	// ──────────────────────────────────────────────── posicionamento

	/** Posição-alvo de um atleta pela formação, fase do jogo e posição da bola. */
	private slotTarget(side: Side, slot: number, inPossession: boolean, ballX: number, ballY: number): [number, number] {
		const t = this.teams[side];
		const formation = FORMATIONS[t.tactic.formation];
		const s = formation[Math.min(slot, formation.length - 1)];
		const p = t.params;
		const [bx, by] = toRel(side, ballX, ballY);
		const depth = (100 - s.y) / 100; // 0 = próprio gol, 1 = ataque
		const lateral = (s.x / 100) * PITCH.width;
		let ax: number;
		let ay: number;
		if (s.position === 'GOL') {
			ax = Math.max(3, Math.min(16, 4 + (bx - 30) * 0.12));
			ay = PITCH.width / 2 + (by - PITCH.width / 2) * 0.15;
			return toAbs(side, ax, ay);
		}
		if (inPossession) {
			const line = clamp(p.defLine + 10 + (bx - 52) * 0.4, 20, 64);
			const span = Math.min(p.blockLength + 14, 98 - line);
			ax = line + ((depth - 0.24) / 0.6) * span;
			if ((s.position === 'LD' || s.position === 'LE') && bx > 45) ax += 8 * p.support + 4;
			ay = PITCH.width / 2 + (lateral - PITCH.width / 2) * p.width;
			ay += (by - PITCH.width / 2) * 0.12;
		} else {
			let line = clamp(p.defLine + (bx - 52) * 0.28, 11, 52);
			line = Math.min(line, Math.max(8, bx - 4));
			// Bola perto da própria área: o bloco se compacta (meio-campo protege a entrada da área).
			const span = bx < 40 ? p.blockLength * (0.62 + (bx / 40) * 0.38) / Math.sqrt(p.boxDefense) : p.blockLength;
			ax = line + ((depth - 0.24) / 0.6) * span;
			ax = Math.min(ax, Math.max(line + 4, bx + 6));
			ay = PITCH.width / 2 + (lateral - PITCH.width / 2) * 0.72 + (by - PITCH.width / 2) * 0.32;
		}
		[ax, ay] = clampToPitch(ax, ay);
		return toAbs(side, ax, ay);
	}

	/** Linha de impedimento (relativa ao lado que ataca): penúltimo defensor ou a bola. */
	private offsideLine(attacking: Side): number {
		const defenders = this.onPitch(OTHER[attacking])
			.map((s) => toRel(attacking, s.x, s.y)[0])
			.sort((a, b) => b - a);
		const second = defenders[1] ?? HALF_LENGTH;
		const [bx] = toRel(attacking, this.ball.x, this.ball.y);
		return Math.max(second, bx, HALF_LENGTH);
	}

	private movePlayers() {
		const ownerState = this.ball.owner ? this.states.get(this.ball.owner)! : null;
		const posSide: Side | null = ownerState?.side ?? (this.ball.flight ? (this.lastTouch?.side ?? null) : null);
		const focusX = this.ball.flight ? this.ball.flight.toX : this.ball.x;
		const focusY = this.ball.flight ? this.ball.flight.toY : this.ball.y;
		const pressers = new Set<string>();
		if (ownerState && this.restart === null) {
			const def = OTHER[ownerState.side];
			const p = this.teams[def].params;
			const near = this.onPitch(def)
				.filter((s) => s.id !== this.teams[def].gkId)
				.map((s) => ({ s, d: dist(s.x, s.y, ownerState.x, ownerState.y) }))
				.sort((a, b) => a.d - b.d);
			// Perto da própria área, a defesa sempre combate o portador (contenção).
			const [cax] = toRel(ownerState.side, ownerState.x, ownerState.y);
			const danger = cax > 68 ? 2 : 0;
			near.forEach((n, i) => {
				if (i === 0 && n.d < Math.max(p.pressDistance, 12)) pressers.add(n.s.id);
				else if (i < p.pressers && n.d < p.pressDistance) pressers.add(n.s.id);
				else if (i < 1 + danger && n.d < 14) pressers.add(n.s.id);
			});
		}
		const lines: Record<Side, number> = { home: this.offsideLine('home'), away: this.offsideLine('away') };
		const marks = posSide && this.restart === null ? this.assignMarking(OTHER[posSide], pressers, focusX, focusY) : new Map<string, [number, number]>();
		for (const s of this.states.values()) {
			if (!s.onPitch || s.id === this.ball.owner) continue;
			const mine = posSide === s.side;
			let [tx, ty] = this.slotTarget(s.side, s.slot, mine, focusX, focusY);
			const info = this.player(s.id)!;
			if (pressers.has(s.id) && ownerState) {
				const [ox, oy] = toRel(s.side, ownerState.x, ownerState.y);
				[tx, ty] = toAbs(s.side, ox - 1.2, oy);
			} else if (mine && this.restart === null && s.id !== this.teams[s.side].gkId) {
				// Em posse, ninguém fica parado em impedimento; atacantes rápidos esticam até a linha.
				const [rx, ry] = toRel(s.side, tx, ty);
				const line = lines[s.side];
				const attacker = info.position === 'ATA' || info.position === 'PD' || info.position === 'PE' || info.position === 'MEI';
				const depthDrive = attacker && (info.attributes.velocidade + info.attributes.antecipacao) / 2 > 68 ? 6 : 0;
				const risk = Math.max(0.01, 0.1 - info.attributes.antecipacao * 0.0009 - info.attributes.decisoes * 0.0004);
				const overshoot = attacker && this.rng.next() < risk ? 1 : -1.2;
				[tx, ty] = toAbs(s.side, Math.min(rx + depthDrive, line + overshoot), ry);
			} else if (marks.has(s.id)) {
				[tx, ty] = marks.get(s.id)!;
			} else if (!mine && this.ball.flight && this.ball.flight.target === null) {
				// Bola dividida: os mais próximos disputam.
				const d = dist(s.x, s.y, focusX, focusY);
				if (d < 12) [tx, ty] = [focusX, focusY];
			}
			if (this.restart) {
				const r = this.restart;
				if (r.type === 'corner' || (r.type === 'free_kick' && inBox(...toRel(r.side, r.x, r.y)))) {
					[tx, ty] = this.setPieceTarget(s, r);
				}
			}
			const speed = this.speed(s);
			const d = dist(s.x, s.y, tx, ty);
			if (d > 0.05) {
				const k = Math.min(1, speed / d);
				s.x += (tx - s.x) * k;
				s.y += (ty - s.y) * k;
			}
		}
		// Portador conduz quando há espaço à frente.
		if (ownerState && this.restart === null && this.tick < this.actAt) this.carry(ownerState);
		if (ownerState) {
			this.ball.x = ownerState.x;
			this.ball.y = ownerState.y;
		}
	}

	/**
	 * Marcação: cada defensor (sem a bola) acompanha o adversário mais próximo da sua zona,
	 * posicionado entre ele e o gol. Quem tem bom posicionamento/antecipação marca mais justo.
	 */
	private assignMarking(defSide: Side, pressers: Set<string>, ballX: number, ballY: number): Map<string, [number, number]> {
		const out = new Map<string, [number, number]>();
		const attSide = OTHER[defSide];
		const attackers = this.onPitch(attSide).filter((a) => a.id !== this.ball.owner && a.id !== this.teams[attSide].gkId);
		const taken = new Set<string>();
		const defenders = this.onPitch(defSide)
			.filter((d) => d.id !== this.teams[defSide].gkId && !pressers.has(d.id))
			.map((d) => ({ d, home: this.slotTarget(defSide, d.slot, false, ballX, ballY) }));
		const pairs: Array<{ d: PlayerState; a: PlayerState; dist: number }> = [];
		for (const { d, home } of defenders) {
			for (const a of attackers) {
				const dd = dist(home[0], home[1], a.x, a.y);
				const [arx] = toRel(attSide, a.x, a.y);
				if (dd < 11 && arx > 45) pairs.push({ d, a, dist: dd });
			}
		}
		pairs.sort((x, y) => x.dist - y.dist);
		const used = new Set<string>();
		for (const { d, a } of pairs) {
			if (used.has(d.id) || taken.has(a.id)) continue;
			used.add(d.id);
			taken.add(a.id);
			const at = this.player(d.id)!.attributes;
			const tight = 0.5 + (at.posicionamento + at.antecipacao) / 400; // 0.8–0.95
			const [ax, ay] = toRel(defSide, a.x, a.y);
			const [gx, gy] = [0, PITCH.width / 2];
			const k = 1.6 / Math.max(1.6, Math.hypot(ax - gx, ay - gy));
			const mx = ax + (gx - ax) * k;
			const my = ay + (gy - ay) * k;
			const [hx, hy] = toRel(defSide, ...this.slotTarget(defSide, d.slot, false, ballX, ballY));
			out.set(d.id, toAbs(defSide, hx + (mx - hx) * tight, hy + (my - hy) * tight));
		}
		return out;
	}

	private setPieceTarget(s: PlayerState, r: Restart): [number, number] {
		const info = this.player(s.id)!;
		const attacking = s.side === r.side;
		const [rx] = toRel(r.side, r.x, r.y);
		if (rx < 70) return [s.x, s.y];
		const aerial = info.attributes.cabeceio + info.attributes.impulsao;
		if (attacking) {
			if (s.id === this.teams[s.side].gkId) return [s.x, s.y];
			if (aerial > 120 || ['ZAG', 'ATA'].includes(info.position)) {
				const off = ((s.slot * 37) % 14) - 7;
				return toAbs(r.side, PITCH.length - 9 + (s.slot % 3), PITCH.width / 2 + off);
			}
			return toAbs(r.side, PITCH.length - 24, PITCH.width / 2 + ((s.slot * 23) % 20) - 10);
		}
		if (s.id === this.teams[s.side].gkId) return toAbs(r.side, PITCH.length - 1.5, PITCH.width / 2);
		const off = ((s.slot * 41) % 18) - 9;
		return toAbs(r.side, PITCH.length - 7, PITCH.width / 2 + off);
	}

	private speed(s: PlayerState): number {
		const a = this.player(s.id)!.attributes;
		const base = 3.0 + a.velocidade * 0.042 + a.aceleracao * 0.01;
		const t = this.teams[s.side];
		const counter = this.tick < this.counterUntil[s.side] ? 1.1 : t.params.counterBoost && this.tick - t.regainTick < 8 ? 1 + 0.12 * t.params.counterBoost : 1;
		const injured = s.injured ? 0.6 : 1;
		return base * this.physFactor(s) * counter * injured * (1 + (this.homeBoost(s.side) - 1) * 0.5);
	}

	private physFactor(s: PlayerState): number {
		return 0.68 + 0.32 * (s.condition / 100);
	}

	private techFactor(s: PlayerState): number {
		return 0.86 + 0.14 * (s.condition / 100);
	}

	private homeBoost(side: Side): number {
		return (this.rules.homeAdvantage && side === 'home' ? 1.07 : 1) * this.form[side];
	}

	private fatigue() {
		if (this.restart !== null && this.tick % 2 === 1) return; // bola parada cansa menos
		for (const s of this.states.values()) {
			if (!s.onPitch) continue;
			const a = this.player(s.id)!.attributes;
			const t = this.teams[s.side];
			const perMinute = 0.13 + (100 - a.resistencia) * 0.0024 + t.params.fatigueCost * 3 + (s.id === this.ball.owner ? 0.05 : 0);
			s.condition = Math.max(5, s.condition - perMinute / 60);
		}
	}

	// ──────────────────────────────────────────────── bola em jogo

	private live() {
		const flight = this.ball.flight;
		if (flight) {
			this.ball.x += (flight.toX - this.ball.x) / Math.max(1, flight.arrive - this.tick);
			this.ball.y += (flight.toY - this.ball.y) / Math.max(1, flight.arrive - this.tick);
			if (this.tick >= flight.arrive) this.landFlight();
			return;
		}
		if (!this.ball.owner) {
			this.contestLooseBall(this.ball.x, this.ball.y);
			return;
		}
		const owner = this.states.get(this.ball.owner)!;
		if (this.tick >= this.actAt) this.act(owner);
		else this.pressureDuel(owner);
	}

	private giveBall(id: string, reactionTicks?: number) {
		const s = this.states.get(id)!;
		const previous = this.lastTouch?.side;
		this.ball.owner = id;
		this.ball.flight = null;
		this.ball.x = s.x;
		this.ball.y = s.y;
		if (previous && previous !== s.side) {
			this.teams[s.side].regainTick = this.tick;
			// Contra-ataque: quantos adversários ficaram à frente da bola (fora da jogada)?
			const [bx] = toRel(s.side, s.x, s.y);
			const committed = this.onPitch(OTHER[s.side]).filter((o) => toRel(s.side, o.x, o.y)[0] < bx - 3).length;
			if (committed >= 5 && bx < 75) this.counterUntil[s.side] = this.tick + 9;
		}
		this.lastTouch = { side: s.side, player: id };
		const a = this.player(id)!.attributes;
		const t = this.teams[s.side].params;
		const pressured = this.nearestOpponentDistance(s) < 4;
		const tempo = t.tempo * (1.25 - a.decisoes / 220) * (pressured ? 0.6 : 1);
		const counter = this.tick < this.counterUntil[s.side] ? 0.6 : t.counterBoost && this.tick - this.teams[s.side].regainTick < 6 ? 1 - 0.3 * t.counterBoost : 1;
		this.actAt = this.tick + Math.max(1, reactionTicks ?? Math.round(tempo * counter + this.rng.next() * 1.2));
	}

	private nearestOpponentDistance(s: PlayerState): number {
		let best = Infinity;
		for (const o of this.states.values()) {
			if (o.onPitch && o.side !== s.side) best = Math.min(best, dist(s.x, s.y, o.x, o.y));
		}
		return best;
	}

	/** Conduz a bola para frente quando há espaço; protege quando pressionado. */
	private carry(owner: PlayerState) {
		const [ax, ay] = toRel(owner.side, owner.x, owner.y);
		const nearest = this.nearestOpponentDistance(owner);
		if (nearest < 3.5) return;
		// Defensor posicionado à frente bloqueia a condução: é preciso passar ou driblar.
		for (const o of this.onPitch(OTHER[owner.side])) {
			const [ox, oy] = toRel(owner.side, o.x, o.y);
			if (ox > ax && ox - ax < 7 && Math.abs(oy - ay) < 3.5) return;
		}
		const a = this.player(owner.id)!.attributes;
		const step = (2.2 + a.velocidade * 0.03 + a.drible * 0.01) * this.physFactor(owner);
		const targetY = ay + (PITCH.width / 2 - ay) * 0.06;
		const [nx, ny] = toAbs(owner.side, Math.min(PITCH.length - 3, ax + step), targetY);
		owner.x = nx;
		owner.y = ny;
	}

	/** Defensor colado tenta o desarme antes de o portador agir. */
	private pressureDuel(owner: PlayerState) {
		const t = this.teams[OTHER[owner.side]];
		for (const d of this.onPitch(OTHER[owner.side])) {
			if (d.id === t.gkId) continue;
			if (dist(d.x, d.y, owner.x, owner.y) > 1.9) continue;
			const intent = 0.16 + t.params.pressers * 0.04;
			if (this.rng.next() > intent) continue;
			this.tackleContest(d, owner, false);
			return;
		}
	}

	/** Disputa de desarme. Pode terminar em roubada, falta, ou portador mantendo a bola. */
	private tackleContest(def: PlayerState, att: PlayerState, takeOn: boolean): 'won' | 'lost' | 'foul' {
		const da = this.player(def.id)!.attributes;
		const aa = this.player(att.id)!.attributes;
		const defScore = (da.desarme * 0.55 + da.posicionamento * 0.2 + da.forca * 0.15 + da.antecipacao * 0.1) * this.physFactor(def) * this.homeBoost(def.side);
		const attScore = (aa.drible * 0.45 + aa.agilidade * 0.2 + aa.forca * 0.15 + aa.dominio * 0.2) * this.techFactor(att) * this.homeBoost(att.side) * (takeOn ? 0.88 : 1.15);
		const pWin = defScore / (defScore + attScore);
		const r = this.rng.next();
		// Quem já tem amarelo entra com mais cuidado.
		// Dentro da própria área o defensor evita o contato (risco de pênalti).
		const inOwnBox = inBox(...toRel(att.side, att.x, att.y));
		const caution = (def.yellow > 0 ? 0.55 : 1) * (inOwnBox ? 0.22 : 1);
		const foulChance = (0.04 + Math.max(0, 62 - da.desarme) / 600 + (1 - def.condition / 100) * 0.06 + (takeOn ? 0.03 : 0)) * caution;
		if (r < foulChance) {
			this.foul(def, att);
			return 'foul';
		}
		if (this.rng.next() < pWin) {
			this.emit('tackle', { side: def.side, player: def.id, other: att.id, x: def.x, y: def.y });
			if (takeOn) this.emit('dribble_fail', { side: att.side, player: att.id, other: def.id });
			this.loss(att);
			this.injuryCheck(att, 0.002);
			if (this.rng.next() < 0.78) this.giveBall(def.id);
			else this.looseBall(def.x, def.y, 5);
			return 'won';
		}
		if (takeOn) {
			this.emit('dribble', { side: att.side, player: att.id, other: def.id, x: att.x, y: att.y });
			const [ax, ay] = toRel(att.side, att.x, att.y);
			[att.x, att.y] = toAbs(att.side, Math.min(PITCH.length - 9, ax + 3.5), ay);
			[def.x, def.y] = toAbs(att.side, ax - 1.5, ay + (this.rng.next() - 0.5) * 3);
		}
		return 'lost';
	}

	private loss(s: PlayerState) {
		this.recentLosses.push({ player: s.id, side: s.side, tick: this.tick });
		if (this.recentLosses.length > 12) this.recentLosses.shift();
	}

	private injuryCheck(s: PlayerState, base: number) {
		if (s.injured || !s.onPitch) return;
		const p = base * (1.6 - s.condition / 100) * (1.3 - this.player(s.id)!.attributes.forca / 250);
		if (this.rng.next() < p) {
			s.injured = true;
			this.stoppageSeconds += 60;
			this.emit('injury', { side: s.side, player: s.id, x: s.x, y: s.y });
		}
	}

	// ──────────────────────────────────────────────── decisões do portador

	private act(owner: PlayerState) {
		const side = owner.side;
		const info = this.player(owner.id)!;
		const a = info.attributes;
		const p = this.teams[side].params;
		const [ax, ay] = toRel(side, owner.x, owner.y);
		const mates = this.onPitch(side).filter((s) => s.id !== owner.id);
		const opps = this.onPitch(OTHER[side]);
		const oppBox = this.teams[OTHER[side]].params.boxDefense;
		const pressure = opps.filter((o) => dist(o.x, o.y, owner.x, owner.y) < (ax > 80 ? 3 * oppBox : 3)).length;
		const diff = this.score[side] - this.score[OTHER[side]];
		const late = this.half === 2 && this.tick - this.halfEnd > 30 * 60;

		type Option = { u: number; run: () => void };
		const options: Option[] = [];

		// Finalização
		const xg = baseXg(ax, ay) * Math.pow(0.72, Math.min(2, pressure));
		const goalDist = Math.hypot(PITCH.length - ax, PITCH.width / 2 - ay);
		if (ax > 66) {
			let threshold = p.shotThreshold * (1.15 - a.compostura / 300);
			if (late && diff < 0) threshold *= 0.75;
			let u = xg >= threshold ? 0.26 + xg * 5 : xg >= threshold * 0.6 ? 0.04 + xg * 2 : xg;
			// Chute de fora da área: arma de quem finaliza bem e tem espaço.
			if (goalDist > 16.5 && goalDist < 28 && pressure === 0) u = Math.max(u, 0.04 + a.finalizacao / 330 + a.tecnica / 900 - (goalDist - 16.5) * 0.02);
			options.push({ u, run: () => this.shoot(owner, false) });
		}

		// Passes
		const visionRange = 22 + a.visao * 0.42;
		const line = this.offsideLine(side);
		for (const m of mates) {
			const d = dist(owner.x, owner.y, m.x, m.y);
			if (d < 4 || d > visionRange) continue;
			const mi = this.player(m.id)!;
			let [tx, ty] = toRel(side, m.x, m.y);
			// Impedimento: posição do recebedor NO MOMENTO do passe.
			const offside = tx > line + 0.3 && tx > HALF_LENGTH;
			// Passe em profundidade: explora o espaço atrás de uma linha defensiva alta.
			const runner = (mi.position === 'ATA' || mi.position === 'PD' || mi.position === 'PE' || mi.position === 'MEI') && !offside;
			const spaceBehind = PITCH.length - 6 - line;
			const inCounter = this.tick < this.counterUntil[side];
			const through = runner && tx > line - 7 && spaceBehind > (inCounter ? 8 : 16) && a.visao > 50;
			let throughFactor = 1;
			if (through) {
				const defPace = this.onPitch(OTHER[side]).reduce((acc, o) => acc + this.player(o.id)!.attributes.velocidade, 0) / 11;
				tx = Math.min(PITCH.length - 9, line + Math.min(20, spaceBehind * 0.55));
				throughFactor = clamp(0.22 + (a.visao + a.passe) / 650 + (mi.attributes.velocidade - defPace) / 110 + (inCounter ? 0.15 : 0), 0.1, 0.7);
			}
			// Leitura do passe: quem tem boa visão/decisão quase nunca serve um atleta impedido.
			if (offside && this.rng.next() > 0.12 - a.decisoes / 1500) continue;
			const [absX, absY] = toAbs(side, tx, ty);
			const prob = through ? clamp(throughFactor * (0.8 + a.passe / 500), 0.15, 0.9) : this.passSuccess(owner, absX, absY, opps, d);
			const progress = tx - ax;
			const recvXg = baseXg(tx, ty);
			const space = Math.min(8, this.nearestOpponentDistanceTo(OTHER[side], absX, absY));
			const pw = p.progressWeight * (this.tick < this.counterUntil[side] ? 1.4 : 1);
			let u = Math.pow(prob, 1.2 * p.safetyWeight) * (0.4 + Math.max(0, progress) * 0.032 * pw + recvXg * 5 + space * 0.025);
			if (d < 18) u += 0.12 * p.shortBias;
			if (d > 30) u += 0.12 * p.longBias;
			if (Math.abs(ty - PITCH.width / 2) > 22) u += 0.1 * p.wideBias;
			if (progress < -6) u -= 0.08 * p.progressWeight;
			if (late && diff > 0 && progress < 0) u += 0.05;
			// Custo de perder a bola: muito maior perto do próprio gol.
			u -= (1 - prob) * (ax < 35 ? 0.9 : ax < 55 ? 0.35 : 0.08);
			const runTicks = through ? Math.ceil(dist(m.x, m.y, absX, absY) / Math.max(4, this.speed(m))) : 0;
			options.push({ u, run: () => this.pass(owner, m, absX, absY, prob, offside, d, runTicks) });
		}

		// Cruzamento
		if (ax > 76 && Math.abs(ay - PITCH.width / 2) > 15) {
			const targets = mates.filter((m) => inBox(...toRel(side, m.x, m.y))).length;
			const u = (a.cruzamento / 100) * (targets ? 0.55 + targets * 0.08 : 0.1) * (1 + p.wideBias * 0.5);
			options.push({ u, run: () => this.cross(owner) });
		}

		// Drible / condução
		const ahead = opps
			.map((o) => ({ o, rel: toRel(side, o.x, o.y) }))
			.filter(({ rel }) => rel[0] > ax && rel[0] < ax + 6 && Math.abs(rel[1] - ay) < 4)
			.sort((x, y) => x.rel[0] - y.rel[0])[0];
		if (ahead) {
			const skill = (a.drible + a.agilidade + a.aceleracao) / 3;
			const crowd = opps.filter((o) => dist(o.x, o.y, owner.x, owner.y) < 7).length;
			const u = (skill / 100) * 0.6 * (ax > 60 ? 1.1 : 0.8) * (info.position === 'ZAG' || info.position === 'GOL' ? 0.3 : 1) * (crowd >= 2 ? 0.65 : 1);
			options.push({ u, run: () => this.takeOn(owner, this.states.get(ahead.o.id)!) });
		} else if (ax < PITCH.length - 18) {
			options.push({ u: 0.45 + (a.drible / 400), run: () => this.carryAction(owner) });
		}

		// Afastar (sob pressão na própria área)
		if (ax < 35 && this.nearestOpponentDistance(owner) < 5) {
			options.push({ u: 0.32 + (ax < 20 ? 0.15 : 0) + (p.safetyWeight - 1) * 0.3 + (60 - a.compostura) / 250, run: () => this.clear(owner) });
		}

		if (!options.length) {
			this.carryAction(owner);
			return;
		}
		// Escolha com ruído controlado pelas "decisões": melhores jogadores escolhem melhor.
		const temp = Math.max(0.05, 0.22 - a.decisoes / 650);
		const max = Math.max(...options.map((o) => o.u));
		const weights = options.map((o) => Math.exp((o.u - max) / temp));
		const total = weights.reduce((s, w) => s + w, 0);
		let r = this.rng.next() * total;
		for (let i = 0; i < options.length; i++) {
			r -= weights[i];
			if (r <= 0) return options[i].run();
		}
		options[options.length - 1].run();
	}

	private nearestOpponentDistanceTo(side: Side, x: number, y: number): number {
		let best = Infinity;
		for (const o of this.states.values()) if (o.onPitch && o.side === side) best = Math.min(best, dist(x, y, o.x, o.y));
		return best;
	}

	private passSuccess(owner: PlayerState, tx: number, ty: number, opps: PlayerState[], d: number): number {
		const a = this.player(owner.id)!.attributes;
		let base = d <= 30 ? 0.975 - d * 0.0045 : 0.84 - (d - 30) * 0.011;
		base *= 0.79 + a.passe / 360 + a.tecnica / 1100 + a.visao / 2000;
		base *= this.techFactor(owner) * this.homeBoost(owner.side) * this.teams[owner.side].params.passAccuracy;
		let threat = 0;
		for (const o of opps) {
			const { d: seg, t } = segmentDistance(o.x, o.y, owner.x, owner.y, tx, ty);
			const reach = 1.3 + this.player(o.id)!.attributes.antecipacao / 80;
			if (seg < reach && t > 0.12) threat += (1 - seg / reach) * (0.22 + 0.18 * t);
		}
		const pressure = this.nearestOpponentDistance(owner) < 2.5 ? 0.92 : 1;
		// Área congestionada: cada defensor perto do ponto de recepção dificulta o passe.
		const [trx, try_] = toRel(owner.side, tx, ty);
		if (trx > 80) {
			for (const o of opps) if (dist(o.x, o.y, tx, ty) < 4.5) threat += 0.1;
			void try_;
		}
		return clamp(base * pressure * (1 - Math.min(0.85, threat)), 0.05, 0.985);
	}

	private pass(owner: PlayerState, mate: PlayerState, tx: number, ty: number, prob: number, offside: boolean, d: number, runTicks = 0) {
		const side = owner.side;
		const speed = d > 30 ? 21 : 15;
		// Em profundidade, a bola só é dominada quando o atacante alcança o ponto.
		const arrive = this.tick + Math.max(1, Math.round(d / speed), runTicks);
		this.ball.owner = null;
		const [ctx, cty] = clampToPitch(tx, ty);
		if (offside) {
			this.ball.flight = { toX: ctx, toY: cty, arrive, target: mate.id, outcome: { kind: 'offside' } };
			this.pendingPass = { from: owner.id, to: mate.id, side };
			return;
		}
		if (this.rng.next() < prob) {
			this.ball.flight = { toX: ctx, toY: cty, arrive, target: mate.id, outcome: { kind: 'receive' } };
		} else {
			// Falhou: interceptado, para fora ou bola dividida.
			const opps = this.onPitch(OTHER[side]);
			let interceptor: PlayerState | null = null;
			let best = Infinity;
			for (const o of opps) {
				const { d: seg } = segmentDistance(o.x, o.y, owner.x, owner.y, ctx, cty);
				if (seg < best) {
					best = seg;
					interceptor = o;
				}
			}
			const overshoot = this.rng.next() < 0.2;
			if (interceptor && best < 6 && !overshoot) {
				this.ball.flight = { toX: interceptor.x, toY: interceptor.y, arrive, target: interceptor.id, outcome: { kind: 'intercept', by: interceptor.id } };
			} else {
				const [rx, ry] = toRel(side, ctx, cty);
				const errX = rx + (this.rng.next() - 0.3) * 10;
				const errY = ry + (this.rng.next() - 0.5) * 14;
				if (errX >= PITCH.length) {
					this.ball.flight = { toX: toAbs(side, PITCH.length, errY)[0], toY: toAbs(side, PITCH.length, errY)[1], arrive, target: null, outcome: { kind: 'out', restart: 'goal_kick', side: OTHER[side] } };
				} else if (errY <= 0 || errY >= PITCH.width) {
					const [ox, oy] = toAbs(side, errX, errY <= 0 ? 0 : PITCH.width);
					this.ball.flight = { toX: ox, toY: oy, arrive, target: null, outcome: { kind: 'out', restart: 'throw_in', side: OTHER[side] } };
				} else {
					const [lx, ly] = toAbs(side, errX, errY);
					this.ball.flight = { toX: lx, toY: ly, arrive, target: null, outcome: { kind: 'loose' } };
				}
			}
			this.loss(owner);
		}
		this.pendingPass = { from: owner.id, to: mate.id, side };
	}

	private pendingPass: { from: string; to: string; side: Side } | null = null;

	private landFlight() {
		const f = this.ball.flight!;
		const pp = this.pendingPass;
		this.pendingPass = null;
		this.ball.x = f.toX;
		this.ball.y = f.toY;
		this.ball.flight = null;
		switch (f.outcome.kind) {
			case 'receive': {
				const r = this.states.get(f.target!)!;
				if (!r.onPitch) return this.looseBall(f.toX, f.toY, 3);
				r.x = f.toX;
				r.y = f.toY;
				if (pp) {
					this.emit('pass', { side: pp.side, player: pp.from, other: pp.to });
					this.lastPass = { from: pp.from, to: pp.to, tick: this.tick, side: pp.side };
				}
				// Recepção marcada na entrada/dentro da área: duelo de domínio × marcação.
				const ra = this.player(r.id)!.attributes;
				const [rrx] = toRel(r.side, r.x, r.y);
				if (rrx > 78) {
					for (const d of this.onPitch(OTHER[r.side])) {
						if (d.id === this.teams[d.side].gkId || dist(d.x, d.y, r.x, r.y) > 3) continue;
						const da = this.player(d.id)!.attributes;
						const pWin = clamp((0.3 + (da.posicionamento + da.desarme + da.antecipacao) / 3 / 300 - (ra.dominio + ra.forca + ra.agilidade) / 3 / 380) * this.teams[d.side].params.boxDefense, 0.1, 0.6);
						if (this.rng.next() < pWin) {
							if (pp) this.emit('pass', { side: pp.side, player: pp.from, other: pp.to });
							this.emit('interception', { side: d.side, player: d.id, x: r.x, y: r.y, data: { marking: true } });
							this.loss(r);
							return this.giveBall(d.id);
						}
					}
				}
				const close = this.nearestOpponentDistance(r);
				const failControl = close < 1.5 ? Math.max(0.02, 0.12 - ra.dominio / 800) : 0.01;
				if (this.rng.next() < failControl) {
					this.loss(r);
					return this.looseBall(f.toX, f.toY, 3);
				}
				return this.giveBall(r.id);
			}
			case 'intercept': {
				const by = this.states.get(f.outcome.by)!;
				const [byx] = toRel(by.side, by.x, by.y);
				if (byx < 14 && pp && this.rng.next() < 0.35) {
					// desvio do defensor para a linha de fundo
					this.emit('pass_fail', { side: pp.side, player: pp.from, other: pp.to });
					this.emit('interception', { side: by.side, player: by.id, x: by.x, y: by.y, data: { deflection: true } });
					this.lastTouch = { side: by.side, player: by.id };
					return this.outOfPlay('corner', pp.side, ...this.cornerSpot(pp.side, by.y));
				}
				if (pp) {
					this.emit('pass_fail', { side: pp.side, player: pp.from, other: pp.to });
				}
				this.emit('interception', { side: by.side, player: by.id, x: by.x, y: by.y });
				return this.giveBall(by.id);
			}
			case 'loose':
				if (pp) this.emit('pass_fail', { side: pp.side, player: pp.from, other: pp.to });
				return this.contestLooseBall(f.toX, f.toY);
			case 'out':
				if (pp) this.emit('pass_fail', { side: pp.side, player: pp.from, other: pp.to });
				return this.outOfPlay(f.outcome.restart, f.outcome.side, f.toX, f.toY);
			case 'offside': {
				const off = this.states.get(f.target!)!;
				this.emit('offside', { side: off.side, player: off.id, x: off.x, y: off.y });
				if (pp) this.emit('pass_fail', { side: pp.side, player: pp.from, other: pp.to, data: { offside: true } });
				return this.setRestart({ type: 'free_kick', side: OTHER[off.side], x: off.x, y: off.y }, 12);
			}
		}
	}

	private looseBall(x: number, y: number, spread: number) {
		const [cx, cy] = clampToPitch(x + (this.rng.next() - 0.5) * spread, y + (this.rng.next() - 0.5) * spread);
		this.ball.owner = null;
		this.ball.flight = { toX: cx, toY: cy, arrive: this.tick + 1, target: null, outcome: { kind: 'loose' } };
	}

	/** Bola dividida: vence quem chega antes, ponderado por antecipação e força. */
	private contestLooseBall(x: number, y: number) {
		let best: PlayerState | null = null;
		let bestScore = -Infinity;
		for (const s of this.states.values()) {
			if (!s.onPitch || s.injured) continue;
			const d = dist(s.x, s.y, x, y);
			if (d > 14) continue;
			const a = this.player(s.id)!.attributes;
			const score = -d * 1.6 + a.antecipacao * 0.05 + a.forca * 0.02 + this.rng.next() * 3;
			if (score > bestScore) {
				bestScore = score;
				best = s;
			}
		}
		if (!best) {
			// Ninguém perto: a bola rola até o mais próximo.
			let nearest: PlayerState | null = null;
			let nd = Infinity;
			for (const s of this.states.values()) {
				if (!s.onPitch) continue;
				const d = dist(s.x, s.y, x, y);
				if (d < nd) {
					nd = d;
					nearest = s;
				}
			}
			if (!nearest) return;
			best = nearest;
		}
		best.x = x;
		best.y = y;
		if (this.lastTouch && this.lastTouch.side !== best.side) {
			this.emit('interception', { side: best.side, player: best.id, x, y, data: { loose: true } });
		}
		this.giveBall(best.id);
	}

	private takeOn(owner: PlayerState, def: PlayerState) {
		const res = this.tackleContest(def, owner, true);
		if (res === 'lost') this.giveBall(owner.id, 1);
	}

	private carryAction(owner: PlayerState) {
		this.carry(owner);
		this.giveBall(owner.id, 1);
	}

	private clear(owner: PlayerState) {
		const a = this.player(owner.id)!.attributes;
		const [ax, ay] = toRel(owner.side, owner.x, owner.y);
		const tx = Math.min(80, ax + 30 + a.forca * 0.15 + this.rng.next() * 15);
		const ty = clampToPitch(0, ay + (this.rng.next() - 0.5) * 40)[1];
		const [x, y] = toAbs(owner.side, tx, ty);
		this.emit('clearance', { side: owner.side, player: owner.id, x: owner.x, y: owner.y });
		if (ax < 18 && this.rng.next() < 0.12) {
			this.lastTouch = { side: owner.side, player: owner.id };
			return this.outOfPlay('corner', OTHER[owner.side], ...this.cornerSpot(OTHER[owner.side], owner.y));
		}
		this.ball.owner = null;
		this.ball.flight = { toX: x, toY: y, arrive: this.tick + 2, target: null, outcome: { kind: 'loose' } };
		this.lastTouch = { side: owner.side, player: owner.id };
	}

	// ──────────────────────────────────────────────── cruzamentos e jogo aéreo

	private cross(owner: PlayerState) {
		const side = owner.side;
		const a = this.player(owner.id)!.attributes;
		const ok = this.rng.next() < clamp(0.42 + a.cruzamento / 220 - (this.nearestOpponentDistance(owner) < 2 ? 0.15 : 0), 0.2, 0.85) * this.techFactor(owner);
		this.emit('cross', { side, player: owner.id, x: owner.x, y: owner.y, data: { ok } });
		this.ball.owner = null;
		this.lastTouch = { side, player: owner.id };
		if (!ok) {
			this.loss(owner);
			const roll = this.rng.next();
			if (roll < 0.18) return this.outOfPlay('corner', side, ...this.cornerSpot(side, owner.y));
			if (roll < 0.55) {
				const [x, y] = toAbs(side, PITCH.length, PITCH.width / 2 + (this.rng.next() - 0.5) * 30);
				this.ball.flight = { toX: x, toY: y, arrive: this.tick + 2, target: null, outcome: { kind: 'out', restart: 'goal_kick', side: OTHER[side] } };
			} else {
				const [x, y] = toAbs(side, PITCH.length - 10 - this.rng.next() * 10, PITCH.width / 2 + (this.rng.next() - 0.5) * 30);
				this.ball.flight = { toX: x, toY: y, arrive: this.tick + 2, target: null, outcome: { kind: 'loose' } };
			}
			return;
		}
		this.aerialDuel(owner, false);
	}

	/** Disputa aérea na área: atacantes × defensores × goleiro. */
	private aerialDuel(crosser: PlayerState, setPiece: boolean) {
		const side = crosser.side;
		const [tx, ty] = toAbs(side, PITCH.length - 6 - this.rng.next() * 6, PITCH.width / 2 + (this.rng.next() - 0.5) * 16);
		const gk = this.states.get(this.teams[OTHER[side]].gkId);
		if (gk?.onPitch) {
			const ga = this.player(gk.id)!.attributes;
			const [, rely] = toRel(side, tx, ty);
			const claim = clamp(0.12 + (ga.saidas + ga.jogoAereo - 110) / 300 - Math.abs(rely - PITCH.width / 2) / 60, 0.03, 0.4);
			if (this.rng.next() < claim) {
				this.emit('aerial', { side: OTHER[side], player: gk.id, data: { claim: true } });
				this.ball.x = gk.x;
				this.ball.y = gk.y;
				return this.giveBall(gk.id, 3);
			}
		}
		const near = (s: Side) =>
			this.onPitch(s)
				.filter((p) => p.id !== this.teams[s].gkId && dist(p.x, p.y, tx, ty) < 9)
				.sort((a, b) => dist(a.x, a.y, tx, ty) - dist(b.x, b.y, tx, ty))
				.slice(0, 3);
		const attackers = near(side);
		const defenders = near(OTHER[side]);
		const aerial = (p: PlayerState) => {
			const at = this.player(p.id)!.attributes;
			return (at.cabeceio * 0.45 + at.impulsao * 0.3 + at.forca * 0.15 + at.posicionamento * 0.1) * this.physFactor(p) * this.homeBoost(p.side) + this.rng.next() * 18;
		};
		const bestAtt = attackers.map((p) => ({ p, s: aerial(p) })).sort((a, b) => b.s - a.s)[0];
		const bestDef = defenders.map((p) => ({ p, s: aerial(p) + 4 })).sort((a, b) => b.s - a.s)[0];
		if (bestAtt && (!bestDef || bestAtt.s > bestDef.s)) {
			bestAtt.p.x = tx;
			bestAtt.p.y = ty;
			this.emit('aerial', { side, player: bestAtt.p.id, other: bestDef?.p.id });
			this.lastPass = { from: crosser.id, to: bestAtt.p.id, tick: this.tick, side };
			this.ball.x = tx;
			this.ball.y = ty;
			this.ball.owner = bestAtt.p.id;
			return this.shoot(bestAtt.p, true, setPiece);
		}
		if (bestDef) {
			this.emit('aerial', { side: OTHER[side], player: bestDef.p.id, other: bestAtt?.p.id });
			bestDef.p.x = tx;
			bestDef.p.y = ty;
			if (this.rng.next() < 0.3) {
				this.lastTouch = { side: OTHER[side], player: bestDef.p.id };
				return this.outOfPlay('corner', side, ...this.cornerSpot(side, ty));
			}
			this.ball.owner = bestDef.p.id;
			return this.clear(bestDef.p);
		}
		this.looseBall(tx, ty, 6);
	}

	// ──────────────────────────────────────────────── finalizações

	private shoot(shooter: PlayerState, header: boolean, setPiece = false, penalty = false) {
		const side = shooter.side;
		const a = this.player(shooter.id)!.attributes;
		const [ax, ay] = toRel(side, shooter.x, shooter.y);
		const opps = this.onPitch(OTHER[side]);
		const pressure = opps.filter((o) => dist(o.x, o.y, shooter.x, shooter.y) < 4 * Math.sqrt(this.teams[OTHER[side]].params.boxDefense)).length;
		let xg = penalty ? 0.78 : baseXg(ax, ay) * Math.pow(0.68, Math.min(3, pressure)) * (header ? 0.6 : 1) / Math.sqrt(this.teams[OTHER[side]].params.boxDefense);
		xg = Math.min(0.95, xg);
		const skillAttr = header ? a.cabeceio : a.finalizacao;
		const skill = (0.6 + skillAttr / 250 + a.compostura / 500 + (header ? 0 : a.tecnica / 2500)) * this.techFactor(shooter) * this.homeBoost(side);
		const gkState = this.states.get(this.teams[OTHER[side]].gkId);
		const gk = gkState?.onPitch ? this.player(gkState.id)!.attributes : null;
		const gkRating = gk ? gk.reflexos * 0.45 + gk.posicionamentoGol * 0.3 + gk.defesa * 0.15 + gk.agilidade * 0.1 : 25;
		const gkFactor = 1.22 - (gkRating / 100) * 0.36 * (gkState ? this.physFactor(gkState) / 0.98 : 0);
		const pGoal = clamp(xg * skill * gkFactor, 0.005, 0.97);
		const boxDef = this.teams[OTHER[side]].params.boxDefense;
		const blockChance = penalty ? 0 : clamp((0.06 + this.defendersInLane(shooter) * 0.11) * boxDef, 0, 0.45);
		const onTarget = clamp(0.42 + (skillAttr - 60) / 160 + (a.compostura - 60) / 320 - pressure * 0.07 - Math.max(0, PITCH.length - ax - 16) * 0.005, 0.12, 0.8) * this.techFactor(shooter);
		const assist = this.lastPass && this.lastPass.to === shooter.id && this.tick - this.lastPass.tick <= 6 && this.lastPass.side === side ? this.lastPass.from : undefined;
		const data = { xg: Math.round(xg * 1000) / 1000, header, setPiece, penalty, ...(assist ? { keyPassFrom: assist } : {}) };
		this.emit('shot', { side, player: shooter.id, x: shooter.x, y: shooter.y, data });
		this.ball.owner = null;
		this.lastTouch = { side, player: shooter.id };
		this.lastPass = null;

		if (this.rng.next() < blockChance) {
			const blocker = opps.sort((p, q) => dist(p.x, p.y, shooter.x, shooter.y) - dist(q.x, q.y, shooter.x, shooter.y))[0];
			this.emit('shot_blocked', { side: OTHER[side], player: blocker?.id, other: shooter.id });
			if (this.rng.next() < 0.35) return this.outOfPlay('corner', side, ...this.cornerSpot(side, shooter.y));
			return this.looseBall(shooter.x, shooter.y, 10);
		}
		if (this.rng.next() >= onTarget) {
			this.emit('shot_off', { side, player: shooter.id });
			if (penalty) this.emit('penalty_miss', { side, player: shooter.id });
			return this.outOfPlay('goal_kick', OTHER[side], ...toAbs(side, PITCH.length, PITCH.width / 2));
		}
		const pGoalGivenTarget = clamp(pGoal / onTarget / (1 - blockChance), 0.02, 0.96);
		if (this.rng.next() < pGoalGivenTarget) return this.goal(shooter, assist);
		// Defesa do goleiro
		if (gkState) this.emit('shot_saved', { side: OTHER[side], player: gkState.id, other: shooter.id, data: { xg: data.xg } });
		if (penalty) this.emit('penalty_miss', { side, player: shooter.id });
		const hold = gk ? clamp(0.42 + gk.defesa / 280, 0.3, 0.8) : 0.3;
		if (gkState && this.rng.next() < hold) {
			this.ball.x = gkState.x;
			this.ball.y = gkState.y;
			return this.giveBall(gkState.id, 4);
		}
		if (this.rng.next() < 0.45) return this.outOfPlay('corner', side, ...this.cornerSpot(side, shooter.y));
		return this.looseBall(...toAbs(side, PITCH.length - 8, PITCH.width / 2), 10);
	}

	private defendersInLane(shooter: PlayerState): number {
		const [gx, gy] = toAbs(shooter.side, PITCH.length, PITCH.width / 2);
		let n = 0;
		for (const o of this.onPitch(OTHER[shooter.side])) {
			if (o.id === this.teams[o.side].gkId) continue;
			const { d, t } = segmentDistance(o.x, o.y, shooter.x, shooter.y, gx, gy);
			if (d < 1.4 && t > 0.05) n++;
		}
		return Math.min(3, n);
	}

	private cornerSpot(side: Side, nearY: number): [number, number] {
		const [, ry] = toRel(side, 0, nearY);
		return toAbs(side, PITCH.length, ry < PITCH.width / 2 ? 0 : PITCH.width);
	}

	private goal(scorer: PlayerState, assist?: string) {
		const side = scorer.side;
		this.score[side]++;
		const error = this.recentLosses.filter((l) => l.side === OTHER[side] && this.tick - l.tick <= 12).at(-1);
		this.emit('goal', {
			side, player: scorer.id, x: scorer.x, y: scorer.y,
			data: { score: `${this.score.home}-${this.score.away}`, ...(assist ? { assist } : {}), ...(error ? { error: error.player } : {}) },
			...(assist ? { other: assist } : {})
		});
		this.stoppageSeconds += 35;
		this.setRestart({ type: 'kickoff', side: OTHER[side], x: HALF_LENGTH, y: PITCH.width / 2 }, 35);
	}

	// ──────────────────────────────────────────────── faltas e cartões

	private foul(offender: PlayerState, victim: PlayerState) {
		const side = offender.side;
		const [vx, vy] = toRel(victim.side, victim.x, victim.y);
		const counter = this.tick - this.teams[victim.side].regainTick < 8 && vx > 50;
		this.emit('foul', { side, player: offender.id, other: victim.id, x: victim.x, y: victim.y });
		this.injuryCheck(victim, 0.012);
		this.ball.owner = null;
		this.ball.flight = null;
		const da = this.player(offender.id)!.attributes;
		const severity = 0.085 + (counter ? 0.25 : 0) + (inBox(vx, vy) ? 0.05 : 0) + (60 - da.desarme) / 500 + (60 - da.concentracao) / 700;
		const r = this.rng.next();
		if (r < 0.0015 + (counter ? 0.003 : 0)) this.card(offender, 'red');
		else if (r < severity) this.card(offender, 'yellow');
		this.stoppageSeconds += 15;
		if (inBox(vx, vy)) {
			return this.setRestart({ type: 'penalty', side: victim.side, ...absPoint(toAbs(victim.side, PITCH.length - 11, PITCH.width / 2)) }, 45);
		}
		this.setRestart({ type: 'free_kick', side: victim.side, x: victim.x, y: victim.y }, 14 + Math.round(this.rng.next() * 8));
	}

	private card(s: PlayerState, kind: 'yellow' | 'red') {
		if (kind === 'yellow') {
			s.yellow++;
			this.emit('yellow', { side: s.side, player: s.id });
			if (s.yellow < 2) return;
			this.emit('red', { side: s.side, player: s.id, data: { secondYellow: true } });
		} else {
			this.emit('red', { side: s.side, player: s.id });
		}
		s.sentOff = true;
		s.onPitch = false;
		s.minuteOut = this.tick;
		if (this.ball.owner === s.id) this.ball.owner = null;
		const t = this.teams[s.side];
		if (t.gkId === s.id) {
			// Sem goleiro: o atleta com melhor perfil de gol assume a meta.
			const stand = this.onPitch(s.side).sort((a, b) => {
				const aa = this.player(a.id)!.attributes;
				const bb = this.player(b.id)!.attributes;
				return bb.reflexos + bb.jogoAereo - (aa.reflexos + aa.jogoAereo);
			})[0];
			if (stand) {
				t.gkId = stand.id;
				const old = stand.slot;
				stand.slot = 0;
				// Quem estava no slot 0 (expulso) libera a vaga; a posição do substituto fica vaga.
				t.tactic.lineup[0] = stand.id;
				t.tactic.lineup[old] = s.id;
			}
		}
	}

	// ──────────────────────────────────────────────── bola parada

	private outOfPlay(type: 'throw_in' | 'goal_kick' | 'corner', side: Side, x: number, y: number) {
		this.ball.owner = null;
		this.ball.flight = null;
		const delay = type === 'throw_in' ? 6 : type === 'goal_kick' ? 12 : 20;
		this.stoppageSeconds += type === 'corner' ? 6 : 2;
		this.setRestart({ type, side, x, y }, delay + Math.round(this.rng.next() * 6));
	}

	private setRestart(r: Restart, delay: number) {
		const [x, y] = clampToPitch(r.x, r.y);
		this.restart = { ...r, x, y };
		this.ball.x = x;
		this.ball.y = y;
		this.ball.owner = null;
		this.ball.flight = null;
		const t = this.teams[r.side];
		// Time que vence no fim gasta mais tempo nas reposições.
		const wasting = this.half === 2 && this.tick - this.halfEnd > 35 * 60 && this.score[r.side] > this.score[OTHER[r.side]] ? 6 : 0;
		this.deadUntil = this.tick + delay + wasting;
		void t;
		if (r.type !== 'kickoff') this.emit(r.type, { side: r.side, x, y });
	}

	private takeRestart() {
		const r = this.restart!;
		this.restart = null;
		const t = this.teams[r.side];
		const team = this.onPitch(r.side).filter((s) => !s.injured);
		const pick = (score: (p: EnginePlayer, s: PlayerState) => number) =>
			team.sort((a, b) => score(this.player(b.id)!, b) - score(this.player(a.id)!, a))[0];
		let taker: PlayerState;
		switch (r.type) {
			case 'kickoff':
				taker = pick((p, s) => (p.position === 'ATA' ? 100 : 0) - dist(s.x, s.y, r.x, r.y));
				break;
			case 'goal_kick':
				taker = this.states.get(t.gkId) ?? team[0];
				break;
			case 'corner':
				taker = pick((p) => p.attributes.cruzamento);
				break;
			case 'penalty':
				taker = pick((p) => p.attributes.finalizacao + p.attributes.compostura);
				break;
			case 'free_kick': {
				const [rx] = toRel(r.side, r.x, r.y);
				taker = rx > 70 ? pick((p) => p.attributes.cruzamento + p.attributes.tecnica + p.attributes.finalizacao / 2) : pick((_, s) => -dist(s.x, s.y, r.x, r.y));
				break;
			}
			default:
				taker = pick((_, s) => -dist(s.x, s.y, r.x, r.y));
		}
		if (!taker) return;
		taker.x = r.x;
		taker.y = r.y;
		this.ball.x = r.x;
		this.ball.y = r.y;
		this.lastTouch = { side: r.side, player: taker.id };
		this.lastPass = null;
		if (r.type === 'corner') {
			this.ball.owner = taker.id;
			return this.cornerKick(taker);
		}
		if (r.type === 'penalty') {
			this.ball.owner = taker.id;
			return this.shoot(taker, false, true, true);
		}
		if (r.type === 'free_kick') {
			const [rx, ry] = toRel(r.side, r.x, r.y);
			const dGoal = Math.hypot(PITCH.length - rx, PITCH.width / 2 - ry);
			if (dGoal < 30 && Math.abs(ry - PITCH.width / 2) < 18) {
				this.ball.owner = taker.id;
				const a = this.player(taker.id)!.attributes;
				if (this.rng.next() < 0.45 + (a.finalizacao + a.tecnica - 130) / 200) return this.shoot(taker, false, true);
				return this.cross(taker);
			}
			if (rx > 72) {
				this.ball.owner = taker.id;
				return this.cross(taker);
			}
		}
		if (r.type === 'goal_kick') {
			const a = this.player(taker.id)!.attributes;
			const p = t.params;
			const long = this.rng.next() < clamp(0.5 + p.longBias * 0.3 - p.shortBias * 0.3 - (a.reposicao - 60) / 150, 0.1, 0.9);
			if (long) {
				const [tx, ty] = toAbs(r.side, 55 + this.rng.next() * 15, PITCH.width / 2 + (this.rng.next() - 0.5) * 30);
				this.ball.flight = { toX: tx, toY: ty, arrive: this.tick + 3, target: null, outcome: { kind: 'loose' } };
				return;
			}
		}
		this.giveBall(taker.id, 1);
	}

	private cornerKick(taker: PlayerState) {
		this.emit('cross', { side: taker.side, player: taker.id, x: taker.x, y: taker.y, data: { corner: true, ok: true } });
		this.ball.owner = null;
		const a = this.player(taker.id)!.attributes;
		if (this.rng.next() < 0.18 - a.cruzamento / 1000) {
			// Escanteio mal batido
			this.loss(taker);
			return this.looseBall(...toAbs(taker.side, PITCH.length - 18, PITCH.width / 2), 14);
		}
		this.aerialDuel(taker, true);
	}

	// ──────────────────────────────────────────────── registro

	private emit(type: EventType, e: Omit<MatchEvent, 'tick' | 'type'>) {
		if (this.phase === 'finished' && type !== 'full_time') return;
		this.events.push({ tick: this.tick, type, ...e });
	}
}

export const HALF_LENGTH_TICKS = 45 * 60;

function clamp(v: number, lo: number, hi: number) {
	return Math.max(lo, Math.min(hi, v));
}

function absPoint([x, y]: [number, number]) {
	return { x, y };
}

function fitScore(p: EnginePlayer, slot: Position): number {
	return positionFit(p.position, slot) * 100 + overallish(p.attributes) + p.condition * 0.1;
}

function overallish(a: Attributes): number {
	return (a.passe + a.drible + a.desarme + a.finalizacao + a.velocidade + a.posicionamento + a.decisoes) / 7;
}

/** Atalho: simula uma partida inteira de forma reproduzível. */
export function simulateMatch(opts: MatchOptions): MatchResult {
	return new Match(opts).runToEnd();
}

export type { FormationId };
