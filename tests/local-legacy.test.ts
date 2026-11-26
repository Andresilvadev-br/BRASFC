import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgliteDb, type Db } from '#lib/server/db/index.ts';
import { runMigrations } from '#lib/server/db/migrate.ts';
import { createGuestProfile } from '#lib/server/repos/profiles.ts';
import { CareerLimitError, createCareer, getCareer, listMessages } from '#lib/server/repos/careers.ts';
import { listLedger } from '#lib/server/repos/management.ts';
import { listResults, listUserMatches } from '#lib/server/repos/matches.ts';
import { fixtureKey, playRound, RoundError } from '#lib/server/rounds.ts';
import { answerDeal, passTurn, openDeal, TurnError } from '#lib/server/local-turns.ts';
import { activeCoachIndex, humanClubs, localGroup, projectCoach } from '#lib/domain/turns.ts';
import { careerView } from '#lib/domain/view.ts';
import { clubStateOf, rosterContext } from '#lib/domain/world.ts';
import { fixtureSetup, matchFromShared, sharedSetup } from '#lib/domain/matchday.ts';
import { matchdayContext } from '#lib/server/rounds.ts';
import { rosterOf, currentClubOf } from '#lib/domain/market.ts';
import type { Career } from '#lib/domain/career.ts';

/**
 * 0.13 LOCAL LEGACY — carreira local com vários treinadores (turnos, confronto direto e negociação
 * entre humanos). Tudo roda no save local (PGlite), sem rede.
 */
let db: Db;
beforeAll(async () => {
	db = await createPgliteDb();
	await runMigrations(db);
});
afterAll(() => db.close());

/** Adversário do Flamengo na 1ª rodada: os dois treinadores se enfrentam logo no primeiro passo de liga. */
async function rivals() {
	const { profile } = await createGuestProfile(db);
	const probe = await createCareer(db, profile.id, { mode: 'coach', personName: 'Sonda', clubId: 'flamengo', world: 'brasil' }, 777);
	const v = careerView(probe, []);
	const first = v.clubFixtures.find((f) => f.competition === 'serie-a')!;
	return { profile, rival: first.home === 'flamengo' ? first.away : first.home, round: first.round };
}

async function readyAll(profileId: string, career: Career): Promise<Career> {
	for (;;) {
		const out = await passTurn(db, profileId, career, career.version);
		career = out.career;
		if (out.play) return career;
	}
}

