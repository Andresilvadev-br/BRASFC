import type { Position } from '#lib/domain/positions.ts';
import type { FormationId, Mentality, PlayStyle } from '#lib/domain/tactics.ts';
import type { Attributes } from './attributes.ts';

/** Campo em metros: x ao longo do comprimento (0–105), y na largura (0–68). */
export const PITCH = { length: 105, width: 68, goalWidth: 7.32, boxDepth: 16.5, boxWidth: 40.3 } as const;

/** Versão do motor gravada com cada resultado (mudanças de regra mudam a versão). */
export const ENGINE_VERSION = '0.2.0';

export type Side = 'home' | 'away';

export interface EnginePlayer {
	id: string;
	name: string;
	shortName: string;
	number: number;
	position: Position;
	attributes: Attributes;
	/** 0–100 no início da partida */
	condition: number;
	/** Atleta de elenco pendente (sem dados reais). */
	pending?: boolean;
}

export interface TeamTactic {
	formation: FormationId;
	/** 11 titulares, na ordem dos slots da formação */
	lineup: string[];
	/** reservas disponíveis (até 12) */
	bench: string[];
	mentality: Mentality;
	style: PlayStyle;
}

export interface TeamSetup {
	id: string;
	name: string;
	short: string;
	colors: { primary: string; secondary: string; gk?: string };
	players: EnginePlayer[];
	tactic: TeamTactic;
}

export interface MatchRules {
	/** máximo de substituições */
	maxSubs: number;
	/** janelas de substituição (o intervalo não conta) */
	maxWindows: number;
	/** duração de cada tempo em minutos */
	halfMinutes: number;
	homeAdvantage: boolean;
}

export const DEFAULT_RULES: MatchRules = { maxSubs: 5, maxWindows: 3, halfMinutes: 45, homeAdvantage: true };

export type Decision =
	| { type: 'sub'; outId: string; inId: string }
	| { type: 'mentality'; value: Mentality }
	| { type: 'style'; value: PlayStyle }
	| { type: 'formation'; value: FormationId; lineup: string[] };

export interface AppliedDecision {
	tick: number;
	side: Side;
	decision: Decision;
	/** decisão recusada (ex.: substituição inválida) */
	rejected?: string;
}

export type EventType =
	| 'kickoff' | 'half_time' | 'second_half' | 'full_time'
	| 'pass' | 'pass_fail' | 'interception' | 'dribble' | 'dribble_fail' | 'tackle' | 'cross' | 'clearance'
	| 'shot' | 'shot_saved' | 'shot_off' | 'shot_blocked' | 'goal' | 'aerial'
	| 'corner' | 'throw_in' | 'goal_kick' | 'free_kick' | 'penalty' | 'penalty_miss' | 'foul' | 'offside'
	| 'yellow' | 'red' | 'injury' | 'sub' | 'tactic';

export interface MatchEvent {
	tick: number;
	type: EventType;
	side?: Side;
	player?: string;
	/** recebedor, assistente, jogador que sofreu a falta, quem saiu na substituição… */
	other?: string;
	x?: number;
	y?: number;
	/** dados extras: xG da finalização, assistência, motivo do cartão… */
	data?: Record<string, number | string | boolean>;
}

export type Phase = 'first_half' | 'half_time' | 'second_half' | 'finished';

export interface PlayerState {
	id: string;
	side: Side;
	slot: number;
	x: number;
	y: number;
	/** posição no tick anterior (interpolação visual) */
	px: number;
	py: number;
	condition: number;
	onPitch: boolean;
	sentOff: boolean;
	injured: boolean;
	yellow: number;
	minutesIn: number;
	minuteOut: number | null;
}

export interface BallState {
	x: number;
	y: number;
	px: number;
	py: number;
	owner: string | null;
	/** bola viajando: chega ao destino no tick indicado */
	flight: { toX: number; toY: number; arrive: number; target: string | null; outcome: FlightOutcome } | null;
}

export type FlightOutcome =
	| { kind: 'receive' }
	| { kind: 'intercept'; by: string }
	| { kind: 'loose' }
	| { kind: 'out'; restart: 'throw_in' | 'goal_kick' | 'corner'; side: Side }
	| { kind: 'offside' };

export interface TeamStats {
	goals: number;
	shots: number;
	shotsOnTarget: number;
	xg: number;
	passes: number;
	passesCompleted: number;
	possessionTicks: number;
	corners: number;
	fouls: number;
	offsides: number;
	yellows: number;
	reds: number;
	subs: number;
	tackles: number;
	interceptions: number;
}

export interface PlayerStats {
	minutes: number;
	goals: number;
	assists: number;
	shots: number;
	shotsOnTarget: number;
	passes: number;
	passesCompleted: number;
	keyPasses: number;
	dribbles: number;
	dribblesFailed: number;
	tackles: number;
	interceptions: number;
	clearances: number;
	aerialsWon: number;
	foulsCommitted: number;
	foulsWon: number;
	saves: number;
	goalsConceded: number;
	yellow: number;
	red: number;
	offsides: number;
	errorsLeadingToGoal: number;
	rating: number;
	condition: number;
}

export interface MatchResult {
	seed: number;
	homeGoals: number;
	awayGoals: number;
	events: MatchEvent[];
	decisions: AppliedDecision[];
	stats: Record<Side, TeamStats>;
	players: Record<string, PlayerStats>;
	addedTime: [number, number];
	durationTicks: number;
}
