import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, params }) => {
	const { career } = await parent();
	if (career.mode === 'player' && career.data.player && career.data.position) redirect(307, `/carreira/${params.id}?secao=treino`);
	return {};
};
