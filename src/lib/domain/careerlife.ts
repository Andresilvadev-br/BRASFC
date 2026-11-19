import type { Career, PlayerProfile } from './career.ts';
import { getClub } from './clubs.ts';
import { expectedWage, roundMoney, tierOfDivision, type Contract } from './market.ts';
import { createRng, deriveSeed } from './rng.ts';

/**
 * Carreiras mais vivas (Dev 0.4).
 *  - Treinador: propostas de emprego (após demissão ou por destaque), coerentes com a reputação.
 *  - Jogador: contrato, propostas de outros clubes via empresário, objetivos pessoais, prêmios e
 *    evolução por temporada que depende de minutos jogados e do desempenho.
 * A vida pessoal fica de fora: o foco é a trajetória no futebol.
 */

export interface JobOfferDetail {
	id: string;
	clubId: string;
	division: string;
	reason: string;
	expiresSeason: number;
	/** Dev 0.5: proposta vinda do universo (salário, duração e projeto) */
	wage?: number;
	years?: number;
	project?: string;
}

/** Propostas de emprego coerentes com a reputação do treinador (determinísticas). */
export function jobOffers(seed: number, season: number, round: number, coachReputation: number, currentClub: string, divisions: Record<string, string[]>, dismissed: boolean): JobOfferDetail[] {
	const rng = createRng(deriveSeed(seed, 'emprego', season, round));
	const maxRep = Math.max(1, Math.min(5, Math.round(coachReputation / 20) + (dismissed ? 0 : 1)));
	const order = ['serie-a', 'serie-b', 'serie-c', 'serie-d', 'liga-brasfc'];
	const pool: Array<{ id: string; div: string }> = [];
	for (const div of order) for (const id of divisions[div] ?? []) {
		const rep = getClub(id)?.reputation ?? 1;
		if (id === currentClub || rep > maxRep) continue;
		// Demitido: clubes de divisão igual ou inferior; em destaque: clubes maiores.
		if (dismissed ? rep <= maxRep : rep >= Math.min(5, (getClub(currentClub)?.reputation ?? 1) + 1)) pool.push({ id, div });
	}
	return rng
		.shuffle(pool)
		.slice(0, 3)
		.map(({ id, div }) => ({
			id: `${season}-${round}-${id}`,
			clubId: id,
			division: div,
			reason: dismissed ? 'Procura um treinador para reorganizar o time.' : 'Gostou do seu trabalho e quer você no comando.',
			expiresSeason: season
		}));
}

// ─────────────────────────────────────────────────────────────── carreira de jogador

export interface PlayerCareerState {
	contract: Contract;
	/** reputação 1–100 (visibilidade no mercado) */
	reputation: number;
	offers: Array<{ id: string; clubId: string; wage: number; years: number; role: 'titular' | 'rotacao'; expiresRound: number; season: number }>;
	/** objetivos pessoais da temporada */
	goals: Array<{ kind: 'jogos' | 'gols' | 'nota' | 'titular'; label: string; target: number }>;
	awards: Array<{ season: number; label: string }>;
	agent: { name: string; style: 'agressivo' | 'equilibrado' | 'cauteloso' };
}

const AGENTS = ['Rogério Prates', 'Valéria Antunes', 'Marcelo Brito', 'Sílvia Torquato', 'Henrique Lessa'];

export function initialPlayerCareer(seed: number, profile: PlayerProfile, division: string | null, season: number): PlayerCareerState {
	const rng = createRng(deriveSeed(seed, 'empresario'));
	return {
		contract: { wage: expectedWage(profile.overall, tierOfDivision(division), profile.age), until: season + 2, role: 'jovem' },
		reputation: Math.max(1, profile.reputation),
		offers: [],
		goals: personalGoals(profile, season),
		awards: [],
		agent: { name: rng.pick(AGENTS), style: rng.pick(['agressivo', 'equilibrado', 'cauteloso'] as const) }
	};
}

export function personalGoals(profile: PlayerProfile, _season: number): PlayerCareerState['goals'] {
	const young = profile.age <= 20;
	return [
		{ kind: 'jogos', label: young ? 'Atuar em 12 partidas' : 'Atuar em 25 partidas', target: young ? 12 : 25 },
		{ kind: 'nota', label: 'Nota média de pelo menos 6,6', target: 6.6 },
		{ kind: 'titular', label: young ? 'Ser titular em 6 jogos' : 'Ser titular em 18 jogos', target: young ? 6 : 18 }
	];
}

