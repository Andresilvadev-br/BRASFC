// Diagnóstico de uma formação contra o 4-3-3: posse, xG por chute, distância dos chutes sofridos.
import { CLUBS } from '../src/lib/domain/clubs.ts';
import { generateSquad } from '../src/lib/domain/squad.ts';
import { simulateMatch } from '../src/lib/engine/match.ts';
import { buildTeamSetup } from '../src/lib/engine/teams.ts';
const f = process.argv[2] ?? '5-3-2';
const n = Number(process.argv[3] ?? 30);
const [c1, c2] = CLUBS.filter((c) => c.reputation === 3);
const setup = (c: typeof c1, fm: string) => buildTeamSetup({ id: c.id, name: c.name, short: c.short, colors: c.colors }, generateSquad(c.id, 7), { formation: fm as never, mentality: 'equilibrada', style: 'posse' });
let pos = 0, shA = 0, xgA = 0, far = 0, box = 0, shF = 0, xgF = 0, cr = 0;
for (let k = 0; k < n; k++) {
	const r = simulateMatch({ home: setup(c1, f), away: setup(c2, '4-3-3'), seed: 52000 + k, ai: { home: false, away: false } });
	pos += r.stats.home.possessionTicks / (r.stats.home.possessionTicks + r.stats.away.possessionTicks);
	shA += r.stats.away.shots; xgA += r.stats.away.xg; shF += r.stats.home.shots; xgF += r.stats.home.xg; cr += r.stats.away.crosses ?? 0;
	for (const e of r.events) if (e.type === 'shot' && e.side === 'away') { const dx = (e.x ?? 0); if (dx < 16.5) box++; else far++; }
}
console.log(`${f}: posse ${((pos / n) * 100).toFixed(0)}%  chutes sofridos ${(shA / n).toFixed(1)} (área ${(box / n).toFixed(1)}, fora ${(far / n).toFixed(1)}) xG/chute sofrido ${(xgA / shA).toFixed(3)}  cruzamentos sofridos ${(cr / n).toFixed(1)} | chutes feitos ${(shF / n).toFixed(1)} xG/chute ${(xgF / shF).toFixed(3)}`);
