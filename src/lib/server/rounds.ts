import { isPlayerOrder } from '#lib/domain/player-orders.ts';
import { staffEffects } from '#lib/domain/staff.ts';
import { suggestPlan } from '#lib/domain/drills.ts';
import type { StoredRoundResult } from '#lib/domain/league.ts';
import { ensureUniverse, inboxWorthy, officeOf, officeSeasonEnd, officeStep, universeAfterStep, universeAtSeasonEnd } from './universe.ts';
import type { Career, CareerData } from '#lib/domain/career.ts';
import { addDays } from '#lib/domain/dates.ts';
import { applyTrainingWeek, recoverFitness } from '#lib/domain/drills.ts';
import { activeDivisions, closeSeason, divisionOf, leagueSeasonStart, phaseOneLength, settleLeagueMatchday, type DivisionId, type SeasonSummary } from '#lib/domain/league.ts';
import { fixtureStepKey } from '#lib/domain/calendar.ts';
import { settleTournament, tournamentView } from '#lib/domain/tournaments.ts';
import { nextBrazilTournaments, regionalCupRankings, tournamentDefinitions } from '#lib/data/brasil/2026/tournaments.ts';
import { CUP_ID, clubCupRun, cupView, projectedCup, settleCupMatchday } from '#lib/domain/cup.ts';
import { qualifyBrazil2027 } from '#lib/domain/continental-qualification.ts';
import { initialClubState, payroll, sanitizeMarket } from '#lib/domain/management.ts';
import { clubStateOf, rosterContext } from '#lib/domain/world.ts';
import { seasonEndManagement, weeklyManagement, type WeeklyResult } from './management.ts';
import { rosterOf, tierOfDivision } from '#lib/domain/market.ts';
import { attendance, clubEconomy, isDerby, stadiumCapacity } from '#lib/domain/club.ts';
import { getClub } from '#lib/domain/clubs.ts';
import { realClub } from '#lib/data/brasil.ts';
import { insertLedger, insertMessages, insertTransfers, upsertHistory, type TransferRow } from './repos/management.ts';
import { strengthFor } from '#lib/domain/strength.ts';
import type { Fixture } from '#lib/domain/season.ts';
import { fixtureSetup, matchFromSetup, matchFromShared, observedFrom, sharedSetup, simulateOtherFixtures, summarize, type MatchdayContext } from '#lib/domain/matchday.ts';
import { activeCoachIndex, humanClubs, liveCoaches, localGroup, projectCoach, rebuildShared, sharedClub, type LocalGroup } from '#lib/domain/turns.ts';
import type { ClubState, LedgerLine } from '#lib/domain/management.ts';
import { learnFromMatch, teamMastery } from '#lib/domain/tactical.ts';
import { applyMatchDiscipline, sanitizeDiscipline, type DisciplineState } from '#lib/domain/discipline.ts';
import { coachLearnFromMatch, coachSeasonDecay, teachingFactor, withTeaching } from '#lib/domain/coach-knowledge.ts';
import { careerView } from '#lib/domain/view.ts';
import { isUnemployed } from '#lib/domain/employment.ts';
import { ENGINE_VERSION, type AppliedDecision } from '#lib/engine/types.ts';
import { FORMATIONS, isFormation, normalizeMentality, normalizeStyle } from '#lib/domain/tactics.ts';
import { presetInstructions, sanitizeInstructions } from '#lib/engine/instructions.ts';
import { isRoleId } from '#lib/engine/roles.ts';
import type { Decision, Side } from '#lib/engine/types.ts';
import type { Db } from './db/index.ts';
import { replaceCareerData, saveCareerProgress } from './repos/careers.ts';
import { rememberPrefetched, takePrefetched } from './round-prefetch.ts';
import { insertRound, listResults, listSeasonGoals, listUserMatches, recentUserMatches, type RoundInsert, type StoredResult } from './repos/matches.ts';

export class RoundError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
	}
}

export class SeasonSelectionRequired extends RoundError {
	constructor(readonly divisions: DivisionId[]) {
		super('Confirme as novas divisões dos clubes dos treinadores antes de iniciar a próxima temporada.', 409);
	}
}

/** Contexto do dia de jogo a partir do estado salvo (o mesmo usado pelo navegador). */
export async function matchdayContext(db: Db, career: Career, view?: ReturnType<typeof careerView>): Promise<MatchdayContext> {
	view ??= careerView(career, await listResults(db, career.id, career.season));
	const previous = await recentUserMatches(db, career.id, 3, sharedClub(career));
	const observed = previous
		.map((m) => observedFrom(m.summary))
		.filter((o) => o !== null);
	return { season: career.season, firstSeason: view.firstSeason, tactical: view.effective, fitness: career.data.fitness, observed, playerCalendar: { division: view.division, gameDates: view.clubFixtures.map((f) => f.date) } };
}

/** Chave estável de um jogo do passo (decisões enviadas pela central da rodada). */
export const fixtureKey = (f: { competition: string; home: string; away: string }) => `${f.competition}:${f.home}:${f.away}`;

/** Um treinador dentro do processamento de um passo (na carreira individual há só um). */
type CoachRun = {
	index: number;
	/** id do treinador (null na carreira individual) */
	id: string | null;
	career: Career;
	view: ReturnType<typeof careerView>;
	unemployed: boolean;
	ctx: MatchdayContext;
	mine: Fixture | null;
	setup: ReturnType<typeof fixtureSetup> | null;
	userMatch: { fixture: Fixture; homeGoals: number; awayGoals: number; summary: ReturnType<typeof summarize> } | null;
	row: RoundInsert | null;
	tactical: ReturnType<typeof careerView>['tactical'];
	coachKnowledge: ReturnType<typeof careerView>['coach'];
	discipline: DisciplineState | null;
	disciplineNews: Array<{ subject: string; body: string }>;
	fitness: Record<string, number>;
};

