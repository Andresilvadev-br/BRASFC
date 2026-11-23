import { isPlayerOrder } from '#lib/domain/player-orders.ts';
import { staffEffects } from '#lib/domain/staff.ts';
import { suggestPlan } from '#lib/domain/drills.ts';
import type { StoredRoundResult } from '#lib/domain/league.ts';
import { ensureUniverse, inboxWorthy, officeOf, officeSeasonEnd, officeStep, universeAfterStep, universeAtSeasonEnd } from './universe.ts';
import type { Career, CareerData } from '#lib/domain/career.ts';
import { addDays } from '#lib/domain/dates.ts';
import { applyTrainingWeek, recoverFitness } from '#lib/domain/drills.ts';
import { closeSeason, prepareRound, seasonFixtures, seasonStartDate, type SeasonSummary } from '#lib/domain/league.ts';
import { CUP_ID, clubCupRun, cupFixtures, cupView, prepareCup, projectedCup } from '#lib/domain/cup.ts';
import { payroll, sanitizeMarket } from '#lib/domain/management.ts';
import { clubStateOf, rosterContext } from '#lib/domain/world.ts';
import { seasonEndManagement, weeklyManagement } from './management.ts';
import { rosterOf } from '#lib/domain/market.ts';
import { insertLedger, insertMessages, insertTransfers, upsertHistory } from './repos/management.ts';
import { strengthFor } from '#lib/domain/strength.ts';
import type { Fixture } from '#lib/domain/season.ts';
import { fixtureSetup, matchFromSetup, observedFrom, simulateOtherFixtures, summarize, type MatchdayContext } from '#lib/domain/matchday.ts';
import { learnFromMatch, teamMastery } from '#lib/domain/tactical.ts';
import { applyMatchDiscipline, sanitizeDiscipline, type DisciplineState } from '#lib/domain/discipline.ts';
import { coachLearnFromMatch, coachSeasonDecay, teachingFactor, withTeaching } from '#lib/domain/coach-knowledge.ts';
import { careerView } from '#lib/domain/view.ts';
import { isUnemployed } from '#lib/domain/employment.ts';
import { ENGINE_VERSION, type AppliedDecision } from '#lib/engine/types.ts';
import { FORMATIONS, isFormation, normalizeMentality, normalizeStyle } from '#lib/domain/tactics.ts';
import { presetInstructions, sanitizeInstructions } from '#lib/engine/instructions.ts';
import { isRoleId } from '#lib/engine/roles.ts';
import type { Decision } from '#lib/engine/types.ts';
import type { Db } from './db/index.ts';
import { saveCareerProgress } from './repos/careers.ts';
import { insertRound, listResults, listSeasonGoals, recentUserMatches, type RoundInsert } from './repos/matches.ts';

export class RoundError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
	}
}

/** Contexto do dia de jogo a partir do estado salvo (o mesmo usado pelo navegador). */
export async function matchdayContext(db: Db, career: Career, view?: ReturnType<typeof careerView>): Promise<MatchdayContext> {
	view ??= careerView(career, await listResults(db, career.id, career.season));
	const previous = await recentUserMatches(db, career.id, 3);
	const observed = previous
		.map((m) => observedFrom(m.summary))
		.filter((o) => o !== null);
	return { season: career.season, firstSeason: view.firstSeason, tactical: view.effective, fitness: career.data.fitness, observed, playerCalendar: { division: view.division, gameDates: view.clubFixtures.map((f) => f.date) } };
}


/**
 * Processa o próximo PASSO do calendário (domingo de liga ou quarta de Copa): reproduz a partida do
 * usuário pela semente + decisões (o placar enviado pelo cliente nunca é aceito), simula os demais
 * jogos, aplica aprendizado tático, treino e recuperação, e grava tudo de uma vez.
 * Jogos da competição do usuário usam o motor completo; os demais, o modelo rápido calibrado.
 */
