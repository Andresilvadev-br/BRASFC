import type { Position } from '#lib/domain/positions.ts';
import type { AttributeKey, Attributes } from './attributes.ts';

/**
 * Funções individuais (Dev 0.3). Cada função muda ONDE o atleta se posiciona e O QUE
 * ele prefere fazer com a bola — e exige atributos específicos. Um atleta pode jogar
 * fora da função ideal, mas decide pior (ver `roleCompatibility` e o motor).
 */
export type RoleId =
	| 'gk-tradicional' | 'gk-libero'
	| 'zag-tradicional' | 'zag-construtor'
	| 'lat-defensivo' | 'lat-ofensivo' | 'ala'
	| 'vol-marcador' | 'vol-construtor'
	| 'mc-organizador' | 'mc-area-a-area' | 'mc-infiltrador'
	| 'mei-armador' | 'mei-infiltrador'
	| 'pt-classico' | 'pt-invertido' | 'pt-interior'
	| 'ata-referencia' | 'ata-movel' | 'ata-falso9';

export interface RoleDef {
	id: RoleId;
	label: string;
	/** posições (do esquema) em que a função faz sentido */
	positions: Position[];
	/** atributos que mais importam, com peso */
	key: Partial<Record<AttributeKey, number>>;
	/** deslocamento de posicionamento (m): profundidade em posse, sem posse, aproximação do centro */
	space: { attack: number; defend: number; narrow: number };
	/** multiplicadores de decisão com a bola */
	bias: { shoot: number; dribble: number; cross: number; progress: number; safe: number; run: number };
	summary: string;
	risk: string;
}

const B = { shoot: 1, dribble: 1, cross: 1, progress: 1, safe: 1, run: 1 };

