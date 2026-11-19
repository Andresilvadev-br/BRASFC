import type { Profile } from '#lib/server/repos/profiles.ts';

declare global {
	const __APP_VERSION__: string;
	const __GIT_SHA__: string;
	const __BUILD_TIME__: string;

	namespace App {
		interface Locals {
			profile: Profile | null;
			requestId: string;
		}
		interface Error {
			message: string;
			id?: string;
		}
	}
}

export {};
