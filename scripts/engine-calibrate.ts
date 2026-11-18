// Calibração pela liga real: um turno completo da Série A 2026 com técnicos da IA.
// Mede gols, finalizações, conversão, goleadas e a dispersão da tabela (pontos projetados para 38 rodadas).
// Referências (Brasileirão Série A 2023–2025, ver docs/MOTOR.md): ~2,3–2,5 gols/jogo; ~12–13 chutes e ~4 no alvo por time;
// campeão ~75–80 pts; lanterna ~25–35 pts; jogos com 5+ gols ~8–10%.
// Uso: node scripts/engine-calibrate.ts [semente] [divisão] [ia|fixo]
import '../src/lib/data/brasil.ts';
import { TEMPORADA_2026 } from '../src/lib/data/brasil.ts';
import type { Career } from '../src/lib/domain/career.ts';
import { aiTeam } from '../src/lib/domain/matchday.ts';
import { computeStandings, generateLeagueFixtures } from '../src/lib/domain/season.ts';
import { simulateMatch } from '../src/lib/engine/match.ts';
import { buildTeamSetup } from '../src/lib/engine/teams.ts';
import { generateSquad, squadStrength } from '../src/lib/domain/squad.ts';
import { requireClub } from '../src/lib/domain/clubs.ts';
const seed = Number(process.argv[2] ?? 2026);
const div = process.argv[3] ?? 'serie-a';
const mode = process.argv[4] ?? 'ia';
const team = (id: string, round: number) => {
	if (mode === 'ia') return aiTeam(career, id, ctx, round).setup;
	const c = requireClub(id);
	return buildTeamSetup({ id, name: c.name, short: c.short, colors: c.colors }, generateSquad(id, seed), { formation: '4-3-3', mentality: 'equilibrada', style: 'posse' });
};
const career = { seed } as Career;
const ctx = { season: 2026, firstSeason: 2026 };
const ids = TEMPORADA_2026.competicoes.find((c) => c.id === div)!.clubes;
const fx = generateLeagueFixtures(seed, ids).filter((f) => f.round <= ids.length - 1);
const res: Array<{ home: string; away: string; homeGoals: number; awayGoals: number }> = [];
const a = { sh: 0, sot: 0, big: 0, d: 0, hw: 0, xg: 0 };
const t0 = performance.now();
for (const f of fx) {
	const r = simulateMatch({ home: team(f.home, f.round), away: team(f.away, f.round), seed: seed * 1000 + res.length });
	res.push({ home: f.home, away: f.away, homeGoals: r.homeGoals, awayGoals: r.awayGoals });
	for (const s of [r.stats.home, r.stats.away]) { a.sh += s.shots; a.sot += s.shotsOnTarget; a.xg += s.xg; }
	if (r.homeGoals + r.awayGoals >= 5) a.big++;
	if (r.homeGoals === r.awayGoals) a.d++; else if (r.homeGoals > r.awayGoals) a.hw++;
}
const n = res.length;
const goals = res.reduce((s, r) => s + r.homeGoals + r.awayGoals, 0);
const table = computeStandings(ids, res);
const scale = (2 * (ids.length - 1)) / (ids.length - 1);
console.log(`${div} semente ${seed}: ${n} jogos, gols/jogo ${(goals / n).toFixed(2)}, empates ${((a.d / n) * 100).toFixed(0)}%, mandante ${((a.hw / n) * 100).toFixed(0)}%, 5+ gols ${((a.big / n) * 100).toFixed(0)}%`);
console.log(`por time: chutes ${(a.sh / n / 2).toFixed(1)}, no alvo ${(a.sot / n / 2).toFixed(1)}, xG ${(a.xg / n / 2).toFixed(2)}, conversão no alvo ${((goals / a.sot) * 100).toFixed(0)}%`);
console.log(`pontos projetados (38 rodadas): campeão ${Math.round(table[0].points * scale)}, 4º ${Math.round(table[3].points * scale)}, 17º ${Math.round(table[16]?.points * scale)}, lanterna ${Math.round(table.at(-1)!.points * scale)}  (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
console.log(table.map((r) => `${r.clubId}(${squadStrength(generateSquad(r.clubId, seed))}) ${r.points}`).join(' · '));