export const ROLES: Record<RoleId, RoleDef> = {
	'gk-tradicional': { id: 'gk-tradicional', label: 'Goleiro tradicional', positions: ['GOL'], key: { reflexos: 3, posicionamentoGol: 3, defesa: 2, jogoAereo: 1 }, space: { attack: 0, defend: 0, narrow: 0 }, bias: { ...B, safe: 1.2 }, summary: 'Fica sob as traves e prioriza a defesa.', risk: 'Pouco ajuda contra bolas nas costas da defesa.' },
	'gk-libero': { id: 'gk-libero', label: 'Goleiro-líbero', positions: ['GOL'], key: { saidas: 3, reposicao: 2, passe: 2, velocidade: 1, decisoes: 1 }, space: { attack: 9, defend: 5, narrow: 0 }, bias: { ...B, progress: 1.2 }, summary: 'Joga adiantado, corta lançamentos e participa da saída.', risk: 'Fica exposto a chutes de longe e erros na saída.' },
	'zag-tradicional': { id: 'zag-tradicional', label: 'Zagueiro tradicional', positions: ['ZAG'], key: { desarme: 3, cabeceio: 2, posicionamento: 2, forca: 2 }, space: { attack: -2, defend: -1, narrow: 0 }, bias: { ...B, safe: 1.3, progress: 0.8, dribble: 0.6 }, summary: 'Protege a área, ganha pelo alto e joga simples.', risk: 'Contribui pouco para a construção.' },
	'zag-construtor': { id: 'zag-construtor', label: 'Zagueiro construtor', positions: ['ZAG'], key: { passe: 3, visao: 2, compostura: 2, desarme: 2 }, space: { attack: 2, defend: 0, narrow: 0 }, bias: { ...B, progress: 1.25, safe: 0.95 }, summary: 'Inicia jogadas com passes verticais.', risk: 'Uma perda na saída vira chance clara do rival.' },
	'lat-defensivo': { id: 'lat-defensivo', label: 'Lateral defensivo', positions: ['LD', 'LE'], key: { desarme: 3, posicionamento: 2, velocidade: 1, concentracao: 1 }, space: { attack: -6, defend: -1, narrow: 2 }, bias: { ...B, cross: 0.7, safe: 1.2 }, summary: 'Fica atrás e fecha o corredor.', risk: 'O time perde amplitude no ataque.' },
	'lat-ofensivo': { id: 'lat-ofensivo', label: 'Lateral ofensivo', positions: ['LD', 'LE'], key: { cruzamento: 3, velocidade: 2, resistencia: 2, drible: 1 }, space: { attack: 6, defend: 0, narrow: 0 }, bias: { ...B, cross: 1.3, progress: 1.15 }, summary: 'Apoia, cruza e dá amplitude.', risk: 'Deixa espaço nas costas para o contra-ataque.' },
	ala: { id: 'ala', label: 'Ala', positions: ['LD', 'LE'], key: { resistencia: 3, velocidade: 2, cruzamento: 2, drible: 1 }, space: { attack: 11, defend: 2, narrow: -1 }, bias: { ...B, cross: 1.35, dribble: 1.15, progress: 1.2 }, summary: 'Ocupa todo o corredor, quase como ponta.', risk: 'Cansa rápido e expõe a defesa.' },
	'vol-marcador': { id: 'vol-marcador', label: 'Volante marcador', positions: ['VOL', 'MC'], key: { desarme: 3, posicionamento: 2, antecipacao: 2, resistencia: 1 }, space: { attack: -5, defend: -2, narrow: 3 }, bias: { ...B, safe: 1.3, progress: 0.85, shoot: 0.5, dribble: 0.6 }, summary: 'Protege a zaga e rouba bolas.', risk: 'Pouca criação a partir do meio.' },
	'vol-construtor': { id: 'vol-construtor', label: 'Organizador recuado', positions: ['VOL', 'MC'], key: { passe: 3, visao: 3, compostura: 2, decisoes: 1 }, space: { attack: -3, defend: -1, narrow: 3 }, bias: { ...B, progress: 1.25, shoot: 0.6 }, summary: 'Dita o ritmo de trás com passes longos e verticais.', risk: 'Marcado de perto, a saída trava.' },
	'mc-organizador': { id: 'mc-organizador', label: 'Construtor', positions: ['MC', 'VOL', 'MEI'], key: { passe: 3, visao: 2, tecnica: 2, decisoes: 2 }, space: { attack: 0, defend: 0, narrow: 2 }, bias: { ...B, progress: 1.15, safe: 1.05 }, summary: 'Faz a bola circular e liga defesa e ataque.', risk: 'Pouca chegada à área.' },
	'mc-area-a-area': { id: 'mc-area-a-area', label: 'Área a área', positions: ['MC'], key: { resistencia: 3, desarme: 1, passe: 1, finalizacao: 1, trabalhoEquipe: 2 }, space: { attack: 5, defend: -1, narrow: 0 }, bias: { ...B, shoot: 1.15, run: 1.2 }, summary: 'Defende e chega à área adversária.', risk: 'Cansa e pode deixar o meio desprotegido.' },
	'mc-infiltrador': { id: 'mc-infiltrador', label: 'Meia infiltrador', positions: ['MC', 'MEI'], key: { antecipacao: 3, finalizacao: 2, velocidade: 1, compostura: 1 }, space: { attack: 9, defend: 1, narrow: 2 }, bias: { ...B, shoot: 1.3, run: 1.4, safe: 0.9 }, summary: 'Entra na área vindo de trás.', risk: 'Abre um buraco no meio quando o time perde a bola.' },
	'mei-armador': { id: 'mei-armador', label: 'Armador avançado', positions: ['MEI', 'MC'], key: { visao: 3, passe: 3, tecnica: 2, drible: 1 }, space: { attack: 2, defend: 1, narrow: 3 }, bias: { ...B, progress: 1.3, shoot: 0.9 }, summary: 'Cria as chances entre as linhas.', risk: 'Marca pouco.' },
	'mei-infiltrador': { id: 'mei-infiltrador', label: 'Meia-atacante infiltrador', positions: ['MEI'], key: { antecipacao: 3, finalizacao: 2, drible: 1, aceleracao: 1 }, space: { attack: 7, defend: 2, narrow: 2 }, bias: { ...B, shoot: 1.35, run: 1.4 }, summary: 'Ataca o espaço como um segundo atacante.', risk: 'Some da construção.' },
	'pt-classico': { id: 'pt-classico', label: 'Ponta clássico', positions: ['PD', 'PE'], key: { cruzamento: 3, velocidade: 2, drible: 2 }, space: { attack: 2, defend: 0, narrow: -3 }, bias: { ...B, cross: 1.4, dribble: 1.1, shoot: 0.85 }, summary: 'Fica aberto, vai à linha de fundo e cruza.', risk: 'Depende de gente na área.' },
	'pt-invertido': { id: 'pt-invertido', label: 'Ponta invertido', positions: ['PD', 'PE'], key: { drible: 3, finalizacao: 2, tecnica: 2, aceleracao: 1 }, space: { attack: 2, defend: 0, narrow: 7 }, bias: { ...B, shoot: 1.3, dribble: 1.2, cross: 0.6 }, summary: 'Corta para dentro e finaliza com a perna boa.', risk: 'Precisa do lateral para dar amplitude.' },
	'pt-interior': { id: 'pt-interior', label: 'Atacante interior', positions: ['PD', 'PE', 'MEI'], key: { finalizacao: 3, antecipacao: 2, velocidade: 2 }, space: { attack: 6, defend: 1, narrow: 9 }, bias: { ...B, shoot: 1.35, run: 1.35, cross: 0.5 }, summary: 'Ataca a área pela diagonal.', risk: 'Some do corredor e o time fica estreito.' },
	'ata-referencia': { id: 'ata-referencia', label: 'Centroavante de referência', positions: ['ATA'], key: { cabeceio: 3, forca: 3, finalizacao: 2, dominio: 1 }, space: { attack: 1, defend: 2, narrow: 3 }, bias: { ...B, run: 0.7, shoot: 1.1, safe: 1.1 }, summary: 'Segura a bola, briga pelo alto e finaliza na área.', risk: 'Pouco útil contra linhas altas e rápidas.' },
	'ata-movel': { id: 'ata-movel', label: 'Atacante móvel', positions: ['ATA'], key: { velocidade: 3, antecipacao: 2, finalizacao: 2, aceleracao: 1 }, space: { attack: 3, defend: 1, narrow: 0 }, bias: { ...B, run: 1.45, dribble: 1.1 }, summary: 'Ataca a profundidade e se movimenta muito.', risk: 'Contra bloco baixo, falta espaço e sobra impedimento.' },
	'ata-falso9': { id: 'ata-falso9', label: 'Falso 9', positions: ['ATA', 'MEI'], key: { visao: 3, passe: 2, tecnica: 2, drible: 2 }, space: { attack: -7, defend: 0, narrow: 2 }, bias: { ...B, progress: 1.25, run: 0.5, shoot: 0.85 }, summary: 'Recua para criar e arrasta os zagueiros.', risk: 'Sem ninguém atacando a área, falta finalizador.' }
};

