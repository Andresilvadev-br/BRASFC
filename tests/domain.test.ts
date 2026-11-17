import { describe, expect, it } from 'vitest';
import { validateCreateCareer, initialCareerData, welcomeMessages } from '#lib/domain/career.ts';
import { CLUBS } from '#lib/domain/clubs.ts';
import { addDays, formatLong, isIsoDate, monthGrid, startOfWeek, weekday } from '#lib/domain/dates.ts';
import { positionFit } from '#lib/domain/positions.ts';
import { computeStandings, generateLeagueFixtures, nextFixture } from '#lib/domain/season.ts';
import { generateSquad } from '#lib/domain/squad.ts';
import { assistantReport, autoLineup, FORMATION_IDS, FORMATIONS, lineupFamiliarity, sanitizeTactic } from '#lib/domain/tactics.ts';
import { weekPlan } from '#lib/domain/training.ts';
import { careerView } from '#lib/domain/view.ts';

describe('datas do jogo', () => {
	it('valida, soma e formata em UTC', () => {
		expect(isIsoDate('2027-01-11')).toBe(true);
		expect(isIsoDate('2027-02-30')).toBe(false);
		expect(addDays('2027-01-31', 1)).toBe('2027-02-01');
		expect(weekday('2027-01-24')).toBe(0); // domingo
		expect(startOfWeek('2027-01-24')).toBe('2027-01-18');
		expect(formatLong('2027-01-11')).toBe('Segunda, 11 de janeiro de 2027');
		expect(monthGrid(2027, 0)).toHaveLength(42);
	});
});

describe('calendário da Liga', () => {
	const fixtures = generateLeagueFixtures(12345);

	it('tem 38 rodadas com 10 jogos e cada clube joga uma vez por rodada', () => {
		expect(fixtures).toHaveLength(380);
		for (let r = 1; r <= 38; r++) {
			const games = fixtures.filter((f) => f.round === r);
			expect(games).toHaveLength(10);
			const teams = games.flatMap((g) => [g.home, g.away]);
			expect(new Set(teams).size).toBe(20);
		}
	});

	it('cada par se enfrenta duas vezes, uma em casa e outra fora', () => {
		const pairs = new Map<string, number>();
		for (const f of fixtures) pairs.set(`${f.home}>${f.away}`, (pairs.get(`${f.home}>${f.away}`) ?? 0) + 1);
		expect(pairs.size).toBe(380);
		for (const [k, n] of pairs) {
			expect(n).toBe(1);
			const [h, a] = k.split('>');
			expect(pairs.has(`${a}>${h}`)).toBe(true);
		}
	});

	it('é determinístico pela semente', () => {
		expect(generateLeagueFixtures(12345)).toEqual(fixtures);
		expect(generateLeagueFixtures(999)).not.toEqual(fixtures);
	});

	it('encontra o próximo jogo a partir da data atual', () => {
		const next = nextFixture(fixtures, 'aurora', '2027-01-11');
		expect(next?.round).toBe(1);
		expect(next?.date).toBe('2027-01-24');
	});
});

describe('classificação', () => {
	it('começa zerada e ordena por pontos, vitórias e saldo', () => {
		const ids = CLUBS.map((c) => c.id);
		expect(computeStandings(ids, []).every((r) => r.points === 0)).toBe(true);
		const table = computeStandings(['a', 'b', 'c'], [
			{ home: 'a', away: 'b', homeGoals: 2, awayGoals: 0 },
			{ home: 'c', away: 'a', homeGoals: 1, awayGoals: 1 },
			{ home: 'b', away: 'c', homeGoals: 3, awayGoals: 0 }
		]);
		expect(table.map((r) => [r.clubId, r.points, r.position])).toEqual([
			['a', 4, 1],
			['b', 3, 2],
			['c', 1, 3]
		]);
	});
});

describe('elencos demonstrativos', () => {
	it('gera 25 atletas válidos, com números únicos e de forma determinística', () => {
		const squad = generateSquad('aurora', 42);
		expect(squad).toHaveLength(25);
		expect(new Set(squad.map((p) => p.number)).size).toBe(25);
		expect(new Set(squad.map((p) => p.name)).size).toBe(25);
		expect(squad.filter((p) => p.position === 'GOL')).toHaveLength(3);
		expect(generateSquad('aurora', 42)).toEqual(squad);
		for (const p of squad) {
			expect(p.overall).toBeGreaterThanOrEqual(40);
			expect(p.potential).toBeGreaterThanOrEqual(p.overall);
		}
	});
});