/** Monta os treinadores do passo: projeção de cada um, contexto e jogo (se tiver). */
async function coachRuns(db: Db, career: Career, results: StoredResult[], view: ReturnType<typeof careerView>, fixtures: Fixture[]): Promise<CoachRun[]> {
	const group = localGroup(career);
	const active = activeCoachIndex(career);
	const indexes = group ? group.coaches.map((_, i) => i) : [0];
	const runs: CoachRun[] = [];
	for (const i of indexes) {
		const c = projectCoach(career, i);
		const v = i === active ? view : careerView(c, results);
		const unemployed = isUnemployed(c);
		const mine = unemployed ? null : (fixtures.find((f) => f.home === c.clubId || f.away === c.clubId) ?? null);
		runs.push({
			index: i, id: group ? group.coaches[i].id : null, career: c, view: v, unemployed,
			ctx: mine ? await matchdayContext(db, c, v) : { season: c.season, firstSeason: v.firstSeason, tactical: v.effective, observed: [] },
			mine, setup: null, userMatch: null, row: null,
			tactical: v.tactical, coachKnowledge: v.coach, discipline: null, disciplineNews: [], fitness: { ...(c.data.fitness ?? {}) }
		});
	}
	return runs;
}

/**
 * Processa o próximo PASSO do calendário (domingo de liga ou quarta de Copa): reproduz as partidas dos
 * treinadores pela semente + decisões (o placar enviado pelo cliente nunca é aceito), simula os demais
 * jogos, aplica aprendizado tático, treino e recuperação, e grava tudo de uma vez.
 * 0.13: com vários treinadores, cada um tem o próprio jogo e a própria gestão; o confronto entre dois
 * humanos é UMA partida (simulada uma vez, com as decisões dos dois lados). No fim o controle volta ao
 * primeiro treinador. Jogos das competições dos treinadores usam o motor completo; os demais, o modelo rápido.
 */
