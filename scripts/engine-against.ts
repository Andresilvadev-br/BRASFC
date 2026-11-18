// Quem finaliza CONTRA uma formação (posições do adversário 4-3-3) e onde o time perde a bola.
import { CLUBS } from '../src/lib/domain/clubs.ts';
import { generateSquad } from '../src/lib/domain/squad.ts';
import { simulateMatch } from '../src/lib/engine/match.ts';
import { buildTeamSetup } from '../src/lib/engine/teams.ts';
const f = process.argv[2] ?? '5-3-2';
const n = Number(process.argv[3] ?? 30);
const opp = process.env.OPP ?? '4-3-3';
const [c1, c2] = CLUBS.filter((c) => c.reputation === 3);
const setup = (c: typeof c1, fm: string) => buildTeamSetup({ id: c.id, name: c.name, short: c.short, colors: c.colors }, generateSquad(c.id, 7), { formation: fm as never, mentality: 'equilibrada', style: 'posse' });
const shots: Record<string, number> = {}, kp: Record<string, number> = {};
const keys = new Set<string>();
for (let k = 0; k < n; k++) {
	const away = setup(c2, opp);
	const pos = new Map(away.players.map((p) => [p.id, p.position]));
	const r = simulateMatch({ home: setup(c1, f), away, seed: 54000 + k, ai: { home: false, away: false } });
	for (const [id, st] of Object.entries(r.players)) {
		const ps = pos.get(id); if (!ps) continue;
		shots[ps] = (shots[ps] ?? 0) + st.shots / n; kp[ps] = (kp[ps] ?? 0) + st.keyPasses / n;
		for (const key of Object.keys(st)) keys.add(key);
	}
}
const fmt = (o: Record<string, number>) => Object.entries(o).filter(([, v]) => v > 0.05).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · ');
console.log(`${f} x ${opp}\n  chutes do adversário: ${fmt(shots)}\n  passes-chave do adversário: ${fmt(kp)}\n  campos: ${[...keys].join(',')}`);
