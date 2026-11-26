import type { Career, CareerData } from './career.ts';
import type { Appearance } from './appearance.ts';
import { ctDevelopment } from './club.ts';

/**
 * BRASFC 0.13 · LOCAL LEGACY — carreira local com um ou mais treinadores (turnos, como nos clássicos).
 *
 * Um save = um universo. Cada treinador tem a própria gestão (tática, treino, clube, gabinete…) e o
 * mundo (ligas, Copa, mercado, universo vivo) é um só. O treinador DA VEZ fica "projetado" nos campos
 * de sempre do save (`clubId`, `personName`, `data.tactic`…): todas as telas e regras da carreira
 * individual funcionam sem duplicação. Os demais ficam guardados em `data.local.coaches`.
 * Uma carreira individual é o caso de um treinador só (sem `data.local`).
 */
export const COACH_FIELDS = ['appearance', 'tactic', 'trainingFocus', 'tactical', 'trainingPlan', 'fitness', 'seasons', 'dismissedTips', 'club', 'office', 'coachKnowledge', 'tacticPresets', 'discipline'] as const;
export type CoachField = (typeof COACH_FIELDS)[number];
export type CoachData = Partial<Pick<CareerData, CoachField>>;

export const MAX_LOCAL_COACHES = 8;

export interface CoachSlot {
	id: string;
	personName: string;
	clubId: string;
	/** dados do treinador; o do treinador da vez fica desatualizado aqui (o oficial está no topo do save) */
	data: CoachData;
}

/** Proposta entre dois treinadores humanos (o controle passa ao outro lado até a resposta). */
export interface HumanDeal {
	id: string;
	playerId: string;
	playerName: string;
	/** índices dos treinadores (ordem de criação) */
	buyer: number;
	seller: number;
	sellerClub: string;
	buyerClub: string;
	kind: 'compra' | 'emprestimo';
	fee: number;
	wage: number;
	years: number;
	role: 'titular' | 'rotacao' | 'reserva' | 'jovem';
	wageShare: number;
	/** de quem é a vez de responder */
	turn: number;
	/** quem iniciou (o controle volta para ele no fim) */
	initiator: number;
	history: Array<{ by: number; action: 'proposta' | 'contraproposta' | 'aceita' | 'recusada'; fee: number }>;
	status: 'aberta' | 'concluida' | 'recusada' | 'cancelada';
	message?: string;
	season: number;
	round: number;
}

export interface LocalGroup {
	coaches: CoachSlot[];
	/** índice do treinador no controle */
	active: number;
	/** ids dos treinadores que confirmaram a preparação do passo `step` */
	ready: string[];
	step: string | null;
	/** negociação entre humanos em andamento (no máximo uma por vez) */
	deal?: HumanDeal | null;
	/** desfecho da última negociação, mostrado ao treinador que a iniciou */
	dealResult?: (HumanDeal & { seen?: boolean }) | null;
}

type CareerLike = Pick<Career, 'clubId' | 'personName' | 'data'> & Partial<Pick<Career, 'mode'>>;

export function localGroup(career: Pick<Career, 'data'>): LocalGroup | null {
	const g = career.data.local;
	return g && Array.isArray(g.coaches) && g.coaches.length > 1 ? g : null;
}

/** Carreira com mais de um treinador humano. */
export function isShared(career: Pick<Career, 'data'>): boolean {
	return localGroup(career) !== null;
}

export function coachDataOf(data: CareerData): CoachData {
	const out: CoachData = {};
	for (const f of COACH_FIELDS) if (data[f] !== undefined && data[f] !== null) (out as Record<string, unknown>)[f] = data[f];
	return out;
}

/** Treinadores com o da vez atualizado a partir do topo do save. */
export function liveCoaches(career: CareerLike): CoachSlot[] {
	const g = localGroup(career);
	if (!g) return [{ id: 'solo', personName: career.personName, clubId: career.clubId, data: coachDataOf(career.data) }];
	return g.coaches.map((c, i) => (i === g.active ? { ...c, personName: career.personName, clubId: career.clubId, data: coachDataOf(career.data) } : c));
}

export function activeCoachIndex(career: Pick<Career, 'data'>): number {
	return localGroup(career)?.active ?? 0;
}

export function activeCoachId(career: Pick<Career, 'data'>): string | null {
	const g = localGroup(career);
	return g ? g.coaches[g.active]?.id ?? null : null;
}

