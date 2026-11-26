import { randomAppearance } from './appearance.ts';
import { addDays, weekday } from './dates.ts';
import { getClub, registerClubs, type Club } from './clubs.ts';
import { isPosition, type Position } from './positions.ts';
import { createRng, deriveSeed } from './rng.ts';
import { computeStandings, generateLeagueFixtures, type Fixture, type MatchResult, type ScheduleVersion, type StandingRow } from './season.ts';
import type { SquadPlayer } from './squad.ts';
import { ALL_ATTRIBUTES, computeOverall, generateAttributes, type AttributeKey } from '#lib/engine/attributes.ts';

/**
 * World Database · ligas do catálogo mundial jogáveis (mundo `mundo`).
 *
 *  - Divisões identificadas por `league/<país>/<nível>` (docs/WORLD-CONTRACT.md).
 *  - Só entram divisões com TODOS os inscritos confirmados no catálogo (nada é inventado).
 *  - Temporada europeia: `season = 2026` é a edição 2026/27, de agosto a maio, com rodadas aos domingos,
 *    pausas das datas FIFA e das festas, e quartas-feiras quando o calendário não cabe.
 *  - Clubes e elencos da carreira ficam gravados no save em forma compacta (`WorldSnapshot`). Os atributos
 *    são regerados pela semente, igual no servidor e no navegador, com a mesma regra do catálogo.
 */
export const WORLD_DIVISION = /^league\/[a-z]{3}\/\d{1,2}$/;
export const WORLD_CLUB = /^world\/[a-z]{3}\/[a-z0-9-]+$/;

export type Tiebreak = 'confronto-direto' | 'saldo';

export interface WorldDivisionRule {
	name: string;
	country: string;
	level: number;
	/** 2 = turno e returno */
	legs: 1 | 2;
	/** caem direto para o nível abaixo */
	relegated: number;
	/** sobem direto para o nível acima */
	promoted: number;
	tiebreak: Tiebreak;
}

/** [id, nome, idade, país, posição, titular(0/1), overall estimado, potencial estimado, características] */
export type CompactPlayer = [string, string, number, string, string, 0 | 1, number, number, AttributeKey[]];

export interface WorldSnapshot {
	catalog: string;
	clubs: Club[];
	players: Record<string, CompactPlayer[]>;
}

/** Liga montada pelo servidor para uma carreira nova (países → divisões jogáveis, clubes e elencos). */
export interface WorldPlan {
	countries: string[];
	league: import('./league.ts').LeagueState;
	snapshot: WorldSnapshot;
}

// ─────────────────────────────────────────────────────────────── elencos

