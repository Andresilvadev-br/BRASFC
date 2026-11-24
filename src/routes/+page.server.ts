import { redirect } from '@sveltejs/kit';
import { RELEASES } from '#lib/changelog.ts';
import { DESKTOP_RELEASE, opensGameDirectly } from '#lib/site.ts';
import type { PageServerLoad } from './$types';

/** Landing page do BRASFC. O jogo fica em /jogar (o app do Windows e o modo offline vão direto). */
export const load: PageServerLoad = ({ request, url }) => {
	if (opensGameDirectly(request.headers.get('user-agent'), process.env.BRASFC_OFFLINE === '1')) redirect(307, `/jogar${url.search}`);
	const latest = RELEASES[0];
	return {
		desktop: DESKTOP_RELEASE,
		latest: { version: latest.version, title: latest.title, date: latest.date, highlights: latest.highlights ?? [] },
		recent: RELEASES.slice(0, 3).map((r) => ({ version: r.version, title: r.title, date: r.date }))
	};
};
