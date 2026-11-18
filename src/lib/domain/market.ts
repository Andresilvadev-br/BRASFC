import { computeOverall, generateAttributes, type Attributes } from '#lib/engine/attributes.ts';
import { randomAppearance } from './appearance.ts';
import { getClub } from './clubs.ts';
import type { Position } from './positions.ts';
import { createRng, deriveSeed } from './rng.ts';
import { generateSquad, randomName, squadStrength, type SquadPlayer } from './squad.ts';

/**
 * Mercado, contratos e evolução dos atletas (Dev 0.4).
 *
 * O elenco de cada clube = elenco-base determinístico (gerado pela semente) EVOLUÍDO pelas
 * temporadas (idade, desenvolvimento, aposentadoria, jovens que sobem), mais as alterações
 * PERSISTIDAS da carreira (transferências, empréstimos, renovações, jovens da base).
 * Assim um atleta nunca pertence a dois clubes: o "dono" é o override, se existir; senão, a base.
 *
 * Valores em reais (inteiros). Salários e valores são ESTIMATIVAS DO JOGO (não dados reais).
 */

export type ContractRole = 'titular' | 'rotacao' | 'reserva' | 'jovem';
export const ROLE_LABELS: Record<ContractRole, string> = { titular: 'Titular', rotacao: 'Rotação', reserva: 'Reserva', jovem: 'Jovem promessa' };

export interface Contract {
	/** salário mensal (R$) */
	wage: number;
	/** última temporada do contrato */
	until: number;
	/** participação prometida */
	role: ContractRole;
	/** multa rescisória (R$), quando negociada */
	clause?: number;
}

export interface Loan {
	from: string;
	/** última temporada do empréstimo */
	until: number;
	/** parte do salário paga pelo clube que recebe (0–1) */
	wageShare: number;
}

/** Alteração persistida de um atleta. */
export interface PlayerOverride {
	/** clube atual (null = sem clube) */
	club: string | null;
	contract: Contract | null;
	loan?: Loan;
	/** data da última movimentação */
	since: string;
	/** aposentado pela carreira (ex.: rescisão sem novo clube por muito tempo) */
	retired?: boolean;
}

/** Atleta criado pela carreira (base do usuário ou gerado pelo mundo). */
export interface ExtraPlayer {
	player: SquadPlayer;
	/** temporada em que os números de `player` valem */
	season: number;
	origin: 'base' | 'mundo';
	/** clube formador */
	formedBy: string;
}

export interface MarketState {
	players: Record<string, PlayerOverride>;
	extra: Record<string, ExtraPlayer>;
	/** caixa extra dos clubes da IA (efeito das transferências) */
	clubCash: Record<string, number>;
	/** atletas que o usuário colocou à venda */
	listed: string[];
	/** observados pelo usuário */
	shortlist: string[];
}

export function emptyMarket(): MarketState {
	return { players: {}, extra: {}, clubCash: {}, listed: [], shortlist: [] };
}

export interface RosterPlayer extends SquadPlayer {
	club: string;
	contract: Contract;
	loan?: Loan;
	/** valor de mercado estimado (R$) */
	value: number;
}

// ─────────────────────────────────────────────────────────────── economia por divisão

export type Tier = 'A' | 'B' | 'C' | 'D' | 'E';
/** Salário de referência (R$/mês) por nível do clube, para um atleta no overall de referência. */
const WAGE_BASE: Record<Tier, { base: number; ref: number }> = {
	A: { base: 220_000, ref: 74 },
	B: { base: 50_000, ref: 68 },
	C: { base: 14_000, ref: 64 },
	D: { base: 4_000, ref: 60 },
	E: { base: 2_500, ref: 58 }
};

export function tierOfDivision(div: string | null | undefined): Tier {
	if (div === 'serie-a') return 'A';
	if (div === 'serie-b') return 'B';
	if (div === 'serie-c') return 'C';
	if (div === 'serie-d') return 'D';
	if (div === 'liga-brasfc') return 'B';
	return 'E';
}

/** Salário esperado (R$/mês) para um atleta num clube desse nível. */
export function expectedWage(overall: number, tier: Tier, age = 26): number {
	const w = WAGE_BASE[tier];
	const ageF = age <= 20 ? 0.55 : age <= 23 ? 0.8 : age >= 33 ? 0.85 : 1;
	return roundMoney(w.base * Math.exp(0.14 * (overall - w.ref)) * ageF);
}

/**
 * Valor de mercado (R$): qualidade (exponencial no overall), idade, potencial, contrato e forma.
 * Calibrado para o mercado interno brasileiro do jogo (estimativas do BRASFC).
 */