export async function playRound(db: Db, profileId: string, career: Career, body: { version: number; season?: number; round?: number; step?: string; decisions?: AppliedDecision[]; matches?: Record<string, unknown> }) {
	const versionChanged = body.version !== career.version;
	const versionError = () => new RoundError('A carreira mudou em outra janela. Recarregue para continuar.', 409);
	if (body.season !== undefined && body.season !== career.season) throw versionError();
	if (versionChanged && body.season === undefined) throw versionError();
	if (career.mode !== 'coach') throw new RoundError('A carreira de jogador foi descontinuada na versão 0.12. O save continua guardado como legado.', 410);
	const group = localGroup(career);
	// Medição por etapa (devolvida em Server-Timing): leitura, partida do usuário, outros jogos, gestão, mundo, gravação.
	const timings: Record<string, number> = {};
	let lap = performance.now();
	const mark = (name: string) => {
		const now = performance.now();
		timings[name] = Math.round((now - lap) * 10) / 10;
		lap = now;
	};
	const results = await listResults(db, career.id, career.season);
	const view = careerView(career, results);
	const step = view.step;
	const asked = body.step ?? (typeof body.round === 'number' ? `league:${body.round}` : null);
	if (asked !== step?.key) {
		// Reenvio de um passo que JÁ foi gravado (resposta perdida, segundo envio, "Tentar de novo" depois de um
		// envio que chegou ao servidor): devolve o resultado oficial guardado em vez de acusar erro.
		const replay = asked ? await recordedStep(db, career, results, view, asked) : null;
		if (replay) return replay;
		if (versionChanged) throw versionError();
		if (!step) throw new RoundError('A temporada terminou. Encerre-a para começar a próxima.', 409);
		throw new RoundError('Este passo do calendário já foi disputado ou ainda não chegou.', 409);
	}
	if (versionChanged || !step) throw versionError();
	// Turnos: nada acontece antes de o último treinador confirmar a preparação.
	if (group && !allReady(group)) throw new RoundError('Ainda há treinadores preparando o clube para esta rodada.', 409);
	if (group?.deal?.status === 'aberta') throw new RoundError('Há uma negociação entre treinadores aguardando resposta.', 409);
	const divisions = group ? Object.keys(humanClubs(career)).map((id) => divisionOf(view.league, id)).filter((d): d is NonNullable<typeof d> => !!d) : undefined;
	const roundPlan = planRound(career, results, view, divisions);
	const { strengthOf, fixtures, full } = roundPlan;
	const { league, cup } = roundPlan;
	const round = step.kind === 'league' ? step.round : step.matchday;
	mark('leitura');
	const runs = await coachRuns(db, career, results, view, fixtures);
	const rows: RoundInsert[] = [];
	// Jogos com treinador humano: um por partida (o confronto entre humanos junta os dois lados).
	const humanFixtures = [...new Set(runs.flatMap((r) => (r.mine ? [r.mine] : [])))];
	for (const f of humanFixtures) {
		const sides = runs.filter((r) => r.mine === f);
		for (const r of sides) r.setup = fixtureSetup(r.career, f, r.view.tactic, r.ctx);
		const shared = sharedSetup(sides.map((r) => r.setup!));
		const decisions = group
			? sanitizeSides((body.matches ?? {})[fixtureKey(f)], shared.humans)
			: sanitizeDecisions(body.decisions, sides[0].setup!.control);
		const match = group ? matchFromShared(shared, decisions) : matchFromSetup(sides[0].setup!, decisions);
		const result = match.runToEnd();
		let stored: ReturnType<typeof summarize> | null = null;
		for (const r of sides) {
			const setup = r.setup!;
			const t = setup.myTactic;
			const mastery = teamMastery(r.view.effective, t.formation, t.style, t.lineup, t.instructions);
			const summary = summarize(match, result, setup.mySide, {
				tactic: { formation: t.formation, style: t.style, ...(t.instructions ? { instructions: t.instructions } : {}), roles: t.roles },
				opponentCoach: setup.opponentCoach,
				opponentPlan: setup.opponentPlan,
				execution: mastery.execution
			});
			// Súmula gravada: a do mandante humano (ou do único humano). O outro lado a relê pelo próprio lado.
			if (!stored || setup.mySide === 'home') stored = summary;
			r.userMatch = { fixture: f, homeGoals: result.homeGoals, awayGoals: result.awayGoals, summary };
			// Disciplina: suspensos cumprem este jogo; cartões geram acúmulo e novas suspensões (por competição).
			const squad = r.view.squad;
			const names = new Map(squad.map((p) => [p.id, p.name]));
			const discipline = sanitizeDiscipline(r.career.data.discipline, r.career.season);
			if (f.competition === 'serie-b' && league.bPromotionPlayoff?.length && round === phaseOneLength(league, 'serie-b') + 1) {
				delete discipline.yellows['serie-b'];
			}
			const competition = r.view.tournaments.find((t) => t.competition.id === f.competition);
			if (competition?.competition.kind === 'regional-cup' && competition.phases[0]?.rounds[0] === round) {
				delete discipline.yellows[f.competition];
			}
			const out = applyMatchDiscipline(discipline, {
				season: r.career.season, round, competition: f.competition,
				cards: summary.cards.filter((c) => c.side === setup.mySide),
				names: (id) => names.get(id) ?? id
			});
			r.discipline = out.state;
			r.disciplineNews = out.news;
			// Aprendizado: quem jogou, quantos minutos e em que função (titulares pelo slot; reservas na função do slot que ocuparam).
			const team = match.teams[setup.mySide];
			const appearances = [...match.states.values()]
				.filter((s) => s.side === setup.mySide && (result.players[s.id]?.minutes ?? 0) > 0)
				.map((s) => ({ id: s.id, minutes: result.players[s.id].minutes, role: t.roles[s.slot] ?? t.roles[0] }));
			const learned = learnFromMatch(r.tactical, { formation: team.tactic.formation, style: team.tactic.style, instructions: t.instructions, appearances, squad });
			// O elenco aprende mais rápido com um treinador que domina o sistema; o treinador também ganha experiência.
			r.tactical = withTeaching(r.tactical, learned, teachingFactor(r.tactical, r.view.coach, t.formation, t.style));
			if (r.view.coach) r.coachKnowledge = coachLearnFromMatch(r.view.coach, { formation: team.tactic.formation, style: team.tactic.style, instructions: t.instructions, season: r.career.season, clubId: r.career.clubId });
			r.tactical.history = [...r.tactical.history, { season: r.career.season, round, formation: t.formation, style: t.style, goalsFor: setup.mySide === 'home' ? result.homeGoals : result.awayGoals, goalsAgainst: setup.mySide === 'home' ? result.awayGoals : result.homeGoals, execution: mastery.execution }].slice(-120);
			for (const [id, st] of Object.entries(result.players)) if (squad.some((p) => p.id === id) && st.minutes > 0) r.fitness[id] = st.condition;
		}
		const row: RoundInsert = { season: career.season, round, competition: f.competition, home: f.home, away: f.away, homeGoals: result.homeGoals, awayGoals: result.awayGoals, seed: shared.seed, isUser: true, decisions: result.decisions.filter((d) => shared.humans.includes(d.side)), summary: stored! };
		rows.push(row);
		for (const r of sides) r.row = row;
	}
	mark('partida-usuario');
	const others = fixtures.filter((f) => !humanFixtures.includes(f));
	// Os demais jogos não dependem das decisões dos treinadores: se já foram simulados em segundo plano
	// (mesma versão do save e mesmo passo), o resultado é reaproveitado — idêntico, só que pronto.
	const lead = runs.find((r) => r.career === career) ?? runs[0];
	const prefetched = takePrefetched(career, step.key, others);
	timings.reaproveitado = prefetched ? 1 : 0;
	for (const r of prefetched ?? simulateOtherFixtures(career, others, lead.ctx, { full, strengthOf })) {
		rows.push({ season: career.season, round, competition: r.competition, home: r.home, away: r.away, homeGoals: r.homeGoals, awayGoals: r.awayGoals, seed: r.seed, isUser: false, ...(r.goals ? { summary: { goals: r.goals.map(({ side, player, minute }) => ({ side, player, minute })), highlights: r.highlights } as never } : {}) });
	}
	const allResults: StoredRoundResult[] = [...results, ...rows.map((r) => ({ round: r.round, competition: r.competition, home: r.home, away: r.away, homeGoals: r.homeGoals, awayGoals: r.awayGoals }))];
	const nextDate = addDays(step.date, 1);
	mark('outros-jogos');
	let universe = ensureUniverse(career, league);
	let market = sanitizeMarket(career.data.market);
	type CoachOut = { run: CoachRun; club: ClubState; office: ReturnType<typeof officeOf> | null; ledger: LedgerLine[]; news: WeeklyResult['news']; data: Partial<CareerData> };
	const outs: CoachOut[] = [];
	const transfers: TransferRow[] = [];
	const universeBefore = universe;
	for (const [k, r] of runs.entries()) {
		const c = r.career;
		// Domingo: semana de treinos e recuperação até a próxima rodada. Quarta: só o desgaste do jogo.
		// Dev 0.5: a comissão técnica entra nos cálculos (aprendizado, recuperação, preparação).
		const clubNow = clubStateOf(c, league);
		const fx = staffEffects(clubNow.staff);
		let office = officeOf(c, clubNow, league);
		if (r.mine && r.tactical.opponentPrep) r.tactical = { ...r.tactical, opponentPrep: null }; // a preparação vale um jogo
		const nextFix = upcomingAfter(r.view, allResults);
		const nextOpponent = nextFix ? (nextFix.home === c.clubId ? nextFix.away : nextFix.home) : null;
		let plan = r.view.trainingPlan;
		let delegatedReasons: string[] = [];
		const squad = r.view.squad;
		if (step.kind === 'league') {
			if (!r.unemployed) {
				const weekCtx = { formation: r.view.tactic.formation, style: r.view.tactic.style, lineup: r.view.tactic.lineup, roles: r.view.tactic.roles, squad, nextOpponent, learning: fx.tacticalLearning, analyst: fx.opponentPrep };
				if (office?.delegated) {
					const avg = squad.reduce((s, p) => s + (r.fitness[p.id] ?? 95), 0) / Math.max(1, squad.length);
					const sug = suggestPlan(r.tactical, weekCtx, avg);
					plan = sug.plan;
					delegatedReasons = sug.reasons;
				}
				r.tactical = withTeaching(r.tactical, applyTrainingWeek(r.tactical, plan, weekCtx), teachingFactor(r.tactical, r.view.coach, r.view.tactic.formation, r.view.tactic.style));
			}
			const before = r.fitness;
			const recovered = recoverFitness(r.fitness, squad, plan);
			r.fitness = {};
			for (const [id, v] of Object.entries(recovered)) {
				const prev = before[id] ?? 95;
				const gainF = (v - prev) * fx.fitnessRecovery * (prev < 70 ? fx.physio : 1);
				r.fitness[id] = Math.round(Math.max(30, Math.min(100, prev + gainF)) * 10) / 10;
			}
		}
		// Gestão do clube e mundo vivo: finanças, torcida, diretoria, mercado da IA, propostas e olheiros.
		if (k === 0) mark('treino');
		const wk = weeklyManagement({
			career: c,
			league,
			club: clubStateOf(c, league),
			market,
			step: { kind: step.kind, round: step.kind === 'league' ? step.round : r.view.nextRound, ...(step.kind === 'cup' ? { matchday: step.matchday } : {}) },
			roster: rosterContext(c, league),
			userRow: r.row,
			strengthOf,
			aiMarket: k === 0
		});
		market = wk.market;
		transfers.push(...wk.transfers);
		// Dev 0.5: universo vivo (forma, diretorias, demissões, notícias) e gabinete do treinador — o mundo avança uma vez.
		if (k === 0) {
			mark('gestao');
			universe = universeAfterStep(universe, career, league, { round, league: step.kind === 'league', seasonResults: allResults, newResults: rows.map(({ home, away, homeGoals, awayGoals, competition }) => ({ home, away, homeGoals, awayGoals, competition })), strengthOf });
		}
		// Ex-clube volta para a IA: as finanças dele não são mais da carreira (nem lançamentos, nem caixa).
		let clubOut = r.unemployed ? clubStateOf(c, league) : wk.club;
		if (r.unemployed) wk.news.splice(0, wk.news.length);
		const big = wk.transfers.filter((t) => t.to === c.clubId && t.fee >= 1_000_000).sort((a, b) => b.fee - a.fee)[0];
		const os = officeStep({ career: c, league, office, club: clubOut, universe, round, leagueRound: r.view.nextRound - 1, isLeague: step.kind === 'league', totalRounds: r.view.rounds, seasonResults: allResults, userMatch: r.mine && r.userMatch ? { home: r.mine.home, away: r.mine.away, homeGoals: r.userMatch.homeGoals, awayGoals: r.userMatch.awayGoals, competition: r.mine.competition } : null, nextOpponent, nextDecisive: !!nextFix && nextFix.competition === CUP_ID, signedBig: big?.playerName ?? null });
		office = os.office;
		clubOut = os.club;
		universe = os.universe;
		wk.news.push(...os.news);
		if (delegatedReasons.length) wk.news.push({ sender: 'Auxiliar técnico', subject: 'Semana de treinos planejada', body: `Montei a semana: ${plan.sessions.join(', ')} (intensidade ${plan.intensity}). ${delegatedReasons.join(' ')}`, important: false });
		outs.push({ run: r, club: clubOut, office, ledger: r.unemployed ? [] : wk.ledger, news: wk.news, data: {} });
	}
	for (const o of outs) {
		const r = o.run;
		const nextFix = upcomingAfter(r.view, allResults);
		const nextOpponent = nextFix ? (nextFix.home === r.career.clubId ? nextFix.away : nextFix.home) : null;
		o.news.push(...inboxWorthy(universeBefore, universe, r.career.clubId, r.view.division, nextOpponent));
		for (const n of r.disciplineNews) o.news.push({ sender: 'Departamento de futebol', subject: n.subject, body: n.body, important: true });
		o.data = { tactical: r.tactical, fitness: r.fitness, ...(r.coachKnowledge ? { coachKnowledge: r.coachKnowledge } : {}), ...(r.discipline ? { discipline: r.discipline } : {}), ...(o.office ? { office: o.office } : {}), club: o.club };
	}
	const key = `${career.season}:${step.key}`;
	mark('mundo');
	const settledCup = cup && step.kind === 'cup' && !step.competition ? settleCupMatchday(cup, step.matchday, allResults, career.seed, strengthOf) : cup;
	const states = career.data.tournaments;
	const tournament = step.kind === 'cup' && step.competition
		? tournamentDefinitions(career.season, states ?? []).find(({ competition }) => competition.id === step.competition)
		: undefined;
	const tournaments = tournament && step.kind === 'cup' ? states?.map((state) => state.id !== tournament.competition.id
		? state
		: settleTournament(state, tournamentView(tournament, state, allResults, career.seed, strengthOf, career.clubId), step.matchday)) : states;
	const settledLeague = step.kind === 'league' ? settleLeagueMatchday(league, round, allResults, career.seed, strengthOf) : league;
	const world: Partial<CareerData> = { league: settledLeague, universe, ...(settledCup ? { cup: settledCup } : {}), ...(tournaments ? { tournaments } : {}), market };
	const updated = await db.transaction(async (tx) => {
		await insertRound(tx, career.id, rows, ENGINE_VERSION);
		const saved = group
			? await replaceCareerData(tx, profileId, career.id, { ...afterRound(career, outs.map((o) => o.data), world), gameDate: nextDate }, career.version)
			: await saveCareerProgress(tx, profileId, career.id, { gameDate: nextDate, data: { ...outs[0].data, ...world } }, career.version);
		for (const o of outs) {
			if (!o.run.unemployed) await insertLedger(tx, career.id, career.season, step.date, o.ledger, key, o.run.id);
			await insertMessages(tx, career.id, nextDate, o.news, o.run.id);
		}
		await insertTransfers(tx, career.id, career.season, step.date, transfers, `${key}:t`);
		return saved;
	});
	mark('gravacao');
	const me = outs.find((o) => o.run.career === career) ?? outs[0];
	const coachResult = (o: CoachOut) => ({
		index: o.run.index,
		match: o.run.userMatch,
		finance: !o.run.unemployed ? { balance: o.club.balance, ledger: o.ledger } : null,
		dismissed: o.club.board.dismissed && !(o.run.career.data.club?.board?.dismissed ?? false),
		unemployed: o.club.board.dismissed
	});
	const mine = coachResult(me);
	return {
		career: updated,
		timings,
		round,
		step: step.key,
		match: mine.match,
		finance: mine.finance,
		dismissed: mine.dismissed,
		unemployed: mine.unemployed,
		results: rows.filter((r) => !r.isUser).map(({ home, away, homeGoals, awayGoals, competition }) => ({ home, away, homeGoals, awayGoals, competition })),
		...(group ? { coaches: outs.map(coachResult) } : {})
	};
}

