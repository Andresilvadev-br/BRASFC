// Diagnóstico: de onde vêm os impedimentos (uso interno de calibração).
import { CLUBS } from '../src/lib/domain/clubs.ts';
import { generateSquad } from '../src/lib/domain/squad.ts';
import { simulateMatch } from '../src/lib/engine/match.ts';
import { buildTeamSetup } from '../src/lib/engine/teams.ts';
const mid = CLUBS.filter((c) => c.reputation === 3);
const team = (c: (typeof CLUBS)[number]) => buildTeamSetup({ id: c.id, name: c.name, short: c.short, colors: c.colors }, generateSquad(c.id, 7), { formation: '4-3-3', mentality: 'equilibrada', style: 'posse' });
const n = 40;
const by: Record<string, number> = {};
for (let i = 0; i < n; i++) {
	const r = simulateMatch({ home: team(mid[i % mid.length]), away: team(mid[(i + 1) % mid.length]), seed: 1000 + i });
	r.events.forEach((e, k) => {
		if (e.type !== 'offside') return;
		const prev = r.events.slice(Math.max(0, k - 3), k).map((p) => p.type).join('>');
		const pos = r.players && e.player ? '' : '';
		by[prev + pos] = (by[prev + pos] ?? 0) + 1 / n;
	});
}
console.log(Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${v.toFixed(2)} ${k}`).join('\n'));
