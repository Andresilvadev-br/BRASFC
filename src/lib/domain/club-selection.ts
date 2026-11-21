import { defaultTactic, FORMATIONS, type Tactic } from './tactics.ts';
import type { SquadPlayer } from './squad.ts';

export function clubLineup(squad: SquadPlayer[], tactic: Tactic = defaultTactic(squad)) {
	const players = new Map(squad.map((player) => [player.id, player]));
	return {
		formation: tactic.formation,
		starters: FORMATIONS[tactic.formation].map((slot, index) => {
			const player = players.get(tactic.lineup[index]);
			return {
				...slot,
				name: player?.name,
				shortName: player?.shortName,
				overall: player?.overall
			};
		})
	};
}

export type ClubLineup = ReturnType<typeof clubLineup>;
