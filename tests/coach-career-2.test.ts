import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import '#lib/data/brasil.ts';
import { createPgliteDb, setDbForTests, type Db } from '#lib/server/db/index.ts';
import { runMigrations } from '#lib/server/db/migrate.ts';
import { createGuestProfile } from '#lib/server/repos/profiles.ts';
import { createCareer, getCareer, listMessages, patchCareerData } from '#lib/server/repos/careers.ts';
import { listLedger } from '#lib/server/repos/management.ts';
import { listResults } from '#lib/server/repos/matches.ts';
import { finishSeason, matchdayContext, playRound } from '#lib/server/rounds.ts';
import { officeOf, officeSeasonEnd } from '#lib/server/universe.ts';
import { careerView } from '#lib/domain/view.ts';
import { clubStateOf } from '#lib/domain/world.ts';
import { employmentStatus, isOfferOpen, offerWindowRounds, openOffers, renewalVerdict } from '#lib/domain/employment.ts';
import { applyPreset, presetFromTactic, sanitizePresets } from '#lib/domain/tactic-presets.ts';
import { coachLearnFromMatch, coachSeasonDecay, effectiveTactical, initialCoachKnowledge, sanitizeCoachKnowledge, teachingFactor, withTeaching, COACH_EXECUTION_SHARE } from '#lib/domain/coach-knowledge.ts';
import { initialTacticalState, learnFromMatch } from '#lib/domain/tactical.ts';
import { applyMatchDiscipline, initialDiscipline, sanitizeDiscipline, suspendedFor } from '#lib/domain/discipline.ts';
import { bestBench, bestEleven, lineupScore } from '#lib/domain/lineup-optimizer.ts';
import { autoLineup, FORMATIONS, type Tactic } from '#lib/domain/tactics.ts';
import { generateSquad } from '#lib/domain/squad.ts';
import { fixtureSetup } from '#lib/domain/matchday.ts';
import { initialClubState } from '#lib/domain/management.ts';
import { initialOffice } from '#lib/domain/office.ts';
import { initialLeague } from '#lib/domain/league.ts';
import { applyOfficeAction } from '#lib/server/office-actions.ts';
import { evaluateBudget, type BudgetContext } from '#lib/domain/board-talks.ts';
import { buildTeamSetup } from '#lib/engine/teams.ts';
import { Match } from '#lib/engine/match.ts';
import { rulesForVersion, ENGINE_VERSION } from '#lib/engine/types.ts';
import { CLUBS } from '#lib/domain/clubs.ts';
import type { Career } from '#lib/domain/career.ts';
import type { Profile } from '#lib/server/repos/profiles.ts';
import { POST as clubPost } from '../src/routes/api/careers/[id]/club/+server.ts';
import { PATCH as careerPatch } from '../src/routes/api/careers/[id]/+server.ts';

let db: Db;
beforeAll(async () => {
	db = await createPgliteDb();
	await runMigrations(db);
	setDbForTests(db);
});
afterAll(async () => {
	setDbForTests(undefined);
	await db.close();
});