/**
 * 0.13 · Central da rodada (carreira com vários treinadores): monta as partidas dos treinadores
 * (com as táticas de cada um) e simula UMA vez os demais jogos — os mesmos que a gravação usará
 * (o resultado fica guardado para a gravação da rodada, na mesma versão do save).
 */
export async function roundPreview(db: Db, career: Career) {
	const group = localGroup(career);
	const results = await listResults(db, career.id, career.season);
	const view = careerView(career, results);
	if (view.seasonOver || !view.step) return null;
	const step = view.step;
	const divisions = group ? Object.keys(humanClubs(career)).map((id) => divisionOf(view.league, id)).filter((d): d is NonNullable<typeof d> => !!d) : undefined;
	const plan = planRound(career, results, view, divisions);
	const runs = await coachRuns(db, career, results, view, plan.fixtures);
	// Estádio e público (modelo de bilheteria do jogo: o dos clubes humanos é o mesmo que entra no caixa deles).
	const humansNow = new Map(runs.filter((r) => !r.unemployed).map((r) => [r.career.clubId, r.career]));
	const venue = (f: { home: string; away: string; competition: string }) => {
		const division = divisionOf(plan.league, f.home);
		const tier = tierOfDivision(division);
		const owner = humansNow.get(f.home);
		const st = owner ? clubStateOf(owner, plan.league) : initialClubState(career.seed, f.home, division, career.season);
		const eco = clubEconomy(f.home, tier);
		const neutral = !!(f as { neutral?: boolean }).neutral;
		const crowd = attendance({ capacity: stadiumCapacity(eco.capacity, st.infra.estadio.level), fanMood: st.fanMood, price: st.ticketPrice, ticketRef: eco.ticketRef, opponentReputation: getClub(f.away)?.reputation ?? 2, derby: isDerby(f.home, f.away), competitionWeight: f.competition === CUP_ID ? 1.1 : 1 });
		return { stadium: neutral ? 'Campo neutro' : (realClub(f.home)?.estadio ?? getClub(f.home)?.stadium ?? '—'), attendance: neutral ? null : crowd };
	};
	const humanFixtures = [...new Set(runs.flatMap((r) => (r.mine ? [r.mine] : [])))];
	const matches = humanFixtures.map((f) => {
		const sides = runs.filter((r) => r.mine === f);
		const parts = sides.map((r) => fixtureSetup(r.career, f, r.view.tactic, r.ctx));
		return {
			key: fixtureKey(f), competition: f.competition, round: f.round, home: f.home, away: f.away, venue: venue(f),
			coaches: sides.map((r, i) => ({ index: r.index, side: parts[i].mySide, name: r.career.personName })),
			setup: sharedSetup(parts),
			suspended: parts.flatMap((p) => p.suspended)
		};
	});
	const others = plan.fixtures.filter((f) => !humanFixtures.includes(f));
	const lead = runs.find((r) => r.career === career) ?? runs[0];
	const sims = takePrefetched(career, step.key, others) ?? simulateOtherFixtures(career, others, lead.ctx, { full: plan.full, strengthOf: plan.strengthOf });
	rememberPrefetched(career, step.key, others, sims);
	const ctx = rosterContext(career, plan.league);
	const names = new Map<string, string>();
	const loadedClubs = new Set<string>();
	const nameOf = (club: string, id: string) => {
		if (!loadedClubs.has(club)) {
			for (const p of rosterOf(ctx, club)) names.set(`${club}:${p.id}`, p.shortName ?? p.name);
			loadedClubs.add(club);
		}
		return names.get(`${club}:${id}`) ?? '—';
	};
	return {
		step: step.key,
		kind: step.kind,
		round: step.kind === 'league' ? step.round : step.matchday,
		date: step.date,
		matches,
		others: sims.map((r) => ({
			competition: r.competition, home: r.home, away: r.away, homeGoals: r.homeGoals, awayGoals: r.awayGoals, quick: !!r.quick, venue: venue(others.find((f) => f.home === r.home && f.away === r.away && f.competition === r.competition) ?? r),
			highlights: (r.highlights ?? []).map((x) => {
				const club = x.side === 'home' ? r.home : r.away;
				return { ...x, player: x.player && nameOf(club, x.player), other: x.other && nameOf(club, x.other) };
			})
		}))
	};
}

