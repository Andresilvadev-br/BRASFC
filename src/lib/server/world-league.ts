import { ITALIAN_SECOND } from '#lib/domain/italian-postseason.ts';
import supplements from '#lib/data/world/2026/added-clubs.json' with { type: 'json' };
import germanClubs from '#lib/data/world/2026/german-clubs.json' with { type: 'json' };
import { continentalSupercupClubs } from '#lib/data/world/2026/continental-supercups.ts';
import type { Club } from '#lib/domain/clubs.ts';
import { careerStart } from '#lib/domain/career.ts';
import type { DivisionId, LeagueState } from '#lib/domain/league.ts';
import { GERMAN_FIRST, GERMAN_SECOND, GERMAN_THIRD } from '#lib/domain/german-playoffs.ts';
import { WORLD_DIVISION_NAMES, SPAIN_FIRST, SPAIN_SECOND, type CompactPlayer, type Tiebreak, type WorldDivisionRule, type WorldPlan, type WorldSnapshot } from '#lib/domain/world-league.ts';
import type { AttributeKey } from '#lib/engine/attributes.ts';
import { countryName } from '#lib/world/countries.ts';
import { newestWorldCatalog, openWorldCatalog } from './world-catalog.ts';

/**
 * Mundo `mundo` (World Database): monta a liga jogável de uma carreira a partir do catálogo instalado.
 *
 *  - Uma divisão só é jogável com TODOS os inscritos da edição 2026/27 confirmados (`membership_evidence`,
 *    com fonte por linha). Faltou um clube, a divisão fica fora; nada é inventado.
 *  - O nível de baixo, quando não é jogável, vira reserva de acesso com os clubes conhecidos dele.
 *  - O regulamento vem do catálogo (tamanho, turno e returno, rebaixados) e o critério de desempate é o
 *    oficial de cada liga.
 */
export const EDITION = '2026/27';

interface SupplementalClub {
	name: string;
	city: string;
	stadium: string;
	reputation?: number;
	colors?: string;
	players: Array<Array<string | number | null>>;
}

const additions = new Map<string, SupplementalClub>(Object.entries({ ...supplements, ...germanClubs }));
const extraMembers: Record<string, string[]> = {
	[SPAIN_SECOND]: Object.keys(supplements).filter((id) => id.startsWith('esp/')),
	[ITALIAN_SECOND]: Object.keys(supplements).filter((id) => id.startsWith('ita/')),
	[GERMAN_THIRD]: Object.keys(germanClubs)
};
const italianThird = ['pescara', 'reggiana', 'spezia', 'ssc-bari'].map((id) => `world/ita/${id}`);
const spanishThird = ['cd-mirandes', 'cultural-leonesa', 'real-zaragoza', 'sd-huesca'].map((id) => `world/esp/${id}`);
const germanFourth = ['fc-erzgebirge-aue', 'ssv-ulm-1846', '1-fc-schweinfurt-05', 'tsv-1860-munchen'].map((id) => `world/ger/${id}`);

const OFFICIAL_NAMES = WORLD_DIVISION_NAMES;

/**
 * Critério após os pontos. Espanha (art. 201 do Reglamento General RFEF) e Itália (Lega Serie A, desde 2022/23):
 * confronto direto. Inglaterra, Alemanha, França e Holanda: saldo de gols.
 */
const TIEBREAK: Record<string, Tiebreak> = { esp: 'confronto-direto', ita: 'confronto-direto' };

interface CatalogRules { teams?: number; two_rounds?: boolean; relegated_directly?: number; relegated?: number; promotion_places?: number; groups?: number }

export interface WorldPlanDivision {
	id: string;
	country: string;
	level: number;
	name: string;
	teams: number;
	verified: string[];
	playable: boolean;
	rule: WorldDivisionRule;
}

