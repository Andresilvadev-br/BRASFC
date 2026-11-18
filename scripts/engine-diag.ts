// Diagnóstico de finalizações (uso interno de calibração).
import { CLUBS } from '../src/lib/domain/clubs.ts';
import { generateSquad } from '../src/lib/domain/squad.ts';
import { simulateMatch } from '../src/lib/engine/match.ts';
import { buildTeamSetup } from '../src/lib/engine/teams.ts';
import { toRel } from '../src/lib/engine/geometry.ts';
const n = Number(process.argv[2] ?? 60);
const mid = CLUBS.filter((c) => c.reputation === 3);
const team = (c: (typeof CLUBS)[number]) => buildTeamSetup({ id: c.id, name: c.name, short: c.short, colors: c.colors }, generateSquad(c.id, 7), { formation: '4-3-3', mentality: 'equilibrada', style: 'posse' });
const c: Record<string, number> = {};
const inc = (k: string, v = 1) => (c[k] = (c[k] ?? 0) + v);
for (let i = 0; i < n; i++) {
	const r = simulateMatch({ home: team(mid[i % mid.length]), away: team(mid[(i + 1) % mid.length]), seed: 1000 + i });
	const ev = r.events;
	for (let k = 0; k < ev.length; k++) {
		const e = ev[k];
		inc('ev_' + e.type);
		if (e.type !== 'shot') continue;
		const [x, y] = toRel(e.side!, e.x!, e.y!);
		const d = Math.hypot(105 - x, 34 - y);
		inc(d < 11 ? 'd<11' : d < 18 ? 'd11-18' : d < 25 ? 'd18-25' : 'd25+');
		if (e.data?.header) inc('header');
		if (e.data?.setPiece) inc('setpiece');
		if (e.data?.penalty) inc('penalty');
		const prev = ev.slice(Math.max(0, k - 4), k).map((p) => p.type).join('>');
		inc('prev:' + (ev[k - 1]?.type ?? '-'));
		void prev;
	}
}
const out = Object.entries(c).sort().map(([k, v]) => `${k}=${(v / n / 2).toFixed(2)}`);
console.log('por time por jogo:\n' + out.join('\n'));