export function marketValue(p: Pick<SquadPlayer, 'overall' | 'potential' | 'age' | 'condition'>, yearsLeft: number, form = 0): number {
	let v = 30_000 * Math.exp(0.19 * (p.overall - 50));
	const gap = Math.max(0, p.potential - p.overall);
	if (p.age <= 21) v *= 1 + gap * 0.06;
	else if (p.age <= 24) v *= 1 + gap * 0.03;
	else if (p.age >= 33) v *= 0.3;
	else if (p.age >= 31) v *= 0.55;
	else if (p.age >= 29) v *= 0.8;
	v *= yearsLeft <= 0 ? 0.45 : yearsLeft === 1 ? 0.8 : 1;
	v *= 1 + Math.max(-0.15, Math.min(0.15, form * 0.1));
	if (p.condition < 60) v *= 0.9;
	return roundMoney(v);
}

export function roundMoney(v: number): number {
	if (v >= 1_000_000) return Math.round(v / 50_000) * 50_000;
	if (v >= 100_000) return Math.round(v / 5_000) * 5_000;
	return Math.round(v / 500) * 500;
}

// ─────────────────────────────────────────────────────────────── evolução

/** Variação de overall de um atleta numa temporada (determinística). */
export function seasonGrowth(p: Pick<SquadPlayer, 'id' | 'age' | 'overall' | 'potential'>, seed: number, season: number, devBoost = 1): number {
	const r = createRng(deriveSeed(seed, 'evo', p.id, season)).next();
	const gap = Math.max(0, p.potential - p.overall);
	if (p.age <= 21) return Math.round(gap * (0.22 + r * 0.22) * devBoost);
	if (p.age <= 24) return Math.round(gap * (0.12 + r * 0.18) * devBoost);
	if (p.age <= 29) return Math.round(-1 + r * 2.4);
	if (p.age <= 32) return -Math.round(1 + r * 2.2);
	return -Math.round(2 + r * 3);
}

function shiftAttributes(a: Attributes, delta: number): Attributes {
	const out = { ...a };
	for (const k of Object.keys(out) as Array<keyof Attributes>) out[k] = Math.max(15, Math.min(97, out[k] + delta));
	return out;
}

/** Atleta após `years` temporadas (idade, overall e atributos). */
export function evolve(p: SquadPlayer, seed: number, fromSeason: number, toSeason: number, devBoost = 1): SquadPlayer {
	let cur = p;
	for (let s = fromSeason; s < toSeason; s++) {
		const g = seasonGrowth(cur, seed, s, devBoost);
		const attributes = g ? shiftAttributes(cur.attributes, g) : cur.attributes;
		const overall = g ? computeOverall(attributes, cur.position) : cur.overall;
		cur = { ...cur, age: cur.age + 1, attributes, overall, potential: Math.max(cur.potential, overall) };
	}
	return cur;
}

/** O atleta encerra a carreira ao fim desta idade? */
export function retires(p: Pick<SquadPlayer, 'age' | 'overall'>): boolean {
	return p.age >= 37 || (p.age >= 34 && p.overall < 58);
}

// ─────────────────────────────────────────────────────────────── elencos

export interface RosterContext {
	seed: number;
	firstSeason: number;
	season: number;
	market: MarketState;
	/** divisão atual de um clube (para salários e contratos-base) */
	divisionOf: (clubId: string) => string | null;
	/** clube do usuário (não recebe jovens automáticos: tem a base própria) */
	userClub?: string;
	/** bônus de desenvolvimento do CT do usuário */
	userDevBoost?: number;
}

/** Clube de origem de um id de atleta-base ("flamengo-07" → "flamengo"). */
export function originClub(playerId: string): string {
	const i = playerId.lastIndexOf('-');
	return i > 0 ? playerId.slice(0, i) : playerId;
}

const evolved = new Map<string, SquadPlayer[]>();

/** Elenco-base do clube evoluído até a temporada, com jovens que repõem os aposentados (clubes da IA). */
export function evolvedBase(seed: number, clubId: string, firstSeason: number, season: number, autoYouth: boolean, devBoost = 1): SquadPlayer[] {
	const key = `${seed}:${clubId}:${firstSeason}:${season}:${autoYouth ? 1 : 0}:${devBoost}`;
	const hit = evolved.get(key);
	if (hit) return hit;
	let squad = generateSquad(clubId, seed);
	for (let s = firstSeason; s < season; s++) {
		const next: SquadPlayer[] = [];
		const gone: SquadPlayer[] = [];
		for (const p of squad) {
			const e = evolve(p, seed, s, s + 1, devBoost);
			if (retires(e)) gone.push(e);
			else next.push(e);
		}
		if (autoYouth) gone.forEach((g, k) => next.push(regen(seed, clubId, s + 1, k, g.position)));
		squad = next;
	}
	if (evolved.size > 3000) evolved.clear();
	evolved.set(key, squad);
	return squad;
}

