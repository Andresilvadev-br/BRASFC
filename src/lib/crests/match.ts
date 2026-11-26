import type { ClubId } from '#lib/world/contract.ts';

/**
 * Liga cada arquivo de imagem da pasta escolhida a um clube do jogo. Formatos reconhecidos:
 *  - Brasfoot Next: `clubs/<país>/<slug>/crest.png`, identificação exata;
 *  - Brasfoot clássico ou Megapatch: `escudos/<Nome do clube>.png` (ou `teams/escudos/`), por nome normalizado;
 *  - pasta solta: `<Nome do clube>.png`, por nome normalizado.
 * Nome ambíguo (dois clubes com a mesma forma normalizada, sem país que desempate) não é importado.
 */
export type CrestSource = 'brasfoot-next' | 'megapatch' | 'pasta-local';

export interface ClubName {
	id: ClubId;
	name: string;
	country: string;
	/** apelidos verificáveis (ex.: nome oficial completo, sigla consagrada) */
	aliases?: string[];
}

export interface CrestIndex {
	/** catálogo mundial: `world/<país>/<slug>` existentes */
	world: Set<ClubId>;
	/** Brasfoot Next brasileiro (`bra/<slug>`) → clube nativo */
	brazil: Map<string, ClubId>;
	/** nome normalizado → clubes */
	names: Map<string, ClubId[]>;
}

export interface CrestMatch {
	path: string;
	club: ClubId;
	source: CrestSource;
}

const IMAGE = /\.(png|gif|jpe?g|webp|bmp)$/i;
/** termos genéricos que variam entre bases sem mudar o clube */
const NOISE = /\b(esporte|sport|futebol|football|futbol|clube|club|clube de regatas|associacao|atletica|sociedade|esportiva|fc|ec|sc|ac|cf|cd|afc|cr|se|aa|de|do|da|e)\b/g;

/**
 * Clubes brasileiros do Brasfoot Next cujo nome difere do cadastro nativo. Cada caso foi conferido pelo estado
 * e pela divisão no `club.toml`.
 */
const BRAZIL_ALIASES: Record<string, ClubId> = {
	'bra/bragantino': 'rb-bragantino' // "Bragantino", SP, Série A: Red Bull Bragantino (não o Bragantino-PA)
};

export function normalizeName(value: string): string {
	const plain = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
		.replace(/\./g, '').replace(/[^a-z0-9]+/g, ' ').trim();
	const core = plain.replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
	// "Sport" sozinho é o nome do clube, não um termo genérico.
	return core || plain;
}

export function buildCrestIndex(native: ClubName[], world: ClubName[]): CrestIndex {
	const names = new Map<string, ClubId[]>();
	const add = (key: string, id: ClubId) => {
		if (!key) return;
		const list = names.get(key) ?? [];
		if (!list.includes(id)) list.push(id);
		names.set(key, list);
	};
	const brazil = new Map<string, ClubId>();
	const nativeIds = new Set(native.map((c) => c.id));
	for (const club of native) {
		add(normalizeName(club.name), club.id);
		for (const alias of club.aliases ?? []) add(normalizeName(alias), club.id);
	}
	// O catálogo brasileiro aponta para o clube nativo de mesmo nome. O clube nativo prevalece.
	for (const club of world) {
		if (club.country === 'bra') {
			const slug = club.id.replace(/^world\//, '');
			const bare = slug.slice(4);
			const nativeId = BRAZIL_ALIASES[slug] ?? (nativeIds.has(bare) ? bare : names.get(normalizeName(club.name))?.find((id) => !id.startsWith('world/')));
			if (nativeId) brazil.set(slug, nativeId);
			continue;
		}
		add(normalizeName(club.name), club.id);
		for (const alias of club.aliases ?? []) add(normalizeName(alias), club.id);
	}
	return { world: new Set(world.filter((c) => c.country !== 'bra').map((c) => c.id)), brazil, names };
}

function byName(index: CrestIndex, file: string): ClubId | null {
	const stem = file.replace(IMAGE, '').replace(/[_]+/g, ' ');
	const found = index.names.get(normalizeName(stem));
	return found?.length === 1 ? found[0] : null;
}

export function matchCrest(index: CrestIndex, path: string): CrestMatch | null {
	const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
	const file = parts.at(-1) ?? '';
	if (!IMAGE.test(file)) return null;
	const at = parts.lastIndexOf('clubs');
	if (at >= 0 && parts.length === at + 4 && /^crest\.png$/i.test(file)) {
		const key = `${parts[at + 1].toLowerCase()}/${parts[at + 2].toLowerCase()}`;
		const club = key.startsWith('bra/') ? index.brazil.get(key) : index.world.has(`world/${key}`) ? `world/${key}` : undefined;
		return club ? { path, club, source: 'brasfoot-next' } : null;
	}
	// O Brasfoot Next também tem `kit.png` e troféus. No layout clássico, só a pasta `escudos` vale.
	if (parts.some((p) => /^(kits?|uniformes|camisas|trofeus|trophies|national-teams|pequenos|small)$/i.test(p))) return null;
	const club = byName(index, file);
	if (!club) return null;
	return { path, club, source: parts.some((p) => /^escudos$/i.test(p)) ? 'megapatch' : 'pasta-local' };
}

const RANK: Record<CrestSource, number> = { 'brasfoot-next': 0, megapatch: 1, 'pasta-local': 2 };

/**
 * Candidatos por clube, em ordem de preferência de fonte e caminho mais curto. O cliente escolhe o de maior
 * arte visível (melhor resolução) e usa essa ordem só para desempatar.
 */
export function groupCrests(matches: CrestMatch[]): Map<ClubId, CrestMatch[]> {
	const out = new Map<ClubId, CrestMatch[]>();
	for (const m of matches) out.set(m.club, [...(out.get(m.club) ?? []), m]);
	for (const list of out.values()) list.sort((a, b) => RANK[a.source] - RANK[b.source] || a.path.length - b.path.length);
	return out;
}
