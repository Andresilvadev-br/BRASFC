import { getDb } from '#lib/server/db/index.ts';
import { prefetchRound } from '#lib/server/round-prefetch.ts';
import { observedFrom } from '#lib/domain/matchday.ts';
import { isShared } from '#lib/domain/turns.ts';
import type { PageServerLoad } from './$types';

/** A leitura da carreira já traz as últimas súmulas necessárias ao adversário. */
export const load: PageServerLoad = async ({ parent, locals }) => {
	const { recent, career } = await parent();
	// Enquanto o treinador se prepara e assiste à partida, os demais jogos da rodada já são simulados.
	// (Na carreira com vários treinadores, a central da rodada calcula e guarda esses jogos.)
	if (locals.profile && !isShared(career)) prefetchRound(await getDb(), locals.profile.id, career.id);
	return { observed: recent.slice(-3).map((m) => observedFrom(m.summary, m.home === career.clubId ? 'home' : 'away')).filter((m) => m !== null) };
};