describe('carreira local com vários treinadores', () => {
	it('cria os treinadores na ordem, recusa clube repetido e separa mensagens por treinador', async () => {
		const { profile } = await createGuestProfile(db);
		await expect(createCareer(db, profile.id, { mode: 'coach', personName: 'Ana', clubId: 'flamengo', world: 'brasil' }, 11, [{ personName: 'Bia', clubId: 'flamengo' }])).rejects.toBeInstanceOf(CareerLimitError);
		const c = await createCareer(db, profile.id, { mode: 'coach', personName: 'Ana', clubId: 'flamengo', world: 'brasil' }, 11, [{ personName: 'Bia', clubId: 'sport' }, { personName: 'Caio', clubId: 'palmeiras' }]);
		const g = localGroup(c)!;
		expect(g.coaches.map((x) => x.personName)).toEqual(['Ana', 'Bia', 'Caio']);
		expect(activeCoachIndex(c)).toBe(0);
		expect(Object.keys(humanClubs(c)).sort()).toEqual(['flamengo', 'palmeiras', 'sport']);
		const ana = await listMessages(db, profile.id, c.id);
		expect(ana.some((m) => m.subject.includes('Flamengo'))).toBe(true);
		expect(ana.some((m) => m.subject.includes('Sport'))).toBe(false);
		// Passa a vez: Bia assume, com as mensagens dela.
		const t = await passTurn(db, profile.id, c, c.version);
		expect(t.play).toBe(false);
		expect(t.career.personName).toBe('Bia');
		expect(t.career.clubId).toBe('sport');
		const bia = await listMessages(db, profile.id, c.id);
		expect(bia.some((m) => m.subject.includes('Sport'))).toBe(true);
		expect(bia.some((m) => m.subject.includes('Flamengo'))).toBe(false);
		// Elenco de um clube humano é o mesmo, seja quem for o treinador da vez.
		const a = rosterOf(rosterContext(c), 'sport').map((p) => p.id);
		const b = rosterOf(rosterContext(t.career), 'sport').map((p) => p.id);
		expect(b).toEqual(a);
		// Nada é simulado antes de o último confirmar.
		const v = careerView(t.career, []);
		await expect(playRound(db, profile.id, t.career, { version: t.career.version, step: v.step!.key })).rejects.toBeInstanceOf(RoundError);
	}, 60_000);

	it('confronto entre treinadores: uma partida, decisões dos dois lados, controle volta ao primeiro e cada um com a própria gestão', async () => {
		const { profile, rival, round } = await rivals();
		let career = await createCareer(db, profile.id, { mode: 'coach', personName: 'Ana', clubId: 'flamengo', world: 'brasil' }, 777, [{ personName: 'Bia', clubId: rival }]);
		const startA = clubStateOf(career).balance;
		const startB = clubStateOf(projectCoach(career, 1)).balance;
		let h2h = false;
		for (let guard = 0; guard < 12 && !h2h; guard++) {
			career = await readyAll(profile.id, career);
			const results = await listResults(db, career.id, career.season);
			const v = careerView(career, results);
			const step = v.step!;
			// Monta a partida como a central da rodada faz e decide pelos dois lados.
			const fx = v.fixtures.find((f) => step.kind === 'league' && f.round === step.round && ((f.home === 'flamengo' && f.away === rival) || (f.away === 'flamengo' && f.home === rival)));
			let matches: Record<string, unknown> | undefined;
			let expected: { homeGoals: number; awayGoals: number } | null = null;
			if (fx) {
				const parts = [];
				for (const i of [0, 1]) {
					const c = projectCoach(career, i);
					const cv = careerView(c, results);
					parts.push(fixtureSetup(c, fx, cv.tactic, await matchdayContext(db, c, cv)));
				}
				const s = sharedSetup(parts);
				expect(s.humans.sort()).toEqual(['away', 'home']);
				const live = matchFromShared(s);
				while (live.tick < 1200) live.step();
				live.submit('home', { type: 'mentality', value: 'muito-ofensiva' });
				live.submit('away', { type: 'mentality', value: 'defensiva' });
				const result = live.runToEnd();
				expected = { homeGoals: result.homeGoals, awayGoals: result.awayGoals };
				const decisions = result.decisions.filter((d) => !d.rejected);
				expect(new Set(decisions.map((d) => d.side)).size).toBe(2);
				matches = { [fixtureKey(fx)]: decisions };
				// Sem as decisões o jogo seria outro: elas mudam o restante da simulação.
				const plain = matchFromShared(s).runToEnd();
				expect(plain.events.length === result.events.length && plain.homeGoals === result.homeGoals && plain.awayGoals === result.awayGoals && JSON.stringify(plain.stats) === JSON.stringify(result.stats)).toBe(false);
			}
			const out = await playRound(db, profile.id, career, { version: career.version, step: step.key, matches });
			career = out.career;
			expect(activeCoachIndex(career)).toBe(0);
			expect(career.personName).toBe('Ana');
			if (fx && expected) {
				h2h = true;
				expect(step.kind === 'league' && step.round).toBe(round);
				const rows = (await listResults(db, career.id, career.season - (career.season === 2026 ? 0 : 1))).filter((r) => r.home === fx.home && r.away === fx.away && r.competition === fx.competition);
				expect(rows).toHaveLength(1);
				expect(rows[0].isUser).toBe(true);
				expect({ homeGoals: rows[0].homeGoals, awayGoals: rows[0].awayGoals }).toEqual(expected);
				// Cada treinador vê a partida do próprio lado.
				const mineA = (await listUserMatches(db, career.id, undefined, 'flamengo')).find((m) => m.round === round && m.competition === 'serie-a')!;
				expect(mineA.summary.mySide).toBe(fx.home === 'flamengo' ? 'home' : 'away');
				const mineB = (await listUserMatches(db, career.id, undefined, rival)).find((m) => m.round === round && m.competition === 'serie-a')!;
				expect(mineB.summary.mySide).toBe(fx.home === rival ? 'home' : 'away');
				expect('coaches' in out && out.coaches).toHaveLength(2);
			}
		}
		expect(h2h).toBe(true);
		// Finanças: o caixa de cada treinador bate com os próprios lançamentos (nada misturado).
		const g = localGroup(career)!;
		const ledgerA = await listLedger(db, career.id, 2026, g.coaches[0].id);
		const ledgerB = await listLedger(db, career.id, 2026, g.coaches[1].id);
		expect(clubStateOf(career).balance).toBe(startA + ledgerA.reduce((s, l) => s + l.amount, 0));
		expect(clubStateOf(projectCoach(career, 1)).balance).toBe(startB + ledgerB.reduce((s, l) => s + l.amount, 0));
		expect(ledgerA.length).toBeGreaterThan(0);
		expect(ledgerB.length).toBeGreaterThan(0);
	}, 180_000);

	it('negociação entre humanos: controle vai ao vendedor, contraproposta volta, aceite conclui uma vez e devolve o turno a quem iniciou', async () => {
		const { profile } = await createGuestProfile(db);
		let career = await createCareer(db, profile.id, { mode: 'coach', personName: 'Ana', clubId: 'flamengo', world: 'brasil' }, 99, [{ personName: 'Bia', clubId: 'palmeiras' }]);
		// Ana passa a vez; Bia (turno dela) faz proposta por um atleta da Ana.
		career = (await passTurn(db, profile.id, career, career.version)).career;
		expect(career.personName).toBe('Bia');
		const anaId = localGroup(career)!.coaches[0].id;
		const target = rosterOf(rosterContext(career), 'flamengo').filter((p) => !p.loan).sort((a, b) => a.value - b.value)[0];
		const budget = clubStateOf(career).transferBudget;
		const fee = Math.min(budget, Math.round(target.value * 1.2));
		const opened = await openDeal(db, profile.id, career, { playerId: target.id, kind: 'compra', fee, wage: Math.round(target.contract.wage * 1.6), years: 3, role: 'titular' });
		career = opened.career;
		expect(career.personName).toBe('Ana'); // o vendedor assume para responder
		expect(localGroup(career)!.ready).toContain(anaId);
		// Ana contrapropõe; o controle volta à Bia.
		const counter = Math.max(0, fee - 1000);
		career = (await answerDeal(db, profile.id, career, { version: career.version, dealId: opened.deal.id, action: 'contraproposta', fee: counter })).career;
		expect(career.personName).toBe('Bia');
		// Bia aceita a contraproposta.
		const done = await answerDeal(db, profile.id, career, { version: career.version, dealId: opened.deal.id, action: 'aceitar' });
		career = done.career;
		expect(career.personName).toBe('Bia'); // quem iniciou continua no turno
		const g = localGroup(career)!;
		expect(g.deal).toBeNull();
		expect(g.ready).toContain(anaId); // a preparação da Ana foi preservada
		if (done.deal.status === 'concluida') {
			expect(currentClubOf(rosterContext(career), target.id)).toBe('palmeiras');
			const sale = await listLedger(db, career.id, 2026, anaId);
			expect(sale.filter((l) => l.description === `Venda de ${target.name}`).map((l) => l.amount)).toEqual([counter]);
		} else {
			// O atleta pode recusar o contrato (regra de sempre do mercado): nada muda de dono.
			expect(currentClubOf(rosterContext(career), target.id)).toBe('flamengo');
		}
		// Repetir o aceite não duplica nada.
		await expect(answerDeal(db, profile.id, career, { version: career.version, dealId: opened.deal.id, action: 'aceitar' })).rejects.toBeInstanceOf(TurnError);
		expect((await getCareer(db, profile.id, career.id))!.version).toBe(career.version);
	}, 60_000);
});

