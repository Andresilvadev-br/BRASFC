// Equilíbrio tático: confronto cruzado de todos os estilos (e mentalidades), mando alternado.
// Uso: node scripts/engine-balance.ts [jogos por confronto] [--mentalidades]
import { CLUBS } from '../src/lib/domain/clubs.ts';
import { generateSquad } from '../src/lib/domain/squad.ts';
import { MENTALITIES, STYLES } from '../src/lib/domain/tactics.ts';
import { simulateMatch } from '../src/lib/engine/match.ts';
import { buildTeamSetup } from '../src/lib/engine/teams.ts';

const n = Number(process.argv[2] ?? 30);
const mentalities = process.argv.includes('--mentalidades');
const [c1, c2] = CLUBS.filter((c) => c.reputation === 3);
const setup = (c: typeof c1, mentality: string, style: string, formation = '4-3-3') =>
	buildTeamSetup({ id: c.id, name: c.name, short: c.short, colors: c.colors }, generateSquad(c.id, 7), { formation: formation as never, mentality: mentality as never, style: style as never });

const opts = mentalities ? MENTALITIES.flatMap((m) => STYLES.map((s) => [m, s] as const)) : STYLES.map((s) => ['equilibrada', s] as const);
const label = (o: readonly [string, string]) => (mentalities ? `${o[0].slice(0, 3)}/${o[1]}` : o[1]);
const pts: Record<string, number> = {};
const games: Record<string, number> = {};
const rows: string[] = [];
let seed = 50_000;
for (let i = 0; i < opts.length; i++) {
	const cells: string[] = [];
	for (let j = 0; j < opts.length; j++) {
		if (i === j) { cells.push('  -  '); continue; }
		let p = 0;
		for (let k = 0; k < n; k++) {
			// alterna clube e mando para neutralizar diferenças de elenco
			const aClub = k % 2 ? c1 : c2, bClub = k % 2 ? c2 : c1;
			const home = k % 4 < 2;
			const A = setup(aClub, opts[i][0], opts[i][1]);
			const B = setup(bClub, opts[j][0], opts[j][1]);
			const r = simulateMatch({ home: home ? A : B, away: home ? B : A, seed: seed++ });
			const [f, a] = home ? [r.homeGoals, r.awayGoals] : [r.awayGoals, r.homeGoals];
			p += f > a ? 3 : f === a ? 1 : 0;
		}
		pts[label(opts[i])] = (pts[label(opts[i])] ?? 0) + p;
		games[label(opts[i])] = (games[label(opts[i])] ?? 0) + n;
		cells.push((p / n).toFixed(2).padStart(5));
	}
	rows.push(label(opts[i]).padEnd(16) + cells.join(' '));
}
console.log('pontos por jogo (linha contra coluna)');
console.log(''.padEnd(16) + opts.map((o) => label(o).slice(0, 5).padStart(5)).join(' '));
console.log(rows.join('\n'));
console.log('\nmédia de pontos por jogo contra todos:');
for (const k of Object.keys(pts).sort((a, b) => pts[b] / games[b] - pts[a] / games[a])) console.log(`${k.padEnd(16)} ${(pts[k] / games[k]).toFixed(3)}`);
