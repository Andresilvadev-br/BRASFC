import { crestMap } from '#lib/server/crests.ts';
import { gameEnabled } from '#lib/server/mode.ts';
import { BUILD } from '#lib/server/version.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, depends }) => {
	depends('app:crests');
	return {
		profile: locals.profile,
		build: { version: BUILD.version, commit: BUILD.commit, environment: BUILD.environment },
		/** escudos importados pelo jogador (clube → arquivo local). Vazio no site público. */
		crests: gameEnabled() ? crestMap() : {}
	};
};
