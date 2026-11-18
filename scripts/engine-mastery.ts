// Domínio tático: o mesmo time com execução 35, 60 e 85 contra um rival em 60.
// Mostra que dominar o sistema melhora a execução, sem tornar o time invencível.
import { CLUBS } from '../src/lib/domain/clubs.ts';
import { generateSquad } from '../src/lib/domain/squad.ts';
import { simulateMatch } from '../src/lib/engine/match.ts';
import { buildTeamSetup } from '../src/lib/engine/teams.ts';
const [c1, c2] = CLUBS.filter((c) => c.reputation === 3);
const n = Number(process.argv[2] ?? 120);
const setup = (c: typeof c1, exec: number) => {
	const s = buildTeamSetup({ id: c.id, name: c.name, short: c.short, colors: c.colors }, generateSquad(c.id, 7), { formation: '4-3-3', mentality: 'equilibrada', style: 'posse' });
	s.familiarity = { execution: exec };
	return s;
};
for (const exec of [35, 60, 85]) {
	let w = 0, d = 0, l = 0, pass = 0, comp = 0, gf = 0, ga = 0;
	for (let k = 0; k < n; k++) {
		const home = k % 2 === 0;
		const A = setup(home ? c1 : c2, exec), B = setup(home ? c2 : c1, 60);
		const r = simulateMatch({ home: home ? A : B, away: home ? B : A, seed: 71000 + k });
		const [x, y] = home ? [r.homeGoals, r.awayGoals] : [r.awayGoals, r.homeGoals];
		const st = home ? r.stats.home : r.stats.away;
		pass += st.passes; comp += st.passesCompleted; gf += x; ga += y;
		if (x > y) w++; else if (x === y) d++; else l++;
	}
	console.log(`execução ${exec}: V${w} E${d} D${l}  gols ${(gf / n).toFixed(2)}–${(ga / n).toFixed(2)}  passes certos ${((comp / pass) * 100).toFixed(1)}%`);
}
