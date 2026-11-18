// Calibração pela POPULAÇÃO real das carreiras: clubes reais (forças variadas) com técnico da IA.
// Uso: node scripts/engine-population.ts [jogos] [modo: ia|fixo]
import '../src/lib/data/brasil.ts';
import { CLUBES_2026 } from '../src/lib/data/brasil.ts';
import { requireClub } from '../src/lib/domain/clubs.ts';
import type { Career } from '../src/lib/domain/career.ts';
import { aiTeam } from '../src/lib/domain/matchday.ts';
import { generateSquad } from '../src/lib/domain/squad.ts';
import { simulateMatch } from '../src/lib/engine/match.ts';
import { buildTeamSetup } from '../src/lib/engine/teams.ts';
const n = Number(process.argv[2] ?? 120);
const mode = process.argv[3] ?? 'ia';
const career = { seed: 31337 } as Career;
const ctx = { season: 2026, firstSeason: 2026 };
const ids = CLUBES_2026.map((c) => c.id);
const team = (id: string, i: number) => {
	if (mode === 'ia') return aiTeam(career, id, ctx, i).setup;
	const c = requireClub(id);
	return buildTeamSetup({ id, name: c.name, short: c.short, colors: c.colors }, generateSquad(id, career.seed), { formation: '4-3-3', mentality: 'equilibrada', style: 'posse' });
};
const a = { g: 0, sh: 0, sot: 0, xg: 0, d: 0, hw: 0, big: 0, saves: 0, blocked: 0 };
const t0 = performance.now();
for (let i = 0; i < n; i++) {
	// Pares dentro da mesma série (como numa liga real).
	const div = ['A', 'B', 'C'][i % 3];
	const pool = CLUBES_2026.filter((c) => c.serie === div).map((c) => c.id);
	const h = pool[(i * 7) % pool.length], w = pool[(i * 11 + 3) % pool.length];
	if (h === w) continue;
	const r = simulateMatch({ home: team(h, i), away: team(w, i), seed: 50000 + i });
	const g = r.homeGoals + r.awayGoals;
	a.g += g; if (g >= 5) a.big++;
	if (r.homeGoals === r.awayGoals) a.d++; else if (r.homeGoals > r.awayGoals) a.hw++;
	for (const s of [r.stats.home, r.stats.away]) { a.sh += s.shots; a.sot += s.shotsOnTarget; a.xg += s.xg; }
}
void ids;
const per = (v: number) => (v / n).toFixed(2);
console.log(`modo=${mode} partidas=${n} gols/jogo=${per(a.g)} empates=${((a.d / n) * 100).toFixed(0)}% mandante=${((a.hw / n) * 100).toFixed(0)}% jogos com 5+ gols=${((a.big / n) * 100).toFixed(0)}%`);
console.log(`por time: chutes=${per(a.sh / 2)} no alvo=${per(a.sot / 2)} xG=${per(a.xg / 2)} conversão no alvo=${((a.g / a.sot) * 100).toFixed(0)}%  ${((performance.now() - t0) / n).toFixed(0)} ms/jogo`);
