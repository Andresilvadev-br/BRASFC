import { CLUBS } from './src/lib/domain/clubs.ts';
import { generateSquad } from './src/lib/domain/squad.ts';
import { simulateMatch } from './src/lib/engine/match.ts';
import { buildTeamSetup } from './src/lib/engine/teams.ts';
import { DEFAULT_RULES } from './src/lib/engine/types.ts';
const [c1, c2] = CLUBS.filter((c) => c.reputation === 3);
const t = (c: typeof c1) => buildTeamSetup({ id: c.id, name: c.name, short: c.short, colors: c.colors }, generateSquad(c.id, 7), { formation: '4-3-3', mentality: 'equilibrada', style: 'posse' });
let h = 0, a = 0, hs = 0, as = 0, hp = 0;
const n = 300;
for (let i = 0; i < n; i++) {
	const r = simulateMatch({ home: t(i % 2 ? c1 : c2), away: t(i % 2 ? c2 : c1), seed: 9000 + i, rules: { ...DEFAULT_RULES, homeAdvantage: true } } as any);
	if (r.homeGoals > r.awayGoals) h++; else if (r.awayGoals > r.homeGoals) a++;
	hs += r.stats.home.shots; as += r.stats.away.shots; hp += r.stats.home.possessionTicks / (r.stats.home.possessionTicks + r.stats.away.possessionTicks);
}
console.log({ h, a, hs: hs / n, as: as / n, hposs: hp / n });
