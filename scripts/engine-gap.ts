// Sensibilidade à força: mesmo clube contra ele mesmo com atributos deslocados (+gap), mandos alternados.
// Referência real: ~+4 de overall ≈ 55–60% de aproveitamento; ~+10 ≈ 70–75%.
import '../src/lib/data/brasil.ts';
import { requireClub } from '../src/lib/domain/clubs.ts';
import { generateSquad } from '../src/lib/domain/squad.ts';
import { simulateMatch } from '../src/lib/engine/match.ts';
import { buildTeamSetup } from '../src/lib/engine/teams.ts';
const N = Number(process.argv[2] ?? 60);
const id = 'internacional';
const c = requireClub(id);
	const team = (gap: number, seed: number, tag: string) => {
	const sq = generateSquad(id, seed).map((p) => ({ ...p, id: tag + p.id, attributes: Object.fromEntries(Object.entries(p.attributes).map(([k, v]) => [k, Math.min(99, v + gap)])) as typeof p.attributes }));
	return buildTeamSetup({ id: gap ? 'forte' : 'base', name: c.name, short: c.short, colors: c.colors }, sq, { formation: '4-3-3', mentality: 'equilibrada', style: 'posse' });
};
for (const gap of [2, 4, 8]) {
	let pts = 0, gf = 0, ga = 0;
	for (let i = 0; i < N; i++) {
		const strongHome = i % 2 === 0;
		const r = simulateMatch({ home: team(strongHome ? gap : 0, 3, 'h'), away: team(strongHome ? 0 : gap, 3, 'a'), seed: 4000 + i });
		const [f, a] = strongHome ? [r.homeGoals, r.awayGoals] : [r.awayGoals, r.homeGoals];
		gf += f; ga += a; pts += f > a ? 3 : f === a ? 1 : 0;
	}
	console.log(`+${gap} atributos: aproveitamento ${((pts / (3 * N)) * 100).toFixed(0)}%  gols ${(gf / N).toFixed(2)} x ${(ga / N).toFixed(2)}`);
}
