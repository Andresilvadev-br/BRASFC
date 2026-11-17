import { BUILD } from '#lib/server/version.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
	profile: locals.profile,
	build: { version: BUILD.version, commit: BUILD.commit, environment: BUILD.environment }
});
