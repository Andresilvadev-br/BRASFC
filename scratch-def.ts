import { CLUBS } from './src/lib/domain/clubs.ts';
import { generateSquad } from './src/lib/domain/squad.ts';
import { simulateMatch } from './src/lib/engine/match.ts';
import { buildTeamSetup } from './src/lib/engine/teams.ts';
import { toRel } from './src/lib/engine/geometry.ts';
const cnt: Record<string, number> = {};
const [c1, c2] = CLUBS.filter((c) => c.reputation === 3);
const ment = process.argv[2] ?? 'defensiva';
const keys = ['shots', 'shotsOnTarget', 'xg', 'goals', 'passes', 'passesCompleted', 'possessionTicks', 'fouls', 'corners'] as const;
const mine: Record<string, number> = {}, opp: Record<string, number> = {};
const m = 120;
let pens = 0;
for (let i = 0; i < m; i++) {
	const me = buildTeamSetup({ id: c1.id, name: c1.name, short: c1.short, colors: c1.colors }, generateSquad(c1.id, 7), { formation: '4-3-3', mentality: ment as never, style: 'posse' });
	const ref = buildTeamSetup({ id: c2.id, name: c2.name, short: c2.short, colors: c2.colors }, generateSquad(c2.id, 7), { formation: '4-3-3', mentality: 'equilibrada', style: 'posse' });
	const home = i % 2 === 0;
	const r = simulateMatch({ home: home ? me : ref, away: home ? ref : me, seed: 7000 + i });
	const [a, b] = home ? [r.stats.home, r.stats.away] : [r.stats.away, r.stats.home];
	for (const k of keys) { mine[k] = (mine[k] ?? 0) + a[k] / m; opp[k] = (opp[k] ?? 0) + b[k] / m; }
	const os = home ? 'away' : 'home';
	r.events.forEach((e, k) => { if (e.type === 'shot' && e.side === os) { let j = k - 1; while (j > 0 && !(['interception','tackle'].includes(r.events[j].type) && r.events[j].side === os) && !['goal_kick','throw_in','corner','free_kick','kickoff','shot'].includes(r.events[j].type)) j--; const g = r.events[j]; const gx = g.x != null ? toRel(os, g.x, g.y!)[0] : -1; const gk = 'origem ' + g.type + ' ' + (gx < 0 ? '?' : gx < 35 ? 'campo próprio' : gx < 70 ? 'meio' : 'terço final') + ' (' + (k - j) + 'ev)'; cnt[gk.replace(/\(\d+ev\)/, '')] = (cnt[gk.replace(/\(\d+ev\)/, '')] ?? 0) + 1 / m;  const [x, y] = toRel(os, e.x!, e.y!); const d = Math.hypot(105 - x, 34 - y); const key = (d < 11 ? 'd<11' : d < 18 ? 'd<18' : 'd18+') + ' ' + (e.data?.header ? 'cab' : '') + (e.data?.setPiece ? 'bp ' : '') + 'prev=' + r.events[k - 1]?.type; } });
	pens += r.events.filter((e) => e.type === 'penalty' && e.side === (home ? 'away' : 'home')).length;
}
console.log(ment, Object.fromEntries(keys.map((k) => [k, `${mine[k].toFixed(2)} x ${opp[k].toFixed(2)}`])), 'pÃªnaltis contra', pens / m);

console.log(Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => k + ' ' + v.toFixed(2)).join(' | '));