export async function playRound(db: Db, profileId: string, career: Career, body: { version: number; round?: number; step?: string; decisions?: AppliedDecision[] }) {
	if (body.version !== career.version) throw new RoundError('A carreira mudou em outra janela. Recarregue para continuar.', 409);
	if (career.mode !== 'coach') throw new RoundError('A carreira de jogador foi descontinuada na versão 0.12. O save continua guardado como legado.', 410);
	// Sem clube (demitido ou contrato expirado): o calendário avança na procura por emprego, mas o
	// treinador não comanda o ex-clube — o jogo dele é simulado pela IA, sem decisões nem gestão.
	const unemployed = isUnemployed(career);
	const results = await listResults(db, career.id, career.season);
	const view = careerView(career, results);
	if (view.seasonOver || !view.step) throw new RoundError('A temporada terminou. Encerre-a para começar a próxima.', 409);
	const step = view.step;
	const asked = body.step ?? (typeof body.round === 'number' ? `league:${body.round}` : null);
	if (asked !== step.key) throw new RoundError('Este passo do calendário já foi disputado ou ainda não chegou.', 409);
	const strengthOf = strengthFor(career);

	let league = view.league;
	let cup = view.cup;
	let fixtures: Fixture[];
	if (step.kind === 'league') {
		league = prepareRound(league, step.round, results, career.seed, strengthOf);
		fixtures = (league === view.league ? view.fixtures : seasonFixtures(league, career.seed)).filter((f) => f.round === step.round);
	} else {
		cup = prepareCup(cup!, step.matchday, results, career.seed, strengthOf);
		fixtures = cupFixtures(cup).filter((f) => f.round === step.matchday);
	}
	const round = step.kind === 'league' ? step.round : step.matchday;
	const mine = unemployed ? null : (fixtures.find((f) => f.home === career.clubId || f.away === career.clubId) ?? null);
	const ctx = await matchdayContext(db, career, view);
	const rows: RoundInsert[] = [];
	let userMatch: { fixture: Fixture; homeGoals: number; awayGoals: number; summary: ReturnType<typeof summarize> } | null = null;
	let tactical = view.tactical;
	let coachKnowledge = view.coach;
	let discipline: DisciplineState | null = null;
	let disciplineNews: Array<{ subject: string; body: string }> = [];
	let fitness = { ...(career.data.fitness ?? {}) };
	const squad = view.squad;

	if (mine) {
		const setup = fixtureSetup(career, mine, view.tactic, ctx);
		const decisions = sanitizeDecisions(body.decisions, setup.control);
		const match = matchFromSetup(setup, decisions);
		const result = match.runToEnd();
		const t = setup.myTactic;
		const mastery = teamMastery(view.effective, t.formation, t.style, t.lineup, t.instructions);
		const summary = summarize(match, result, setup.mySide, {
			tactic: { formation: t.formation, style: t.style, ...(t.instructions ? { instructions: t.instructions } : {}), roles: t.roles },
			opponentCoach: setup.opponentCoach,
			opponentPlan: setup.opponentPlan,
			execution: mastery.execution
		});
		rows.push({ season: career.season, round, competition: mine.competition, home: mine.home, away: mine.away, homeGoals: result.homeGoals, awayGoals: result.awayGoals, seed: setup.seed, isUser: true, decisions: result.decisions.filter((d) => d.side === setup.control), summary });
		userMatch = { fixture: mine, homeGoals: result.homeGoals, awayGoals: result.awayGoals, summary };
		// Disciplina: suspensos cumprem este jogo; cartões geram acúmulo e novas suspensões (por competição).
		if (career.mode === 'coach') {
			const names = new Map(squad.map((p) => [p.id, p.name]));
			const out = applyMatchDiscipline(discipline ?? sanitizeDiscipline(career.data.discipline, career.season), {
				season: career.season, round, competition: mine.competition,
				cards: summary.cards.filter((c) => c.side === setup.mySide),
				names: (id) => names.get(id) ?? id
			});
			discipline = out.state;
			disciplineNews = out.news;
		}
		// Aprendizado: quem jogou, quantos minutos e em que função (titulares pelo slot; reservas na função do slot que ocuparam).
		const team = match.teams[setup.mySide];
		const appearances = [...match.states.values()]
			.filter((s) => s.side === setup.mySide && (result.players[s.id]?.minutes ?? 0) > 0)
			.map((s) => ({ id: s.id, minutes: result.players[s.id].minutes, role: t.roles[s.slot] ?? t.roles[0] }));
		const learned = learnFromMatch(tactical, { formation: team.tactic.formation, style: team.tactic.style, instructions: t.instructions, appearances, squad });
		// O elenco aprende mais rápido com um treinador que domina o sistema; o treinador também ganha experiência.
		tactical = withTeaching(tactical, learned, teachingFactor(tactical, view.coach, t.formation, t.style));
		if (view.coach) coachKnowledge = coachLearnFromMatch(view.coach, { formation: team.tactic.formation, style: team.tactic.style, instructions: t.instructions, season: career.season, clubId: career.clubId });
		tactical.history = [...tactical.history, { season: career.season, round, formation: t.formation, style: t.style, goalsFor: setup.mySide === 'home' ? result.homeGoals : result.awayGoals, goalsAgainst: setup.mySide === 'home' ? result.awayGoals : result.homeGoals, execution: mastery.execution }].slice(-120);
		for (const [id, st] of Object.entries(result.players)) if (squad.some((p) => p.id === id) && st.minutes > 0) fitness[id] = st.condition;
	}
	const others = fixtures.filter((f) => f !== mine);
	// Motor completo: a divisão do usuário (rodadas de liga) e todo o mundo fictício; o resto, modelo rápido.
	const full = view.world === 'brasfc' ? () => true : (f: Fixture) => step.kind === 'league' && f.competition === view.division;
	for (const r of simulateOtherFixtures(career, others, ctx, { full, strengthOf })) {
		rows.push({ season: career.season, round, competition: r.competition, home: r.home, away: r.away, homeGoals: r.homeGoals, awayGoals: r.awayGoals, seed: r.seed, isUser: false, ...(r.goals ? { summary: { goals: r.goals } as never } : {}) });
	}
	// Domingo: semana de treinos e recuperação até a próxima rodada. Quarta: só o desgaste do jogo.
	// Dev 0.5: a comissão técnica entra nos cálculos (aprendizado, recuperação, preparação).
	const clubNow = career.mode === 'coach' ? clubStateOf(career, league) : null;
	const fx = staffEffects(clubNow?.staff);
	let universe = ensureUniverse(career, league);
	let office = clubNow ? officeOf(career, clubNow, league) : null;
	if (mine && tactical.opponentPrep) tactical = { ...tactical, opponentPrep: null }; // a preparação vale um jogo
	const allResults: StoredRoundResult[] = [...results, ...rows.map((r) => ({ round: r.round, competition: r.competition, home: r.home, away: r.away, homeGoals: r.homeGoals, awayGoals: r.awayGoals }))];
	const nextFix = upcomingAfter(view, allResults);
	const nextOpponent = nextFix ? (nextFix.home === career.clubId ? nextFix.away : nextFix.home) : null;
	let plan = view.trainingPlan;
	let delegatedReasons: string[] = [];
	if (step.kind === 'league') {
		if (career.mode === 'coach' && !unemployed) {
			const weekCtx = { formation: view.tactic.formation, style: view.tactic.style, lineup: view.tactic.lineup, roles: view.tactic.roles, squad, nextOpponent, learning: fx.tacticalLearning, analyst: fx.opponentPrep };
			if (office?.delegated) {
				const avg = squad.reduce((s, p) => s + (fitness[p.id] ?? 95), 0) / Math.max(1, squad.length);
				const sug = suggestPlan(tactical, weekCtx, avg);
				plan = sug.plan;
				delegatedReasons = sug.reasons;
			}
			tactical = withTeaching(tactical, applyTrainingWeek(tactical, plan, weekCtx), teachingFactor(tactical, view.coach, view.tactic.formation, view.tactic.style));
		}
		const before = fitness;
		const recovered = recoverFitness(fitness, squad, plan);
		fitness = {};
		for (const [id, v] of Object.entries(recovered)) {
			const prev = before[id] ?? 95;
			const gainF = (v - prev) * (career.mode === 'coach' ? fx.fitnessRecovery * (prev < 70 ? fx.physio : 1) : 1);
			fitness[id] = Math.round(Math.max(30, Math.min(100, prev + gainF)) * 10) / 10;
		}
	}
	const nextDate = addDays(step.date, 1);
	// Gestão do clube e mundo vivo: finanças, torcida, diretoria, mercado da IA, propostas e olheiros.
	const rosterCtx = rosterContext(career, league);
	const wk = weeklyManagement({
		career,
		league,
		club: clubStateOf(career, league),
		market: sanitizeMarket(career.data.market),
		step: { kind: step.kind, round: step.kind === 'league' ? step.round : view.nextRound, ...(step.kind === 'cup' ? { matchday: step.matchday } : {}) },
		roster: rosterCtx,
		userRow: career.mode === 'coach' ? (rows.find((r) => r.isUser) ?? null) : null,
		strengthOf
	});
	// Dev 0.5: universo vivo (forma, diretorias, demissões, notícias) e gabinete do treinador.
	const before = universe;
	universe = universeAfterStep(universe, career, league, { round, league: step.kind === 'league', seasonResults: allResults, newResults: rows.map(({ home, away, homeGoals, awayGoals, competition }) => ({ home, away, homeGoals, awayGoals, competition })), strengthOf });
	// Ex-clube volta para a IA: as finanças dele não são mais da carreira (nem lançamentos, nem caixa).
	let clubOut = unemployed ? clubStateOf(career, league) : wk.club;
	if (unemployed) wk.news.splice(0, wk.news.length);
	if (career.mode === 'coach' && office) {
		const big = wk.transfers.filter((t) => t.to === career.clubId && t.fee >= 1_000_000).sort((a, b) => b.fee - a.fee)[0];
		const os = officeStep({ career, league, office, club: clubOut, universe, round, leagueRound: view.nextRound - 1, isLeague: step.kind === 'league', totalRounds: view.rounds, seasonResults: allResults, userMatch: mine && userMatch ? { home: mine.home, away: mine.away, homeGoals: userMatch.homeGoals, awayGoals: userMatch.awayGoals, competition: mine.competition } : null, nextOpponent, nextDecisive: !!nextFix && nextFix.competition === CUP_ID, signedBig: big?.playerName ?? null });
		office = os.office;
		clubOut = os.club;
		universe = os.universe;
		wk.news.push(...os.news);
		if (delegatedReasons.length) wk.news.push({ sender: 'Auxiliar técnico', subject: 'Semana de treinos planejada', body: `Montei a semana: ${plan.sessions.join(', ')} (intensidade ${plan.intensity}). ${delegatedReasons.join(' ')}`, important: false });
	}
	wk.news.push(...inboxWorthy(before, universe, career.clubId, view.division, nextOpponent));
	for (const n of disciplineNews) wk.news.push({ sender: 'Departamento de futebol', subject: n.subject, body: n.body, important: true });
	const data: Partial<CareerData> = { tactical, fitness, league, universe, ...(coachKnowledge ? { coachKnowledge } : {}), ...(discipline ? { discipline } : {}), ...(office ? { office } : {}), ...(cup ? { cup } : {}), market: wk.market, club: clubOut };
	const key = `${career.season}:${step.key}`;
	const updated = await db.transaction(async (tx) => {
		await insertRound(tx, career.id, rows, ENGINE_VERSION);
		const saved = await saveCareerProgress(tx, profileId, career.id, { gameDate: nextDate, data }, career.version);
		if (career.mode === 'coach' && !unemployed) await insertLedger(tx, career.id, career.season, step.date, wk.ledger, key);
		await insertTransfers(tx, career.id, career.season, step.date, wk.transfers, `${key}:t`);
		await insertMessages(tx, career.id, nextDate, wk.news);
		return saved;
	});
	return {
		career: updated,
		round,
		step: step.key,
		match: userMatch,
		finance: career.mode === 'coach' && !unemployed ? { balance: clubOut.balance, ledger: wk.ledger } : null,
		dismissed: career.mode === 'coach' && clubOut.board.dismissed && !(career.data.club?.board?.dismissed ?? false),
		unemployed: career.mode === 'coach' && clubOut.board.dismissed,
		results: rows.filter((r) => !r.isUser).map(({ home, away, homeGoals, awayGoals, competition }) => ({ home, away, homeGoals, awayGoals, competition }))
	};
}

