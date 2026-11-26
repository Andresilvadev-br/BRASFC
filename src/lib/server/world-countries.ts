import { BRASIL_DIVISIONS, DIVISION_LABELS, divisionMatchCount } from '#lib/domain/league.ts';
import { initialCareerData } from '#lib/domain/career.ts';
import type { Club } from '#lib/domain/clubs.ts';
import { cupMatchCount } from '#lib/domain/cup.ts';
import type { CountryCode, LoadEstimate, WorldCountry, WorldDivision } from '#lib/world/contract.ts';
import { countryConfederation, countryFlag, countryName } from '#lib/world/countries.ts';
import { newestWorldCatalog, openWorldCatalog } from './world-catalog.ts';
import { worldDivisions } from './world-league.ts';

/**
 * PROVISÓRIO (branch de interface): a engine (`feature/world-database-engine`) substitui esta função
 * com a mesma assinatura (docs/WORLD-CONTRACT.md).
 *  - Brasil: dados nativos (Séries A a D + Copa do Brasil), jogáveis.
 *  - Demais países: divisões definidas no catálogo, sem inscrições confirmadas, `playable: false`.
 *    O custo é estimado pelo regulamento da fonte.
 */

/** Custo médio medido por partida do modelo rápido, incluindo a gravação da rodada. Base: P50 de 256 ms por rodada brasileira (docs/RELATORIO-DEV-0.12.md). */
export const MS_PER_MATCH = 2.5;
/** Tamanho médio de um resultado gravado no save. */
const KB_PER_MATCH = 0.35;

export function estimateLoad(matches: number): LoadEstimate {
	return { matches, seasonMs: Math.round(matches * MS_PER_MATCH), saveKb: Math.round(matches * KB_PER_MATCH) };
}

interface CatalogRules { teams?: number; two_rounds?: boolean; groups?: number; knockout_teams?: number }

/** Jogos de uma divisão a partir do regulamento da fonte: pontos corridos e mata-mata final, quando houver. */
export function rulesMatchCount(rules: CatalogRules): number {
	const teams = Math.max(0, Number(rules.teams) || 0);
	const groups = Math.max(1, Number(rules.groups) || 1);
	const perGroup = Math.ceil(teams / groups);
	const legs = rules.two_rounds === false ? 1 : 2;
	const league = groups * (perGroup * (perGroup - 1) / 2) * legs;
	const knockout = Math.max(0, (Number(rules.knockout_teams) || 0) - 1) * 2;
	return league + knockout;
}

function brazil(): WorldCountry {
	const { league, cup } = initialCareerData({ world: 'brasil', worldSelection: { countries: ['bra'] }, mode: 'coach', clubId: '', personName: '' }, 1);
	if (!league || !cup) throw new Error('Seleção inicial do Brasil indisponível.');
	const divisions: WorldDivision[] = BRASIL_DIVISIONS.map((id, i) => ({
		id, country: 'bra', level: i + 1, name: DIVISION_LABELS[id], clubs: [...(league.divisions[id] ?? [])], playable: true
	}));
	const matches = BRASIL_DIVISIONS.reduce((sum, id) => sum + divisionMatchCount(league, id), 0) + cupMatchCount(cup);
	return {
		code: 'bra', name: countryName('bra'), flag: countryFlag('bra')!, confederation: countryConfederation('bra'),
		divisions, cups: ['copa-do-brasil'], clubCount: divisions.reduce((n, d) => n + d.clubs.length, 0) + (league.pool?.length ?? 0),
		playable: true, load: estimateLoad(matches)
	};
}

let cache: { key: string; value: WorldCountry[] } | undefined;