describe('temporada completa com dois treinadores em competições diferentes', () => {
	it('calendários diferentes, fim de temporada para cada um e o controle volta ao primeiro', async () => {
		const { finishSeason } = await import('#lib/server/rounds.ts');
		const { listHistory } = await import('#lib/server/repos/management.ts');
		const { profile } = await createGuestProfile(db);
		let career = await createCareer(db, profile.id, { mode: 'coach', personName: 'Ana', clubId: 'mirassol', world: 'brasil' }, 4242, [{ personName: 'Bia', clubId: 'sport' }]);
		const divA = careerView(career, []).division;
		const divB = careerView(projectCoach(career, 1), []).division;
		expect(divA).not.toBe(divB);
		let steps = 0;
		for (;;) {
			const v = careerView(career, await listResults(db, career.id, career.season));
			if (!v.step) break;
			career = await readyAll(profile.id, career);
			career = (await playRound(db, profile.id, career, { version: career.version, step: v.step.key })).career;
			steps++;
		}
		expect(steps).toBeGreaterThanOrEqual(38);
		// O último treinador encerra a temporada.
		career = await readyAll(profile.id, career);
		const res = await finishSeason(db, profile.id, career, career.version);
		expect(res.career.season).toBe(2027);
		expect(res.summaries).toHaveLength(2);
		expect(res.summaries!.map((s) => s.division)).toEqual([divA, divB]);
		expect(res.career.personName).toBe('Ana');
		const g = localGroup(res.career)!;
		expect(res.career.data.seasons).toHaveLength(1);
		expect(projectCoach(res.career, 1).data.seasons).toHaveLength(1);
		const histA = (await listHistory(db, career.id, g.coaches[0].id)).filter((h) => h.kind === 'temporada-usuario');
		const histB = (await listHistory(db, career.id, g.coaches[1].id)).filter((h) => h.kind === 'temporada-usuario');
		expect(histA.map((h) => h.competition)).toEqual([divA]);
		expect(histB.map((h) => h.competition)).toEqual([divB]);
	}, 600_000);
});
