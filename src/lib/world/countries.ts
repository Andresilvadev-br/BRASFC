import type { Confederation, CountryCode } from './contract.ts';

/**
 * Trigramas FIFA do catálogo → bandeira local (ISO 3166-1 alfa-2, ou subdivisão britânica) e confederação.
 * O nome em português vem do próprio sistema (`Intl.DisplayNames`), sem tabela de traduções.
 */
const TABLE: Record<CountryCode, [flag: string, confederation: Confederation]> = {
	alb: ['al', 'UEFA'], alg: ['dz', 'CAF'], ang: ['ao', 'CAF'], arg: ['ar', 'CONMEBOL'], arm: ['am', 'UEFA'],
	aus: ['au', 'AFC'], aut: ['at', 'UEFA'], aze: ['az', 'UEFA'], bel: ['be', 'UEFA'], bih: ['ba', 'UEFA'],
	blr: ['by', 'UEFA'], blz: ['bz', 'CONCACAF'], bol: ['bo', 'CONMEBOL'], bra: ['br', 'CONMEBOL'], bul: ['bg', 'UEFA'],
	can: ['ca', 'CONCACAF'], cgo: ['cg', 'CAF'], chi: ['cl', 'CONMEBOL'], chn: ['cn', 'AFC'], civ: ['ci', 'CAF'],
	cmr: ['cm', 'CAF'], cod: ['cd', 'CAF'], col: ['co', 'CONMEBOL'], crc: ['cr', 'CONCACAF'], cro: ['hr', 'UEFA'],
	cub: ['cu', 'CONCACAF'], cyp: ['cy', 'UEFA'], cze: ['cz', 'UEFA'], den: ['dk', 'UEFA'], dom: ['do', 'CONCACAF'],
	ecu: ['ec', 'CONMEBOL'], egy: ['eg', 'CAF'], eng: ['gb-eng', 'UEFA'], esp: ['es', 'UEFA'], est: ['ee', 'UEFA'],
	eth: ['et', 'CAF'], fij: ['fj', 'OFC'], fin: ['fi', 'UEFA'], fra: ['fr', 'UEFA'], fro: ['fo', 'UEFA'],
	geo: ['ge', 'UEFA'], ger: ['de', 'UEFA'], gha: ['gh', 'CAF'], gib: ['gi', 'UEFA'], gre: ['gr', 'UEFA'],
	gua: ['gt', 'CONCACAF'], gui: ['gn', 'CAF'], hai: ['ht', 'CONCACAF'], hkg: ['hk', 'AFC'], hon: ['hn', 'CONCACAF'],
	hun: ['hu', 'UEFA'], idn: ['id', 'AFC'], ind: ['in', 'AFC'], irl: ['ie', 'UEFA'], irn: ['ir', 'AFC'],
	irq: ['iq', 'AFC'], isl: ['is', 'UEFA'], isr: ['il', 'UEFA'], ita: ['it', 'UEFA'], jam: ['jm', 'CONCACAF'],
	jor: ['jo', 'AFC'], jpn: ['jp', 'AFC'], kor: ['kr', 'AFC'], ksa: ['sa', 'AFC'], kvx: ['xk', 'UEFA'],
	lbn: ['lb', 'AFC'], lby: ['ly', 'CAF'], lie: ['li', 'UEFA'], ltu: ['lt', 'UEFA'], lux: ['lu', 'UEFA'],
	lva: ['lv', 'UEFA'], mar: ['ma', 'CAF'], mas: ['my', 'AFC'], mda: ['md', 'UEFA'], mex: ['mx', 'CONCACAF'],
	mkd: ['mk', 'UEFA'], mli: ['ml', 'CAF'], mlt: ['mt', 'UEFA'], mne: ['me', 'UEFA'], moz: ['mz', 'CAF'],
	mya: ['mm', 'AFC'], nca: ['ni', 'CONCACAF'], ncl: ['nc', 'OFC'], ned: ['nl', 'UEFA'], nga: ['ng', 'CAF'],
	nir: ['gb-nir', 'UEFA'], nor: ['no', 'UEFA'], nzl: ['nz', 'OFC'], pan: ['pa', 'CONCACAF'], par: ['py', 'CONMEBOL'],
	per: ['pe', 'CONMEBOL'], phi: ['ph', 'AFC'], png: ['pg', 'OFC'], pol: ['pl', 'UEFA'], por: ['pt', 'UEFA'],
	prk: ['kp', 'AFC'], qat: ['qa', 'AFC'], rou: ['ro', 'UEFA'], rsa: ['za', 'CAF'], rus: ['ru', 'UEFA'],
	sco: ['gb-sct', 'UEFA'], sdn: ['sd', 'CAF'], sen: ['sn', 'CAF'], sgp: ['sg', 'AFC'], slv: ['sv', 'CONCACAF'],
	smr: ['sm', 'UEFA'], sol: ['sb', 'OFC'], srb: ['rs', 'UEFA'], sui: ['ch', 'UEFA'], svk: ['sk', 'UEFA'],
	svn: ['si', 'UEFA'], swe: ['se', 'UEFA'], syr: ['sy', 'AFC'], tah: ['pf', 'OFC'], tan: ['tz', 'CAF'],
	tha: ['th', 'AFC'], tjk: ['tj', 'AFC'], tri: ['tt', 'CONCACAF'], tun: ['tn', 'CAF'], tur: ['tr', 'UEFA'],
	uae: ['ae', 'AFC'], uga: ['ug', 'CAF'], ukr: ['ua', 'UEFA'], uru: ['uy', 'CONMEBOL'], usa: ['us', 'CONCACAF'],
	uzb: ['uz', 'AFC'], van: ['vu', 'OFC'], ven: ['ve', 'CONMEBOL'], vie: ['vn', 'AFC'], wal: ['gb-wls', 'UEFA'],
	zam: ['zm', 'CAF'], zim: ['zw', 'CAF']
};

/** Nomes que o `Intl` não resolve (subdivisões britânicas e Kosovo, sem código ISO oficial). */
const SPECIAL_NAMES: Record<string, string> = { 'gb-eng': 'Inglaterra', 'gb-sct': 'Escócia', 'gb-wls': 'País de Gales', 'gb-nir': 'Irlanda do Norte', xk: 'Kosovo' };

let names: Intl.DisplayNames | undefined;

export function countryFlag(code: CountryCode): string | null {
	return TABLE[code]?.[0] ?? null;
}

export function countryConfederation(code: CountryCode): Confederation | null {
	return TABLE[code]?.[1] ?? null;
}

export function countryName(code: CountryCode): string {
	const flag = countryFlag(code);
	if (!flag) return code.toUpperCase();
	if (SPECIAL_NAMES[flag]) return SPECIAL_NAMES[flag];
	try {
		names ??= new Intl.DisplayNames(['pt-BR'], { type: 'region' });
		return names.of(flag.toUpperCase()) ?? code.toUpperCase();
	} catch {
		return code.toUpperCase();
	}
}

export const KNOWN_COUNTRIES = Object.keys(TABLE);
