// Nível médio de atributos dos titulares (referência da calibração = clubes médios fictícios, 4-3-3).
import '../src/lib/data/brasil.ts';
import { CLUBS } from '../src/lib/domain/clubs.ts';
import { generateSquad } from '../src/lib/domain/squad.ts';
import { buildTeamSetup } from '../src/lib/engine/teams.ts';
import { CLUBES_2026 } from '../src/lib/data/brasil.ts';
function level(id: string, seed: number) {
	const s = buildTeamSetup({ id, name: id, short: 'X', colors: { primary: '#000', secondary: '#fff', shorts: '#fff', socks: '#000' } }, generateSquad(id, seed), { formation: '4-3-3', mentality: 'equilibrada', style: 'posse' });
	const xi = s.tactic.lineup.map((pid) => s.players.find((p) => p.id === pid)!).filter((p) => p.position !== 'GOL');
	const vals = xi.flatMap((p) => Object.values(p.attributes) as number[]);
	return vals.reduce((a, b) => a + b, 0) / vals.length;
}
const mid = CLUBS.filter((c) => c.reputation === 3);
console.log('referência (fictícios rep 3):', (mid.reduce((s, c) => s + level(c.id, 7), 0) / mid.length).toFixed(2));
for (const serie of ['A', 'B', 'C']) {
	const cs = CLUBES_2026.filter((c) => c.serie === serie);
	console.log('Série', serie, (cs.reduce((s, c) => s + level(c.id, 2026), 0) / cs.length).toFixed(2));
}
