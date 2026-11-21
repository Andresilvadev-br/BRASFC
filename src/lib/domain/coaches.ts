import { COACH_PROFILES, planAgainst, type CoachProfile, type CoachStyleId, type Scouting } from '#lib/engine/ai-coach.ts';
import { presetInstructions, type TacticalInstructions } from '#lib/engine/instructions.ts';
import type { TeamFamiliarity } from '#lib/engine/types.ts';
import { createRng, deriveSeed } from './rng.ts';
import type { SquadPlayer } from './squad.ts';
import { bestRoles } from './tactical.ts';
import { autoLineup, FORMATIONS, lineupFamiliarity, type FormationId, type Tactic } from './tactics.ts';

/**
 * Treinadores controlados pela IA. Os técnicos reais estão PENDENTES na base de dados,
 * então cada clube recebe um PERFIL de jogo (sem nome de pessoa), estável ao longo das
 * temporadas e com chance de troca de comando a cada temporada.
 */
const STYLE_IDS = Object.keys(COACH_PROFILES) as CoachStyleId[];

export interface ClubCoach {
	profile: CoachProfile;
	/** temporadas seguidas no cargo (o elenco domina melhor a filosofia) */
	tenure: number;
	/** trocou de comando nesta temporada */
	changed: boolean;
}

/** Perfil do treinador do clube na temporada (determinístico pela semente da carreira). */
export function clubCoach(careerSeed: number, clubId: string, season: number, firstSeason: number): ClubCoach {
	let id = STYLE_IDS[createRng(deriveSeed(careerSeed, 'coach', `${clubId}:${firstSeason}`)).int(0, STYLE_IDS.length - 1)];
	let tenure = 2;
	let changed = false;
	for (let s = firstSeason + 1; s <= season; s++) {
		const rng = createRng(deriveSeed(careerSeed, 'coach', `${clubId}:${s}`));
		if (rng.chance(0.3)) {
			id = STYLE_IDS[rng.int(0, STYLE_IDS.length - 1)];
			tenure = 0;
			changed = s === season;
		} else tenure++;
	}
	return { profile: COACH_PROFILES[id], tenure, changed };
}

/** Formação preferida que o elenco consegue executar melhor. */
export function coachFormation(profile: CoachProfile, squad: SquadPlayer[]): FormationId {
	let best = profile.formations[0];
	let bestScore = -1;
	profile.formations.forEach((f, i) => {
		const lineup = autoLineup(f, squad);
		const score = lineupFamiliarity(f, lineup, squad) - i * 4;
		if (score > bestScore) {
			bestScore = score;
			best = f;
		}
	});
	return best;
}

export interface AiTeamPlan {
	tactic: Tactic & { instructions: TacticalInstructions; roles: ReturnType<typeof bestRoles> };
	familiarity: TeamFamiliarity;
	coach: ClubCoach;
	reasons: string[];
}

/**
 * Plano do clube da IA para um jogo: formação/estilo do perfil, funções pelo elenco,
 * domínio pela permanência do técnico e, se houver observação do adversário, contramedidas.
 */
/** Comando do clube vindo do universo persistido (Dev 0.5): técnico, sistema e domínio reais da carreira. */
export interface CoachOverride {
	style: CoachStyleId;
	formation: FormationId;
	execution: number;
	name: string;
	since: number;
}

export function aiTeamPlan(careerSeed: number, clubId: string, season: number, firstSeason: number, squad: SquadPlayer[], scout?: Scouting, round = 0, override?: CoachOverride | null, initial?: Tactic): AiTeamPlan {
	const coach: ClubCoach = override ? { profile: COACH_PROFILES[override.style], tenure: Math.max(0, season - override.since), changed: override.since === season } : clubCoach(careerSeed, clubId, season, firstSeason);
	const p = coach.profile;
	const formation = initial?.formation ?? override?.formation ?? coachFormation(p, squad);
	const lineup = initial?.lineup ?? autoLineup(formation, squad);
	const roles = bestRoles(formation, lineup, squad);
	let instructions = presetInstructions(p.mentality, p.style);
	const reasons: string[] = [];
	if (scout) {
		const rng = (k: string) => createRng(deriveSeed(careerSeed, 'plan', `${clubId}:${season}:${round}:${k}`)).next();
		const plan = planAgainst(p, instructions, scout, rng);
		instructions = { ...instructions, ...plan.instructions };
		reasons.push(...plan.reasons);
	}
	// Domínio: técnico novo começa em ~52; cada temporada no cargo soma, até ~74.
	const execution = override ? override.execution : Math.min(74, 52 + coach.tenure * 5 + Math.min(10, round * 0.3));
	return {
		tactic: { formation, lineup, mentality: p.mentality, style: p.style, instructions, roles },
		familiarity: { execution, setPieces: 50 },
		coach,
		reasons
	};
}

/** O que dá para observar do time do usuário nos últimos jogos (sem dados ocultos). */
export interface ObservedMatch {
	formation: FormationId;
	instructions?: TacticalInstructions;
	possession: number;
	crosses?: number;
	roles?: string[];
}

export function scoutFrom(observed: ObservedMatch[], ownSquad: SquadPlayer[]): Scouting {
	const last = observed.slice(-3);
	const n = last.length;
	// Velocidade dos nossos três melhores atacantes (o treinador conhece o próprio elenco).
	const fwd = ownSquad
		.filter((p) => ['ATA', 'PD', 'PE'].includes(p.position))
		.sort((a, b) => b.overall - a.overall)
		.slice(0, 3);
	const fast = fwd.length > 0 && fwd.reduce((s, p) => s + p.attributes.velocidade, 0) / fwd.length >= 70;
	if (!n) return { samples: 0, highPress: false, lowBlock: false, highLine: false, attackingFullbacks: false, centralFocus: false, wideFocus: false, fastForwards: fast };
	const avg = (f: (m: ObservedMatch) => number) => last.reduce((s, m) => s + f(m), 0) / n;
	const ins = (m: ObservedMatch) => m.instructions;
	const backs = (f: FormationId) => FORMATIONS[f].filter((s) => s.position === 'ZAG').length;
	return {
		samples: n,
		highPress: avg((m) => (ins(m)?.pressao ?? 3)) >= 4,
		lowBlock: avg((m) => (ins(m)?.bloco ?? 2)) <= 1.4 || avg((m) => (ins(m)?.linha ?? 3)) <= 2,
		highLine: avg((m) => (ins(m)?.linha ?? 3)) >= 4,
		attackingFullbacks: avg((m) => ((ins(m)?.laterais ?? 2) === 3 || (m.roles ?? []).some((r) => r === 'ala' || r === 'lat-ofensivo') ? 1 : 0)) >= 0.67 && avg((m) => backs(m.formation)) >= 4,
		centralFocus: avg((m) => ((ins(m)?.corredor ?? 2) === 1 ? 1 : 0)) >= 0.67,
		wideFocus: avg((m) => ((ins(m)?.corredor ?? 2) === 3 ? 1 : 0)) >= 0.67,
		fastForwards: fast
	};
}