/** Todos os treinadores confirmaram a preparação do passo (o último confirma ao mandar jogar). */
function allReady(g: LocalGroup): boolean {
	return g.coaches.every((c, i) => i === g.active || g.ready.includes(c.id));
}

/** Save depois do passo: mundo novo, cada treinador com os próprios dados e o primeiro no controle. */
function afterRound(career: Career, coachData: Array<Partial<CareerData>>, world: Partial<CareerData>) {
	return rebuildShared(career, Object.fromEntries(coachData.map((d, i) => [i, d])), world, { ready: [], step: null }, 0);
}

/**
 * Resultado de um passo já disputado nesta temporada, no mesmo formato da resposta de playRound
 * (com `replay: true`). Só leitura: nada é recalculado nem gravado de novo. Null quando o passo
 * ainda não foi jogado (aí o erro original continua valendo).
 */
async function recordedStep(db: Db, career: Career, results: StoredResult[], view: ReturnType<typeof careerView>, asked: string) {
	const number = Number(asked.split(':').at(-1));
	const inStep = (r: { competition: string; round: number }) => fixtureStepKey(r.competition, r.round) === asked;
	const rows = results.filter(inStep);
	if (!rows.length) return null;
	const recorded = rows.some((r) => r.isUser) ? (await listUserMatches(db, career.id, career.season, null, { round: number })).filter(inStep) : [];
	const seen = (clubId: string) => {
		const mine = recorded.find((r) => r.home === clubId || r.away === clubId);
		if (!mine) return null;
		const fixture = [...view.fixtures, ...view.clubFixtures, ...view.tournaments.flatMap((tournament) => tournament.fixtures)].find((f) => inStep(f) && f.home === mine.home && f.away === mine.away)
			?? ({ round: number, competition: mine.competition, home: mine.home, away: mine.away } as Fixture);
		return { fixture, homeGoals: mine.homeGoals, awayGoals: mine.awayGoals, summary: mine.summary ? { ...mine.summary, mySide: mine.home === clubId ? 'home' as const : 'away' as const } : null };
	};
	return {
		career,
		timings: {} as Record<string, number>,
		round: number,
		step: asked,
		replay: true as const,
		match: seen(career.clubId),
		finance: null,
		dismissed: false,
		unemployed: isUnemployed(career),
		...(localGroup(career) ? { coaches: liveCoaches(career).map((c, index) => ({ index, match: seen(c.clubId) })) } : {}),
		results: rows.filter((r) => !r.isUser).map(({ home, away, homeGoals, awayGoals, competition }) => ({ home, away, homeGoals, awayGoals, competition }))
	};
}

