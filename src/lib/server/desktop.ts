/**
 * Instalador do BRASFC para Windows: consulta a última versão publicada no GitHub Releases
 * (repositório público) e devolve o link SÓ se o instalador existir de fato — sem botão falso.
 * Cache de 10 minutos para não depender do GitHub a cada visita.
 */
export type DesktopRelease = { available: true; version: string; url: string; sizeMb: number; publishedAt: string } | { available: false; reason: string };

const REPO = process.env.BRASFC_DESKTOP_REPO ?? 'Andresilvadev-br/BRASFC';
const ASSET = 'BRASFC-Setup.exe';
const TTL = 10 * 60_000;
let cache: { at: number; value: DesktopRelease } | null = null;

export function pickInstaller(release: unknown): DesktopRelease {
	const r = release as { tag_name?: string; published_at?: string; draft?: boolean; assets?: Array<{ name: string; browser_download_url: string; size: number }> } | null;
	if (!r || r.draft || !Array.isArray(r.assets)) return { available: false, reason: 'Nenhuma versão do aplicativo publicada ainda.' };
	const asset = r.assets.find((a) => a.name === ASSET);
	if (!asset || !/^https:\/\/github\.com\//.test(asset.browser_download_url)) return { available: false, reason: 'A versão publicada não contém o instalador.' };
	return {
		available: true,
		version: String(r.tag_name ?? '').replace(/^v/, ''),
		url: asset.browser_download_url,
		sizeMb: Math.round((asset.size / 1048576) * 10) / 10,
		publishedAt: String(r.published_at ?? '')
	};
}

export async function desktopRelease(fetcher: typeof fetch = fetch, now = Date.now()): Promise<DesktopRelease> {
	if (cache && now - cache.at < TTL) return cache.value;
	let value: DesktopRelease;
	try {
		const res = await fetcher(`https://api.github.com/repos/${REPO}/releases/latest`, {
			headers: { accept: 'application/vnd.github+json', 'user-agent': 'brasfc-server' },
			signal: AbortSignal.timeout(6000)
		});
		value = res.status === 404 ? { available: false, reason: 'Nenhuma versão do aplicativo publicada ainda.' } : res.ok ? pickInstaller(await res.json()) : { available: false, reason: 'Não foi possível consultar as versões agora.' };
	} catch {
		value = { available: false, reason: 'Não foi possível consultar as versões agora.' };
	}
	cache = { at: now, value };
	return value;
}

export function resetDesktopCache() {
	cache = null;
}
