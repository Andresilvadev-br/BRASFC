// Impressão digital do motor: simula partidas fixas e gera um hash dos resultados completos.
// Otimizações de desempenho NÃO podem mudar este hash (mesmos placares, eventos e estatísticas).
import '../src/lib/data/brasil.ts';
import { createHash } from 'node:crypto';
import type { Career } from '../src/lib/domain/career.ts';
import { aiTeam } from '../src/lib/domain/matchday.ts';
import { simulateMatch } from '../src/lib/engine/match.ts';
const career = { seed: 4242, season: 2026, clubId: 'flamengo', data: { world: 'brasil' } } as unknown as Career;
const ctx = { season: 2026, firstSeason: 2026 };
const clubs = ['flamengo', 'palmeiras', 'bahia', 'santos', 'gremio', 'vasco', 'sport', 'goias'];
const N = Number(process.argv[2] ?? 16);
const h = createHash('sha256');
for (let i = 0; i < N; i++) {
	const r = simulateMatch({ home: aiTeam(career, clubs[i % 8], ctx, i).setup, away: aiTeam(career, clubs[(i + 3) % 8], ctx, i).setup, seed: 9000 + i });
	h.update(JSON.stringify([r.homeGoals, r.awayGoals, r.stats, r.events.length, r.players]));
}
console.log(h.digest('hex').slice(0, 16));
