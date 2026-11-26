import { redirect } from '@sveltejs/kit';
import { RELEASES } from '#lib/changelog.ts';
import { DESKTOP_RELEASE, opensGameDirectly } from '#lib/site.ts';
import { gameEnabled } from '#lib/server/mode.ts';
import type { PageServerLoad } from './$types';

/** Landing page do BRASFC. No aplicativo do Windows (jogo local) a raiz abre direto o jogo em /jogar. */
export const load: PageServerLoad = ({ request, url }) => {
	// No site público nunca há redirecionamento para o jogo (ele não existe lá): apps antigos veem o site e se atualizam pelo GitHub.
	if (gameEnabled(process.env, import.meta.env.DEV) && opensGameDirectly(request.headers.get('user-agent'), process.env.BRASFC_OFFLINE === '1')) redirect(307, `/jogar${url.search}`);
	const latest = RELEASES[0];
	return {
		desktop: DESKTOP_RELEASE,
		latest: { version: latest.version, title: latest.title, date: latest.date, highlights: latest.highlights ?? [] },
		recent: RELEASES.slice(0, 3).map((r) => ({ version: r.version, title: r.title, date: r.date }))
	};
};
