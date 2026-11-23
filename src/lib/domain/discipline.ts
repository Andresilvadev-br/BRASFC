import { CUP_ID } from './cup.ts';

/**
 * Sistema disciplinar persistente (Carreira de Treinador 2.0).
 *
 * - Cartões e suspensões são separados por competição (liga × Copa).
 * - Vermelho direto ou segundo amarelo: suspensão conforme o regulamento (padrão: 1 jogo).
 * - Amarelos acumulados: ao atingir o limite (padrão: 3), 1 jogo de suspensão e a contagem zera.
 * - Na troca de temporada os amarelos zeram; suspensões pendentes continuam valendo.
 * - O cumprimento é registrado no servidor quando o clube disputa uma partida daquela competição,
 *   então recarregar o save ou trocar de dispositivo não apaga a punição.
 */
export interface DisciplineRules {
	label: string;
	yellowLimit: number;
	redBan: number;
	secondYellowBan: number;
}

export const DEFAULT_DISCIPLINE: DisciplineRules = { label: 'Regulamento padrão', yellowLimit: 3, redBan: 1, secondYellowBan: 1 };

/** Regulamento de cada competição (o específico prevalece sobre o padrão). */
export function disciplineRules(competition: string): DisciplineRules {
	if (competition === CUP_ID) return { label: 'Copa do Brasil', yellowLimit: 3, redBan: 1, secondYellowBan: 1 };
	return { ...DEFAULT_DISCIPLINE, label: 'Campeonato' };
}

export type BanReason = 'vermelho' | 'segundo-amarelo' | 'amarelos';
export const BAN_REASON_LABEL: Record<BanReason, string> = {
	vermelho: 'Cartão vermelho',
	'segundo-amarelo': 'Expulso com o segundo amarelo',
	amarelos: 'Acúmulo de amarelos'
};

export interface Suspension {
	playerId: string;
	competition: string;
	/** partidas que ainda faltam cumprir */
	remaining: number;
	matches: number;
	reason: BanReason;
	season: number;
	round: number;
}

export interface DisciplineEntry {
	season: number;
	round: number;
	competition: string;
	playerId: string;
	kind: 'amarelo' | 'vermelho' | 'suspenso' | 'cumprida';
	detail: string;
}

export interface DisciplineState {
	v: 1;
	season: number;
	/** amarelos acumulados desde a última suspensão: competição → atleta → quantidade */
	yellows: Record<string, Record<string, number>>;
	suspensions: Suspension[];
	log: DisciplineEntry[];
}

export function initialDiscipline(season: number): DisciplineState {
	return { v: 1, season, yellows: {}, suspensions: [], log: [] };
}

export function sanitizeDiscipline(raw: unknown, season: number): DisciplineState {
	if (!raw || typeof raw !== 'object' || (raw as DisciplineState).v !== 1) return initialDiscipline(season);
	const d = raw as DisciplineState;
	const suspensions = Array.isArray(d.suspensions)
		? d.suspensions.filter((s) => s && typeof s.playerId === 'string' && typeof s.competition === 'string' && Number.isInteger(s.remaining) && s.remaining > 0)
		: [];
	const yellows: DisciplineState['yellows'] = {};
	if (d.season === season && d.yellows && typeof d.yellows === 'object') {
		for (const [comp, byPlayer] of Object.entries(d.yellows)) {
			if (!byPlayer || typeof byPlayer !== 'object') continue;
			yellows[comp] = Object.fromEntries(Object.entries(byPlayer).filter(([, n]) => Number.isInteger(n) && (n as number) > 0)) as Record<string, number>;
		}
	}
	// Temporada nova: amarelos zeram; suspensões pendentes continuam.
	return { v: 1, season, yellows, suspensions, log: Array.isArray(d.log) ? d.log.slice(-200) : [] };
}

/** Atletas suspensos para a próxima partida da competição. */
export function suspendedFor(d: DisciplineState | null | undefined, competition: string | null | undefined): Set<string> {
	if (!d || !competition) return new Set();
	return new Set(d.suspensions.filter((s) => s.competition === competition && s.remaining > 0).map((s) => s.playerId));
}

