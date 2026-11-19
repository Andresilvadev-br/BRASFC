import { addDays, startOfWeek } from './dates.ts';
import type { Fixture } from './season.ts';

export type SessionKind = 'tatico' | 'fisico' | 'tecnico' | 'recuperacao' | 'descanso' | 'jogo';

export const SESSION_LABELS: Record<SessionKind, string> = {
	tatico: 'Tático',
	fisico: 'Físico',
	tecnico: 'Técnico',
	recuperacao: 'Recuperação',
	descanso: 'Descanso',
	jogo: 'Dia de jogo'
};

export const TEAM_FOCUS = ['equilibrado', 'fisico', 'tatico', 'tecnico'] as const;
export type TeamFocus = (typeof TEAM_FOCUS)[number];
export const TEAM_FOCUS_LABELS: Record<TeamFocus, string> = {
	equilibrado: 'Equilibrado',
	fisico: 'Ênfase física',
	tatico: 'Ênfase tática',
	tecnico: 'Ênfase técnica'
};

export const PLAYER_FOCUS = ['finalizacao', 'passe', 'drible', 'marcacao', 'fisico', 'goleiro'] as const;
export type PlayerFocus = (typeof PLAYER_FOCUS)[number];
export const PLAYER_FOCUS_LABELS: Record<PlayerFocus, string> = {
	finalizacao: 'Finalização',
	passe: 'Passe e visão',
	drible: 'Drible',
	marcacao: 'Marcação',
	fisico: 'Condicionamento',
	goleiro: 'Defesa de gol'
};

const WEEK_TEMPLATES: Record<TeamFocus, SessionKind[][]> = {
	// segunda → domingo, até 2 sessões por dia
	equilibrado: [['recuperacao'], ['tatico', 'fisico'], ['tecnico', 'tatico'], ['fisico'], ['tatico', 'tecnico'], ['tatico'], ['descanso']],
	fisico: [['recuperacao'], ['fisico', 'fisico'], ['tecnico', 'fisico'], ['fisico'], ['tatico', 'fisico'], ['tatico'], ['descanso']],
	tatico: [['recuperacao'], ['tatico', 'tatico'], ['tecnico', 'tatico'], ['fisico'], ['tatico', 'tatico'], ['tatico'], ['descanso']],
	tecnico: [['recuperacao'], ['tecnico', 'fisico'], ['tecnico', 'tatico'], ['tecnico'], ['tatico', 'tecnico'], ['tatico'], ['descanso']]
};

export interface TrainingDay {
	date: string;
	sessions: SessionKind[];
	fixture?: Fixture;
}

/** Plano semanal: o template do foco escolhido, com o dia de jogo substituindo as sessões. */
export function weekPlan(date: string, focus: TeamFocus, clubFixtures: Fixture[]): TrainingDay[] {
	const monday = startOfWeek(date);
	return WEEK_TEMPLATES[focus].map((sessions, i) => {
		const day = addDays(monday, i);
		const fixture = clubFixtures.find((f) => f.date === day);
		if (fixture) return { date: day, sessions: ['jogo'], fixture };
		const dayBefore = clubFixtures.find((f) => f.date === addDays(day, 1));
		return { date: day, sessions: dayBefore ? ['tatico'] : sessions };
	});
}

export function isTeamFocus(v: unknown): v is TeamFocus {
	return typeof v === 'string' && (TEAM_FOCUS as readonly string[]).includes(v);
}

export function isPlayerFocus(v: unknown): v is PlayerFocus {
	return typeof v === 'string' && (PLAYER_FOCUS as readonly string[]).includes(v);
}

export function isPlayerFocusForPosition(focus: PlayerFocus, position: string): boolean {
	return position === 'GOL' ? focus !== 'finalizacao' : focus !== 'goleiro';
}
