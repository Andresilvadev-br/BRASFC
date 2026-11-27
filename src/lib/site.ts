/**
 * Dados públicos do site (landing page). A versão do instalador acompanha `desktop/package.json`
 * (um teste garante que não fiquem diferentes).
 */
export const REPOSITORY = 'https://github.com/Andresilvadev-br/BRASFC';

export const DESKTOP_RELEASE = {
	version: '1.7.0',
	platform: 'Windows x64',
	/** sempre o instalador da última versão publicada */
	download: `${REPOSITORY}/releases/latest/download/BRASFC-Setup.exe`,
	page: `${REPOSITORY}/releases/latest`
} as const;

export const COMMUNITY = {
	issues: `${REPOSITORY}/issues`,
	newIssue: `${REPOSITORY}/issues/new`
} as const;

/**
 * Quem abre `/` sem ser visitante do site vai direto para o jogo: o app do Windows (a casca
 * Electron identifica-se no User-Agent, inclusive versões antigas) e o servidor offline embutido.
 */
export function opensGameDirectly(userAgent: string | null, offline: boolean): boolean {
	return offline || /\bBRASFC-Desktop\//.test(userAgent ?? '');
}
