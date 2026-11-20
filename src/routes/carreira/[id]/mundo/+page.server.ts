import { sanitizeUniverse } from '#lib/domain/universe.ts';
import { getDb } from '#lib/server/db/index.ts';
import { getCareer } from '#lib/server/repos/careers.ts';
import { logRequestFailure } from '#lib/server/request-error.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, locals, request }) => {
	const { career } = await parent();
	try {
		const full = await getCareer(await getDb(), locals.profile!.id, career.id);
		return { universe: sanitizeUniverse(full?.data.universe), newsUnavailable: false };
	} catch (cause) {
		logRequestFailure(locals.requestId, 'notícias do universo', request.method, cause);
		return { universe: null, newsUnavailable: true };
	}
};