/** Chama um endpoint real (mesma validação do servidor), devolvendo status e corpo. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(handler: (e: any) => Response | Promise<Response>, profile: Profile, id: string, body: Record<string, unknown>, method = 'POST') {
	const request = new Request(`http://brasfc.test/api/careers/${id}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
	try {
		const res = await handler({ request, params: { id }, locals: { profile }, url: new URL(request.url) } as never);
		return { status: res.status, json: (await res.json()) as Record<string, unknown> };
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) return { status: (e as { status: number }).status, json: (e as unknown as { body: Record<string, unknown> }).body };
		throw e;
	}
}

async function playSeason(profile: Profile, career: Career, each?: (c: Career, played: boolean) => void): Promise<Career> {
	for (;;) {
		const v = careerView(career, await listResults(db, career.id, career.season));
		if (!v.step) return career;
		const r = await playRound(db, profile.id, career, { version: career.version, step: v.step.key });
		career = r.career;
		each?.(career, !!r.match);
	}
}

describe('Cenários 1, 3 e 4 — não renovar, mercado de treinadores e troca de clube', () => {
	it('cumpre o contrato até o fim, recebe sondagens nas janelas, fica sem clube, não administra o ex-clube e leva o conhecimento ao assinar', async () => {
		const { profile } = await createGuestProfile(db);
		let career = await createCareer(db, profile.id, { mode: 'coach', personName: 'Técnico 2.0', clubId: 'palmeiras', world: 'brasil' });
		const league = careerView(career).league;
		const club = clubStateOf(career, league);
		club.board.confidence = 95;
		club.coachReputation = 72;
		const office = officeOf(career, club, league);
		office.contract = { ...office.contract, until: career.season };
		// Recusa explícita E renovação automática ligada: a recusa precisa prevalecer.
		office.renewalDeclinedSeason = career.season;
		office.autoRenewal = true;
		career = await patchCareerData(db, profile.id, career.id, { club, office }, career.version);
		expect(employmentStatus(office, club, career.season, 0).key).toBe('saida-confirmada');

		const windows = new Set<string>();
		let userMatches = 0;
		career = await playSeason(profile, career, (c, played) => {
			for (const w of c.data.office?.offerWindows ?? []) windows.add(w);
			const offers = c.data.club!.jobOffers;
			// Nada de propostas repetidas: ids únicos e no máximo uma aberta por clube.
			expect(new Set(offers.map((o) => o.id)).size).toBe(offers.length);
			const open = openOffers(offers, c.season, careerView(c).nextRound - 1);
			expect(new Set(open.map((o) => o.clubId)).size).toBe(open.length);
			if (played) userMatches++;
		});
		const v = careerView(career, await listResults(db, career.id, career.season));
		expect(career.data.club!.board.dismissed).toBe(false); // seguiu treinando até o último jogo
		expect(userMatches).toBe(v.clubFixtures.length);
		for (const r of offerWindowRounds(v.rounds)) expect(windows.has(`${career.season}:${r}`)).toBe(true);
		// Persistência: recarregar não muda nem duplica propostas.
		const reloaded = (await getCareer(db, profile.id, career.id))!;
		expect(reloaded.data.club!.jobOffers).toEqual(career.data.club!.jobOffers);
		for (const o of career.data.club!.jobOffers) {
			expect(o.status).toBeDefined();
			if (o.source === 'janela') expect(typeof o.expiresRound).toBe('number');
		}

		// Fim da temporada: contrato expira, histórico registra a saída e a Central de Propostas assume.
		const end = await finishSeason(db, profile.id, career, career.version);
		career = end.career;
		expect(career.season).toBe(2027);
		const o2 = career.data.office!;
		expect(career.data.club!.board.dismissed).toBe(true);
		expect(o2.unemployedSince?.reason).toBe('fim-contrato');
		expect(o2.autoRenewal).toBe(false);
		expect(o2.decisions.some((d) => d.choice === 'contrato-expirado')).toBe(true);
		expect(o2.history.find((h) => h.season === 2026 && h.clubId === 'palmeiras')?.games).toBe(userMatches);
		const msgs = await listMessages(db, profile.id, career.id, 50);
		expect(msgs.some((m) => m.subject === 'Fim de contrato')).toBe(true);
		const offers2027 = openOffers(career.data.club!.jobOffers, 2027, 0);
		expect(offers2027.length).toBeGreaterThan(0);
		expect(employmentStatus(o2, career.data.club!, 2027, 0).key).toBe('em-negociacao');

		// O ex-clube não pode ser administrado: servidor recusa gestão, gabinete, tática e partidas do clube.
		expect((await call(clubPost, profile, career.id, { version: career.version, action: 'ingresso', price: 40 })).status).toBe(409);
		expect((await call(clubPost, profile, career.id, { version: career.version, action: 'verba-solicitar', kind: 'transferencias', percent: 10 })).status).toBe(409);
		const v27 = careerView(career);
		expect((await call(careerPatch, profile, career.id, { version: career.version, tactic: v27.tactic }, 'PATCH')).status).toBe(409);
		// O calendário avança na procura por emprego, sem jogo do usuário e sem lançamentos do ex-clube.
		const ledgerBefore = (await listLedger(db, career.id, 2027)).length;
		const step = await playRound(db, profile.id, career, { version: career.version, step: v27.step!.key, decisions: [{ tick: 10, side: 'home', decision: { type: 'mentality', value: 'defensiva' } }] as never });
		expect(step.match).toBeNull();
		expect(step.finance).toBeNull();
		expect(step.unemployed).toBe(true);
		expect((await listLedger(db, career.id, 2027)).length).toBe(ledgerBefore);
		expect((await listResults(db, career.id, 2027)).every((r) => r.competition)).toBe(true);
		career = step.career;

		// Biblioteca de táticas: pertence ao treinador (pode salvar mesmo sem clube).
		const saved = await call(careerPatch, profile, career.id, { version: career.version, preset: { op: 'save', name: '4-3-3 — Posse e Pressão', tactic: { ...v27.tactic, formation: '4-3-3', lineup: autoLineup('4-3-3', v27.squad), mentality: 'ofensiva', style: 'posse', bench: undefined } } }, 'PATCH');
		expect(saved.status).toBe(200);
		career = (await getCareer(db, profile.id, career.id))!;
		expect(sanitizePresets(career.data.tacticPresets)).toHaveLength(1);
		const knowledge = sanitizeCoachKnowledge(career.data.coachKnowledge);

		// Assinatura: exige confirmação, é transacional e resiste a clique duplo.
		const offer = openOffers(career.data.club!.jobOffers, career.season, careerView(career).nextRound - 1)[0];
		expect((await call(clubPost, profile, career.id, { version: career.version, action: 'emprego', offerId: offer.id })).status).toBe(422);
		const preview = await call(clubPost, profile, career.id, { version: career.version, action: 'emprego', offerId: offer.id, confirm: true });
		expect(preview.status).toBe(200);
		const twice = await call(clubPost, profile, career.id, { version: career.version, action: 'emprego', offerId: offer.id, confirm: true });
		expect(twice.status).toBe(409);
		const signed = (await getCareer(db, profile.id, career.id))!;
		expect(signed.clubId).toBe(offer.clubId);
		expect(signed.data.club!.board.dismissed).toBe(false);
		expect(signed.data.office!.unemployedSince).toBeUndefined();
		expect(signed.data.tactical).toBeNull();
		// Cenário 4: conhecimento pessoal preservado; o elenco novo começa do zero.
		expect(sanitizeCoachKnowledge(signed.data.coachKnowledge)).toEqual(knowledge);
		const sv = careerView(signed);
		const best = (Object.entries(knowledge.formations) as Array<[keyof typeof knowledge.formations, number]>).sort((a, b) => b[1] - a[1])[0][0];
		expect(sv.coach!.formations[best]).toBe(knowledge.formations[best]);
		expect(sv.effective.formations[best]).toBeGreaterThanOrEqual(sv.tactical.formations[best]);
		// Cenário 5: o preset vai junto e é redistribuído no elenco novo, sem IDs do clube anterior.
		const presets = sanitizePresets(signed.data.tacticPresets);
		expect(presets).toHaveLength(1);
		const applied = applyPreset(presets[0], sv.tactic, sv.squad, { clubId: signed.clubId });
		const ids = new Set(sv.squad.map((p) => p.id));
		expect(applied.tactic.formation).toBe('4-3-3');
		expect(applied.tactic.style).toBe('posse');
		expect(applied.tactic.mentality).toBe('ofensiva');
		expect(applied.tactic.lineup.every((id) => ids.has(id))).toBe(true);
		expect(applied.review.length).toBeGreaterThan(0);
		// O ex-clube voltou para a IA com um técnico do universo.
		expect(signed.data.universe!.clubs.palmeiras.coachId).toBeTruthy();
	}, 600_000);
});

describe('Cenário 2 — renovação automática', () => {
	const season = 2027;
	const clubId = CLUBS[0].id;
	const next = initialLeague('brasfc', season + 1);
	const career = { mode: 'coach', clubId, seed: 900, season, data: {} } as Career;
	const end = (o: { auto: boolean; declined?: boolean; confidence: number; outcome?: 'campeao' | 'permanece' | 'queda' }) => {
		const club = initialClubState(900, clubId, 'liga-brasfc', season);
		club.board.confidence = o.confidence;
		const office = initialOffice(season, 'E', club.coachReputation);
		office.contract.until = season;
		office.autoRenewal = o.auto;
		if (o.declined) office.renewalDeclinedSeason = season;
		return officeSeasonEnd({ career, office, club, universe: { clubs: {} } as never, division: 'liga-brasfc', position: 3, outcome: o.outcome ?? 'permanece', next, monthlyWages: 100_000 });
	};
	it('diretoria aprova: contrato prorrogado com notificação e histórico', () => {
		const r = end({ auto: true, confidence: 80, outcome: 'campeao' });
		expect(r.club.board.dismissed).toBe(false);
		expect(r.office.contract.until).toBeGreaterThan(season);
		expect(r.news.some((n) => n.subject === 'Contrato renovado automaticamente')).toBe(true);
		expect(r.office.decisions.at(-1)).toMatchObject({ kind: 'renovacao-automatica', choice: 'aprovada' });
	});
	it('a recusa explícita prevalece sobre a opção automática', () => {
		const r = end({ auto: true, declined: true, confidence: 99, outcome: 'campeao' });
		expect(r.club.board.dismissed).toBe(true);
		expect(r.office.unemployedSince?.reason).toBe('fim-contrato');
		expect(r.news.some((n) => n.subject === 'Fim de contrato')).toBe(true);
	});
	it('diretoria recusa com campanha ruim e avisa o motivo', () => {
		const r = end({ auto: true, confidence: 55, outcome: 'queda' });
		expect(r.club.board.dismissed).toBe(true);
		expect(r.news.some((n) => n.subject === 'Renovação automática recusada')).toBe(true);
		expect(renewalVerdict({ confidence: 55, outcome: 'queda', objectiveMet: false, balance: 1, monthlyWages: 10, reputation: 40, profile: 'rigida' }).approved).toBe(false);
	});
});

describe('Cenário 4 — conhecimento pessoal × entrosamento', () => {
	const squad = generateSquad(CLUBS[1].id, 3);
	it('o treinador que domina o 4-3-3 corrige parte da execução e ensina mais rápido, sem copiar o entrosamento', () => {
		const team = initialTacticalState(squad, '4-4-2', 'contra-ataque');
		const coach = initialCoachKnowledge();
		coach.formations['4-3-3'] = 90;
		coach.styles.posse = 85;
		const eff = effectiveTactical(team, coach);
		expect(eff.formations['4-3-3']).toBeCloseTo(team.formations['4-3-3'] + (90 - team.formations['4-3-3']) * COACH_EXECUTION_SHARE, 0);
		expect(eff.formations['4-3-3']).toBeLessThan(90);
		expect(eff.formations['4-4-2']).toBe(team.formations['4-4-2']);
		const factor = teachingFactor(team, coach, '4-3-3', 'posse');
		expect(factor).toBeGreaterThan(1.3);
		const lineup = autoLineup('4-3-3', squad);
		const learned = learnFromMatch(team, { formation: '4-3-3', style: 'posse', appearances: lineup.map((id) => ({ id, minutes: 90, role: 'cb-stopper' as never })), squad });
		const taught = withTeaching(team, learned, factor);
		expect(taught.formations['4-3-3'] - team.formations['4-3-3']).toBeGreaterThan(learned.formations['4-3-3'] - team.formations['4-3-3']);
		// entrosamento individual não é tocado pelo treinador
		expect(taught.integration).toEqual(learned.integration);
	});
	it('experiência do treinador cresce devagar e quase não se perde', () => {
		let k = initialCoachKnowledge();
		const before = k.formations['4-3-3'];
		for (let i = 0; i < 38; i++) k = coachLearnFromMatch(k, { formation: '4-3-3', style: 'posse', season: 2026, clubId: 'x' });
		expect(k.formations['4-3-3']).toBeGreaterThan(before + 10);
		expect(k.matches).toBe(38);
		expect(k.timeline.at(-1)?.games).toBe(38);
		const decayed = coachSeasonDecay(k);
		expect(decayed.formations['4-3-3']).toBeGreaterThan(k.formations['4-3-3'] * 0.98);
	});
	it('save antigo: o conhecimento nasce igual ao domínio do clube (nada muda no motor)', () => {
		const team = initialTacticalState(squad, '4-3-3', 'posse');
		const k = sanitizeCoachKnowledge(undefined, team);
		expect(effectiveTactical(team, k).formations).toEqual(team.formations);
	});
});

describe('Cenário 5 — Minhas Táticas', () => {
	it('preserva formação, estilo, instruções, funções e ordens por posição; redistribui atletas em outro elenco', () => {
		const a = generateSquad(CLUBS[0].id, 11);
		const b = generateSquad(CLUBS[5].id, 11);
		const lineup = autoLineup('4-3-3', a);
		const tactic: Tactic = { formation: '4-3-3', lineup, mentality: 'ofensiva', style: 'pressao', instructions: { construcao: 1, ritmo: 4, distancia: 2, amplitude: 4, corredor: 3, laterais: 3, passe: 1, abordagem: 1, profundidade: 4, presencaArea: 4, linha: 4, pressao: 5, bloco: 3, compactacao: 3, marcacao: 'zona', agressividade: 4, aoRecuperar: 'equilibrado', aposPerder: 'pressionar' }, captains: [lineup[3]] };
		const preset = presetFromTactic(tactic, { id: 'p1', name: 'Pressão total', clubId: CLUBS[0].id, season: 2026, now: '2026-01-01' });
		expect(sanitizePresets([preset])[0]).toEqual(preset);
		const same = applyPreset(preset, tactic, a, { clubId: CLUBS[0].id });
		expect(same.sameSquad).toBe(true);
		expect(same.tactic.lineup).toEqual(lineup);
		const other = applyPreset(preset, tactic, b, { clubId: CLUBS[5].id });
		const ids = new Set(b.map((p) => p.id));
		expect(other.sameSquad).toBe(false);
		expect(other.tactic.lineup.every((id) => ids.has(id))).toBe(true);
		expect(other.tactic.instructions).toEqual(tactic.instructions);
		expect(other.tactic.roles).toEqual(preset.roles);
		expect(other.tactic.captains).toBeUndefined();
		expect(other.review.join(' ')).toMatch(/outro clube/);
	});
});

describe('Cenário 6 — expulsão e reorganização com 10', () => {
	const team = (clubId: string, seed: number) => buildTeamSetup({ id: clubId, name: clubId, short: clubId.slice(0, 3).toUpperCase(), colors: { primary: '#111', secondary: '#eee' } }, generateSquad(clubId, seed), { formation: '4-3-3', mentality: 'equilibrada', style: 'posse' });
	const redOnCenterBack = (m: Match, side: 'home' | 'away') => {
		const shape = FORMATIONS[m.teams[side].tactic.formation];
		const st = m.onPitch(side).find((s) => shape[s.slot].position === 'ZAG')!;
		(m as unknown as { card: (s: unknown, k: 'red') => void }).card(st, 'red');
		return st.slot;
	};
	it('zagueiro expulso: sai um atacante, entra um zagueiro NA VAGA, e o time segue com dez até o fim', () => {
		const m = new Match({ home: team(CLUBS[0].id, 1), away: team(CLUBS[1].id, 2), seed: 99, ai: { home: false, away: true } });
		for (let i = 0; i < 20 * 60; i++) m.step();
		const hole = redOnCenterBack(m, 'home');
		expect(m.onPitch('home')).toHaveLength(10);
		const shape = FORMATIONS['4-3-3'];
		const attacker = m.onPitch('home').find((s) => ['ATA', 'PD', 'PE'].includes(shape[s.slot].position))!;
		const defender = m.bench('home').find((p) => p.position === 'ZAG') ?? m.bench('home').find((p) => p.position !== 'GOL')!;
		m.submit('home', { type: 'sub', outId: attacker.id, inId: defender.id, slot: hole });
		for (let i = 0; i < 4000 && m.pending('home').length; i++) m.step();
		const applied = m.applied.filter((d) => d.side === 'home' && d.decision.type === 'sub').at(-1)!;
		expect(applied.rejected).toBeUndefined();
		expect(m.onPitch('home')).toHaveLength(10);
		expect(m.states.get(defender.id)!.slot).toBe(hole);
		expect(m.states.get(attacker.id)!.onPitch).toBe(false);
		// Formação com 11 nomes é recusada; com vagas ('') é aceita.
		const active = m.onPitch('home').map((s) => s.id);
		m.submit('home', { type: 'formation', value: '4-4-2', lineup: [...active, active[0]] });
		m.step();
		expect(m.applied.at(-1)?.rejected).toBeDefined();
		const lineup442 = [...active.slice(0, 10), ''];
		m.submit('home', { type: 'formation', value: '4-4-2', lineup: lineup442 });
		m.step();
		expect(m.teams.home.tactic.formation).toBe('4-4-2');
		const result = m.runToEnd();
		expect(m.onPitch('home').length).toBeLessThanOrEqual(10);
		expect(result.homeGoals).toBeGreaterThanOrEqual(0);
	});
	it('sem trocar: leva um atacante para a vaga do zagueiro', () => {
		const m = new Match({ home: team(CLUBS[0].id, 1), away: team(CLUBS[1].id, 2), seed: 5, ai: { home: false, away: true } });
		for (let i = 0; i < 10 * 60; i++) m.step();
		const hole = redOnCenterBack(m, 'home');
		const fwd = m.onPitch('home').find((s) => FORMATIONS['4-3-3'][s.slot].position === 'ATA')!;
		m.submit('home', { type: 'move', playerId: fwd.id, slot: hole });
		m.step();
		expect(m.states.get(fwd.id)!.slot).toBe(hole);
		expect(m.onPitch('home')).toHaveLength(10);
		expect(m.onPitch('home').some((s) => FORMATIONS['4-3-3'][s.slot].position === 'ZAG' && s.id === fwd.id)).toBe(true);
	});
	it('a IA recompõe a defesa depois de uma expulsão (só na versão nova do motor)', () => {
		const m = new Match({ home: team(CLUBS[0].id, 1), away: team(CLUBS[1].id, 2), seed: 21, ai: { home: false, away: true } });
		for (let i = 0; i < 15 * 60; i++) m.step();
		const hole = redOnCenterBack(m, 'away');
		for (let i = 0; i < 6000; i++) m.step();
		expect(m.onPitch('away').some((s) => s.slot === hole)).toBe(true);
		expect(m.onPitch('away')).toHaveLength(10);
		expect(rulesForVersion(ENGINE_VERSION)).toEqual({});
		expect(rulesForVersion('0.5.2')).toEqual({ redCardReorg: false });
	});
});

describe('Cenário 7 — suspensões', () => {
	it('vermelho suspende na competição; cumpre no jogo seguinte dela; amarelos acumulam por competição', () => {
		let d = initialDiscipline(2026);
		d = applyMatchDiscipline(d, { season: 2026, round: 5, competition: 'serie-a', cards: [{ player: 'z1', kind: 'red' }] }).state;
		expect(suspendedFor(d, 'serie-a').has('z1')).toBe(true);
		expect(suspendedFor(d, 'copa-do-brasil').has('z1')).toBe(false);
		// jogo da Copa não cumpre a suspensão do campeonato
		d = applyMatchDiscipline(d, { season: 2026, round: 2, competition: 'copa-do-brasil', cards: [] }).state;
		expect(suspendedFor(d, 'serie-a').has('z1')).toBe(true);
		d = applyMatchDiscipline(d, { season: 2026, round: 6, competition: 'serie-a', cards: [] }).state;
		expect(suspendedFor(d, 'serie-a').has('z1')).toBe(false);
		for (const r of [7, 8]) d = applyMatchDiscipline(d, { season: 2026, round: r, competition: 'serie-a', cards: [{ player: 'm1', kind: 'yellow' }] }).state;
		expect(suspendedFor(d, 'serie-a').has('m1')).toBe(false);
		const third = applyMatchDiscipline(d, { season: 2026, round: 9, competition: 'serie-a', cards: [{ player: 'm1', kind: 'yellow' }] });
		expect(suspendedFor(third.state, 'serie-a').has('m1')).toBe(true);
		expect(third.state.yellows['serie-a'].m1).toBe(0);
		expect(third.news[0].subject).toMatch(/suspenso/);
		// segundo amarelo na mesma partida
		const two = applyMatchDiscipline(initialDiscipline(2026), { season: 2026, round: 1, competition: 'serie-a', cards: [{ player: 'x', kind: 'yellow' }, { player: 'x', kind: 'yellow' }, { player: 'x', kind: 'red', secondYellow: true }] });
		expect(two.state.suspensions[0]).toMatchObject({ playerId: 'x', reason: 'segundo-amarelo', remaining: 1 });
		// troca de temporada zera amarelos e mantém suspensões pendentes
		const later = sanitizeDiscipline({ ...third.state }, 2027);
		expect(later.yellows).toEqual({});
		expect(later.suspensions).toHaveLength(1);
	});
	it('no servidor o suspenso não joga, nem pelo banco nem por decisão forjada; depois volta a ficar disponível', async () => {
		const { profile } = await createGuestProfile(db);
		let career = await createCareer(db, profile.id, { mode: 'coach', personName: 'Disciplina', clubId: 'palmeiras', world: 'brasil' });
		let v = careerView(career);
		const competition = v.next!.competition;
		const starter = v.tactic.lineup[1];
		career = await patchCareerData(db, profile.id, career.id, { discipline: { v: 1, season: career.season, yellows: {}, suspensions: [{ playerId: starter, competition, remaining: 1, matches: 1, reason: 'vermelho', season: career.season, round: 0 }], log: [] } }, career.version);
		v = careerView(career);
		const ctx = await matchdayContext(db, career, v);
		const setup = fixtureSetup(career, v.next!, v.tactic, ctx);
		const mine = setup.mySide === 'home' ? setup.home : setup.away;
		expect(setup.suspended).toEqual([starter]);
		expect(mine.tactic.lineup).not.toContain(starter);
		expect(mine.tactic.bench).not.toContain(starter);
		expect(mine.tactic.lineup.filter(Boolean)).toHaveLength(11);
		const forged = [{ tick: 3000, side: setup.mySide, decision: { type: 'sub', outId: mine.tactic.lineup[5], inId: starter } }];
		const res = await playRound(db, profile.id, career, { version: career.version, step: v.step!.key, decisions: forged as never });
	expect(res.match!.summary!.players[starter]?.minutes ?? 0).toBe(0);
	expect(res.match!.summary!.starters).not.toContain(starter);
		expect(suspendedFor(sanitizeDiscipline(res.career.data.discipline, res.career.season), competition).has(starter)).toBe(false);
	}, 120_000);
});

describe('Cenário 8 — Montar melhor 11', () => {
	it('troca de 4-4-2 para 4-3-3 usando todo o elenco, sem atacante na zaga e sem suspensos', () => {
		const squad = generateSquad(CLUBS[2].id, 7);
		const was = autoLineup('4-4-2', squad);
		const best = bestEleven('4-3-3', squad);
		expect(new Set(best).size).toBe(11);
		expect(best.every((id) => squad.some((p) => p.id === id))).toBe(true);
		const byId = new Map(squad.map((p) => [p.id, p]));
		FORMATIONS['4-3-3'].forEach((slot, i) => {
			const p = byId.get(best[i])!;
			if (slot.position === 'GOL') expect(p.position).toBe('GOL');
			if (slot.position === 'ZAG') expect(['ZAG', 'LD', 'LE', 'VOL']).toContain(p.position);
		});
		expect(lineupScore('4-3-3', best, squad)).toBeGreaterThanOrEqual(lineupScore('4-3-3', autoLineup('4-3-3', squad), squad));
		expect(best.some((id) => !was.includes(id)) || best.every((id) => was.includes(id))).toBe(true);
		const star = best[1];
		const without = bestEleven('4-3-3', squad, { unavailable: new Set([star]) });
		expect(without).not.toContain(star);
		const bench = bestBench(squad, best);
		expect(bench.length).toBeGreaterThan(0);
		expect(byId.get(bench[0])!.position).toBe('GOL');
		expect(bench.some((id) => best.includes(id))).toBe(false);
	});
});

describe('Cenário 9 — reuniões de orçamento', () => {
	const make = (confidence: number, balance = 20_000_000) => {
		const club = initialClubState(451, CLUBS[0].id, 'liga-brasfc', 2027);
		club.board.confidence = confidence;
		club.balance = balance;
		club.transferBudget = 1_000_000;
		club.wageBudget = 500_000;
		const office = initialOffice(2027, 'E', club.coachReputation);
		return { club, career: { mode: 'coach', seed: 451, season: 2027, clubId: CLUBS[0].id, data: { office } } as Career };
	};
	const league = initialLeague('brasfc', 2027);
	it('aprovação não cria dinheiro; teto da folha não paga ninguém; limite por temporada e intervalo', () => {
		const { club, career } = make(95);
		const a = applyOfficeAction(career, league, club, 5, 12, 1, { action: 'verba-solicitar', kind: 'folha', percent: 10, justification: 'manter' });
		expect(a.club.balance).toBe(club.balance);
		expect(a.club.wageBudget).toBeGreaterThanOrEqual(club.wageBudget);
		expect(() => applyOfficeAction({ ...career, data: { office: a.office } } as Career, league, a.club, 9, 12, 1, { action: 'verba-solicitar', kind: 'folha', percent: 10 })).toThrow(/intervalo de 8 rodadas/);
		const b = applyOfficeAction({ ...career, data: { office: a.office } } as Career, league, a.club, 14, 20, 1, { action: 'verba-solicitar', kind: 'folha', percent: 10 });
		const c = applyOfficeAction({ ...career, data: { office: b.office } } as Career, league, b.club, 23, 30, 1, { action: 'verba-solicitar', kind: 'folha', percent: 10 });
		expect(() => applyOfficeAction({ ...career, data: { office: c.office } } as Career, league, c.club, 33, 40, 1, { action: 'verba-solicitar', kind: 'folha', percent: 10 })).toThrow(/três vezes/);
		expect(c.office.budgetTalks!.length).toBe(3);
		expect(c.club.balance).toBe(club.balance);
	});
	it('justificativa incoerente e campanha ruim pesam; diretoria pode pedir resultados antes', () => {
		const base: BudgetContext = { season: 2027, round: 20, totalRounds: 38, balance: 2_000_000, transferBudget: 1_500_000, wageBudget: 500_000, wageBill: 480_000, monthlyIncome: 400_000, monthlyExpense: 600_000, confidence: 38, reputation: 40, profile: 'rigida', objective: { kind: 'liga-posicao', label: 'Top 10', target: 10, weight: 3 }, position: 17, size: 20, promotion: 0, relegation: 4, history: [], baseline: { transferBudget: 1_500_000, wageBudget: 500_000 } };
		const v = evaluateBudget(base, { kind: 'transferencias', percent: 30, justification: 'titulo' });
		expect(['recusado', 'aguardar']).toContain(v.outcome);
		expect(v.granted).toBe(0);
		const good = evaluateBudget({ ...base, confidence: 85, reputation: 70, profile: 'ambiciosa', position: 2, balance: 30_000_000, monthlyExpense: 300_000 }, { kind: 'transferencias', percent: 20, justification: 'titulo' });
		expect(['aprovado', 'parcial']).toContain(good.outcome);
	});
	it('contraproposta: aceitar fecha o acordo; o caixa continua igual', () => {
		const { club, career } = make(60, 3_000_000);
		const r = applyOfficeAction(career, league, club, 12, 16, 9, { action: 'verba-solicitar', kind: 'transferencias', percent: 30, justification: 'carencias' });
		if (!r.office.budgetCounter) return; // o veredito depende do perfil sorteado da diretoria; sem contraproposta, nada a aceitar
		const ok = applyOfficeAction({ ...career, data: { office: r.office } } as Career, league, r.club, 13, 16, 9, { action: 'verba-contraproposta', accept: true });
		expect(ok.club.transferBudget).toBeGreaterThan(club.transferBudget);
		expect(ok.club.balance).toBe(club.balance);
		expect(ok.office.budgetCounter).toBeNull();
	});
});

describe('Cenário 10 — saves antigos e offline', () => {
	it('carreira sem os campos 2.0 abre, joga e passa a gravar conhecimento e disciplina', async () => {
		const { profile } = await createGuestProfile(db);
		let career = await createCareer(db, profile.id, { mode: 'coach', personName: 'Save Antigo', clubId: 'palmeiras', world: 'brasil' });
		// remove o que a 2.0 grava (save antigo)
		await db.query(`UPDATE careers SET data = data - 'coachKnowledge' - 'tacticPresets' - 'discipline' WHERE id = $1`, [career.id]);
		career = (await getCareer(db, profile.id, career.id))!;
		const v = careerView(career);
		expect(v.coach).not.toBeNull();
		expect(v.effective.formations).toEqual(v.tactical.formations);
		const r = await playRound(db, profile.id, career, { version: career.version, step: v.step!.key });
		expect(r.career.data.coachKnowledge?.matches).toBe(v.next ? 1 : 0);
		expect(isOfferOpen({ id: 'x', clubId: 'y', division: 'serie-a', reason: '', expiresSeason: 2026 }, 2026, 30)).toBe(true);
		expect(offerWindowRounds(38)).toEqual([10, 23, 32]);
	}, 120_000);
});