/** Encerra a temporada: tabela final, acesso/rebaixamento, Copa e início da próxima. */
export async function finishSeason(db: Db, profileId: string, career: Career, version: number) {
	if (version !== career.version) throw new RoundError('A carreira mudou em outra janela. Recarregue para continuar.', 409);
	if (career.mode !== 'coach') throw new RoundError('A carreira de jogador foi descontinuada na versão 0.12. O save continua guardado como legado.', 410);
	const results = await listResults(db, career.id, career.season);
	const view = careerView(career, results);
	if (!view.seasonOver) throw new RoundError('Ainda há jogos a disputar nesta temporada.', 409);
	const strengthOf = strengthFor(career);
	const leagueResults = results.filter((r) => r.competition !== CUP_ID);
	const outcome = closeSeason(view.league, leagueResults, career.seed, strengthOf);
	const table = outcome.tables[view.division] ?? [];
	const row = table.find((r) => r.clubId === career.clubId);
	const move = outcome.moves.find((m) => m.clubId === career.clubId);
	const summary: SeasonSummary = {
		season: career.season,
		division: view.division,
		position: row?.position ?? 0,
		points: row?.points ?? 0,
		played: row?.played ?? 0,
		outcome: outcome.champions[view.division] === career.clubId ? 'campeao' : move?.reason === 'acesso' ? 'acesso' : move?.reason === 'rebaixamento' ? 'rebaixado' : 'permanece',
		champion: outcome.champions[view.division] ?? null
	};
	// Entre temporadas: elenco descansa; o conhecimento tático fica, com leve esquecimento.
	const tactical = structuredClone(view.tactical);
	for (const f of Object.keys(tactical.formations) as Array<keyof typeof tactical.formations>) tactical.formations[f] = Math.round(tactical.formations[f] * 0.95 * 10) / 10;
	for (const s of Object.keys(tactical.styles) as Array<keyof typeof tactical.styles>) tactical.styles[s] = Math.round(tactical.styles[s] * 0.95 * 10) / 10;
	const fitness: Record<string, number> = {};
	for (const p of view.squad) fitness[p.id] = 100;
	const coachKnowledge = view.coach ? coachSeasonDecay(view.coach) : null;
	const next = outcome.next;
	const cupNow = view.cup ? cupView(view.cup, results, career.seed, strengthOf) : null;
	// Copa da próxima temporada (projeção) a partir das novas divisões e dos campeões.
	const nextCup =
		view.world === 'brasil'
			? projectedCup(next, { cChampion: outcome.champions['serie-c'], cRunnerUp: outcome.runnersUp['serie-c'], dChampion: outcome.champions['serie-d'], dRunnerUp: outcome.runnersUp['serie-d'], dRanking: outcome.tables['serie-d']?.map((r) => r.clubId) })
			: undefined;
	// Gestão: contratos que terminam, empréstimos, premiações, avaliação da diretoria e nova base.
	const myCup = cupNow ? clubCupRun(cupNow, career.clubId) : null;
	const unemployed = isUnemployed(career);
	const officeBefore = career.mode === 'coach' ? officeOf(career, clubStateOf(career, view.league), view.league) : null;
	// Temporada inteira sem clube: o ex-clube não entra no histórico do treinador.
	const idleSeason = unemployed && !!officeBefore?.unemployedSince && officeBefore.unemployedSince.season < career.season;
	const end = unemployed ? { club: clubStateOf(career, view.league), market: sanitizeMarket(career.data.market), ledger: [], transfers: [], news: [] as Array<{ subject: string; body: string; important?: boolean; sender?: string }> } : seasonEndManagement({
		career,
		club: clubStateOf(career, view.league),
		market: sanitizeMarket(career.data.market),
		roster: rosterContext(career, view.league),
		league: view.league,
		next,
		position: row?.position ?? 0,
		size: table.length,
		promoted: move?.reason === 'acesso',
		relegated: move?.reason === 'rebaixamento',
		champion: summary.outcome === 'campeao',
		cupPhase: myCup?.lastPhase ?? 0,
		cupChampion: !!myCup?.champion,
		cupRunnerUp: !!cupNow && cupNow.runnerUp === career.clubId,
		strengthOf,
		inCupNext: !!nextCup && Object.values(nextCup.entrants).some((l) => l.includes(career.clubId))
	});
	const history: Array<[string, string, unknown]> = [];
	for (const [comp, champ] of Object.entries(outcome.champions)) if (champ) history.push(['campeao', comp, { clubId: champ, runnerUp: outcome.runnersUp[comp as keyof typeof outcome.runnersUp] ?? null }]);
	if (cupNow?.champion) history.push(['campeao', CUP_ID, { clubId: cupNow.champion, runnerUp: cupNow.runnerUp }]);
	if (!idleSeason) history.push(['temporada-usuario', view.division, { ...summary, clubId: career.clubId, cupPhase: myCup?.lastPhase ?? 0, cupChampion: !!myCup?.champion }]);
	history.push(['tabela', view.division, { rows: table.slice(0, 40).map((r) => ({ clubId: r.clubId, points: r.points, won: r.won, drawn: r.drawn, lost: r.lost, goalDiff: r.goalDiff })) }]);
	const scorers = topScorers(await listSeasonGoals(db, career.id, career.season), view.division);
	if (scorers.length) history.push(['artilharia', view.division, { players: scorers }]);
	const nextDate = seasonStartDate(next.season);
	// Dev 0.5: universo (projetos, técnicos, recordes) e gabinete (histórico, contrato, propostas).
	const points: Record<string, { points: number; games: number }> = {};
	for (const rows of Object.values(outcome.tables)) for (const r of rows ?? []) points[r.clubId] = { points: r.points, games: r.played };
	const tablesFinal = Object.fromEntries(Object.entries(outcome.tables).map(([d, rows]) => [d, (rows ?? []).map((r) => r.clubId)]));
	const universe = universeAtSeasonEnd(ensureUniverse(career, view.league), career, view.league, {
		tables: tablesFinal,
		points,
		champions: Object.fromEntries(Object.entries(outcome.champions).filter(([, v]) => !!v)) as Record<string, string>,
		promoted: outcome.moves.filter((m) => m.reason === 'acesso').map((m) => m.clubId),
		relegated: outcome.moves.filter((m) => m.reason === 'rebaixamento').map((m) => m.clubId),
		next,
		cupChampion: cupNow?.champion ?? null
	});
	let officeData: Partial<CareerData> = {};
	if (career.mode === 'coach') {
		const monthlyWages = payroll(rosterOf(rosterContext(career, view.league), career.clubId));
		const oe = officeSeasonEnd({ career, office: officeOf(career, end.club, view.league), club: end.club, universe, division: view.division, position: row?.position ?? null, outcome: summary.outcome === 'rebaixado' ? 'queda' : summary.outcome === 'permanece' ? 'permanece' : summary.outcome, next, monthlyWages });
		end.club = oe.club;
		end.news.push(...oe.news);
		officeData = { office: { ...oe.office, meeting: null, press: null } };
	}
	const updated = await db.transaction(async (tx) => {
		const saved = await saveCareerProgress(
			tx,
			profileId,
			career.id,
			{ gameDate: nextDate, season: next.season, data: { league: next, tactical, fitness, seasons: idleSeason ? view.seasons : [...view.seasons, summary], ...(nextCup ? { cup: nextCup } : {}), market: end.market, ...(career.mode === 'coach' ? { club: end.club } : {}), ...(coachKnowledge ? { coachKnowledge } : {}), universe, ...officeData } },
			career.version
		);
		if (career.mode === 'coach' && !unemployed) await insertLedger(tx, career.id, career.season, addDays(nextDate, -1), end.ledger, `${career.season}:fim`);
		await insertTransfers(tx, career.id, career.season, addDays(nextDate, -1), end.transfers, `${career.season}:fim:t`);
		await insertMessages(tx, career.id, nextDate, end.news);
		for (const [kind, comp, data] of history) await upsertHistory(tx, career.id, career.season, kind, comp, data);
		return saved;
	});
	return { career: updated, summary, moves: outcome.moves, champions: outcome.champions, cupChampion: cupNow?.champion ?? null };
}

