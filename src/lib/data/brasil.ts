import { registerClubs, type Club, type CrestShape } from '#lib/domain/clubs.ts';
import clubesRaw from './brasil/2026/clubes.json' with { type: 'json' };
import correcoesRaw from './brasil/2026/correcoes.json' with { type: 'json' };
import fontesRaw from './brasil/2026/fontes.json' with { type: 'json' };
import identidadeRaw from './brasil/2026/identidade.json' with { type: 'json' };
import temporadaRaw from './brasil/2026/temporada.json' with { type: 'json' };
import serieDRaw from './brasil/2026/serie-d.json' with { type: 'json' };
import copaRaw from './brasil/2026/copa-do-brasil.json' with { type: 'json' };
import { divisionRule } from '#lib/domain/rules.ts';

/**
 * Base de clubes brasileiros — temporada 2026.
 * Regras: só dados verificáveis; o que não foi conferido fica `null` e listado em `pendencias`.
 * Dados esportivos (aqui) ficam separados da identidade visual (identidade.json), que não traz escudos.
 */
/** A–D: divisões nacionais 2026; E: clube de competição estadual (fora das séries nacionais em 2026). */
export type Serie = 'A' | 'B' | 'C' | 'D' | 'E';

export interface RealClub {
	id: string;
	nome: string;
	sigla: string;
	serie: Serie;
	cidade: string | null;
	uf: string | null;
	estadio: string | null;
	tecnico: string | null;
	/** estimativa própria do BRASFC (1–5), usada para gerar a força do elenco pendente */
	forcaEstimada: number;
	pendencias: string[];
	fontes: string[];
}

export interface Fonte {
	id: string;
	veiculo: string;
	titulo: string;
	url: string;
	publicadoEm: string;
	consultadoEm: string;
	usadoPara: string[];
}

export interface Identidade {
	cores: { primaria: string; secundaria: string } | null;
	status: string;
	escudo: { path: string; source: string; permission: string } | null;
}

/** Correção manual: altera um campo de um clube, com justificativa e fonte. */
export interface Correcao {
	clube: string;
	campo: 'nome' | 'sigla' | 'cidade' | 'uf' | 'estadio' | 'tecnico' | 'forcaEstimada' | 'serie';
	valor: string | number | null;
	fonte: string;
	motivo: string;
}

export interface RegraSerie {
	formato: 'pontos-corridos' | 'primeira-fase-mais-grupos';
	turnos: number;
	promovidos?: number;
	rebaixados?: number;
	classificados?: number;
	grupos?: number;
	fonte: string | null;
	status: string;
}

export interface Temporada {
	temporada: number;
	versaoDados: string;
	atualizadoEm: string;
	aviso: string;
	competicoes: Array<{ id: string; nome: string; clubes: string[] }>;
	regras?: Record<'serie-a' | 'serie-b' | 'serie-c', RegraSerie>;
}

export interface ValidationIssue {
	nivel: 'erro' | 'aviso';
	clube?: string;
	mensagem: string;
}

const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
const COLOR = /^#[0-9A-Fa-f]{6}$/;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Valida a base inteira. Erros impedem a importação; avisos só informam. */
export function validateDataset(clubes: RealClub[], fontes: Fonte[], identidade: Record<string, Identidade>, temporada: Temporada, correcoes: Correcao[] = []): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	const err = (mensagem: string, clube?: string) => issues.push({ nivel: 'erro', mensagem, ...(clube ? { clube } : {}) });
	const warn = (mensagem: string, clube?: string) => issues.push({ nivel: 'aviso', mensagem, ...(clube ? { clube } : {}) });
	const fonteIds = new Set(fontes.map((f) => f.id));
	for (const f of fontes) if (!/^https:\/\//.test(f.url)) err(`Fonte ${f.id} sem URL https`);
	const ids = new Set<string>();
	const siglas = new Set<string>();
	for (const c of clubes) {
		if (!ID.test(c.id)) err(`ID inválido "${c.id}"`, c.id);
		if (ids.has(c.id)) err('ID duplicado', c.id);
		ids.add(c.id);
		if (siglas.has(c.sigla)) err(`Sigla duplicada ${c.sigla}`, c.id);
		siglas.add(c.sigla);
		if (!c.nome?.trim()) err('Nome vazio', c.id);
		if (!['A', 'B', 'C', 'D', 'E'].includes(c.serie)) err(`Série inválida ${c.serie}`, c.id);
		if (c.uf !== null && !UFS.has(c.uf)) err(`UF inválida ${c.uf}`, c.id);
		if (!Number.isInteger(c.forcaEstimada) || c.forcaEstimada < 1 || c.forcaEstimada > 5) err('forcaEstimada fora de 1–5', c.id);
		if (!c.fontes.length) err('Clube sem fonte', c.id);
		for (const f of c.fontes) if (!fonteIds.has(f)) err(`Fonte desconhecida ${f}`, c.id);
		for (const campo of ['cidade', 'uf', 'estadio', 'tecnico'] as const) {
			if (c[campo] === null && !c.pendencias.includes(campo === 'uf' ? 'cidade' : campo)) err(`Campo ${campo} nulo sem estar em pendências`, c.id);
		}
		const id = identidade[c.id];
		if (!id) err('Sem registro de identidade visual', c.id);
		else if (id.cores && (!COLOR.test(id.cores.primaria) || !COLOR.test(id.cores.secundaria))) err('Cor inválida', c.id);
		else if (!id.cores) warn('Cores pendentes (usará cores neutras)', c.id);
		if (id?.escudo && (!/^\/escudos\/[a-z0-9.-]+\.(png|webp|svg)$/.test(id.escudo.path) || !id.escudo.source.startsWith('https://') || !id.escudo.permission.trim())) {
			err('Escudo sem caminho local, fonte ou permissão válida', c.id);
		}
	}
	for (const comp of temporada.competicoes) {
		const esperado = divisionRule(comp.id as 'serie-a', temporada.temporada).size;
		if (comp.clubes.length !== esperado) err(`${comp.nome} com ${comp.clubes.length} clubes (esperado ${esperado})`);
		for (const id of comp.clubes) if (!ids.has(id)) err(`${comp.nome} cita clube inexistente ${id}`);
	}
	const all = temporada.competicoes.flatMap((c) => c.clubes);
	if (new Set(all).size !== all.length) err('Clube em mais de uma competição');
	const bySerie = new Map(clubes.map((c) => [c.id, c.serie]));
	for (const comp of temporada.competicoes) {
		const serie = comp.id.replace('serie-', '').toUpperCase();
		for (const id of comp.clubes) if (bySerie.get(id) !== serie) err(`${comp.nome} cita clube da Série ${bySerie.get(id)}`, id);
	}
	for (const k of correcoes) {
		if (!ids.has(k.clube)) err(`Correção para clube inexistente ${k.clube}`);
		if (!fonteIds.has(k.fonte)) err(`Correção sem fonte registrada (${k.fonte})`, k.clube);
	}
	return issues;
}

