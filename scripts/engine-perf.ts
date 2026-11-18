// Mede o custo de uma partida do motor e onde o tempo é gasto (montagem x simulação).
// Uso: node scripts/engine-perf.ts [partidas]
import '../src/lib/data/brasil.ts';
import type { Career } from '../src/lib/domain/career.ts';
import { aiTeam } from '../src/lib/domain/matchday.ts';
import { simulateMatch } from '../src/lib/engine/match.ts';
const career = { seed: 777, season: 2026, clubId: 'flamengo', data: { world: 'brasil' } } as unknown as Career;
const ctx = { season: 2026, firstSeason: 2026 };
const pairs = [['flamengo', 'palmeiras'], ['bahia', 'santos'], ['gremio', 'vasco'], ['sport', 'goias']];
const N = Number(process.argv[2] ?? 40);
let setupMs = 0, simMs = 0;
for (let i = 0; i < N; i++) {
	const [h, a] = pairs[i % pairs.length];
	const t0 = performance.now();
	const home = aiTeam(career, h, ctx, i).setup, away = aiTeam(career, a, ctx, i).setup;
	const t1 = performance.now();
	simulateMatch({ home, away, seed: 1000 + i });
	simMs += performance.now() - t1;
	setupMs += t1 - t0;
}
console.log(`montagem ${(setupMs / N).toFixed(1)} ms/jogo, simulação ${(simMs / N).toFixed(1)} ms/jogo`);
