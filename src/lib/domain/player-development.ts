import { playerDevelopmentFactor } from './player-profile.ts';
import { computeOverall, generateAttributes, type AttributeKey } from '#lib/engine/attributes.ts';
import type { PlayerStats } from '#lib/engine/types.ts';
import type { Career, PlayerProfile } from './career.ts';
import { sanitizePlayerCareer, type PlayerCareerState, type PlayerDailyState } from './careerlife.ts';
import { sponsorBrand } from './club.ts';
import { roundMoney } from './market.ts';
import { addDays, diffDays, startOfWeek, toDate, weekday } from './dates.ts';
import { POSITION_INFO, type Position } from './positions.ts';
import { createRng, deriveSeed } from './rng.ts';
import type { PlayerFocus } from './training.ts';

export const TRAINING_LIMIT = 2;
export const TRAINING_ATTRIBUTES: Record<PlayerFocus, readonly AttributeKey[]> = {
	finalizacao: ['finalizacao', 'compostura', 'posicionamento'],
	passe: ['passe', 'visao', 'decisoes'],
	drible: ['drible', 'dominio', 'agilidade'],
	marcacao: ['desarme', 'antecipacao', 'posicionamento'],
	fisico: ['resistencia', 'forca', 'aceleracao'],
	goleiro: ['reflexos', 'defesa', 'posicionamentoGol']
};

export const bounded = (n: number) => Math.max(0, Math.min(100, n));

export function playerState(c: Career, division: string | null): PlayerCareerState | null {
	const state = sanitizePlayerCareer(c.data.playerCareer, c.seed, c.data.player, division, c.season, c.clubId, c.gameDate);
	if (state && !c.data.playerCareer?.daily) state.daily.condition = c.data.fitness?.eu ?? 95;
	return state;
}

export function playerAttributes(seed: number, position: Position, profile: PlayerProfile, daily?: PlayerDailyState) {
	const generated = generateAttributes(position, profile.overall, createRng(deriveSeed(seed, 'eu-attr')));
	if (position === 'PD' || position === 'PE' || position === 'LD' || position === 'LE') {
		const naturalSide = (profile.foot ?? 'direito') === 'direito' ? position === 'PD' || position === 'LD' : position === 'PE' || position === 'LE';
		if (profile.foot === 'ambidestro') {
			generated.attributes.cruzamento = Math.min(99, generated.attributes.cruzamento + 1);
			generated.attributes.finalizacao = Math.min(99, generated.attributes.finalizacao + 1);
		} else {
			const key = naturalSide ? 'cruzamento' : 'finalizacao';
			generated.attributes[key] = Math.min(99, generated.attributes[key] + 2);
		}
	}
	for (const [key, bonus] of Object.entries(daily?.gains ?? {}) as Array<[AttributeKey, number]>) {
		generated.attributes[key] = Math.max(20, Math.min(99, Math.round(generated.attributes[key] + bonus)));
	}
	const ceiling = Math.max(20, profile.potential);
	while (computeOverall(generated.attributes, position) > ceiling) {
		for (const key of Object.keys(generated.attributes) as AttributeKey[]) {
			generated.attributes[key] = Math.max(20, generated.attributes[key] - 1);
		}
	}
	return generated;
}

export function adjustedOverall(c: Career, state: PlayerCareerState) {
	return computeOverall(playerAttributes(c.seed, c.data.position!, c.data.player!, state.daily).attributes, c.data.position!);
}

export function trainBlock(date: string, today: string, gameDates: string[], state: PlayerCareerState, nextStepDate: string | null): string | null {
	if (!nextStepDate || date < today || date >= nextStepDate || diffDays(today, date) > 13) return 'Escolha um dia antes do próximo avanço da simulação.';
	if (weekday(date) === 0 || gameDates.some((game) => date === game || addDays(date, 1) === game)) return 'Dia reservado para jogo ou recuperação.';
	if (state.daily.injuryUntil && date < state.daily.injuryUntil) return 'Você está em recuperação médica.';
	if (state.daily.drills.some((drill) => drill.date === date)) return 'Já existe uma sessão para esse dia.';
	const week = startOfWeek(date);
	if (state.daily.drills.filter((drill) => startOfWeek(drill.date) === week).length >= TRAINING_LIMIT) return 'Limite de duas sessões por semana.';
	return null;
}

function develop(d: PlayerDailyState, focus: PlayerFocus, amount: number) {
	for (const key of TRAINING_ATTRIBUTES[focus]) d.gains[key] = Math.min(10, (d.gains[key] ?? 0) + amount);
}

export function recordProgress(c: Career, state: PlayerCareerState, date: string) {
	const overall = adjustedOverall(c, state);
	if (state.daily.progress.at(-1)?.overall !== overall) {
		state.daily.progress = [...state.daily.progress.filter((entry) => entry.date !== date), { date, overall }].slice(-80);
	}
}

/** Processa os dias que antecedem o passo. O navegador e o servidor usam a mesma projeção. */
export function advancePlayerDays(c: Career, state: PlayerCareerState, until: string, gameDates: string[], playedOn?: string) {
	const next = structuredClone(state);
	const d = next.daily;
	const age = c.data.player!.age;
	const ageFactor = playerDevelopmentFactor(age);
	for (let date = c.gameDate; date < until; date = addDays(date, 1)) {
		const session = d.drills.find((drill) => drill.date === date);
		const recovering = !!d.injuryUntil && date < d.injuryUntil;
		if (d.injuryUntil && !recovering) d.injuryUntil = null;
		const matchPrep = session && (gameDates.includes(date) || gameDates.includes(addDays(date, 1)));
		if (session && !recovering && !matchPrep && d.condition >= 35) {
			develop(d, session.focus, (d.condition >= 70 ? 0.8 : 0.4) * ageFactor);
			d.condition = bounded(d.condition - (session.focus === 'fisico' ? 12 : 8));
			d.trust = bounded(d.trust + 2);
			recordProgress(c, next, date);
		} else if (date !== playedOn) {
			d.condition = bounded(d.condition + (recovering ? 5 : 7));
		}
		const dt = toDate(date);
		const monthLength = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
		const sponsor = d.sponsor && d.sponsor.until >= c.season && next.reputation >= 35 ? d.sponsor.monthly : 0;
		d.earnings += (next.contract.wage + sponsor) / monthLength;
	}
	d.drills = d.drills.filter((drill) => drill.date >= startOfWeek(until));
	if (d.press && diffDays(d.press.date, until) > 14) d.press = null;
	return next;
}