/** Dados do save com o treinador `index` no topo (o mundo é o mesmo). */
export function dataForCoach(career: CareerLike, index: number): { personName: string; clubId: string; data: CareerData } {
	const g = localGroup(career);
	if (!g || index === g.active) return { personName: career.personName, clubId: career.clubId, data: career.data };
	const coaches = liveCoaches(career);
	const target = coaches[index];
	if (!target) throw new Error('Treinador inexistente.');
	const data = { ...career.data } as Record<string, unknown>;
	for (const f of COACH_FIELDS) delete data[f];
	Object.assign(data, target.data);
	data.local = { ...g, coaches, active: index };
	return { personName: target.personName, clubId: target.clubId, data: data as CareerData };
}

/** A carreira vista por um dos treinadores (sem gravar nada). */
export function projectCoach<C extends CareerLike>(career: C, index: number): C {
	if (!localGroup(career) || index === activeCoachIndex(career)) return career;
	const d = dataForCoach(career, index);
	return { ...career, personName: d.personName, clubId: d.clubId, data: d.data };
}

/** Desempregado: demitido ou sem contrato (o clube volta para a IA). */
function employed(slot: CoachSlot): boolean {
	return !(slot.data.club as { board?: { dismissed?: boolean } } | undefined)?.board?.dismissed;
}

/**
 * Clubes comandados por humanos → bônus de desenvolvimento do CT de cada um. Esses clubes não
 * recebem jovens automáticos nem renovações da IA, e o elenco de cada um é igual para todos os
 * treinadores (a regra não depende de quem está no controle).
 */
export function humanClubs(career: CareerLike): Record<string, number> {
	if (career.mode === 'player') return {};
	const out: Record<string, number> = {};
	for (const c of liveCoaches(career)) {
		if (!employed(c)) continue;
		const ct = (c.data.club as { infra?: { ct?: { level?: number } } } | undefined)?.infra?.ct?.level ?? 2;
		out[c.clubId] = Math.round(ctDevelopment(ct) * 100) / 100;
	}
	return out;
}

/** Índice do treinador humano (empregado) que comanda o clube, ou -1. */
export function clubOwner(career: CareerLike, clubId: string): number {
	return liveCoaches(career).findIndex((c) => c.clubId === clubId && employed(c));
}

/** Próximo treinador que ainda não confirmou a preparação (na ordem de criação), ou null. */
export function nextUnready(g: LocalGroup, after: number): number | null {
	for (let k = 1; k <= g.coaches.length; k++) {
		const i = (after + k) % g.coaches.length;
		if (!g.ready.includes(g.coaches[i].id)) return i;
	}
	return null;
}

export interface CoachDraft {
	personName: string;
	clubId: string;
	appearance?: Appearance;
}

/** Grupo inicial: treinadores na ordem de criação, o primeiro no controle. */
export function initialGroup(drafts: CoachDraft[], ids: string[]): LocalGroup {
	return {
		coaches: drafts.map((d, i) => ({ id: ids[i], personName: d.personName, clubId: d.clubId, data: { ...(d.appearance ? { appearance: d.appearance } : {}), trainingFocus: 'equilibrado' } })),
		active: 0,
		ready: [],
		step: null,
		deal: null
	};
}

/** Clube para filtrar partidas "do usuário" (só numa carreira com vários treinadores). */
export function sharedClub(career: Pick<Career, 'clubId' | 'data'>): string | null {
	return isShared(career) ? career.clubId : null;
}

/**
 * Remonta o save com alterações em vários treinadores de uma vez (rodada, negociação entre humanos):
 * `patches[i]` vai para os dados do treinador i, `world` para o mundo, e `active` fica no controle.
 */
export function rebuildShared(career: CareerLike, patches: Record<number, Partial<CareerData>>, world: Partial<CareerData>, group: Partial<LocalGroup>, active: number): { personName: string; clubId: string; data: CareerData } {
	const g = localGroup(career);
	if (!g) throw new Error('Carreira sem treinadores locais.');
	const coaches = liveCoaches(career).map((c, i) => (patches[i] ? { ...c, data: mergeCoach(c.data, patches[i]) } : c));
	const data = { ...career.data, ...world, local: { ...g, ...group, coaches } } as CareerData;
	// O topo reflete o treinador que estava no controle; depois troca para quem assume.
	if (patches[g.active]) Object.assign(data, coachDataOf(patches[g.active] as CareerData));
	return dataForCoach({ ...career, data }, active);
}

/** Aplica um patch de campos do treinador (null remove o campo, como na gravação do save). */
function mergeCoach(data: CoachData, patch: Partial<CareerData>): CoachData {
	const out = { ...data } as Record<string, unknown>;
	for (const f of COACH_FIELDS) {
		if (!(f in patch)) continue;
		const v = (patch as Record<string, unknown>)[f];
		if (v === null || v === undefined) delete out[f];
		else out[f] = v;
	}
	return out as CoachData;
}