/** Jovem gerado pelo mundo (clubes da IA) para repor um aposentado. Nomes fictícios. */
export function regen(seed: number, clubId: string, season: number, k: number, position: Position): SquadPlayer {
	const rng = createRng(deriveSeed(seed, 'regen', clubId, season, k));
	const club = getClub(clubId);
	const rep = club?.reputation ?? 2;
	const age = rng.int(17, 19);
	const target = 48 + rep * 2 + (club?.tier ?? 0) + rng.int(0, 8);
	const { attributes, archetype } = generateAttributes(position, target, rng);
	const overall = computeOverall(attributes, position);
	const n = randomName(rng);
	return {
		id: `${clubId}-j${season}${k}`,
		name: n.name,
		shortName: n.shortName,
		number: 40 + k,
		position,
		age,
		overall,
		potential: Math.min(90, overall + rng.int(6, 22)),
		condition: 100,
		morale: 'boa',
		appearance: randomAppearance(rng),
		attributes,
		archetype
	};
}

/** Contrato-base de um atleta (determinístico): vence entre 0 e 3 temporadas após a primeira. */
export function baseContract(p: SquadPlayer, seed: number, firstSeason: number, season: number, tier: Tier, starter: boolean): Contract {
	const rng = createRng(deriveSeed(seed, 'contrato', p.id));
	let until = firstSeason + rng.int(0, 3);
	// Clubes da IA renovam a maioria (renovações sucessivas, determinísticas).
	while (until < season) until += 2 + (deriveSeed(seed, 'renova', p.id, until) % 2);
	return { wage: expectedWage(p.overall, tier, p.age), until, role: starter ? 'titular' : p.age <= 20 ? 'jovem' : 'rotacao' };
}

/** Id do atleta pertence a qual clube agora? */
export function currentClubOf(ctx: RosterContext, playerId: string): string | null {
	const o = ctx.market.players[playerId];
	if (o) return o.retired ? null : o.club;
	if (ctx.market.extra[playerId]) return ctx.market.extra[playerId].formedBy;
	return originClub(playerId);
}

/** Atleta (evoluído até a temporada) pelo id, onde quer que esteja. */
export function findPlayer(ctx: RosterContext, playerId: string): SquadPlayer | null {
	const extra = ctx.market.extra[playerId];
	if (extra) return evolve(extra.player, ctx.seed, extra.season, ctx.season, ctx.userDevBoost);
	const origin = originClub(playerId);
	if (!getClub(origin)) return null;
	const auto = origin !== ctx.userClub;
	const base = evolvedBase(ctx.seed, origin, ctx.firstSeason, ctx.season, auto, auto ? 1 : (ctx.userDevBoost ?? 1));
	return base.find((p) => p.id === playerId) ?? null;
}

/** Elenco completo do clube na temporada (com contratos e valores). */
export function rosterOf(ctx: RosterContext, clubId: string): RosterPlayer[] {
	const auto = clubId !== ctx.userClub;
	const tier = tierOfDivision(ctx.divisionOf(clubId));
	const base = evolvedBase(ctx.seed, clubId, ctx.firstSeason, ctx.season, auto, auto ? 1 : (ctx.userDevBoost ?? 1));
	const strength = squadStrength(base);
	const out: RosterPlayer[] = [];
	for (const p of base) {
		const o = ctx.market.players[p.id];
		if (o && (o.club !== clubId || o.retired)) continue;
		const contract = o?.contract ?? baseContract(p, ctx.seed, ctx.firstSeason, ctx.season, tier, p.overall >= strength - 2);
		out.push({ ...p, club: clubId, contract, ...(o?.loan ? { loan: o.loan } : {}), value: marketValue(p, contract.until - ctx.season) });
	}
	for (const [id, o] of Object.entries(ctx.market.players)) {
		if (o.club !== clubId || o.retired || out.some((p) => p.id === id)) continue;
		const p = findPlayer(ctx, id);
		if (!p || !o.contract) continue;
		out.push({ ...p, club: clubId, contract: o.contract, ...(o.loan ? { loan: o.loan } : {}), value: marketValue(p, o.contract.until - ctx.season) });
	}
	return out;
}

