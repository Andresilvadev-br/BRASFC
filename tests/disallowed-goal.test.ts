import { expect, it } from 'vitest';
import { CLUBS } from '#lib/domain/clubs.ts';
import { generateSquad } from '#lib/domain/squad.ts';
import { Match } from '#lib/engine/match.ts';
import { buildTeamSetup } from '#lib/engine/teams.ts';
import { REVIEW_ENGINE_VERSION, LEGACY_ENGINE_VERSION } from '#lib/engine/types.ts';

const clubs = CLUBS.filter((club) => club.reputation === 3);
const setup = (club: (typeof CLUBS)[number]) => buildTeamSetup(club, generateSquad(club.id, 7), {
	formation: '4-3-3', mentality: 'equilibrada', style: 'posse'
});

it('anula uma finalização impedida sem mudar placar, estatísticas ou replay legado', () => {
	const fixture = { home: setup(clubs[0]), away: setup(clubs[1]), neutral: false, version: REVIEW_ENGINE_VERSION };
	const match = new Match({ ...fixture, seed: 49 });
	match.runToEnd();
	const official = match.result();
	const legacy = new Match({ ...fixture, seed: match.seed, version: LEGACY_ENGINE_VERSION }).runToEnd();
	const reviewed = official.events.filter((event) => event.type === 'goal_disallowed');
	expect(reviewed).toHaveLength(1);
	expect(official.events.filter((event) => event.type !== 'goal_disallowed')).toEqual(legacy.events);
	expect({ ...official, events: [] }).toEqual({ ...legacy, events: [] });
	for (const event of reviewed) {
		const offside = official.events.find((prior) => prior.type === 'offside' && prior.tick === event.tick && prior.player === event.player);
		expect(offside?.side).toBe(event.side);
		expect(event.data?.reason).toBe('impedimento');
		const goals = official.events.filter((prior) => prior.type === 'goal' && prior.tick < event.tick);
		expect(event.data?.score).toBe(`${goals.filter((e) => e.side === 'home').length}-${goals.filter((e) => e.side === 'away').length}`);
	}
}, 30000);
