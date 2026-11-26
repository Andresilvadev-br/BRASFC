import type { CompetitionParticipation } from '#lib/world/contract.ts';

export interface BrazilContinentalQualification {
	edition: 2027;
	groups: string[];
	preliminary: string[];
	sudamericana: string[];
}

export const LIBERTADORES = 'continental/libertadores';
export const SUDAMERICANA = 'continental/sudamericana';

/** Art. 6 e 7 do REC Brasileirão Série A 2026, para a edição continental de 2027. */
export function qualifyBrazil2027(
	standings: readonly string[],
	topFlightNextSeason: readonly string[],
	cup: { champion: string; runnerUp: string },
	continentalChampions: readonly string[] = []
): BrazilContinentalQualification {
	const eligible = new Set(topFlightNextSeason);
	const titleholders = [...new Set(continentalChampions)].filter((id) => eligible.has(id));
	const groups = new Set(titleholders);
	const preliminary = new Set<string>();
	const league = standings.filter((id) => eligible.has(id));
	const addFromLeague = (slot: Set<string>) => {
		const next = league.find((id) => !groups.has(id) && !preliminary.has(id));
		if (next) slot.add(next);
	};

	for (let i = 0; i < 4; i++) addFromLeague(groups);

	const { champion, runnerUp } = cup;
	let cupPreliminary = runnerUp;
	if (groups.has(champion)) {
		// O vice herda a vaga direta do campeão e devolve a sua vaga preliminar.
		if (eligible.has(runnerUp) && !groups.has(runnerUp)) groups.add(runnerUp);
		else addFromLeague(groups);
		cupPreliminary = '';
	} else if (eligible.has(champion)) groups.add(champion);
	else addFromLeague(groups);

	if (eligible.has(cupPreliminary) && !groups.has(cupPreliminary)) preliminary.add(cupPreliminary);
	else addFromLeague(preliminary);
	addFromLeague(preliminary);
	return {
		edition: 2027,
		groups: [...groups],
		preliminary: [...preliminary],
		sudamericana: league.filter((id) => !groups.has(id) && !preliminary.has(id)).slice(0, 6)
	};
}

export function continentalParticipation(qualification: BrazilContinentalQualification | undefined, club: string, season: number): CompetitionParticipation[] {
	if (!qualification || qualification.edition !== season) return [];
	const base = { club, status: 'classificado' as const, nextDate: null };
	if (qualification.groups.includes(club)) return [{ ...base, competition: LIBERTADORES, stage: 'Fase de grupos' }];
	if (qualification.preliminary.includes(club)) return [{ ...base, competition: LIBERTADORES, stage: 'Fase preliminar' }];
	if (qualification.sudamericana.includes(club)) return [{ ...base, competition: SUDAMERICANA, stage: 'Fase de grupos' }];
	return [];
}
