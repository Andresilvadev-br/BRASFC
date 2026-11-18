// Equilíbrio entre formações: cada uma contra o 4-3-3 (mesma força, mando alternado, sem IA).
// Uso: node scripts/engine-formations.ts [jogos]
import { CLUBS } from '../src/lib/domain/clubs.ts';
import { generateSquad } from '../src/lib/domain/squad.ts';
import { FORMATION_IDS } from '../src/lib/domain/tactics.ts';
import { simulateMatch } from '../src/lib/engine/match.ts';
import { buildTeamSetup } from '../src/lib/engine/teams.ts';
const [c1, c2] = CLUBS.filter((c) => c.reputation === 3);
const n = Number(process.argv[2] ?? 40);
const setup = (c: typeof c1, f: string) => buildTeamSetup({ id: c.id, name: c.name, short: c.short, colors: c.colors }, generateSquad(c.id, 7), { formation: f as never, mentality: 'equilibrada', style: 'posse' });
for (const f of FORMATION_IDS) {
	let p = 0, gf = 0, ga = 0, sf = 0, sa = 0;
	for (let k = 0; k < n; k++) {
		const a = k % 2 ? c1 : c2, b = k % 2 ? c2 : c1;
		const home = k % 4 < 2;
		const r = simulateMatch({ home: home ? setup(a, f) : setup(b, '4-3-3'), away: home ? setup(b, '4-3-3') : setup(a, f), seed: 31000 + k, ai: { home: false, away: false } });
		const [x, y] = home ? [r.homeGoals, r.awayGoals] : [r.awayGoals, r.homeGoals];
		const [s1, s2] = home ? [r.stats.home.shots, r.stats.away.shots] : [r.stats.away.shots, r.stats.home.shots];
		gf += x; ga += y; sf += s1; sa += s2; p += x > y ? 3 : x === y ? 1 : 0;
	}
	console.log(`${f.padEnd(7)} pontos/jogo ${(p / n).toFixed(2)}  gols ${(gf / n).toFixed(2)}–${(ga / n).toFixed(2)}  chutes ${(sf / n).toFixed(1)}–${(sa / n).toFixed(1)}`);
}