/** Aplica correções manuais (última vence) e retira o campo das pendências. */
export function applyCorrections(clubes: RealClub[], correcoes: Correcao[]): RealClub[] {
	const out = clubes.map((c) => ({ ...c, pendencias: [...c.pendencias], fontes: [...c.fontes] }));
	const byId = new Map(out.map((c) => [c.id, c]));
	for (const k of correcoes) {
		const c = byId.get(k.clube);
		if (!c) continue;
		(c as unknown as Record<string, unknown>)[k.campo] = k.valor;
		if (k.valor !== null) c.pendencias = c.pendencias.filter((p) => p !== k.campo);
		if (!c.fontes.includes(k.fonte)) c.fontes.push(k.fonte);
	}
	return out;
}

export interface SerieD {
	temporada: number;
	fonte: string;
	grupos: string[][];
	verificacao: string;
	campeao: string;
	vice: string;
	acessos: string[];
}

export interface CopaDoBrasilBase {
	temporada: number;
	fontes: string[];
	participantes: Array<{ fase: 1 | 2 | 3 | 5; clube: string }>;
}

export const FONTES = fontesRaw as Fonte[];
export const IDENTIDADE = identidadeRaw as Record<string, Identidade>;
export const SERIE_D_2026 = serieDRaw as SerieD;
export const COPA_2026 = copaRaw as CopaDoBrasilBase;
const temporadaBase = temporadaRaw as Temporada;
/** Temporada 2026 com a Série D (96 clubes, grupos da fonte) junto das Séries A, B e C. */
export const TEMPORADA_2026: Temporada = {
	...temporadaBase,
	competicoes: [...temporadaBase.competicoes, { id: 'serie-d', nome: 'Série D', clubes: SERIE_D_2026.grupos.flat() }]
};
export const CORRECOES = correcoesRaw as Correcao[];
export const CLUBES_2026: RealClub[] = applyCorrections(clubesRaw as RealClub[], CORRECOES);
const realClubById = new Map(CLUBES_2026.map((club) => [club.id, club]));
export const DATASET_ISSUES = validateDataset(CLUBES_2026, FONTES, IDENTIDADE, TEMPORADA_2026, CORRECOES);

/** Cores PROVISÓRIAS (geradas pelo BRASFC) para clubes sem cores conferidas: nunca apresentadas como oficiais. */
export function provisionalColors(id: string): { primaria: string; secundaria: string } {
	let h = 0;
	for (const ch of id) h = (h * 131 + ch.charCodeAt(0)) >>> 0;
	const hue = h % 360;
	const light = 34 + ((h >> 9) % 18);
	const hsl = (hh: number, ss: number, ll: number) => {
		const a = (ss / 100) * Math.min(ll / 100, 1 - ll / 100);
		const f = (n: number) => {
			const k = (n + hh / 30) % 12;
			const c = ll / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
			return Math.round(c * 255).toString(16).padStart(2, '0');
		};
		return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
	};
	return { primaria: hsl(hue, 58, light), secundaria: (h >> 5) % 3 === 0 ? '#111111' : '#F2F2F2' };
}

/** Desconto de força do elenco gerado por nível (D e estaduais abaixo da Série C). */
const TIER: Record<Serie, number> = { A: 0, B: 0, C: 0, D: -3, E: -5 };
const SHAPES: CrestShape[] = ['escudo', 'circulo', 'flamula', 'diamante'];

/** Converte para o formato usado pelo jogo. Escudo: genérico (nenhuma marca protegida). */
export function toGameClub(c: RealClub): Club {
	const conferidas = IDENTIDADE[c.id]?.cores ?? null;
	const cores = conferidas ?? provisionalColors(c.id);
	let h = 0;
	for (const ch of c.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
	return {
		id: c.id,
		name: c.nome,
		short: c.sigla,
		city: c.cidade ?? 'Cidade pendente',
		reputation: c.forcaEstimada,
		colors: { primary: cores.primaria, secondary: cores.secundaria, shorts: cores.secundaria, socks: cores.primaria },
		crest: { shape: SHAPES[h % SHAPES.length], pattern: 'liso' },
		stadium: c.estadio ?? 'Estádio pendente',
		...(TIER[c.serie] ? { tier: TIER[c.serie] } : {}),
		...(conferidas ? {} : { colorsProvisional: true })
	};
}

registerClubs(CLUBES_2026.map(toGameClub));

export function realClub(id: string): RealClub | undefined {
	return realClubById.get(id);
}
