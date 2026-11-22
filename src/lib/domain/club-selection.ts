import { catalogClub, fixedOpeningFormation, type ClubRoster, type RosterCatalogId } from '#lib/data/roster-catalog.ts';
import { autoLineup, defaultTactic, FORMATIONS, recoverTactic, type Tactic } from './tactics.ts';
import { COACH_PROFILES, type CoachProfile } from '#lib/engine/ai-coach.ts';
import { coachFormation } from './coaches.ts';
import { squadStrength, type SquadPlayer } from './squad.ts';

export function initialClubTactic(version: RosterCatalogId | undefined, club: string, squad: SquadPlayer[], profile?: CoachProfile): Tactic {
	const roster = catalogClub(version, club);
	if (!roster) return defaultTactic(squad);
	const fixed = fixedOpeningFormation(version, roster);
	if (!fixed) {
		const shape = profile ?? openingCoach(squad);
		const formation = coachFormation(shape, squad);
		return { formation, lineup: autoLineup(formation, squad), mentality: shape.mentality, style: shape.style };
	}
	return recoverTactic({
		formation: fixed, mentality: 'equilibrada', style: 'posse',
		lineup: roster.players.filter((player) => player.matchRole === 'starter').map((player) => `${club}-cbf${player.playerId}`)
	}, squad) ?? defaultTactic(squad);
}

/** Perfil de partida do treinador humano quando a fonte só documenta a convocação. */
function openingCoach(squad: SquadPlayer[]) {
	const qualified = (position: SquadPlayer['position'], count: number) =>
		squad.filter((player) => !player.pending && player.position === position).length >= count;
	if (qualified('ATA', 2) && qualified('MC', 2)) return COACH_PROFILES.pragmatico;
	if (qualified('VOL', 2) && qualified('MEI', 1)) return COACH_PROFILES.equilibrado;
	if (qualified('ZAG', 3) && !qualified('MEI', 1)) return COACH_PROFILES.ofensivo;
	return COACH_PROFILES.posse;
}

function playerCard(player: SquadPlayer) {
	const { id, name, shortName, overall, number, position, nationality, secondary, cbfId, contractUntil, birthDate } = player;
	return { id, name, shortName, overall, number, position, nationality, secondary, cbfId, contractUntil, age: birthDate ? player.age : undefined };
}

export function clubLineup(squad: SquadPlayer[], tactic: Tactic = defaultTactic(squad), opening?: ClubRoster) {
	const players = new Map(squad.map((player) => [player.id, player]));
	const remaining = squad.filter((player) => !tactic.lineup.includes(player.id) && !player.pending);
	const bench = tactic.bench
		? tactic.bench.flatMap((id) => { const player = remaining.find((p) => p.id === id); return player ? [player] : []; })
		: remaining.filter((player) => player.catalogRole !== 'reserve').slice(0, remaining.some((p) => p.catalogRole) ? 12 : 9);
	const benchIds = new Set(bench.map((player) => player.id));
	const visible = squad.filter((player) => !player.pending);
	return {
		formation: tactic.formation,
		...(opening && { opening: { source: opening.source, asOf: opening.asOf, modeledTactics: opening.modeledTactics, lineupAdjusted: opening.lineupAdjusted } }),
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