/** Atleta do catálogo com atributos determinísticos (mesma regra de `world-catalog.ts`). */
export function catalogPlayer(seed: number, raw: { id: string; name: string; age: number; country: string; position: string; overall: number; potential: number; traits: AttributeKey[] }, index: number): SquadPlayer | null {
	if (!isPosition(raw.position)) return null;
	const position = raw.position as Position;
	const id = 'world/' + raw.id.replace(/^world\//, '');
	const rng = createRng(deriveSeed(seed, 'world-catalog', id));
	const { attributes, archetype } = generateAttributes(position, raw.overall, rng);
	for (const key of raw.traits) if (ALL_ATTRIBUTES.includes(key)) attributes[key] = Math.min(99, attributes[key] + 5);
	const overall = computeOverall(attributes, position);
	return {
		id, name: raw.name, shortName: raw.name.split(' ').at(-1) ?? raw.name, number: index + 1, age: raw.age,
		nationality: raw.country.toUpperCase(), position, overall, potential: Math.max(overall, raw.potential), condition: 100, morale: 'boa',
		attributes, archetype, appearance: randomAppearance(rng)
	};
}

const rosterCache = new WeakMap<WorldSnapshot, Map<string, SquadPlayer[]>>();

/** Registra os clubes do save (nome, cores, estádio) e devolve o elenco-base de um clube do catálogo. */
export function snapshotRoster(snapshot: WorldSnapshot | undefined, seed: number): ((clubId: string) => SquadPlayer[] | undefined) | undefined {
	if (!snapshot) return undefined;
	registerClubs(snapshot.clubs);
	let cache = rosterCache.get(snapshot);
	if (!cache) rosterCache.set(snapshot, (cache = new Map()));
	return (clubId) => {
		const rows = snapshot.players[clubId];
		if (!rows) return undefined;
		let squad = cache.get(clubId);
		if (!squad) {
			squad = rows.flatMap(([id, name, age, country, position, , overall, potential, traits], i) => {
				const p = catalogPlayer(seed, { id, name, age, country, position, overall, potential, traits }, i);
				return p ? [p] : [];
			});
			cache.set(clubId, squad);
		}
		return squad;
	};
}

const sanitized = new WeakMap<object, WorldSnapshot | undefined>();

/** Valida o snapshot do save (memorizado pelo objeto: o cache de elencos continua valendo entre chamadas). */
export function sanitizeSnapshot(input: unknown): WorldSnapshot | undefined {
	if (!input || typeof input !== 'object') return undefined;
	if (sanitized.has(input)) return sanitized.get(input);
	const value = readSnapshot(input);
	sanitized.set(input, value);
	return value;
}

function readSnapshot(input: object): WorldSnapshot | undefined {
	const raw = input as Partial<WorldSnapshot>;
	if (typeof raw.catalog !== 'string' || !Array.isArray(raw.clubs) || !raw.players || typeof raw.players !== 'object') return undefined;
	const clubs = raw.clubs.filter((c): c is Club => !!c && typeof c.id === 'string' && WORLD_CLUB.test(c.id) && typeof c.name === 'string' && !!c.colors);
	return { catalog: raw.catalog, clubs, players: raw.players as Record<string, CompactPlayer[]> };
}

// ─────────────────────────────────────────────────────────────── calendário europeu

/** Domingos sem rodada nacional: datas FIFA da temporada e a semana de Natal/Ano-Novo. */
function blockedSundays(season: number): Set<string> {
	const out = new Set<string>();
	const windows: Array<[string, string]> = [
		[`${season}-09-01`, `${season}-09-09`],
		[`${season}-10-05`, `${season}-10-13`],
		[`${season}-11-09`, `${season}-11-17`],
		[`${season}-12-24`, `${season + 1}-01-01`],
		[`${season + 1}-03-22`, `${season + 1}-03-30`]
	];
	for (const [from, to] of windows) for (let d = from; d <= to; d = addDays(d, 1)) if (weekday(d) === 0) out.add(d);
	return out;
}

const dateCache = new Map<string, string[]>();

/**
 * Datas das rodadas: domingos de meados de agosto ao fim de maio, sem datas FIFA. Quando não cabem
 * todas as rodadas, quartas-feiras entram nas semanas livres, distribuídas ao longo da temporada.
 */
export function europeanRoundDates(season: number, rounds: number): string[] {
	const key = `${season}:${rounds}`;
	const known = dateCache.get(key);
	if (known) return known;
	let first = `${season}-08-16`;
	while (weekday(first) !== 0) first = addDays(first, 1);
	const last = `${season + 1}-05-30`;
	const blocked = blockedSundays(season);
	const sundays: string[] = [];
	for (let d = first; d <= last; d = addDays(d, 7)) if (!blocked.has(d)) sundays.push(d);
	let dates = sundays.slice(0, rounds);
	const missing = rounds - dates.length;
	if (missing > 0) {
		// Quartas entre domingos seguidos (nunca na semana de data FIFA), espalhadas pela temporada.
		const candidates = sundays.slice(1).map((s) => addDays(s, -4)).filter((w) => !blocked.has(addDays(w, 4)));
		const step = candidates.length / missing;
		const midweek = Array.from({ length: missing }, (_, i) => candidates[Math.min(candidates.length - 1, Math.floor(i * step + step / 2))]);
		dates = [...sundays, ...midweek].sort().slice(0, rounds);
	}
	dateCache.set(key, dates);
	return dates;
}

export function europeanSeasonStart(season: number): string {
	return `${season}-08-02`;
}

// ─────────────────────────────────────────────────────────────── regulamento e tabelas

export function worldRounds(size: number, legs: 1 | 2): number {
	return (size % 2 === 0 ? size - 1 : size) * legs;
}

/**
 * Classificação com o critério da liga:
 *  - `confronto-direto` (Espanha, Itália): pontos → mini-tabela entre os empatados (pontos, saldo, gols) → saldo → gols;
 *  - `saldo` (Inglaterra, Alemanha, França, Holanda): pontos → saldo → gols marcados.
 */
export function worldStandings(clubIds: string[], results: MatchResult[], tiebreak: Tiebreak, names: (id: string) => string = (id) => getClub(id)?.name ?? id): StandingRow[] {
	const base = computeStandings(clubIds, results);
	const byPoints = new Map<number, StandingRow[]>();
	for (const r of base) byPoints.set(r.points, [...(byPoints.get(r.points) ?? []), r]);
	const h2h = (tied: StandingRow[]) => {
		const ids = new Set(tied.map((r) => r.clubId));
		const mini = new Map(computeStandings([...ids], results.filter((m) => ids.has(m.home) && ids.has(m.away))).map((r) => [r.clubId, r]));
		return (a: StandingRow, b: StandingRow) => {
			const x = mini.get(a.clubId)!, y = mini.get(b.clubId)!;
			return y.points - x.points || y.goalDiff - x.goalDiff || y.goalsFor - x.goalsFor;
		};
	};
	const sorted = [...byPoints.entries()].sort((a, b) => b[0] - a[0]).flatMap(([, tied]) => {
		const mini = tiebreak === 'confronto-direto' && tied.length > 1 ? h2h(tied) : () => 0;
		return [...tied].sort((a, b) => mini(a, b) || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || names(a.clubId).localeCompare(names(b.clubId), 'pt-BR'));
	});
	return sorted.map((r, i) => ({ ...r, position: i + 1 }));
}

/** Turno e returno (ou só turno), com datas do calendário europeu. */
export function worldDivisionFixtures(season: number, div: string, ids: string[], legs: 1 | 2, careerSeed: number, version: ScheduleVersion = 3): Fixture[] {
	if (ids.length < 2 || ids.length % 2 !== 0) return [];
	const all = generateLeagueFixtures(deriveSeed(careerSeed, 'cal', `${season}:${div}`), ids, version);
	const fixtures = legs === 2 ? all : all.filter((f) => f.round <= ids.length - 1);
	const dates = europeanRoundDates(season, worldRounds(ids.length, legs));
	return fixtures.map((f) => ({ ...f, date: dates[f.round - 1], competition: div }));
}

/**
 * Ordem anual de uma divisão sem jogos (reserva de acesso): reputação + sorteio determinístico, a mesma
 * política das divisões brasileiras inativas. Não inventa placares nem campeões.
 */
export function projectedOrder(ids: string[], careerSeed: number, season: number, div: string): string[] {
	return ids
		.map((id) => ({ id, score: (getClub(id)?.reputation ?? 2) * 8 + createRng(deriveSeed(careerSeed, 'acessos', `${season}:${div}:${id}`)).int(0, 30) }))
		.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
		.map(({ id }) => id);
}

export function worldDivisionLabel(rule: WorldDivisionRule | undefined, div: string): string {
	return rule?.name ?? div;
}