describe('táticas', () => {
	const squad = generateSquad('cerrado', 7);

	it('escalação automática preenche todas as formações sem repetir e com goleiro no gol', () => {
		for (const f of FORMATION_IDS) {
			const lineup = autoLineup(f, squad);
			expect(lineup).toHaveLength(11);
			expect(new Set(lineup).size).toBe(11);
			expect(squad.find((p) => p.id === lineup[0])?.position).toBe('GOL');
			expect(lineupFamiliarity(f, lineup, squad)).toBeGreaterThan(80);
		}
	});

	it('familiaridade cai quando alguém joga fora de posição', () => {
		const lineup = autoLineup('4-3-3', squad);
		const striker = squad.find((p) => p.position === 'ATA' && !lineup.includes(p.id))!;
		const swapped = [striker.id, ...lineup.slice(1)];
		expect(lineupFamiliarity('4-3-3', swapped, squad)).toBeLessThan(lineupFamiliarity('4-3-3', lineup, squad));
		expect(positionFit('ATA', 'GOL')).toBeLessThan(0.5);
		const notes = assistantReport({ formation: '4-3-3', lineup: swapped, mentality: 'equilibrada', style: 'posse' }, squad);
		expect(notes.some((n) => n.tone === 'alerta')).toBe(true);
	});

	it('rejeita táticas inválidas vindas do cliente', () => {
		const lineup = autoLineup('4-4-2', squad);
		const ok = { formation: '4-4-2', lineup, mentality: 'ofensiva', style: 'pressao' };
		expect(sanitizeTactic(ok, squad)).toEqual(ok);
		expect(sanitizeTactic({ ...ok, formation: '9-0-1' }, squad)).toBeNull();
		expect(sanitizeTactic({ ...ok, lineup: [...lineup.slice(0, 10), lineup[0]] }, squad)).toBeNull();
		expect(sanitizeTactic({ ...ok, lineup: [...lineup.slice(0, 10), 'outro-clube-01'] }, squad)).toBeNull();
		expect(sanitizeTactic({ ...ok, mentality: 'kamikaze' }, squad)).toBeNull();
		expect(FORMATIONS['4-4-2']).toHaveLength(11);
	});
});

describe('criação de carreira', () => {
	it('valida dados e explica os erros em português', () => {
		const bad = validateCreateCareer({ mode: 'player', personName: 'X', clubId: 'nao-existe' });
		expect(bad.ok).toBe(false);
		if (!bad.ok) {
			expect(bad.errors.personName).toMatch(/2 letras/);
			expect(bad.errors.clubId).toBeDefined();
			expect(bad.errors.position).toBeDefined();
		}
		expect(validateCreateCareer({ mode: 'coach', personName: '<script>', clubId: 'aurora' }).ok).toBe(false);
		const good = validateCreateCareer({ mode: 'coach', personName: '  Ana   Souza ', clubId: 'aurora' });
		expect(good.ok && good.value.personName).toBe('Ana Souza');
	});

	it('gera dados iniciais e mensagens de boas-vindas', () => {
		const input = { mode: 'player' as const, personName: 'Léo', clubId: 'juriti', position: 'ATA' as const, appearance: { skin: 1, hairColor: 1, hairStyle: 'curto' as const } };
		const data = initialCareerData(input, 99);
		expect(data.player?.age).toBe(18);
		expect(data.player!.potential).toBeGreaterThan(data.player!.overall);
		expect(welcomeMessages(input).some((m) => m.kind === 'important')).toBe(true);
	});

	it('monta a visão da carreira com próximo jogo e semana de treino', () => {
		const view = careerView({
			id: 'x', mode: 'coach', personName: 'Ana', clubId: 'aurora', seed: 5, season: 2027, gameDate: '2027-01-11',
			data: {}, version: 1, createdAt: '', updatedAt: ''
		});
		expect(view.next?.round).toBe(1);
		expect(view.tactic.lineup).toHaveLength(11);
		const week = weekPlan('2027-01-20', 'fisico', view.clubFixtures);
		expect(week).toHaveLength(7);
		expect(week.find((d) => d.date === '2027-01-24')?.sessions).toEqual(['jogo']);
	});
});
