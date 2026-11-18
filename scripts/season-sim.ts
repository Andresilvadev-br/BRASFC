// Temporadas completas do mundo Brasil (Séries A–D + Copa do Brasil) sem banco de dados.
// Valida tamanhos das divisões ano a ano (Série C 20 → 24 → 28), acessos/rebaixamentos e a Copa.
// Uso: node scripts/season-sim.ts [temporadas] [motor: rapido|completo-a]
import '../src/lib/data/brasil.ts';
import type { Career } from '../src/lib/domain/career.ts';
import { seasonSteps, stepFixtures, allFixtures } from '../src/lib/domain/calendar.ts';
import { CUP_ID, cupFixtures, cupView, initialCup, prepareCup, projectedCup, type CupState } from '../src/lib/domain/cup.ts';
import { closeSeason, initialLeague, prepareRound, seasonFixtures, type StoredRoundResult } from '../src/lib/domain/league.ts';
import { simulateOtherFixtures } from '../src/lib/domain/matchday.ts';
import { strengthFor } from '../src/lib/domain/strength.ts';
import { checkTransition } from '../src/lib/domain/rules.ts';
import { getClub } from '../src/lib/domain/clubs.ts';

const seasons = Number(process.argv[2] ?? 3);
const mode = process.argv[3] ?? 'rapido';
const career = { seed: 20260001 } as Career;
const strengthOf = strengthFor(career);
let league = initialLeague('brasil', 2026);
let cup: CupState | null = initialCup(2026);
const name = (id?: string) => (id ? (getClub(id)?.name ?? id) : '—');
for (let s = 0; s < seasons; s++) {
	const season = league.season;
	const results: StoredRoundResult[] = [];
	const t0 = performance.now();
	let matches = 0;
	for (const step of seasonSteps(league, cup)) {
		let fx;
		if (step.kind === 'league') {
			league = prepareRound(league, step.round, results, career.seed, strengthOf);
			fx = seasonFixtures(league, career.seed).filter((f) => f.round === step.round);
		} else {
			cup = prepareCup(cup!, step.matchday, results, career.seed, strengthOf);
			fx = stepFixtures(step, allFixtures([], cup));
		}
		const full = (f: { competition: string }) => mode === 'completo-a' && f.competition === 'serie-a';
		for (const r of simulateOtherFixtures(career, fx, { season, firstSeason: 2026 }, { full, strengthOf })) results.push({ ...r, round: step.kind === 'league' ? step.round : step.matchday });
		matches += fx.length;
	}
	const ms = performance.now() - t0;
	const leagueRes = results.filter((r) => r.competition !== CUP_ID);
	const out = closeSeason(league, leagueRes, career.seed, strengthOf);
	const goals = results.reduce((a, r) => a + r.homeGoals + r.awayGoals, 0);
	const cv = cup ? cupView(cup, results, career.seed, strengthOf) : null;
	console.log(`\n== ${season}: ${matches} partidas, ${(goals / matches).toFixed(2)} gols/jogo, ${(ms / 1000).toFixed(1)} s (${(ms / 51).toFixed(0)} ms por passo)`);
	console.log('tamanhos', Object.fromEntries(Object.entries(league.divisions).map(([k, v]) => [k, v?.length])), 'grupos C', league.groups?.['serie-c']?.length ?? 1);
	for (const d of ['serie-a', 'serie-b', 'serie-c', 'serie-d'] as const) console.log(`  ${d}: campeão ${name(out.champions[d])}${out.runnersUp[d] ? `, vice ${name(out.runnersUp[d])}` : ''}`);
	console.log('  Copa do Brasil:', cv?.champion ? `${name(cv.champion)} campeão sobre ${name(cv.runnerUp ?? undefined)}` : 'incompleta', `(${cup?.stages.length} fases sorteadas, ${cup ? cupFixtures(cup).length : 0} jogos)`);
	const count = (reason: string, to?: string) => out.moves.filter((m) => m.reason === reason && (!to || m.to === to)).length;
	console.log(`  movimentos: acesso→A ${count('acesso', 'serie-a')}, acesso→B ${count('acesso', 'serie-b')}, acesso→C ${count('acesso', 'serie-c')}, quedas→B ${count('rebaixamento', 'serie-b')}, →C ${count('rebaixamento', 'serie-c')}, →D ${count('rebaixamento', 'serie-d')}, D→estaduais ${count('estadual')}`);
	const issues = checkTransition(season, league.pool?.length ?? 0);
	if (issues.length) console.log('  PROBLEMAS de regra:', issues);
	console.log('  próxima', out.next.season, Object.fromEntries(Object.entries(out.next.divisions).map(([k, v]) => [k, v?.length])));
	const all = Object.values(out.next.divisions).flat();
	if (new Set(all).size !== all.length) console.log('  ERRO: clube em duas divisões');
	league = out.next;
	cup = projectedCup(league, { cChampion: out.champions['serie-c'], cRunnerUp: out.runnersUp['serie-c'], dChampion: out.champions['serie-d'], dRunnerUp: out.runnersUp['serie-d'], dRanking: out.tables['serie-d']?.map((r) => r.clubId) });
}