/** Artilharia da divisão do usuário (partidas com súmula: a do usuário e as demais no motor completo). */
function topScorers(games: Array<{ competition: string; home: string; away: string; goals: Array<{ side: 'home' | 'away'; player: string }> }>, division: string): Array<{ playerId: string; clubId: string; goals: number }> {
	const count = new Map<string, { clubId: string; goals: number }>();
	for (const g of games) {
		if (g.competition !== division) continue;
		for (const goal of g.goals) {
			const clubId = goal.side === 'home' ? g.home : g.away;
			const cur = count.get(goal.player) ?? { clubId, goals: 0 };
			cur.goals++;
			count.set(goal.player, cur);
		}
	}
	return [...count.entries()].sort((a, b) => b[1].goals - a[1].goals).slice(0, 10).map(([playerId, v]) => ({ playerId, clubId: v.clubId, goals: v.goals }));
}

const MAX_DECISIONS = 80;

/** Valida a forma das decisões do lado humano; o motor ainda aplica as regras. */
export function sanitizeDecisions(raw: unknown, side: 'home' | 'away' | null): AppliedDecision[] {
	if (raw === undefined || raw === null) return [];
	if (!Array.isArray(raw) || raw.length > MAX_DECISIONS) throw new RoundError('Lista de decisões inválida.', 400);
	const out: AppliedDecision[] = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') throw new RoundError('Decisão inválida.', 400);
		const d = item as Record<string, unknown>;
		if (side === null || d.side !== side || d.rejected) continue; // decisões da IA são recalculadas aqui
		const tick = Number(d.tick);
		if (!Number.isInteger(tick) || tick < 0 || tick > 7200) throw new RoundError('Momento da decisão inválido.', 400);
		const decision = parseDecision(d.decision);
		if (!decision) throw new RoundError('Decisão de tipo desconhecido.', 400);
		out.push({ tick, side, decision, ...(decision.type === 'swap' && d.beforeTick === true ? { beforeTick: true } : {}) });
	}
	return out;
}


