/**
 * BRASFC 0.13 · LOCAL LEGACY — onde este servidor está rodando.
 *
 *  - JOGO: dentro do aplicativo do Windows (BRASFC_OFFLINE=1), no desenvolvimento (`vite dev`)
 *    e em testes/automação (BRASFC_GAME=1). Banco local (PGlite) e todas as rotas do jogo.
 *  - SITE: qualquer outro servidor (a VPS). Só apresentação e download da versão do Windows;
 *    nenhuma rota de jogo e nenhuma conexão com banco (os dados antigos ficam intactos).
 */
export function gameEnabled(env: NodeJS.ProcessEnv = process.env, dev = env.NODE_ENV === 'development'): boolean {
	return env.BRASFC_OFFLINE === '1' || env.BRASFC_GAME === '1' || dev;
}

/** Rotas que o site público ainda serve (apresentação, download, saúde e versão). */
const SITE_PATHS = [/^\/$/, /^\/novidades\/?$/, /^\/api\/(health|version|desktop)\/?$/, /^\/_app\//, /^\/(icons|landing)\//, /^\/[^/]+\.[a-z0-9]+$/i];

export function sitePathAllowed(pathname: string): boolean {
	return SITE_PATHS.some((re) => re.test(pathname));
}
