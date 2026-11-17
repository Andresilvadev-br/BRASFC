export const BUILD = {
	version: __APP_VERSION__,
	commit: __GIT_SHA__,
	builtAt: __BUILD_TIME__,
	name: `${__APP_VERSION__}+${__GIT_SHA__}`,
	environment: process.env.PUBLIC_BRASFC_ENV ?? (process.env.NODE_ENV === 'production' ? 'producao' : 'desenvolvimento')
} as const;

