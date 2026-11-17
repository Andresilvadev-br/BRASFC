/**
 * Clubes FICTÍCIOS usados nesta etapa (dados demonstrativos).
 * Nenhum nome, escudo ou cor pertence a clubes reais.
 */
export type CrestShape = 'escudo' | 'circulo' | 'flamula' | 'diamante';
export type CrestPattern = 'liso' | 'listras' | 'faixa' | 'metade';

export interface Club {
	id: string;
	name: string;
	short: string;
	city: string;
	/** 1 (modesto) a 5 (gigante) */
	reputation: number;
	colors: { primary: string; secondary: string; shorts: string; socks: string };
	crest: { shape: CrestShape; pattern: CrestPattern };
	stadium: string;
}

export const CLUBS: readonly Club[] = [
	{ id: 'aurora', name: 'Aurora da Serra FC', short: 'AUR', city: 'Serra Alta', reputation: 5, colors: { primary: '#1F6FEB', secondary: '#F5F7FA', shorts: '#F5F7FA', socks: '#1F6FEB' }, crest: { shape: 'escudo', pattern: 'listras' }, stadium: 'Arena Mirante' },
	{ id: 'tubaroes', name: 'Tubarões do Litoral EC', short: 'TUB', city: 'Porto Claro', reputation: 4, colors: { primary: '#0E7490', secondary: '#E2E8F0', shorts: '#0F172A', socks: '#0E7490' }, crest: { shape: 'circulo', pattern: 'faixa' }, stadium: 'Estádio da Maré' },
	{ id: 'cerrado', name: 'Real Cerrado', short: 'RCE', city: 'Vereda Grande', reputation: 4, colors: { primary: '#B45309', secondary: '#FDE68A', shorts: '#1C1917', socks: '#B45309' }, crest: { shape: 'escudo', pattern: 'metade' }, stadium: 'Estádio Buriti' },
	{ id: 'ribeirinha', name: 'União Ribeirinha', short: 'URI', city: 'Barra do Rio', reputation: 3, colors: { primary: '#15803D', secondary: '#FFFFFF', shorts: '#FFFFFF', socks: '#15803D' }, crest: { shape: 'flamula', pattern: 'listras' }, stadium: 'Estádio das Margens' },
	{ id: 'valeverde', name: 'Sport Vale Verde', short: 'SVV', city: 'Vale Verde', reputation: 3, colors: { primary: '#166534', secondary: '#FACC15', shorts: '#166534', socks: '#FACC15' }, crest: { shape: 'escudo', pattern: 'faixa' }, stadium: 'Campo do Vale' },
	{ id: 'ventania', name: 'Atlético Ventania', short: 'VEN', city: 'Ventania', reputation: 4, colors: { primary: '#111827', secondary: '#F9FAFB', shorts: '#111827', socks: '#F9FAFB' }, crest: { shape: 'escudo', pattern: 'listras' }, stadium: 'Arena dos Ventos' },
	{ id: 'sertao', name: 'Estrela do Sertão', short: 'EST', city: 'Pedra Branca', reputation: 3, colors: { primary: '#DC2626', secondary: '#FEF3C7', shorts: '#FEF3C7', socks: '#DC2626' }, crest: { shape: 'diamante', pattern: 'liso' }, stadium: 'Estádio Mandacaru' },
	{ id: 'pinheiral', name: 'Pinheiral FC', short: 'PIN', city: 'Pinheiral', reputation: 2, colors: { primary: '#14532D', secondary: '#D1FAE5', shorts: '#F8FAFC', socks: '#14532D' }, crest: { shape: 'circulo', pattern: 'liso' }, stadium: 'Estádio das Araucárias' },
	{ id: 'ipe', name: 'Ipê Amarelo EC', short: 'IPE', city: 'Florada', reputation: 2, colors: { primary: '#EAB308', secondary: '#1E3A8A', shorts: '#1E3A8A', socks: '#EAB308' }, crest: { shape: 'escudo', pattern: 'metade' }, stadium: 'Estádio da Florada' },
	{ id: 'marealta', name: 'Maré Alta FC', short: 'MAR', city: 'Enseada', reputation: 3, colors: { primary: '#0369A1', secondary: '#F0F9FF', shorts: '#F0F9FF', socks: '#0369A1' }, crest: { shape: 'flamula', pattern: 'faixa' }, stadium: 'Estádio Farol' },
	{ id: 'coroados', name: 'Coroados SC', short: 'COR', city: 'Monte Real', reputation: 5, colors: { primary: '#7C2D12', secondary: '#FCD34D', shorts: '#FFFFFF', socks: '#7C2D12' }, crest: { shape: 'escudo', pattern: 'liso' }, stadium: 'Arena Coroa' },
	{ id: 'juriti', name: 'Juriti FC', short: 'JUR', city: 'Campo Lindo', reputation: 1, colors: { primary: '#9333EA', secondary: '#FFFFFF', shorts: '#FFFFFF', socks: '#9333EA' }, crest: { shape: 'circulo', pattern: 'metade' }, stadium: 'Campo Juriti' },
	{ id: 'mangueiral', name: 'Mangueiral EC', short: 'MAN', city: 'Mangueiral', reputation: 2, colors: { primary: '#EA580C', secondary: '#14532D', shorts: '#14532D', socks: '#EA580C' }, crest: { shape: 'escudo', pattern: 'faixa' }, stadium: 'Estádio do Pomar' },
	{ id: 'carcaras', name: 'Carcarás do Norte', short: 'CAR', city: 'Alto Norte', reputation: 3, colors: { primary: '#334155', secondary: '#F97316', shorts: '#334155', socks: '#F97316' }, crest: { shape: 'diamante', pattern: 'faixa' }, stadium: 'Ninho do Carcará' },
	{ id: 'brisamar', name: 'Brisa Mar FC', short: 'BRI', city: 'Costa Azul', reputation: 2, colors: { primary: '#06B6D4', secondary: '#FFFFFF', shorts: '#164E63', socks: '#FFFFFF' }, crest: { shape: 'circulo', pattern: 'listras' }, stadium: 'Estádio Brisa' },
	{ id: 'lobos', name: 'Lobos da Campanha', short: 'LOB', city: 'Campanha', reputation: 3, colors: { primary: '#991B1B', secondary: '#E5E7EB', shorts: '#111827', socks: '#991B1B' }, crest: { shape: 'escudo', pattern: 'metade' }, stadium: 'Toca dos Lobos' },
	{ id: 'cachoeira', name: 'Cachoeira Azul', short: 'CAZ', city: 'Cachoeira', reputation: 2, colors: { primary: '#2563EB', secondary: '#BFDBFE', shorts: '#FFFFFF', socks: '#2563EB' }, crest: { shape: 'flamula', pattern: 'liso' }, stadium: 'Estádio das Águas' },
	{ id: 'jequitiba', name: 'Jequitibá SC', short: 'JEQ', city: 'Mata Alta', reputation: 1, colors: { primary: '#365314', secondary: '#ECFCCB', shorts: '#365314', socks: '#ECFCCB' }, crest: { shape: 'escudo', pattern: 'listras' }, stadium: 'Campo do Jequitibá' },
	{ id: 'fenix', name: 'Fênix Dourada FC', short: 'FEN', city: 'Nova Brasa', reputation: 4, colors: { primary: '#0F172A', secondary: '#E8B86A', shorts: '#0F172A', socks: '#E8B86A' }, crest: { shape: 'diamante', pattern: 'metade' }, stadium: 'Arena Fênix' },
	{ id: 'araras', name: 'Araras EC', short: 'ARA', city: 'Palmeiral', reputation: 1, colors: { primary: '#BE123C', secondary: '#2563EB', shorts: '#FFFFFF', socks: '#BE123C' }, crest: { shape: 'circulo', pattern: 'faixa' }, stadium: 'Estádio das Araras' }
];

const BY_ID = new Map(CLUBS.map((c) => [c.id, c]));

export function getClub(id: string): Club | undefined {
	return BY_ID.get(id);
}

export function requireClub(id: string): Club {
	const club = BY_ID.get(id);
	if (!club) throw new Error(`Clube desconhecido: ${id}`);
	return club;
}

export const LEAGUE = {
	id: 'liga-brasfc',
	name: 'Liga BRASFC',
	shortName: 'Liga',
	season: 2027
} as const;
