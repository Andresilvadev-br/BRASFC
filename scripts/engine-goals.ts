// Diagnóstico de gols entre times da IA por diferença de força (reputação estimada 1–5).
// Uso: node scripts/engine-goals.ts [jogos por par]
import '../src/lib/data/brasil.ts';
import { CLUBES_2026 } from '../src/lib/data/brasil.ts';
import type { Career } from '../src/lib/domain/career.ts';
import { aiTeam } from '../src/lib/domain/matchday.ts';
import { generateSquad, squadStrength } from '../src/lib/domain/squad.ts';
import { simulateMatch } from '../src/lib/engine/match.ts';
const career = { seed: 5151, season: 2026, clubId: 'flamengo', data: { world: 'brasil' } } as unknown as Career;
const ctx = { season: 2026, firstSeason: 2026 };
const N = Number(process.argv[2] ?? 6);
const byRep = new Map<number, string[]>();
for (const c of CLUBES_2026) (byRep.get(c.forcaEstimada) ?? byRep.set(c.forcaEstimada, []).get(c.forcaEstimada)!).push(c.id);
console.log('clubes por força', [...byRep].map(([k, v]) => `${k}:${v.length}`).join(' '));
console.log('força do elenco (média dos 11 melhores) por reputação', [...byRep].sort().map(([k, v]) => `${k}:${(v.reduce((s, id) => s + squadStrength(generateSquad(id, career.seed)), 0) / v.length).toFixed(1)}`).join(' '));
const rows: string[] = [];
let seed = 1;
for (const hr of [1, 2, 3, 4, 5]) for (const ar of [1, 2, 3, 4, 5]) {
	const hs = byRep.get(hr), as = byRep.get(ar);
	if (!hs || !as) continue;
	let g = 0, sh = 0, sot = 0, hw = 0, d = 0;
	for (let i = 0; i < N; i++) {
		const h = hs[i % hs.length], a = as[(i + 1) % as.length];
		if (h === a) continue;
		const r = simulateMatch({ home: aiTeam(career, h, ctx, i).setup, away: aiTeam(career, a, ctx, i).setup, seed: seed++ });
		g += r.homeGoals + r.awayGoals;
		sh += r.stats.home.shots + r.stats.away.shots;
		sot += r.stats.home.shotsOnTarget + r.stats.away.shotsOnTarget;
		if (r.homeGoals > r.awayGoals) hw++; else if (r.homeGoals === r.awayGoals) d++;
	}
	rows.push(`${hr}x${ar}  gols ${(g / N).toFixed(2)}  chutes ${(sh / N).toFixed(1)}  no alvo ${(sot / N).toFixed(1)}  vit.casa ${hw}/${N} emp ${d}`);
}
console.log(rows.join('\n'));
