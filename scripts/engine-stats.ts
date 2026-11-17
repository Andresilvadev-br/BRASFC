// Calibração do motor: simula muitas partidas e imprime distribuições.
// Uso: npx vite-node scripts/engine-stats.ts [n]
import { CLUBS } from '../src/lib/domain/clubs.ts';
import { generateSquad } from '../src/lib/domain/squad.ts';
import { simulateMatch } from '../src/lib/engine/match.ts';
import { buildTeamSetup } from '../src/lib/engine/teams.ts';

const n = Number(process.argv[2] ?? 200);
const strong = CLUBS.find((c) => c.reputation === 5)!;
const weak = CLUBS.find((c) => c.reputation === 1)!;
const mid = CLUBS.filter((c) => c.reputation === 3);

function team(club: (typeof CLUBS)[number], seed: number) {
	return buildTeamSetup(
		{ id: club.id, name: club.name, short: club.short, colors: club.colors },
		generateSquad(club.id, seed),
		{ formation: '4-3-3', mentality: 'equilibrada', style: 'posse' }
	);
}

const agg = { goals: 0, draws: 0, homeWins: 0, shots: 0, sot: 0, passes: 0, comp: 0, fouls: 0, yellows: 0, reds: 0, corners: 0, offsides: 0, xg: 0, ms: 0 };
const dist: Record<number, number> = {};
const lines: Record<string, number> = {};
for (let i = 0; i < n; i++) {
	const a = mid[i % mid.length];
	const b = mid[(i + 1) % mid.length];
	const t0 = performance.now();
	const r = simulateMatch({ home: team(a, 7), away: team(b, 7), seed: 1000 + i });
	agg.ms += performance.now() - t0;
	const g = r.homeGoals + r.awayGoals;
	dist[g] = (dist[g] ?? 0) + 1;
	const key = r.homeGoals + 'x' + r.awayGoals;
	lines[key] = (lines[key] ?? 0) + 1;
	agg.goals += g;
	if (r.homeGoals === r.awayGoals) agg.draws++;
	if (r.homeGoals > r.awayGoals) agg.homeWins++;
	for (const s of [r.stats.home, r.stats.away]) {
		agg.shots += s.shots; agg.sot += s.shotsOnTarget; agg.passes += s.passes; agg.comp += s.passesCompleted;
		agg.fouls += s.fouls; agg.yellows += s.yellows; agg.reds += s.reds; agg.corners += s.corners; agg.offsides += s.offsides; agg.xg += s.xg;
	}
}
const per = (v: number) => (v / n).toFixed(2);
console.log(`partidas=${n} gols/jogo=${per(agg.goals)} empates=${((agg.draws / n) * 100).toFixed(1)}% vitórias mandante=${((agg.homeWins / n) * 100).toFixed(1)}%`);
console.log(`por time: chutes=${per(agg.shots / 2)} no alvo=${per(agg.sot / 2)} xG=${per(agg.xg / 2)} passes=${per(agg.passes / 2)} precisão=${((agg.comp / agg.passes) * 100).toFixed(1)}%`);
console.log(`por jogo: faltas=${per(agg.fouls)} amarelos=${per(agg.yellows)} vermelhos=${per(agg.reds)} escanteios=${per(agg.corners)} impedimentos=${per(agg.offsides)}`);
console.log('placares:', JSON.stringify(Object.entries(lines).sort((a, b) => b[1] - a[1]).slice(0, 10)));
console.log('distribuição de gols:', JSON.stringify(dist), `tempo médio ${per(agg.ms)} ms`);

let sw = 0, sd = 0, sl = 0;
for (let i = 0; i < n; i++) {
	const r = simulateMatch({ home: team(strong, 3), away: team(weak, 3), seed: 5000 + i });
	if (r.homeGoals > r.awayGoals) sw++; else if (r.homeGoals === r.awayGoals) sd++; else sl++;
}
console.log(`forte × fraco: V ${sw} E ${sd} D ${sl}`);

// Equilíbrio tático: cada opção contra a referência (equilibrada/posse), mando alternado.
if (process.argv.includes('--taticas')) {
	const [c1, c2] = mid;
	const vs = (mentality: string, style: string) => {
		let w = 0, d = 0, l = 0, gf = 0, ga = 0;
		const m = Math.min(n, 120);
		for (let i = 0; i < m; i++) {
			const mine = buildTeamSetup({ id: c1.id, name: c1.name, short: c1.short, colors: c1.colors }, generateSquad(c1.id, 7), { formation: '4-3-3', mentality: mentality as never, style: style as never });
			const ref = team(c2, 7);
			const home = i % 2 === 0;
			const r = simulateMatch({ home: home ? mine : ref, away: home ? ref : mine, seed: 7000 + i });
			const [f, a] = home ? [r.homeGoals, r.awayGoals] : [r.awayGoals, r.homeGoals];
			gf += f; ga += a;
			if (f > a) w++; else if (f === a) d++; else l++;
		}
		console.log(`${mentality.padEnd(11)} ${style.padEnd(13)} V${w} E${d} D${l}  gols ${(gf / m).toFixed(2)}–${(ga / m).toFixed(2)}`);
	};
	for (const mm of ['defensiva', 'equilibrada', 'ofensiva']) vs(mm, 'posse');
	for (const st of ['tiki-taka', 'contra-ataque', 'bola-longa', 'laterais', 'pressao', 'vertical']) vs('equilibrada', st);
}
