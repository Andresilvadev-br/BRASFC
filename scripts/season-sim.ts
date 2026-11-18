// Temporada completa do mundo Brasil (Séries A, B e C) sem banco de dados, com fechamento
// de temporada (acesso/rebaixamento) e início da seguinte. Mede tempo por rodada.
import '../src/lib/data/brasil.ts';
import type { Career } from '../src/lib/domain/career.ts';
import { closeSeason, computeCGroups, initialLeague, needsCGroups, seasonFixtures, type StoredRoundResult } from '../src/lib/domain/league.ts';
import { simulateOtherFixtures } from '../src/lib/domain/matchday.ts';
const career = { seed: 20260001 } as Career;
let league = initialLeague('brasil', 2026);
const results: StoredRoundResult[] = [];
let ms = 0, matches = 0;
for (let round = 1; round <= 38; round++) {
	if (needsCGroups(league, round)) league = { ...league, cGroups: computeCGroups(league, results) };
	const fx = seasonFixtures(league, career.seed).filter((f) => f.round === round);
	const t0 = performance.now();
	for (const r of simulateOtherFixtures(career, fx, { season: 2026, firstSeason: 2026 })) results.push({ ...r, round });
	ms += performance.now() - t0;
	matches += fx.length;
}
const out = closeSeason(league, results);
const goals = results.reduce((s, r) => s + r.homeGoals + r.awayGoals, 0);
console.log(`partidas ${matches}, gols/jogo ${(goals / matches).toFixed(2)}, tempo por rodada ${(ms / 38 / 1000).toFixed(2)} s`);
for (const d of ['serie-a', 'serie-b', 'serie-c'] as const) console.log(d, 'campeão', out.champions[d], 'líder pts', out.tables[d]?.[0]?.points, 'lanterna pts', out.tables[d]?.at(-1)?.points);
console.log('movimentos', out.moves.map((m) => `${m.clubId}:${m.from}→${m.to}`).join(' '));
console.log('próxima temporada', out.next.season, Object.fromEntries(Object.entries(out.next.divisions).map(([k, v]) => [k, v?.length])));
