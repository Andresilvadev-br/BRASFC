import type { Career } from './career.ts';
import { CLUBS, requireClub } from './clubs.ts';
import { clubFixtures, computeStandings, generateLeagueFixtures, nextFixture } from './season.ts';
import { generateSquad, squadStrength } from './squad.ts';
import { defaultTactic, sanitizeTactic, type Tactic } from './tactics.ts';

/**
 * Visão derivada de uma carreira: tudo o que é determinístico a partir da
 * semente (elencos, calendário, classificação) é calculado aqui, igual no
 * servidor e no navegador, sem precisar ser armazenado.
 */
export function careerView(career: Career) {
	const club = requireClub(career.clubId);
	const squad = generateSquad(career.clubId, career.seed);
	const fixtures = generateLeagueFixtures(career.seed);
	const mine = clubFixtures(fixtures, career.clubId);
	// Normaliza táticas antigas (Dev 0.1) para o vocabulário atual; inválidas voltam ao padrão.
	const persisted = career.data.tactic ? sanitizeTactic(career.data.tactic, squad) : null;
	const tactic: Tactic = persisted ?? defaultTactic(squad);
	return {
		club,
		squad,
		fixtures,
		clubFixtures: mine,
		next: nextFixture(fixtures, career.clubId, career.gameDate),
		// Nenhuma rodada foi disputada ainda: a tabela começa zerada.
		standings: computeStandings(
			CLUBS.map((c) => c.id),
			[]
		),
		strength: squadStrength(squad),
		tactic,
		tacticSaved: !!persisted
	};
}

export type CareerView = ReturnType<typeof careerView>;