export const ROLE_IDS = Object.keys(ROLES) as RoleId[];

/** Função padrão de cada posição do esquema. */
export const DEFAULT_ROLE: Record<Position, RoleId> = {
	GOL: 'gk-tradicional', ZAG: 'zag-tradicional', LD: 'lat-ofensivo', LE: 'lat-ofensivo', VOL: 'vol-marcador',
	MC: 'mc-organizador', MEI: 'mei-armador', PD: 'pt-invertido', PE: 'pt-invertido', ATA: 'ata-referencia'
};

/**
 * Função padrão de um slot do esquema: com dois atacantes, o segundo é móvel
 * (ataca a profundidade) para a dupla não ocupar o mesmo espaço.
 */
export function defaultRoleForSlot(shape: ReadonlyArray<{ position: Position }>, i: number): RoleId {
	const pos = shape[i].position;
	if (pos === 'ATA' && shape.slice(0, i).some((s) => s.position === 'ATA')) return 'ata-movel';
	return DEFAULT_ROLE[pos];
}

export function rolesFor(position: Position): RoleDef[] {
	return ROLE_IDS.map((id) => ROLES[id]).filter((r) => r.positions.includes(position));
}

export function isRoleId(v: unknown): v is RoleId {
	return typeof v === 'string' && v in ROLES;
}

/**
 * Compatibilidade 0–100 entre um atleta e uma função: média ponderada dos atributos-chave,
 * escalada em torno do nível geral do atleta (um bom jogador pode ser fraco numa função
 * que pede o que ele não tem). Fora das posições previstas, perde 25 pontos.
 */
export function roleCompatibility(attrs: Attributes, role: RoleId, slotPosition?: Position): number {
	const def = ROLES[role];
	let sum = 0;
	let w = 0;
	for (const [k, wt] of Object.entries(def.key) as Array<[AttributeKey, number]>) {
		sum += attrs[k] * wt;
		w += wt;
	}
	const keyAvg = sum / Math.max(1, w);
	let score = 50 + (keyAvg - 60) * 1.6;
	if (slotPosition && !def.positions.includes(slotPosition)) score -= 25;
	return Math.max(0, Math.min(100, Math.round(score)));
}

/** Melhores funções para o atleta numa posição, com o motivo (atributos mais fortes da função). */
export function recommendRoles(attrs: Attributes, position: Position): Array<{ role: RoleDef; score: number; reason: string }> {
	return rolesFor(position)
		.map((role) => {
			const strongest = (Object.keys(role.key) as AttributeKey[]).sort((a, b) => attrs[b] - attrs[a]).slice(0, 2);
			return { role, score: roleCompatibility(attrs, role.id, position), reason: strongest.map((k) => `${k} ${attrs[k]}`).join(', ') };
		})
		.sort((a, b) => b.score - a.score);
}