export const PLAYER_SELECTION = { titular: 'Titular', reserva: 'Banco de reservas', fora: 'Fora da convocação' } as const;
export type PlayerSelection = keyof typeof PLAYER_SELECTION;

export function matchObjective(position: Position) {
	if (position === 'GOL') return { label: 'Fazer pelo menos 2 defesas', met: (s: PlayerStats) => s.saves >= 2, focus: 'goleiro' as const };
	if (POSITION_INFO[position].sector === 'defesa' || position === 'VOL') return { label: 'Somar 2 desarmes ou interceptações', met: (s: PlayerStats) => s.tackles + s.interceptions >= 2, focus: 'marcacao' as const };
	if (POSITION_INFO[position].sector === 'ataque') return { label: 'Finalizar no alvo ou dar uma assistência', met: (s: PlayerStats) => s.shotsOnTarget + s.assists > 0, focus: 'finalizacao' as const };
	return { label: 'Dar um passe decisivo ou assistência', met: (s: PlayerStats) => s.keyPasses + s.assists > 0, focus: 'passe' as const };
}

export interface PlayerAssessment {
	selection: PlayerSelection;
	objective: string;
	met: boolean | null;
	trustDelta: number;
	feedback: string;
	injuryUntil: string | null;
}

export function assessPlayer(c: Career, state: PlayerCareerState, date: string, selection: PlayerSelection, stats: PlayerStats | undefined, injured: boolean) {
	const d = state.daily;
	const before = d.trust;
	const objective = matchObjective(c.data.position!);
	const played = stats && stats.minutes > 0 ? stats : null;
	const met = played ? objective.met(played) : null;
	const injuryUntil = d.injuryUntil && d.injuryUntil > date ? d.injuryUntil : null;
	if (played) {
		d.condition = played.condition;
		d.form = [...d.form, played.rating].slice(-8);
		d.trust = bounded(d.trust + Math.round((played.rating - 6.5) * 5) + (met ? 3 : 0));
		d.support.fans = bounded(d.support.fans + Math.round((played.rating - 6.5) * 4) + played.goals + played.assists);
		state.reputation = Math.max(1, bounded(state.reputation + Math.round((played.rating - 6.5) * 2) + played.goals + played.assists));
		const focus = met ? objective.focus : 'fisico';
		develop(d, focus, Math.max(0, played.rating - 5.5) * (played.minutes / 90) * (c.data.player!.age <= 23 ? 0.45 : 0.2));
		recordProgress(c, state, date);
	}
	if (injured) {
		const rng = createRng(deriveSeed(c.seed, 'lesao-jogador', date));
		d.injuryUntil = addDays(date, rng.int(7, d.condition < 60 ? 30 : 18));
	}
	if (!d.press && (!d.lastPress || diffDays(d.lastPress, date) >= 14)) {
		const kind = played && played.rating >= 7.1 ? 'destaque' : played && played.rating < 6.1 ? 'pressao' : !played ? 'espaco' : null;
		if (kind) d.press = { date, kind };
	}
	const assessment: PlayerAssessment = {
		selection, objective: objective.label, met, trustDelta: d.trust - before,
		feedback: !played ? (selection === 'fora' ? (injuryUntil ? 'Preservado por recomendação do departamento médico.' : 'Fora da convocação para esta partida.') : 'O treinador manteve você no banco.') :
			d.trust > before ? 'A atuação aumentou a confiança do treinador.' : d.trust < before ? 'O treinador espera uma resposta na próxima oportunidade.' : 'A atuação manteve sua posição na disputa por espaço.',
		injuryUntil: injured ? d.injuryUntil : null
	};
	return assessment;
}

export function individualSponsor(c: Career, state: PlayerCareerState) {
	if (state.daily.sponsor || state.reputation < 45 || state.daily.support.fans < 55) return null;
	const rng = createRng(deriveSeed(c.seed, 'patrocinio-individual', c.season));
	return { brand: sponsorBrand(rng), monthly: roundMoney(Math.max(500, state.contract.wage * state.reputation / 250)), until: c.season };
}

export const PRESS_QUESTIONS = {
	destaque: 'Sua atuação foi destaque. O que pesou no seu desempenho?',
	pressao: 'A atuação ficou abaixo do esperado. Como você vai reagir?',
	espaco: 'Você ficou sem minutos. Como enxerga a disputa por uma vaga?'
} as const;

export const PRESS_ANSWERS = {
	elenco: { label: 'Valorizar o elenco', result: 'O grupo gostou da postura coletiva.', squad: 6, trust: 3, fans: 1, reputation: 1 },
	ambicao: { label: 'Assumir o protagonismo', result: 'A declaração animou a torcida e aumentou a cobrança interna.', squad: -4, trust: -3, fans: 7, reputation: 4 },
	trabalho: { label: 'Prometer trabalho nos treinos', result: 'A comissão valorizou seu compromisso.', squad: 1, trust: 6, fans: 0, reputation: 0 }
} as const;