export function parseDecision(raw: unknown): Decision | null {
	const dec = raw as Record<string, unknown> | undefined;
	if (!dec || typeof dec !== 'object') return null;
	if (dec.type === 'individual' && typeof dec.playerId === 'string' && dec.playerId.length <= 128 && (dec.order === null || isPlayerOrder(dec.order))) return { type: 'individual', playerId: dec.playerId, order: dec.order };
	if (dec.type === 'captains' && Array.isArray(dec.order) && dec.order.length <= 11 && dec.order.every((id) => typeof id === 'string' && id.length <= 128)) return { type: 'captains', order: dec.order };
	if (dec.type === 'swap' && typeof dec.first === 'string' && typeof dec.second === 'string'
		&& dec.first.length > 0 && dec.first.length <= 128 && dec.second.length > 0 && dec.second.length <= 128 && dec.first !== dec.second) {
		return { type: 'swap', first: dec.first, second: dec.second };
	}
	if (dec.type === 'sub' && typeof dec.outId === 'string' && typeof dec.inId === 'string') {
		const slot = Number.isInteger(dec.slot) && (dec.slot as number) >= 0 && (dec.slot as number) < 11 ? (dec.slot as number) : undefined;
		return { type: 'sub', outId: dec.outId, inId: dec.inId, ...(slot !== undefined ? { slot } : {}) };
	}
	if (dec.type === 'move' && typeof dec.playerId === 'string' && dec.playerId.length <= 128 && Number.isInteger(dec.slot) && (dec.slot as number) >= 0 && (dec.slot as number) < 11) return { type: 'move', playerId: dec.playerId, slot: dec.slot as number };
	if (dec.type === 'mentality' && normalizeMentality(dec.value)) return { type: 'mentality', value: normalizeMentality(dec.value)! };
	if (dec.type === 'style' && normalizeStyle(dec.value)) return { type: 'style', value: normalizeStyle(dec.value)! };
	if (dec.type === 'instructions' && dec.value && typeof dec.value === 'object') return { type: 'instructions', value: sanitizeInstructions(dec.value, presetInstructions('equilibrada', 'posse')) };
	if (dec.type === 'formation' && isFormation(dec.value) && Array.isArray(dec.lineup) && dec.lineup.length === FORMATIONS[dec.value].length && dec.lineup.every((x) => typeof x === 'string' && x.length <= 128)) {
		const roles = Array.isArray(dec.roles) && dec.roles.length === dec.lineup.length && dec.roles.every(isRoleId) ? dec.roles : undefined;
		return { type: 'formation', value: dec.value, lineup: dec.lineup as string[], ...(roles ? { roles } : {}) };
	}
	return null;
}

/** Próximo jogo do usuário depois deste passo (liga ou Copa). */
function upcomingAfter(view: ReturnType<typeof careerView>, results: StoredRoundResult[]) {
	const played = (f: { competition: string; round: number; home: string }) => results.some((r) => (r.competition ?? 'liga-brasfc') === f.competition && r.round === f.round && r.home === f.home);
	return view.clubFixtures.find((f) => !played(f)) ?? null;
}
