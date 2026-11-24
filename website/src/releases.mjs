import { readFile } from 'node:fs/promises';

export const repository = 'https://github.com/Andresilvadev-br/BRASFC';
export const releasesUrl = repository + '/releases';
const api = 'https://api.github.com/repos/Andresilvadev-br/BRASFC/releases?per_page=100';

export function stableReleases(payload) {
  if (!Array.isArray(payload)) throw new Error('Formato de releases inválido.');
  return payload
    .flatMap((release) => {
      const tag = release?.tag_name;
      if (
        release?.draft !== false ||
        release?.prerelease !== false ||
        !/^v\d+\.\d+\.\d+$/.test(tag) ||
        !Number.isFinite(Date.parse(release.published_at))
      )
        return [];
      const download = `${releasesUrl}/download/${tag}/BRASFC-Setup.exe`;
      const installer = release.assets?.find(
        (asset) =>
          asset.name === 'BRASFC-Setup.exe' &&
          asset.state === 'uploaded' &&
          Number.isSafeInteger(asset.size) &&
          asset.size > 0 &&
          asset.browser_download_url === download
      );
      if (!installer) return [];
      return [
        {
          version: tag.slice(1),
          published: release.published_at,
          page: `${releasesUrl}/tag/${tag}`,
          download,
          bytes: installer.size,
          sha256: /^sha256:[a-f0-9]{64}$/.test(installer.digest) ? installer.digest.slice(7) : null,
          notes: typeof release.body === 'string' ? release.body.trim().slice(0, 6000) : '',
        },
      ];
    })
    .sort((a, b) => Date.parse(b.published) - Date.parse(a.published));
}

export async function fetchReleases(fetcher = fetch) {
  const response = await fetcher(api, {
    redirect: 'error',
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'BRASFC-website' },
    signal: AbortSignal.timeout(2700),
  });
  if (!response.ok) throw new Error(`GitHub respondeu ${response.status}`);
  return { checkedAt: new Date().toISOString(), releases: stableReleases(await response.json()) };
}

export function releaseCatalog({ fetcher = fetch, dynamic = true } = {}) {
  const snapshot = readFile(new URL('./release-snapshot.json', import.meta.url), 'utf8')
    .then(JSON.parse)
    .catch(() => ({ checkedAt: null, releases: [] }));
  let current;
  let inflight;
  let expires = 0;
  return async () => {
    if (!dynamic) return { ...(await snapshot), cached: true };
    if (Date.now() < expires) return current;
    if (!inflight)
      inflight = fetchReleases(fetcher)
        .then((result) => {
          current = { ...result, cached: false };
          expires = Date.now() + 15 * 60 * 1000;
          return current;
        })
        .catch(async () => {
          current = { ...(current ?? (await snapshot)), cached: true };
          expires = Date.now() + 60 * 1000;
          return current;
        })
        .finally(() => {
          inflight = null;
        });
    return inflight;
  };
}