/** Atletas sem clube: contratos encerrados no mercado da carreira. */
export function freeAgents(ctx: RosterContext): RosterPlayer[] {
	const out: RosterPlayer[] = [];
	for (const [id, o] of Object.entries(ctx.market.players)) {
		if (o.club !== null || o.retired) continue;
		const p = findPlayer(ctx, id);
		if (!p || retires(p)) continue;
		const wage = expectedWage(p.overall, 'C', p.age);
		out.push({ ...p, club: '', contract: { wage, until: ctx.season, role: 'rotacao' }, value: 0 });
	}
	return out;
}

// ─────────────────────────────────────────────────────────────── negociação

export interface NegotiationOffer {
	playerId: string;
	/** valor oferecido ao clube (R$); 0 em empréstimo e jogador livre */
	fee: number;
	kind: 'compra' | 'emprestimo' | 'livre';
	/** proposta ao atleta */
	wage: number;
	years: number;
	role: ContractRole;
	/** empréstimo: parte do salário paga pelo usuário */
	wageShare?: number;
}

export type ClubAnswer = { status: 'aceita'; asking: number } | { status: 'contraproposta'; asking: number; reason: string } | { status: 'recusada'; asking: number; reason: string };
export type PlayerAnswer = { status: 'aceita'; demand: number } | { status: 'recusada'; demand: number; reason: string };

/** Quanto o clube vendedor pede (depende de importância, finanças e vontade do atleta). */
export function askingPrice(player: RosterPlayer, squad: RosterPlayer[], cash: number): number {
	const ranked = [...squad].sort((a, b) => b.overall - a.overall);
	const idx = ranked.findIndex((p) => p.id === player.id);
	let f = 1.1;
	if (idx === 0) f = 1.45;
	else if (idx <= 5) f = 1.25;
	else if (idx > 15) f = 0.95;
	if (player.contract.role === 'reserva') f -= 0.08;
	if (cash < 0) f -= 0.12; // clube endividado aceita vender mais barato
	if (player.contract.clause) return player.contract.clause;
	return roundMoney(player.value * f);
}

/** Resposta do clube dono do atleta. */
export function clubResponse(offer: NegotiationOffer, player: RosterPlayer, squad: RosterPlayer[], cash: number): ClubAnswer {
	const asking = askingPrice(player, squad, cash);
	const samePos = squad.filter((p) => p.position === player.position && p.id !== player.id).length;
	if (offer.kind === 'emprestimo') {
		const starter = player.contract.role === 'titular';
		if (starter) return { status: 'recusada', asking, reason: 'Titular do elenco: o clube não empresta.' };
		if ((offer.wageShare ?? 0) < 0.5) return { status: 'contraproposta', asking, reason: 'O clube exige que você pague ao menos metade do salário.' };
		if (samePos < 1) return { status: 'recusada', asking, reason: 'Sem reposição para a posição.' };
		return { status: 'aceita', asking };
	}
	if (samePos < 1) return { status: 'recusada', asking, reason: 'O clube não tem outro atleta na posição e não vende agora.' };
	if (offer.fee >= asking) return { status: 'aceita', asking };
	if (offer.fee >= asking * 0.75) return { status: 'contraproposta', asking, reason: `O clube aceita por ${formatMoney(asking)}.` };
	return { status: 'recusada', asking, reason: `Proposta muito abaixo do valor pedido (${formatMoney(asking)}).` };
}

/** Salário que o atleta exige para assinar (prestígio, participação, idade, tempo de contrato). */
export function wageDemand(player: Pick<SquadPlayer, 'overall' | 'age'> & { contract?: Contract }, buyerTier: Tier, buyerReputation: number, role: ContractRole, years: number): number {
	let d = expectedWage(player.overall, buyerTier, player.age);
	if (player.contract) d = Math.max(d, player.contract.wage * 1.05);
	d *= 1 + (3 - buyerReputation) * 0.06; // clube menor precisa pagar mais para convencer
	d *= role === 'titular' ? 0.95 : role === 'reserva' ? 1.15 : role === 'jovem' ? 0.9 : 1;
	if (player.age >= 30 && years < 2) d *= 1.12; // veteranos querem segurança
	if (player.age <= 23 && years > 4) d *= 1.05;
	return roundMoney(d);
}

export function playerResponse(offer: NegotiationOffer, player: RosterPlayer, buyerTier: Tier, buyerReputation: number, currentStarter: boolean): PlayerAnswer {
	const demand = wageDemand(player, buyerTier, buyerReputation, offer.role, offer.years);
	if (offer.years < 1 || offer.years > 5) return { status: 'recusada', demand, reason: 'Contratos vão de 1 a 5 temporadas.' };
	if (offer.role === 'titular' && !currentStarter && player.overall < 60) return { status: 'recusada', demand, reason: 'Promessa de titularidade pouco crível para o atleta.' };
	const wage = offer.kind === 'emprestimo' ? player.contract.wage : offer.wage;
	if (offer.kind !== 'emprestimo' && wage < demand) return { status: 'recusada', demand, reason: `O empresário pede ${formatMoney(demand)} por mês.` };
	return { status: 'aceita', demand };
}

