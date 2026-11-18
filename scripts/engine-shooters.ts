// Quem finaliza em cada formação (chutes e passes por posição, time da casa) contra o 4-3-3.
import { CLUBS } from '../src/lib/domain/clubs.ts';
import { generateSquad } from '../src/lib/domain/squad.ts';
import { simulateMatch } from '../src/lib/engine/match.ts';
import { buildTeamSetup } from '../src/lib/engine/teams.ts';
const f = process.argv[2] ?? '5-3-2';
const n = Number(process.argv[3] ?? 20);
const [c1, c2] = CLUBS.filter((c) => c.reputation === 3);
const setup = (c: typeof c1, fm: string) => buildTeamSetup({ id: c.id, name: c.name, short: c.short, colors: c.colors }, generateSquad(c.id, 7), { formation: fm as never, mentality: 'equilibrada', style: 'posse' });
const shots: Record<string, number> = {}, kp: Record<string, number> = {}, dr: Record<string, number> = {};
for (let k = 0; k < n; k++) {
	const home = setup(c1, f);
	const pos = new Map(home.players.map((p) => [p.id, p.position]));
	const r = simulateMatch({ home, away: setup(c2, '4-3-3'), seed: 53000 + k, ai: { home: false, away: false } });
	for (const [id, st] of Object.entries(r.players)) {
		const ps = pos.get(id); if (!ps) continue;
		shots[ps] = (shots[ps] ?? 0) + st.shots / n; kp[ps] = (kp[ps] ?? 0) + st.keyPasses / n; dr[ps] = (dr[ps] ?? 0) + st.dribbles / n;
	}
}
const fmt = (o: Record<string, number>) => Object.entries(o).filter(([, v]) => v > 0.05).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · ');
console.log(`${f}\n  chutes: ${fmt(shots)}\n  passes-chave: ${fmt(kp)}\n  dribles: ${fmt(dr)}`);