function readDivisions(catalogId: string | null) {
	const db = catalogId ? openWorldCatalog(catalogId) : undefined;
	if (!db) return null;
	const verified = new Map<string, string[]>();
	if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'membership_evidence'").get()) {
		for (const row of db.prepare('SELECT competition, club FROM membership_evidence WHERE edition = ? ORDER BY competition, club').all(EDITION)) {
			const list = verified.get(String(row.competition)) ?? [];
			list.push(`world/${row.club}`);
			verified.set(String(row.competition), list);
		}
	}
	const out: WorldPlanDivision[] = [];
	for (const row of db.prepare("SELECT id, territory, division, name, rules FROM competition WHERE kind = 'leagues' AND territory <> 'bra' ORDER BY territory, division").all()) {
		let rules: CatalogRules = {};
		try { rules = JSON.parse(String(row.rules)) as CatalogRules; } catch { /* regulamento ilegível: não jogável */ }
		const country = String(row.territory);
		const level = Number(row.division);
		const id = `league/${country}/${level}`;
		const teams = Number(rules.teams) || 0;
		const clubs = [...new Set([...(verified.get(String(row.id)) ?? []), ...(extraMembers[id] ?? []).map((club) => `world/${club}`)])];
		// Divisões com grupos ou mata-mata próprios ainda não têm formato no BRASFC: ficam fora até serem modeladas.
		const simpleFormat = !(Number(rules.groups) > 1);
		const playable = simpleFormat && teams >= 4 && teams % 2 === 0 && clubs.length === teams && new Set(clubs).size === teams;
		out.push({
			id, country, level, name: OFFICIAL_NAMES[id] ?? `${countryName(country)} · ${level}ª divisão`, teams, verified: clubs, playable,
			rule: {
				name: OFFICIAL_NAMES[id] ?? `${countryName(country)} · ${level}ª divisão`, country, level, legs: rules.two_rounds === false ? 1 : 2,
				relegated: [SPAIN_SECOND, ITALIAN_SECOND, GERMAN_THIRD].includes(id) ? 4 : Math.max(0, Number(rules.relegated_directly ?? rules.relegated) || 0),
				promoted: [SPAIN_SECOND, ITALIAN_SECOND, GERMAN_SECOND, GERMAN_THIRD].includes(id) ? 2 : Math.max(0, Number(rules.promotion_places) || 0),
				tiebreak: TIEBREAK[country] ?? 'saldo'
			}
		});
	}
	return { db, divisions: out };
}

let cache: { key: string; value: ReturnType<typeof readDivisions> } | undefined;
export function worldDivisions(catalogId: string | null = newestWorldCatalog() ?? null) {
	const key = catalogId ?? '-';
	if (cache?.key !== key) cache = { key, value: readDivisions(catalogId) };
	return cache.value?.divisions ?? [];
}

const VALID_COLOR = /^#[a-f\d]{6}$/i;

export function missingSupplementalClubs(db: NonNullable<ReturnType<typeof openWorldCatalog>>): string[] {
	const exists = db.prepare('SELECT 1 FROM club WHERE id = ?');
	return [...additions.keys()].filter((id) => !exists.get(id));
}