export function formatMoney(v: number): string {
	const abs = Math.abs(v);
	const sign = v < 0 ? '−' : '';
	if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: abs >= 10_000_000 ? 0 : 1 })} mi`;
	if (abs >= 1_000) return `${sign}R$ ${(abs / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
	return `${sign}R$ ${abs.toLocaleString('pt-BR')}`;
}

/** Janelas de transferência do BRASFC (aproximação das janelas brasileiras): pré-temporada e meio do ano. */
export function transferWindow(stepRound: number): 'pre-temporada' | 'meio-do-ano' | null {
	if (stepRound <= 8) return 'pre-temporada';
	if (stepRound >= 22 && stepRound <= 27) return 'meio-do-ano';
	return null;
}

// ─────────────────────────────────────────────────────────────── IA do mercado

export interface AiMove {
	playerId: string;
	from: string;
	to: string;
	fee: number;
	wage: number;
	until: number;
	reason: string;
}

const COMPOSITION: Record<Position, number> = { GOL: 3, LD: 2, ZAG: 4, LE: 2, VOL: 3, MC: 3, MEI: 2, PD: 2, PE: 2, ATA: 2 };

/** Posições em que o elenco está abaixo da composição mínima (necessidades). */
export function squadNeeds(squad: SquadPlayer[]): Position[] {
	const count = new Map<Position, number>();
	for (const p of squad) count.set(p.position, (count.get(p.position) ?? 0) + 1);
	return (Object.keys(COMPOSITION) as Position[]).filter((pos) => (count.get(pos) ?? 0) < COMPOSITION[pos]);
}

/**
 * Transferências entre clubes da IA numa semana de janela: clubes com carência numa posição
 * compram de clubes com sobra (ou endividados), dentro do orçamento estimado do nível.
 * Determinístico pela semente + semana. Nunca envolve o clube do usuário.
 */
export function aiTransfers(ctx: RosterContext, clubs: string[], week: string, budgetOf: (clubId: string) => number, max = 3): AiMove[] {
	const rng = createRng(deriveSeed(ctx.seed, 'mercado-ia', ctx.season, week));
	const moves: AiMove[] = [];
	const buyers = rng.shuffle(clubs.filter((c) => c !== ctx.userClub)).slice(0, 24);
	const taken = new Set<string>();
	for (const buyer of buyers) {
		if (moves.length >= max) break;
		const squad = rosterOf(ctx, buyer);
		const needs = squadNeeds(squad);
		const pos = needs.length ? needs[0] : rng.chance(0.25) ? rng.pick(Object.keys(COMPOSITION) as Position[]) : null;
		if (!pos) continue;
		const budget = budgetOf(buyer) + (ctx.market.clubCash[buyer] ?? 0);
		const strength = squadStrength(squad);
		const tier = tierOfDivision(ctx.divisionOf(buyer));
		// Procura em clubes de nível igual ou inferior um atleta da posição que melhore o elenco.
		const sellers = rng.shuffle(clubs.filter((c) => c !== buyer && c !== ctx.userClub)).slice(0, 10);
		let best: { p: RosterPlayer; seller: string; fee: number } | null = null;
		for (const seller of sellers) {
			const ss = rosterOf(ctx, seller);
			const same = ss.filter((p) => p.position === pos);
			if (same.length <= COMPOSITION[pos] - 1) continue; // vendedor sem sobra
			for (const p of same) {
				if (taken.has(p.id) || p.loan || p.age > 32 || p.overall < strength - 6) continue;
				const fee = askingPrice(p, ss, (ctx.market.clubCash[seller] ?? 0) + budgetOf(seller));
				if (fee > budget) continue;
				if (!best || p.overall > best.p.overall) best = { p, seller, fee };
			}
		}
		if (!best) continue;
		taken.add(best.p.id);
		moves.push({
			playerId: best.p.id,
			from: best.seller,
			to: buyer,
			fee: best.fee,
			wage: Math.max(best.p.contract.wage, expectedWage(best.p.overall, tier, best.p.age)),
			until: ctx.season + 2 + rng.int(0, 2),
			reason: needs.includes(pos) ? `Carência na posição ${pos}` : 'Reforço para o elenco'
		});
	}
	return moves;
}
