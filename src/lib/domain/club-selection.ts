import { catalogClub, type RosterCatalogId } from '#lib/data/roster-catalog.ts';
import { defaultTactic, FORMATIONS, recoverTactic, type Tactic } from './tactics.ts';
import { squadStrength, type SquadPlayer } from './squad.ts';

export function initialClubTactic(version: RosterCatalogId | undefined, club: string, squad: SquadPlayer[]): Tactic {
	const roster = catalogClub(version, club);
	if (!roster) return defaultTactic(squad);
	return recoverTactic({
		formation: roster.formation, mentality: 'equilibrada', style: 'posse',
		lineup: roster.players.filter((player) => player.matchRole === 'starter').map((player) => `${club}-cbf${player.playerId}`)
	}, squad) ?? defaultTactic(squad);
}

function playerCard(player: SquadPlayer) {
	const { id, name, shortName, overall, number, position, nationality, secondary, cbfId, contractUntil, birthDate } = player;
	return { id, name, shortName, overall, number, position, nationality, secondary, cbfId, contractUntil, age: birthDate ? player.age : undefined };
}

export function clubLineup(squad: SquadPlayer[], tactic: Tactic = defaultTactic(squad)) {
	const players = new Map(squad.map((player) => [player.id, player]));
	const remaining = squad.filter((player) => !tactic.lineup.includes(player.id) && !player.pending);
	const bench = tactic.bench
		? tactic.bench.flatMap((id) => { const player = remaining.find((p) => p.id === id); return player ? [player] : []; })
		: remaining.filter((player) => player.catalogRole !== 'reserve').slice(0, remaining.some((p) => p.catalogRole) ? 12 : 9);
	const benchIds = new Set(bench.map((player) => player.id));
	const visible = squad.filter((player) => !player.pending);
	return {
		formation: tactic.formation,
		strength: visible.length >= 11 ? squadStrength(visible) : null,
		starters: FORMATIONS[tactic.formation].map((slot, index) => {
			const player = players.get(tactic.lineup[index]);
			return { ...slot, player: player && !player.pending ? playerCard(player) : undefined };
		}),
		bench: bench.map(playerCard),
		reserves: remaining.filter((player) => !benchIds.has(player.id)).map(playerCard),
		coverage: (visible.some((player) => player.cbfId) ? 'documented' : squad.some((player) => player.pending) ? 'incomplete' : 'simulation') as 'incomplete' | 'documented' | 'simulation'
	};
}

export type ClubLineup = ReturnType<typeof clubLineup>;
