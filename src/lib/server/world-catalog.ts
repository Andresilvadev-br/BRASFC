import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import type { Career } from '#lib/domain/career.ts';
import { getClub, registerClubs } from '#lib/domain/clubs.ts';
import { normalizeSearch } from '#lib/domain/market-search.ts';
import type { RosterContext } from '#lib/domain/market.ts';
import { isPosition } from '#lib/domain/positions.ts';
import { createRng, deriveSeed } from '#lib/domain/rng.ts';
import { randomAppearance } from '#lib/domain/appearance.ts';
import type { SquadPlayer } from '#lib/domain/squad.ts';
import { ALL_ATTRIBUTES, computeOverall, generateAttributes, type AttributeKey } from '#lib/engine/attributes.ts';

const FILE = /^[a-f0-9]{24}\.sqlite$/;
const PREFIX = 'world/';
const VALID_COLOR = /^#[a-f\d]{6}$/i;
const caches = new Map<string, DatabaseSync>();
const teamsByDb = new WeakMap<DatabaseSync, Map<string, Record<string, unknown>>>();
const require = createRequire(import.meta.url);
const directory = () => process.env.BRASFC_WORLD_CATALOGS ?? join(dirname(process.env.PGLITE_DIR ?? './data/pglite'), 'world-catalogs');

function database(id: string): DatabaseSync | undefined {
	if (!FILE.test(id + '.sqlite')) return;
	const file = join(directory(), id + '.sqlite');
	const old = caches.get(file);
	if (old) return old;
	if (!existsSync(file)) return;
	let db: DatabaseSync | undefined;
	try {
		if (!statSync(file).isFile()) return;
		const sqlite = require('node:sqlite') as typeof import('node:sqlite');
		db = new sqlite.DatabaseSync(file, { readOnly: true });
		db.exec('PRAGMA trusted_schema=OFF');
		db.prepare('SELECT id, name, stadium, reputation, colors, country, search_name FROM club LIMIT 0');
		db.prepare('SELECT id, name, age, country, position, starter, overall_estimate, potential_estimate, traits, search_name, club FROM player LIMIT 0');
		const values = db.prepare("SELECT key, value FROM metadata WHERE key IN ('format', 'catalog_id')").all();
		if (!values.some((r) => r.key === 'format' && r.value === '1') || !values.some((r) => r.key === 'catalog_id' && r.value === id)) {
			db.close();
			return;
		}
		caches.set(file, db);
		return db;
	} catch {
		db?.close();
		return;
	}
}

/** Pacotes com nomes versionados podem coexistir. Escolhe o mais recente só para saves novos. */
export function newestWorldCatalog(): string | undefined {
	const dir = directory();
	try {
		const packs = readdirSync(dir, { withFileTypes: true }).filter((file) => file.isFile() && FILE.test(file.name))
			.map(({ name }) => ({ id: name.slice(0, -7), modified: statSync(join(dir, name)).mtimeMs }))
			.sort((a, b) => b.modified - a.modified || a.id.localeCompare(b.id));
		return packs.find(({ id }) => database(id))?.id;
	} catch {
		// Um catálogo opcional indisponível não impede a criação da carreira nacional.
		return;
	}
}

export function worldCatalog(career: Pick<Career, 'data' | 'seed'>) {
	const id = career.data.worldCatalog;
	if (!id) return;
	const db = database(id);
	if (!db) return;
	const rosterQueries = new Map<string, SquadPlayer[]>();
	let byId = teamsByDb.get(db);
	if (!byId) {
		const teams = db.prepare("SELECT id, name, stadium, reputation, colors FROM club WHERE country <> 'bra' ORDER BY search_name, id").all();
		byId = new Map(teams.map((team) => [PREFIX + String(team.id), team]));
		teamsByDb.set(db, byId);
	}
	const teams = byId;
	return {
		clubs: [...teams].map(([id, team]) => ({ id, name: String(team.name), division: null })),
		/** Limita a leitura dos CSV convertidos ao clube ou ao nome consultado. */
		clubsMatching(words: string[]) {
			if (!words.some((word) => word.length >= 3)) return new Set<string>();
			const clauses = words.map(() => '(p.search_name LIKE ? OR c.search_name LIKE ?)').join(' AND ');
			return new Set(db.prepare(`SELECT DISTINCT p.club FROM player p JOIN club c ON c.id = p.club
				WHERE c.country <> 'bra' AND ${clauses}`).all(...words.flatMap((word) => [`%${normalizeSearch(word)}%`, `%${normalizeSearch(word)}%`]))
				.map((row) => PREFIX + String(row.club)));
		},
		roster(clubId: string): SquadPlayer[] | undefined {
			const team = teams.get(clubId);
			if (!team) return;
			const known = rosterQueries.get(clubId);
			if (known) return known;
			if (!getClub(clubId)) {
				const colors = JSON.parse(String(team.colors)) as unknown[];
				const color = (i: number, fallback: string) => {
					const value = colors[i];
					return typeof value === 'string' && VALID_COLOR.test(value) ? value : fallback;
				};
				registerClubs([{ id: clubId, name: String(team.name), short: String(team.name).slice(0, 3).toUpperCase(), city: '',
					reputation: Math.max(1, Math.min(5, Number(team.reputation) || 2)), stadium: String(team.stadium ?? 'Estádio não informado'),
					colors: { primary: color(0, '#293c3c'), secondary: color(1, '#f5f7fa'), shorts: '#293c3c', socks: '#293c3c' },
					crest: { shape: 'escudo', pattern: 'liso' }, colorsProvisional: true }]);
			}
			const players = db.prepare('SELECT id, name, age, country, position, starter, overall_estimate, potential_estimate, traits FROM player WHERE club=? ORDER BY starter DESC, id')
				.all(String(team.id)).flatMap((p, index) => {
					if (!isPosition(p.position)) return [];
					const id = PREFIX + String(p.id);
					const rng = createRng(deriveSeed(career.seed, 'world-catalog', id));
					const { attributes, archetype } = generateAttributes(p.position, Number(p.overall_estimate), rng);
					for (const key of JSON.parse(String(p.traits)) as AttributeKey[]) {
						if (ALL_ATTRIBUTES.includes(key)) attributes[key] = Math.min(99, attributes[key] + 5);
					}
					const name = String(p.name);
					const overall = computeOverall(attributes, p.position);
					return [{
						id, name, shortName: name.split(' ').at(-1) ?? name, number: index + 1, age: Number(p.age),
						nationality: String(p.country).toUpperCase(), position: p.position, overall,
						potential: Math.max(overall, Number(p.potential_estimate)), condition: 100, morale: 'boa' as const,
						attributes, archetype, appearance: randomAppearance(rng), catalogRole: p.starter ? 'starter' as const : 'bench' as const
					}];
				});
			rosterQueries.set(clubId, players);
			if (rosterQueries.size > 80) rosterQueries.delete(rosterQueries.keys().next().value!);
			return players;
		}
	};
}

export function withWorldRoster(career: Pick<Career, 'data' | 'seed'>, ctx: RosterContext): RosterContext {
	const catalog = worldCatalog(career);
	return catalog ? { ...ctx, externalRoster: catalog.roster } : ctx;
}
