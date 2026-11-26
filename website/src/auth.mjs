import * as oidc from 'openid-client';
import { failure, token } from './forum.mjs';

export function authProvider(env, origin) {
  const names = ['BRASFC_OIDC_ISSUER', 'BRASFC_OIDC_CLIENT_ID', 'BRASFC_OIDC_CLIENT_SECRET'];
  if (!names.some((name) => env[name])) return null;
  if (!names.every((name) => env[name])) throw new Error('Configure os três parâmetros do provedor BRASFC.');
  const issuer = new URL(env.BRASFC_OIDC_ISSUER);
  if (issuer.protocol !== 'https:' || issuer.username || issuer.password || issuer.hash || issuer.search) {
    throw new Error('O emissor OIDC exige uma URL HTTPS válida.');
  }
  const redirects = new Map();
  let provider;
  const get = () =>
    (provider ??= oidc
      .discovery(issuer, env.BRASFC_OIDC_CLIENT_ID, env.BRASFC_OIDC_CLIENT_SECRET, undefined, {
        timeout: 5,
        execute: [oidc.enableNonRepudiationChecks],
      })
      .catch((error) => {
        provider = null;
        throw error;
      }));
  return {
    issuer: issuer.href,
    async begin() {
      const server = await get();
      const now = Date.now();
      for (const [key, flow] of redirects) if (flow.expires <= now) redirects.delete(key);
      if (redirects.size >= 1000) throw failure(503, 'Login temporariamente ocupado.');
      const state = token();
      const nonce = token();
      const verifier = oidc.randomPKCECodeVerifier();
      const location = oidc.buildAuthorizationUrl(server, {
        redirect_uri: new URL('/conta/retorno', origin).href,
        scope: 'openid profile',
        response_type: 'code',
        code_challenge_method: 'S256',
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
        state,
        nonce,
      });
      redirects.set(state, { nonce, verifier, expires: now + 10 * 60_000 });
      return { state, location: location.href };
    },
    async complete(url, cookie) {
      const state = url.searchParams.get('state');
      const flow = state && state === cookie && redirects.get(state);
      if (!flow || flow.expires <= Date.now())
        throw failure(400, 'Sessão de login expirada. Inicie o acesso de novo.');
      redirects.delete(state);
      const tokens = await oidc.authorizationCodeGrant(await get(), url, {
        pkceCodeVerifier: flow.verifier,
        expectedState: state,
        expectedNonce: flow.nonce,
        idTokenExpected: true,
      });
      return tokens.claims();
    },
  };
}
