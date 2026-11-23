import { getDb } from '#lib/server/db/index.ts';
import { prefetchRound } from '#lib/server/round-prefetch.ts';
import { observedFrom } from '#lib/domain/matchday.ts';
import type { PageServerLoad } from './$types';

/** A leitura da carreira já traz as últimas súmulas necessárias ao adversário. */
export const load: PageServerLoad = async ({ parent, locals }) => {
	const { recent, career } = await parent();
	// Enquanto o treinador se prepara e assiste à partida, os demais jogos da rodada já são simulados.
	if (locals.profile) prefetchRound(await getDb(), locals.profile.id, career.id);
	return { observed: recent.slice(-3).map((m) => observedFrom(m.summary)).filter((m) => m !== null) };
};
