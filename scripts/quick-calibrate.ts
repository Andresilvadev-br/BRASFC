// Calibra o modelo rápido (src/lib/domain/quick.ts) com o MOTOR COMPLETO: clubes reais de todas as
// divisões, técnicos da IA, pares aleatórios. Ajusta λ_mandante, λ_visitante e a sensibilidade β por
// regressão de Poisson em escala log (gols ~ exp(a + β·Δforça)).
// Uso: node scripts/quick-calibrate.ts [partidas]
import '../src/lib/data/brasil.ts';
import { CLUBES_2026 } from '../src/lib/data/brasil.ts';
import type { Career } from '../src/lib/domain/career.ts';
import { aiTeam } from '../src/lib/domain/matchday.ts';
import { quickMatch, QUICK_MODEL } from '../src/lib/domain/quick.ts';
import { createRng } from '../src/lib/domain/rng.ts';
import { strengthFor } from '../src/lib/domain/strength.ts';
const baseStrength = (_s: number, id: string) => st(id);
import { simulateMatch } from '../src/lib/engine/match.ts';

const N = Number(process.argv[2] ?? 240);
const career = { seed: 8080, season: 2026, clubId: 'flamengo', data: { world: 'brasil' } } as unknown as Career;
const ctx = { season: 2026, firstSeason: 2026 };
const rng = createRng(31);
const st = strengthFor(career);
const bySerie = (s: string) => CLUBES_2026.filter((c) => c.serie === s).map((c) => c.id);
const pools = [bySerie('A'), bySerie('B'), bySerie('C'), bySerie('D')];
const rows: Array<{ d: number; hg: number; ag: number }> = [];
for (let i = 0; i < N; i++) {
	// Mesma divisão na maioria (como nas ligas); 1/4 entre divisões vizinhas (como na Copa).
	const p = pools[i % 4];
	const q = i % 4 === 3 ? pools[Math.max(0, (i % 4) - 1)] : p;
	const h = rng.pick(p);
	let a = rng.pick(q);
	if (a === h) a = q[(q.indexOf(a) + 1) % q.length];
	const r = simulateMatch({ home: aiTeam(career, h, ctx, i).setup, away: aiTeam(career, a, ctx, i).setup, seed: 60000 + i });
	rows.push({ d: baseStrength(career.seed, h) - baseStrength(career.seed, a), hg: r.homeGoals, ag: r.awayGoals });
}
// Ajuste por gradiente da log-verossimilhança de Poisson.
let a0 = Math.log(1.3), a1 = Math.log(1.05), beta = 0.06;
for (let it = 0; it < 4000; it++) {
	let g0 = 0, g1 = 0, gb = 0;
	for (const r of rows) {
		const lh = Math.exp(a0 + beta * r.d), la = Math.exp(a1 - beta * r.d);
		g0 += r.hg - lh; g1 += r.ag - la; gb += (r.hg - lh) * r.d - (r.ag - la) * r.d;
	}
	a0 += (0.5 * g0) / rows.length; a1 += (0.5 * g1) / rows.length; beta += (0.002 * gb) / rows.length;
}
const mean = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
console.log(`motor: ${rows.length} jogos, gols ${mean((r) => r.hg + r.ag).toFixed(2)}, mandante ${mean((r) => r.hg).toFixed(2)} x ${mean((r) => r.ag).toFixed(2)}, |Δforça| médio ${mean((r) => Math.abs(r.d)).toFixed(1)}`);
console.log(`ajuste: home=${Math.exp(a0).toFixed(3)} away=${Math.exp(a1).toFixed(3)} beta=${beta.toFixed(4)}   (atual: ${QUICK_MODEL.home}/${QUICK_MODEL.away}/${QUICK_MODEL.beta})`);
// Conferência: o modelo atual reproduz as mesmas médias e o mesmo aproveitamento?
let qh = 0, qa = 0, ew = 0, qw = 0;
rows.forEach((r, i) => {
	const q = quickMatch(70 + r.d, 70, 9000 + i);
	qh += q.homeGoals; qa += q.awayGoals;
	if (q.homeGoals > q.awayGoals) qw++;
	if (r.hg > r.ag) ew++;
});
console.log(`conferência (modelo atual): gols ${(qh / N).toFixed(2)} x ${(qa / N).toFixed(2)}; vitórias do mandante motor ${((ew / N) * 100).toFixed(0)}% × modelo ${((qw / N) * 100).toFixed(0)}%`);
