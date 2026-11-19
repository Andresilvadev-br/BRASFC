import type { SquadPlayer } from '#lib/domain/squad.ts';
import { autoLineup, type FormationId, type Mentality, type PlayStyle, type Tactic } from '#lib/domain/tactics.ts';
import type { EnginePlayer, TeamSetup } from './types.ts';

export function toEnginePlayer(p: SquadPlayer & { pending?: boolean }): EnginePlayer {
	return {
		id: p.id,
		name: p.name,
		shortName: p.shortName,
		number: p.number,
		position: p.position,
		attributes: p.attributes,
		condition: p.condition,
		...(p.pending ? { pending: true } : {})
	};
}

/** Reservas: um goleiro e os melhores atletas restantes (até `size`). */
export function pickBench(squad: SquadPlayer[], lineup: string[], size = 9): string[] {
	const rest = squad.filter((p) => !lineup.includes(p.id)).sort((a, b) => b.overall - a.overall);
	const gk = rest.find((p) => p.position === 'GOL');
	const others = rest.filter((p) => p !== gk);
	return [...(gk ? [gk.id] : []), ...others.slice(0, size - (gk ? 1 : 0)).map((p) => p.id)];
}

export interface TeamIdentity {
	id: string;
	name: string;
	short: string;
	colors: { primary: string; secondary: string };
}

export function buildTeamSetup(
	team: TeamIdentity,
	squad: SquadPlayer[],
	tactic: Partial<Tactic> & { formation: FormationId; mentality: Mentality; style: PlayStyle }
): TeamSetup {
	const lineup = tactic.lineup && tactic.lineup.length === 11 ? tactic.lineup : autoLineup(tactic.formation, squad);
	return {
		id: team.id,
		name: team.name,
		short: team.short,
		colors: team.colors,
		players: squad.map(toEnginePlayer),
		tactic: { formation: tactic.formation, lineup, bench: pickBench(squad, lineup), mentality: tactic.mentality, style: tactic.style, captains: tactic.captains, playerOrders: tactic.playerOrders }
	};
}