export function supplementalClub(id: string): Club | undefined {
	const row = additions.get(id.replace(/^world\//, ''));
	return row ? clubCard({ ...row, state: row.city }, id) : undefined;
}

export function clubCard(row: Record<string, unknown>, id: string): Club {
	let colors: unknown[] = [];
	try { colors = JSON.parse(String(row.colors)) as unknown[]; } catch { /* sem cores: neutras */ }
	const color = (i: number, fallback: string) => (typeof colors[i] === 'string' && VALID_COLOR.test(colors[i] as string) ? colors[i] as string : fallback);
	const name = String(row.name);
	return {
		id, name, short: name.replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 3).toUpperCase() || 'CLB', city: String(row.state ?? ''),
		reputation: Math.max(1, Math.min(5, Number(row.reputation) || 2)), stadium: String(row.stadium ?? 'Estádio não informado'),
		colors: { primary: color(0, '#293c3c'), secondary: color(1, '#f5f7fa'), shorts: '#293c3c', socks: '#293c3c' },
		crest: { shape: 'escudo', pattern: 'liso' }, colorsProvisional: true
	};
}

/**
 * Liga de uma carreira nova nos países pedidos (todas as divisões jogáveis de cada um). Devolve null se algum
 * país não tiver divisão jogável: a interface só oferece países com `playable`.
 */
export function buildWorldPlan(countries: string[], catalogId: string | null = newestWorldCatalog() ?? null): WorldPlan | null {
	if (!catalogId || !countries.length || countries.includes('bra')) return null;
	const read = (cache?.key === catalogId ? cache.value : null) ?? readDivisions(catalogId);
	if (!read) return null;
	const season = careerStart('mundo').season;
	const divisions: LeagueState['divisions'] = {};
	const rules: Record<string, WorldDivisionRule> = {};
	const reserves: Record<string, string[]> = {};
	for (const country of countries) {
		const all = read.divisions.filter((d) => d.country === country);
		const playable = all.filter((d) => d.playable);
		if (!playable.length) return null;
		for (const d of playable) {
			divisions[d.id as DivisionId] = [...d.verified];
			rules[d.id] = d.rule;
			const below = all.find((x) => x.level === d.level + 1);
			// O nível de baixo não jogável vira reserva de acesso com os clubes conhecidos (sem completar com fictícios).
			if (below && !below.playable && below.verified.length) reserves[d.id] = below.verified.filter((id) => !playable.some((p) => p.verified.includes(id)));
			if (d.id === SPAIN_SECOND) reserves[d.id] = spanishThird;
			if (d.id === ITALIAN_SECOND) reserves[d.id] = italianThird;
			if (d.id === GERMAN_THIRD) reserves[d.id] = germanFourth;
		}
	}
	const snapshot = catalogSnapshot(catalogId, [...Object.values(divisions).flat(), ...Object.values(reserves).flat()] as string[], season);
	if (!snapshot) return null;
	const active = new Set(snapshot.clubs.map(({ id }) => id));
	const guests = continentalSupercupClubs(season, countries).filter((id) => !active.has(id));
	const additional = guests.length ? catalogSnapshot(catalogId, guests, season) : null;
	if (additional) {
		snapshot.clubs.push(...additional.clubs);
		Object.assign(snapshot.players, additional.players);
	}
	const league: LeagueState = {
		world: 'mundo', season, scheduleVersion: 3, divisions,
		selection: { divisions: Object.keys(divisions).sort() as DivisionId[], cup: false }, rules, reserves,
		...(divisions[SPAIN_FIRST as DivisionId] && divisions[SPAIN_SECOND as DivisionId] ? { spanishPlayoff: [] } : {}),
		...(divisions[ITALIAN_SECOND as DivisionId] ? { italianPostseason: {} } : {}),
		...(divisions[GERMAN_FIRST as DivisionId] && divisions[GERMAN_SECOND as DivisionId] && divisions[GERMAN_THIRD as DivisionId] ? { germanPlayoffs: {} } : {})
	};
	return { countries: [...countries].sort(), league, snapshot };
}

/** Cópia compacta do catálogo para o save, inclusive para adversários de um país inativo. */
export function catalogSnapshot(catalogId: string, clubsToLoad: string[], season: number): WorldSnapshot | null {
	const db = openWorldCatalog(catalogId);
	if (!db) return null;
	const clubQuery = db.prepare('SELECT name, stadium, reputation, colors, state FROM club WHERE id = ?');
	const playerQuery = db.prepare('SELECT id, name, age, country, position, starter, overall_estimate, potential_estimate, traits FROM player WHERE club = ? ORDER BY starter DESC, id');
	const clubs: Club[] = [];
	const players: Record<string, CompactPlayer[]> = {};
	for (const id of new Set(clubsToLoad)) {
		const raw = id.replace(/^world\//, '');
		const additional = additions.get(raw);
		const row = clubQuery.get(raw) ?? (additional ? { ...additional, state: additional.city } : undefined);
		if (!row) return null; // inscrição aponta para clube ausente: catálogo inconsistente
		clubs.push(clubCard(row, id));
		players[id] = additional ? additional.players.map(([number, name, position, country, dateOfBirth], i): CompactPlayer => {
			const birth = typeof dateOfBirth === 'string' ? dateOfBirth : null;
			const age = birth ? season - Number(birth.slice(0, 4)) - Number(birth.slice(5) > '08-02') : null;
			return [`${raw}-${raw.split('/')[0]}26${i + 1}`, String(name), age, String(country ?? ''), String(position), 0, 63, 66, [],
				typeof number === 'number' ? number : undefined];
		}) : playerQuery.all(raw).map((p) => [
			String(p.id), String(p.name), Number(p.age), String(p.country), String(p.position), p.starter ? 1 : 0,
			Number(p.overall_estimate), Number(p.potential_estimate), JSON.parse(String(p.traits)) as AttributeKey[]
		]);
	}
	return { catalog: catalogId, clubs, players };
}