/** Jogos do próximo passo do calendário e como cada um é simulado (comum à rodada e ao pré-cálculo). */
export function planRound(career: Career, results: StoredRoundResult[], view = careerView(career, results), divisions?: string[]) {
	const step = view.step!;
	const strengthOf = strengthFor(career);
	const league = view.league;
	const cup = view.cup;
	const fixtures = view.stepMatches;
	if (!fixtures.length) throw new RoundError('O calendário deste passo não pôde ser montado com os resultados salvos.', 409);
	// A seleção por país escala nas divisões sem treinador humano usando o modelo rápido.
	// Partidas humanas sempre passam pelo motor completo em playRound.
	const mine = new Set(divisions ?? [view.division]);
	const full = !career.data.worldSelection && (league.selection || view.world === 'brasfc')
		? () => true
		: (f: Fixture) => step.kind === 'league' && mine.has(f.competition);
	return { step, strengthOf, league, cup, fixtures, full };
}

/**
 * Encerra a temporada: tabela final, acesso/rebaixamento, Copa e início da próxima.
 * 0.13: com vários treinadores, o mundo fecha uma vez e cada treinador fecha a própria temporada
 * (resumo, contratos, diretoria, gabinete); o controle volta ao primeiro treinador.
 */
export async function finishSeason(db: Db, profileId: string, career: Career, version: number, activate: unknown = undefined) {
	if (version !== career.version) throw new RoundError('A carreira mudou em outra janela. Recarregue para continuar.', 409);
	if (career.mode !== 'coach') throw new RoundError('A carreira de jogador foi descontinuada na versão 0.12. O save continua guardado como legado.', 410);
	const group = localGroup(career);
	if (group?.deal?.status === 'aberta') throw new RoundError('Há uma negociação entre treinadores aguardando resposta.', 409);
	if (group && !allReady(group)) throw new RoundError('Ainda há treinadores fechando a temporada.', 409);
	const results = await listResults(db, career.id, career.season);
	const view = careerView(career, results);
	if (!view.seasonOver) throw new RoundError('Ainda há jogos a disputar nesta temporada.', 409);
	const strengthOf = strengthFor(career);
	const leagueResults = results.filter((r) => fixtureStepKey(r.competition, r.round).startsWith('league:'));
	const outcome = closeSeason(view.league, leagueResults, career.seed, strengthOf);
	const next = outcome.next;
	if (next.selection) {
		const active = new Set(activeDivisions(next));
		const required = [...new Set(Object.keys(humanClubs(career))
			.map((id) => divisionOf(next, id))
			.filter((div): div is DivisionId => div !== null && !active.has(div)))].sort();
		if (required.length) {
			if (!Array.isArray(activate) || activate.length !== required.length || !required.every((div) => activate.includes(div))) {
				throw new SeasonSelectionRequired(required);
			}
			next.selection = { ...next.selection, divisions: [...active, ...required].sort() };
		}
	}
	const cupNow = view.cup ? cupView(view.cup, results, career.seed, strengthOf) : null;
	// Copa da próxima temporada (projeção) a partir das novas divisões e dos campeões.
	const nextCup =
		view.world === 'brasil' && (next.selection?.cup ?? true)
			? projectedCup(next, { cChampion: outcome.champions['serie-c'], cRunnerUp: outcome.runnersUp['serie-c'], dChampion: outcome.champions['serie-d'], dRunnerUp: outcome.runnersUp['serie-d'], dRanking: outcome.tables['serie-d']?.map((r) => r.clubId),
				cRanking: outcome.tables['serie-c']?.map((r) => r.clubId), regionalRankings: regionalCupRankings(view.tournaments) })
			: undefined;
	const nextDate = leagueSeasonStart(next);
	// Dev 0.5: universo (projetos, técnicos, recordes) — fecha uma vez para o mundo todo.
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
	const history: Array<[string, string, unknown]> = [];
	for (const [comp, champ] of Object.entries(outcome.champions)) if (champ) history.push(['campeao', comp, { clubId: champ, runnerUp: outcome.runnersUp[comp as keyof typeof outcome.runnersUp] ?? null }]);
	for (const t of view.tournaments) {
		if (t.champion) history.push(['campeao', t.competition.id, { clubId: t.champion, runnerUp: t.runnerUp }]);
	}
	if (cupNow?.champion) history.push(['campeao', CUP_ID, { clubId: cupNow.champion, runnerUp: cupNow.runnerUp }]);
	const coachDivisions = [...new Set(liveCoaches(career).map(({ clubId }) => divisionOf(view.league, clubId) ?? view.division))];
	const goals = await listSeasonGoals(db, career.id, career.season, coachDivisions.filter((div) => outcome.tables[div]?.length));
	const tablesDone = new Set<string>();
	let market = sanitizeMarket(career.data.market);
	const indexes = group ? group.coaches.map((_, i) => i) : [0];
	type Out = { id: string | null; data: Partial<CareerData>; ledger: LedgerLine[]; news: Array<{ subject: string; body: string; important?: boolean; sender?: string }>; unemployed: boolean; summary: SeasonSummary; personal: Array<[string, string, unknown]> };
	const outs: Out[] = [];
	const transfers: TransferRow[] = [];
	for (const i of indexes) {
		const c = projectCoach(career, i);
		const v = c === career ? view : careerView(c, results);
		const table = outcome.tables[v.division] ?? [];
		const row = table.find((r) => r.clubId === c.clubId);
		const move = outcome.moves.find((m) => m.clubId === c.clubId);
		const relegated = move?.reason === 'rebaixamento' || (!!next.selection && move?.to === 'estadual');
		const summary: SeasonSummary = {
			season: c.season,
			division: v.division,
			position: row?.position ?? 0,
			points: row?.points ?? 0,
			played: row?.played ?? 0,
			outcome: outcome.champions[v.division] === c.clubId ? 'campeao' : move?.reason === 'acesso' ? 'acesso' : relegated ? 'rebaixado' : 'permanece',
			champion: outcome.champions[v.division] ?? null
		};
		// Entre temporadas: elenco descansa; o conhecimento tático fica, com leve esquecimento.
		const tactical = structuredClone(v.tactical);
		for (const f of Object.keys(tactical.formations) as Array<keyof typeof tactical.formations>) tactical.formations[f] = Math.round(tactical.formations[f] * 0.95 * 10) / 10;
		for (const s of Object.keys(tactical.styles) as Array<keyof typeof tactical.styles>) tactical.styles[s] = Math.round(tactical.styles[s] * 0.95 * 10) / 10;
		const fitness: Record<string, number> = {};
		for (const p of v.squad) fitness[p.id] = 100;
		const coachKnowledge = v.coach ? coachSeasonDecay(v.coach) : null;
		// Gestão: contratos que terminam, empréstimos, premiações, avaliação da diretoria e nova base.
		const myCup = cupNow ? clubCupRun(cupNow, c.clubId) : null;
		const unemployed = isUnemployed(c);
		const officeBefore = officeOf(c, clubStateOf(c, v.league), v.league);
		// Temporada inteira sem clube: o ex-clube não entra no histórico do treinador.
		const idleSeason = unemployed && !!officeBefore?.unemployedSince && officeBefore.unemployedSince.season < c.season;
		const end = unemployed ? { club: clubStateOf(c, v.league), market, ledger: [], transfers: [], news: [] as Out['news'] } : seasonEndManagement({
			career: c,
			club: clubStateOf(c, v.league),
			market,
			roster: rosterContext(c, v.league),
			league: v.league,
			next,
			position: row?.position ?? 0,
			size: table.length,
			promoted: move?.reason === 'acesso',
			relegated,
			champion: summary.outcome === 'campeao',
			cupPhase: myCup?.lastPhase ?? 0,
			cupChampion: !!myCup?.champion,
			cupRunnerUp: !!cupNow && cupNow.runnerUp === c.clubId,
			strengthOf,
			inCupNext: !!nextCup && Object.values(nextCup.entrants).some((l) => l.includes(c.clubId))
		});
		market = end.market;
		transfers.push(...end.transfers);
		const personal: Array<[string, string, unknown]> = [];
		const suffix = group ? `@${group.coaches[i].id}` : '';
		if (!idleSeason) personal.push(['temporada-usuario', v.division + suffix, { ...summary, clubId: c.clubId, cupPhase: myCup?.lastPhase ?? 0, cupChampion: !!myCup?.champion }]);
		if (table.length && !tablesDone.has(v.division)) {
			tablesDone.add(v.division);
			history.push(['tabela', v.division, { rows: table.slice(0, 40).map((r) => ({ clubId: r.clubId, points: r.points, won: r.won, drawn: r.drawn, lost: r.lost, goalDiff: r.goalDiff })) }]);
			const scorers = topScorers(goals, v.division);
			if (scorers.length) history.push(['artilharia', v.division, { players: scorers }]);
		}
		const monthlyWages = payroll(rosterOf(rosterContext(c, v.league), c.clubId));
		const oe = officeSeasonEnd({ career: c, office: officeOf(c, end.club, v.league), club: end.club, universe, division: v.division, position: row?.position ?? null, outcome: summary.outcome === 'rebaixado' ? 'queda' : summary.outcome === 'permanece' ? 'permanece' : summary.outcome, next, monthlyWages });
		end.news.push(...oe.news);
		outs.push({
			id: group ? group.coaches[i].id : null,
			data: { tactical, fitness, seasons: idleSeason ? v.seasons : [...v.seasons, summary], club: oe.club, ...(coachKnowledge ? { coachKnowledge } : {}), office: { ...oe.office, meeting: null, press: null } },
			ledger: end.ledger,
			news: end.news,
			unemployed,
			summary,
			personal
		});
	}
	const tournaments = career.data.tournaments ? nextBrazilTournaments(outcome.champions['serie-a'], outcome.runnersUp['serie-a'], cupNow?.champion ?? undefined) : undefined;
	const world: Partial<CareerData> = { league: next, ...(nextCup ? { cup: nextCup } : {}), ...(tournaments ? { tournaments } : {}), market, universe };
	if (career.season === 2026 && career.data.worldSelection?.countries.includes('bra') && cupNow?.champion && cupNow.runnerUp && outcome.tables['serie-a']?.length && next.divisions['serie-a']) {
		world.brazilContinentalQualification = qualifyBrazil2027(
			outcome.tables['serie-a'].map((row) => row.clubId),
			next.divisions['serie-a'],
			{ champion: cupNow.champion, runnerUp: cupNow.runnerUp }
		);
	}
	const updated = await db.transaction(async (tx) => {
		const saved = group
			? await replaceCareerData(tx, profileId, career.id, { ...afterRound(career, outs.map((o) => o.data), world), gameDate: nextDate, season: next.season }, career.version)
			: await saveCareerProgress(tx, profileId, career.id, { gameDate: nextDate, season: next.season, data: { ...outs[0].data, ...world } }, career.version);
		for (const o of outs) {
			if (!o.unemployed) await insertLedger(tx, career.id, career.season, addDays(nextDate, -1), o.ledger, `${career.season}:fim`, o.id);
			await insertMessages(tx, career.id, nextDate, o.news, o.id);
			for (const [kind, comp, data] of o.personal) await upsertHistory(tx, career.id, career.season, kind, comp, data);
		}
		await insertTransfers(tx, career.id, career.season, addDays(nextDate, -1), transfers, `${career.season}:fim:t`);
		for (const [kind, comp, data] of history) await upsertHistory(tx, career.id, career.season, kind, comp, data);
		return saved;
	});
	const me = outs[group ? group.active : 0];
	return { career: updated, summary: me.summary, moves: outcome.moves, champions: outcome.champions, cupChampion: cupNow?.champion ?? null, ...(group ? { summaries: outs.map((o) => o.summary) } : {}) };
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


/** 0.13: decisões de uma partida com um ou dois lados humanos (mantém a ordem original). */
export function sanitizeSides(raw: unknown, sides: Side[]): AppliedDecision[] {
	if (raw === undefined || raw === null) return [];
	if (!Array.isArray(raw) || raw.length > MAX_DECISIONS * 2) throw new RoundError('Lista de decisões inválida.', 400);
	const out: AppliedDecision[] = [];
	for (const item of raw) {
		const side = (item as { side?: unknown } | null)?.side;
		if (side !== 'home' && side !== 'away') throw new RoundError('Decisão inválida.', 400);
		if (!sides.includes(side)) continue;
		out.push(...sanitizeDecisions([item], side));
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
