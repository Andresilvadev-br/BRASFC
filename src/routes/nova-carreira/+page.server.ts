import { randomInt } from 'node:crypto';
import { careerStart } from '#lib/domain/career.ts';
import { MAX_LOCAL_COACHES } from '#lib/domain/turns.ts';
import { worldClubCards, worldCountries } from '#lib/server/world-countries.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const countries = worldCountries();
	return {
	previewSeed: randomInt(1, 2 ** 31 - 1),
	seasons: { brasil: careerStart('brasil').season, brasfc: careerStart('brasfc').season },
	maxCoaches: MAX_LOCAL_COACHES,
	/** World Database: países do catálogo instalado + Brasil nativo (docs/WORLD-CONTRACT.md). Sem a lista de clubes para manter a página leve. */
	countries: countries.map((c) => ({
		code: c.code, name: c.name, flag: c.flag, confederation: c.confederation, clubCount: c.clubCount, playable: c.playable, load: c.load,
		cups: c.cups.length, divisions: c.divisions.map((d) => ({ id: d.id, name: d.name, level: d.level, clubs: d.clubs.length, playable: d.playable }))
	})),
	/** clubes das divisões estrangeiras jogáveis (vazio enquanto a engine não confirmar inscrições) */
	foreignClubs: worldClubCards(countries)
	};
};