/** Situação de um atleta (para os avisos de Elenco, Táticas, Calendário e Pré-jogo). */
export function playerDiscipline(d: DisciplineState | null | undefined, playerId: string): { suspensions: Suspension[]; yellows: Array<{ competition: string; count: number; limit: number }> } {
	if (!d) return { suspensions: [], yellows: [] };
	return {
		suspensions: d.suspensions.filter((s) => s.playerId === playerId && s.remaining > 0),
		yellows: Object.entries(d.yellows)
			.map(([competition, by]) => ({ competition, count: by[playerId] ?? 0, limit: disciplineRules(competition).yellowLimit }))
			.filter((y) => y.count > 0)
	};
}

export function suspensionLabel(s: Pick<Suspension, 'remaining'>): string {
	return `Suspenso — ${s.remaining} ${s.remaining === 1 ? 'partida restante' : 'partidas restantes'}`;
}

/**
 * Atualiza o registro depois de uma partida do clube na competição:
 *  1. quem estava suspenso cumpre um jogo (estava fora desta partida);
 *  2. os cartões da partida geram amarelos acumulados e novas suspensões.
 */
export function applyMatchDiscipline(prev: DisciplineState, m: { season: number; round: number; competition: string; cards: Array<{ player: string; kind: 'yellow' | 'red'; secondYellow?: boolean }>; names?: (id: string) => string }): { state: DisciplineState; news: Array<{ subject: string; body: string }> } {
	const d: DisciplineState = structuredClone(prev);
	const rules = disciplineRules(m.competition);
	const news: Array<{ subject: string; body: string }> = [];
	const name = m.names ?? ((id: string) => id);
	for (const s of d.suspensions) {
		if (s.competition !== m.competition || s.remaining <= 0) continue;
		s.remaining -= 1;
		if (s.remaining === 0) d.log.push({ season: m.season, round: m.round, competition: m.competition, playerId: s.playerId, kind: 'cumprida', detail: `${name(s.playerId)} cumpriu a suspensão e volta a ficar disponível.` });
	}
	d.suspensions = d.suspensions.filter((s) => s.remaining > 0);
	const byPlayer = new Map<string, { yellow: number; red: boolean; second: boolean }>();
	for (const c of m.cards) {
		const cur = byPlayer.get(c.player) ?? { yellow: 0, red: false, second: false };
		if (c.kind === 'yellow') cur.yellow += 1;
		else {
			cur.red = true;
			if (c.secondYellow) cur.second = true;
		}
		byPlayer.set(c.player, cur);
	}
	const ban = (playerId: string, matches: number, reason: BanReason) => {
		d.suspensions.push({ playerId, competition: m.competition, remaining: matches, matches, reason, season: m.season, round: m.round });
		d.log.push({ season: m.season, round: m.round, competition: m.competition, playerId, kind: 'suspenso', detail: `${BAN_REASON_LABEL[reason]}: ${matches} ${matches === 1 ? 'jogo' : 'jogos'} de suspensão.` });
		news.push({ subject: `${name(playerId)} suspenso`, body: `${BAN_REASON_LABEL[reason]}. Fica fora de ${matches} ${matches === 1 ? 'partida' : 'partidas'} da ${rules.label === 'Campeonato' ? 'competição' : rules.label}.` });
	};
	for (const [playerId, c] of byPlayer) {
		const yellows = (d.yellows[m.competition] ??= {});
		if (c.red) {
			const second = c.second || c.yellow >= 2;
			d.log.push({ season: m.season, round: m.round, competition: m.competition, playerId, kind: 'vermelho', detail: second ? 'Segundo amarelo' : 'Vermelho direto' });
			// O amarelo que virou vermelho não entra na contagem acumulada.
			if (!second && c.yellow === 1) yellows[playerId] = (yellows[playerId] ?? 0) + 1;
			ban(playerId, second ? rules.secondYellowBan : rules.redBan, second ? 'segundo-amarelo' : 'vermelho');
			continue;
		}
		if (c.yellow > 0) {
			yellows[playerId] = (yellows[playerId] ?? 0) + 1;
			d.log.push({ season: m.season, round: m.round, competition: m.competition, playerId, kind: 'amarelo', detail: `${yellows[playerId]} de ${rules.yellowLimit} amarelos` });
			if (yellows[playerId] >= rules.yellowLimit) {
				yellows[playerId] = 0;
				ban(playerId, 1, 'amarelos');
			}
		}
	}
	d.log = d.log.slice(-200);
	return { state: d, news };
}