export function sanitizePlayerCareer(raw: unknown, seed: number, profile: PlayerProfile | undefined, division: string | null, season: number): PlayerCareerState | null {
	if (!profile) return null;
	const base = initialPlayerCareer(seed, profile, division, season);
	if (!raw || typeof raw !== 'object') return base;
	const r = raw as Partial<PlayerCareerState>;
	return {
		contract: r.contract && typeof r.contract.wage === 'number' ? r.contract : base.contract,
		reputation: typeof r.reputation === 'number' ? Math.max(1, Math.min(100, r.reputation)) : base.reputation,
		offers: Array.isArray(r.offers) ? r.offers.slice(-3) : [],
		goals: Array.isArray(r.goals) ? r.goals : base.goals,
		awards: Array.isArray(r.awards) ? r.awards.slice(-40) : [],
		agent: r.agent ?? base.agent
	};
}

export interface SeasonPlayerStats {
	games: number;
	starts: number;
	goals: number;
	assists: number;
	rating: number;
	minutes: number;
}

/** Propostas que o empresário traz durante a janela, conforme desempenho e reputação. */
export function playerOffers(seed: number, season: number, round: number, st: PlayerCareerState, profile: PlayerProfile, recentRating: number, clubId: string, divisions: Record<string, string[]>, divisionOf: (id: string) => string | null): PlayerCareerState['offers'] {
	const rng = createRng(deriveSeed(seed, 'propostas-jogador', season, round));
	const interest = (recentRating - 6.2) * 0.25 + st.reputation / 200 + (st.agent.style === 'agressivo' ? 0.08 : st.agent.style === 'cauteloso' ? -0.05 : 0);
	if (!rng.chance(Math.max(0.03, Math.min(0.5, interest)))) return [];
	const myRep = getClub(clubId)?.reputation ?? 1;
	const all = Object.values(divisions).flat().filter((id) => id !== clubId && Math.abs((getClub(id)?.reputation ?? 1) - myRep - 0.5) <= 1.5);
	if (!all.length) return [];
	const club = rng.pick(all);
	const tier = tierOfDivision(divisionOf(club));
	const role = profile.overall >= 60 + (getClub(club)?.reputation ?? 1) * 3 ? 'titular' : 'rotacao';
	return [{ id: `${season}-${round}-${club}`, clubId: club, wage: roundMoney(expectedWage(profile.overall, tier, profile.age) * (1.05 + rng.next() * 0.25)), years: rng.int(2, 4), role, expiresRound: round + 3, season }];
}

/** Fim de temporada do jogador: evolução por minutos, objetivos e prêmios. */
export function closePlayerSeason(st: PlayerCareerState, profile: PlayerProfile, stats: SeasonPlayerStats, teamBest: { rating: boolean; scorer: boolean }, season: number, seed: number): { state: PlayerCareerState; profile: PlayerProfile; news: Array<{ subject: string; body: string; important?: boolean }> } {
	const news: Array<{ subject: string; body: string; important?: boolean }> = [];
	const rng = createRng(deriveSeed(seed, 'evolucao-jogador', season));
	const minutesF = Math.min(1.3, 0.5 + stats.minutes / 2400);
	const gap = Math.max(0, profile.potential - profile.overall);
	const age = profile.age;
	let growth = age <= 21 ? gap * (0.2 + rng.next() * 0.15) * minutesF : age <= 25 ? gap * (0.12 + rng.next() * 0.12) * minutesF : age <= 29 ? rng.next() * 1.5 - 0.5 : -(1 + rng.next() * 2);
	if (stats.rating >= 7) growth += 1;
	const overall = Math.max(40, Math.min(profile.potential, Math.round(profile.overall + growth)));
	const met = st.goals.filter((g) => (g.kind === 'jogos' ? stats.games >= g.target : g.kind === 'gols' ? stats.goals >= g.target : g.kind === 'nota' ? stats.rating >= g.target : stats.starts >= g.target));
	const awards = [...st.awards];
	if (teamBest.rating && stats.games >= 10) awards.push({ season, label: 'Craque do time na temporada' });
	if (teamBest.scorer && stats.goals >= 5) awards.push({ season, label: 'Artilheiro do time' });
	if (stats.games >= 10 && age <= 21 && stats.rating >= 6.8) awards.push({ season, label: 'Revelação do clube' });
	for (const a of awards.slice(st.awards.length)) news.push({ subject: `Prêmio: ${a.label}`, body: `Reconhecimento pela temporada ${season}.`, important: true });
	const reputation = Math.max(1, Math.min(100, Math.round(st.reputation + met.length * 3 + (awards.length - st.awards.length) * 6 + (stats.rating - 6.5) * 8)));
	news.push({ subject: `Temporada ${season}: ${met.length} de ${st.goals.length} objetivos cumpridos`, body: `${stats.games} jogos, ${stats.goals} gols, ${stats.assists} assistências, nota média ${stats.rating.toFixed(2)}. Geral ${profile.overall} → ${overall}.`, important: true });
	const nextProfile = { ...profile, age: age + 1, overall, reputation: Math.round(reputation / 10) };
	return { state: { ...st, reputation, awards, offers: [], goals: personalGoals(nextProfile, season + 1) }, profile: nextProfile, news };
}