export function worldCountries(catalogId: string | null = newestWorldCatalog() ?? null): WorldCountry[] {
	const key = catalogId ?? '-';
	if (cache?.key === key) return cache.value;
	const out: WorldCountry[] = [brazil()];
	const db = catalogId ? openWorldCatalog(catalogId) : undefined;
	if (db) {
		const clubs = new Map(db.prepare('SELECT country, COUNT(*) AS n FROM club GROUP BY country').all().map((r) => [String(r.country), Number(r.n)]));
		const byCountry = new Map<CountryCode, WorldDivision[]>();
		const matches = new Map<CountryCode, number>();
		const verified = new Map<string, string[]>();
		const planned = new Map(worldDivisions(catalogId).map((d) => [d.id, d]));
		if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'membership_evidence'").get()) {
			for (const row of db.prepare("SELECT competition, club FROM membership_evidence WHERE edition = '2026/27' ORDER BY competition, club").all()) {
				const competition = String(row.competition);
				const ids = verified.get(competition) ?? [];
				ids.push(`world/${row.club}`);
				verified.set(competition, ids);
			}
		}
		for (const row of db.prepare("SELECT id, territory, division, name, rules FROM competition WHERE kind = 'leagues' ORDER BY territory, division").all()) {
			const code = String(row.territory);
			if (code === 'bra') continue; // Brasil usa as divisões nativas
			let rules: CatalogRules = {};
			try { rules = JSON.parse(String(row.rules)) as CatalogRules; } catch { /* regulamento ilegível: sem jogos estimados */ }
			const list = byCountry.get(code) ?? [];
			// Jogável = todos os inscritos 2026/27 conferidos e formato suportado (src/lib/server/world-league.ts).
			const plan = planned.get(`league/${code}/${row.division}`);
			list.push({ id: `league/${code}/${row.division}`, country: code, level: Number(row.division), name: plan?.name ?? String(row.name ?? `${row.division}ª divisão`), clubs: plan?.playable ? [...plan.verified] : verified.get(String(row.id)) ?? [], playable: !!plan?.playable });
			byCountry.set(code, list);
			matches.set(code, (matches.get(code) ?? 0) + rulesMatchCount(rules));
		}
		for (const [code, divisions] of byCountry) {
			out.push({
				code, name: countryName(code), flag: countryFlag(code) ?? 'xx', confederation: countryConfederation(code),
				divisions, cups: [], clubCount: clubs.get(code) ?? 0, playable: divisions.some((d) => d.playable),
				load: estimateLoad(matches.get(code) ?? 0)
			});
		}
	}
	out.sort((a, b) => Number(b.code === 'bra') - Number(a.code === 'bra') || Number(b.playable) - Number(a.playable) || a.name.localeCompare(b.name, 'pt-BR'));
	cache = { key, value: out };
	return out;
}

const VALID_COLOR = /^#[a-f\d]{6}$/i;

/**
 * Dados mínimos para mostrar clubes estrangeiros na escolha de clube (nome, sigla, cores e reputação), no mesmo
 * formato que `world-catalog.ts` registra ao abrir um elenco. Só para divisões jogáveis.
 */
export function worldClubCards(countries: WorldCountry[], catalogId: string | null = newestWorldCatalog() ?? null): Array<Club & { division: string }> {
	const wanted = countries.filter((c) => c.code !== 'bra' && c.playable).flatMap((c) => c.divisions.filter((d) => d.playable).flatMap((d) => d.clubs.map((id) => ({ id, division: d.id }))));
	const db = catalogId ? openWorldCatalog(catalogId) : undefined;
	if (!db || !wanted.length) return [];
	const query = db.prepare('SELECT name, stadium, reputation, colors, state FROM club WHERE id = ?');
	return wanted.flatMap(({ id, division }) => {
		const row = query.get(id.replace(/^world\//, ''));
		if (!row) return [];
		let colors: unknown[] = [];
		try { colors = JSON.parse(String(row.colors)) as unknown[]; } catch { /* cores ausentes: neutras */ }
		const color = (i: number, fallback: string) => (typeof colors[i] === 'string' && VALID_COLOR.test(colors[i] as string) ? colors[i] as string : fallback);
		const name = String(row.name);
		return [{
			id, division, name, short: name.replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 3).toUpperCase() || 'CLB', city: String(row.state ?? ''),
			reputation: Math.max(1, Math.min(5, Number(row.reputation) || 2)), stadium: String(row.stadium ?? 'Estádio não informado'),
			colors: { primary: color(0, '#293c3c'), secondary: color(1, '#f5f7fa'), shorts: '#293c3c', socks: '#293c3c' },
			crest: { shape: 'escudo' as const, pattern: 'liso' as const }, colorsProvisional: true
		}];
	});
}
