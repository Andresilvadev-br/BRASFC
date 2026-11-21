import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({
	profile: locals.profile,
	offline: process.env.BRASFC_OFFLINE === '1'
});
