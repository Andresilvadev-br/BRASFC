import { getClub } from './clubs.ts';
import { roundMoney, type Tier } from './market.ts';
import { createRng, deriveSeed } from './rng.ts';

/**
 * Gestão do clube do usuário (Dev 0.4): finanças, diretoria, patrocínios, infraestrutura e torcida.
 * Todos os valores são ESTIMATIVAS DO JOGO (referências de ordem de grandeza do futebol brasileiro),
 * documentadas em docs/ECONOMIA.md — nunca dados oficiais de clubes reais.
 */

// ─────────────────────────────────────────────────────────────── perfil econômico

/** Receita anual de TV/comercial por nível e reputação (R$). */
const TV: Record<Tier, number[]> = {
	A: [0, 60e6, 90e6, 150e6, 250e6, 400e6],
	B: [0, 18e6, 25e6, 35e6, 50e6, 60e6],
	C: [0, 4e6, 6e6, 9e6, 12e6, 15e6],
	D: [0, 1e6, 1.4e6, 2e6, 2.6e6, 3e6],
	E: [0, 0.4e6, 0.5e6, 0.7e6, 0.9e6, 1e6]
};
/** Ingresso médio de referência (R$). */
export const TICKET_REF: Record<Tier, number> = { A: 60, B: 40, C: 25, D: 15, E: 10 };
/** Premiação de liga por posição (R$, estimativa): campeão recebe `top`, decai até o último. */
const LEAGUE_PRIZE: Record<Tier, number> = { A: 48e6, B: 6e6, C: 1.5e6, D: 0.4e6, E: 0 };

export interface ClubEconomy {
	tvAnnual: number;
	capacity: number;
	ticketRef: number;
	fanBase: number;
}

export function clubEconomy(clubId: string, tier: Tier): ClubEconomy {
	const club = getClub(clubId);
	const rep = Math.max(1, Math.min(5, club?.reputation ?? 2));
	const capByRep = [0, 9000, 16000, 26000, 40000, 58000][rep];
	const capacity = tier === 'D' || tier === 'E' ? Math.round(capByRep * 0.6) : capByRep;
	return { tvAnnual: TV[tier][rep], capacity, ticketRef: TICKET_REF[tier], fanBase: 30 + rep * 12 };
}

export function leaguePrize(tier: Tier, position: number, size: number): number {
	const top = LEAGUE_PRIZE[tier];
	if (!top || position < 1) return 0;
	return roundMoney(top * Math.pow(1 - (position - 1) / size, 1.6) + top * 0.06);
}

// ─────────────────────────────────────────────────────────────── infraestrutura

export type Facility = 'ct' | 'base' | 'medico' | 'observacao' | 'estadio';
export const FACILITIES: Facility[] = ['ct', 'base', 'medico', 'observacao', 'estadio'];
export const FACILITY_INFO: Record<Facility, { label: string; effect: (level: number) => string; baseCost: number }> = {
	ct: { label: 'Centro de treinamento', baseCost: 3e6, effect: (l) => `Treinos rendem ${Math.round((ctTraining(l) - 1) * 100)}% ${ctTraining(l) >= 1 ? 'a mais' : 'a menos'}; jovens evoluem ${Math.round((ctDevelopment(l) - 1) * 100)}% ${ctDevelopment(l) >= 1 ? 'mais' : 'menos'}.` },
	base: { label: 'Categorias de base', baseCost: 2e6, effect: (l) => `${youthIntake(l)} jovens por ano; potencial médio ${55 + 5 * l}.` },
	medico: { label: 'Departamento médico', baseCost: 1.5e6, effect: (l) => `Recuperação física ${Math.round(medicalRecovery(l) * 100 - 100)}% mais rápida.` },
	observacao: { label: 'Observação de atletas', baseCost: 1e6, effect: (l) => `Até ${l} olheiros; relatórios com margem de ±${scoutMargin(l, 10)} no nível.` },
	estadio: { label: 'Estrutura do estádio', baseCost: 6e6, effect: (l) => `Capacidade ×${(1 + 0.12 * (l - 1)).toFixed(2)}; conforto melhora o humor da torcida.` }
};

export const ctTraining = (level: number) => 0.85 + 0.075 * level;
export const ctDevelopment = (level: number) => 0.85 + 0.08 * level;
export const youthIntake = (level: number) => 2 + Math.ceil(level / 2);
export const medicalRecovery = (level: number) => 1 + 0.05 * (level - 1);
export const scoutMargin = (level: number, judgement: number) => Math.max(1, Math.round(12 - level * 1.5 - judgement * 0.35));
export const stadiumCapacity = (base: number, level: number) => Math.round(base * (1 + 0.12 * (level - 1)));

/** Custo e prazo (semanas) para subir um nível. */
export function upgradeCost(f: Facility, level: number, tier: Tier): { cost: number; weeks: number } {
	const tierF = tier === 'A' ? 1 : tier === 'B' ? 0.55 : tier === 'C' ? 0.3 : 0.18;
	return { cost: roundMoney(FACILITY_INFO[f].baseCost * Math.pow(level, 1.6) * tierF), weeks: 6 + 4 * level };
}

/** Manutenção semanal de toda a estrutura. */
export function maintenanceWeekly(levels: Record<Facility, number>, tier: Tier): number {
	return roundMoney(FACILITIES.reduce((s, f) => s + upgradeCost(f, levels[f], tier).cost * 0.004, 0));
}

// ─────────────────────────────────────────────────────────────── diretoria

export type BoardProfile = 'ambiciosa' | 'conservadora' | 'rigida' | 'formadora' | 'imediatista' | 'projeto';
export const BOARD_PROFILES: Record<BoardProfile, { label: string; summary: string; results: number; money: number; youth: number; patience: number }> = {
	ambiciosa: { label: 'Ambiciosa', summary: 'Quer brigar no topo e investe para isso.', results: 1.2, money: 0.6, youth: 0.5, patience: 0.8 },
	conservadora: { label: 'Conservadora', summary: 'Prefere estabilidade a riscos.', results: 0.9, money: 1.1, youth: 0.8, patience: 1.1 },
	rigida: { label: 'Financeiramente rígida', summary: 'Contas no azul acima de tudo.', results: 0.8, money: 1.6, youth: 0.7, patience: 1 },
	formadora: { label: 'Formadora de atletas', summary: 'Valoriza a base e jovens no time.', results: 0.8, money: 0.9, youth: 1.6, patience: 1.2 },
	imediatista: { label: 'Focada em resultados imediatos', summary: 'Cobra vitórias desde a primeira rodada.', results: 1.5, money: 0.7, youth: 0.4, patience: 0.6 },
	projeto: { label: 'Projeto de longo prazo', summary: 'Tolera oscilações se houver evolução.', results: 0.7, money: 1, youth: 1.2, patience: 1.5 }
};

export function boardProfileOf(seed: number, clubId: string): BoardProfile {
	const ids = Object.keys(BOARD_PROFILES) as BoardProfile[];
	return ids[createRng(deriveSeed(seed, 'diretoria', clubId)).int(0, ids.length - 1)];
}

export type ObjectiveKind = 'liga-posicao' | 'acesso' | 'permanencia' | 'copa-fase' | 'saldo' | 'base';
export interface Objective {
	kind: ObjectiveKind;
	label: string;
	/** posição máxima (liga), fase mínima (copa), saldo mínimo, minutos de jovens */
	target: number;
	weight: number;
}

/** Objetivos da temporada conforme divisão, força relativa do elenco e perfil da diretoria. */
export function seasonObjectives(opts: { division: string; rank: number; size: number; profile: BoardProfile; inCup: boolean; promotion: number; relegation: number }): Objective[] {
	const { rank, size, profile } = opts;
	const out: Objective[] = [];
	const ambition = profile === 'ambiciosa' || profile === 'imediatista' ? -1 : profile === 'projeto' || profile === 'formadora' ? 1 : 0;
	if (opts.promotion && rank <= opts.promotion + 2) out.push({ kind: 'acesso', label: `Conquistar o acesso (top ${opts.promotion})`, target: opts.promotion, weight: 3 });
	else if (rank <= Math.ceil(size / 4)) {
		const t = Math.max(1, Math.min(size, Math.ceil(size / 5) + ambition));
		out.push({ kind: 'liga-posicao', label: `Terminar entre os ${t} primeiros`, target: t, weight: 3 });
	} else if (opts.relegation && rank > size - opts.relegation - 4) out.push({ kind: 'permanencia', label: 'Evitar o rebaixamento', target: size - opts.relegation, weight: 3 });
	else {
		const t = Math.max(1, Math.min(size, Math.round(size / 2) + ambition * 2));
		out.push({ kind: 'liga-posicao', label: `Terminar no máximo em ${t}º`, target: t, weight: 3 });
	}
	if (opts.inCup) {
		const phase = rank <= 4 ? 7 : rank <= Math.ceil(size / 2) ? 5 : 3;
		out.push({ kind: 'copa-fase', label: `Copa do Brasil: chegar à ${phaseName(phase)}`, target: phase, weight: 1 });
	}
	out.push({ kind: 'saldo', label: profile === 'rigida' ? 'Fechar a temporada com caixa positivo' : 'Não terminar com dívida acima de 20% da receita', target: profile === 'rigida' ? 0 : -0.2, weight: profile === 'rigida' ? 2 : 1 });
	if (profile === 'formadora' || profile === 'projeto') out.push({ kind: 'base', label: 'Dar minutos a jovens da base (1.500 min na temporada)', target: 1500, weight: 1 });
	return out;
}

function phaseName(p: number): string {
	return ['', '1ª fase', '2ª fase', '3ª fase', '4ª fase', '5ª fase', 'oitavas', 'quartas', 'semifinal', 'final'][p];
}

/**
 * Confiança após uma partida: resultado × expectativa (diferença de força), pelo perfil.
 * Retorna a variação (pontos de 0–100).
 */
export function confidenceAfterMatch(profile: BoardProfile, outcome: 'v' | 'e' | 'd', strengthDiff: number, firstSeason: boolean): number {
	const p = BOARD_PROFILES[profile];
	const expected = strengthDiff > 3 ? 'v' : strengthDiff < -3 ? 'd' : 'e';
	let d = outcome === 'v' ? 2.2 : outcome === 'e' ? -0.4 : -2.6;
	if (outcome === 'v' && expected === 'd') d += 1.5;
	if (outcome === 'd' && expected === 'v') d -= 1.2;
	if (outcome === 'd' && expected === 'd') d += 1.4;
	d *= p.results;
	if (d < 0 && firstSeason) d *= 1 / p.patience;
	return Math.round(d * 10) / 10;
}

/** Variação semanal pela saúde financeira. */
export function confidenceFromMoney(profile: BoardProfile, balance: number, annualRevenue: number): number {
	const p = BOARD_PROFILES[profile];
	const ratio = balance / Math.max(1, annualRevenue);
	const d = ratio < -0.2 ? -1.2 : ratio < 0 ? -0.4 : ratio > 0.15 ? 0.3 : 0;
	return Math.round(d * p.money * 10) / 10;
}

export const DISMISSAL_THRESHOLD = 18;

// ─────────────────────────────────────────────────────────────── patrocínios (marcas FICTÍCIAS)

const BRAND_A = ['Vértice', 'Aurora', 'Maré Alta', 'Cerrado', 'Ipê', 'Horizonte', 'Pampa', 'Litoral', 'Serra Azul', 'Brisa', 'Jangada', 'Coqueiral', 'Mandacaru', 'Araucária', 'Buriti'];
const BRAND_B = ['Energia', 'Seguros', 'Telecom', 'Bebidas', 'Logística', 'Banco Digital', 'Construtora', 'Farmácias', 'Agro', 'Móveis', 'Calçados', 'Turismo'];

export type SponsorSlot = 'master' | 'manga' | 'material';
export const SPONSOR_SLOTS: Record<SponsorSlot, { label: string; share: number }> = {
	master: { label: 'Patrocínio master', share: 1 },
	manga: { label: 'Manga', share: 0.25 },
	material: { label: 'Material esportivo', share: 0.45 }
};

export interface SponsorOffer {
	id: string;
	brand: string;
	slot: SponsorSlot;
	monthly: number;
	seasons: number;
	bonus: { label: string; kind: 'acesso' | 'titulo' | 'top' | 'copa'; target: number; amount: number } | null;
	/** exigência: se não cumprir, o contrato é encerrado ao fim da temporada */
	requirement: { label: string; maxPosition: number } | null;
}

export interface SponsorContract extends SponsorOffer {
	signedSeason: number;
	untilSeason: number;
}

/** Propostas de patrocínio da temporada: valor depende do nível, reputação e humor da torcida. */
export function sponsorOffers(seed: number, clubId: string, season: number, tier: Tier, fanMood: number, taken: SponsorSlot[]): SponsorOffer[] {
	const rng = createRng(deriveSeed(seed, 'patrocinio', clubId, season));
	const club = getClub(clubId);
	const rep = club?.reputation ?? 2;
	const base = (clubEconomy(clubId, tier).tvAnnual / 12) * 0.35 * (0.8 + fanMood / 250);
	const out: SponsorOffer[] = [];
	for (const slot of Object.keys(SPONSOR_SLOTS) as SponsorSlot[]) {
		if (taken.includes(slot)) continue;
		for (let k = 0; k < 3; k++) {
			const brand = `${rng.pick(BRAND_A)} ${rng.pick(BRAND_B)}`;
			const style = k; // 0 = valor fixo alto e exigente; 1 = equilibrado; 2 = bônus por metas
			const monthly = roundMoney(base * SPONSOR_SLOTS[slot].share * (style === 0 ? 1.15 : style === 1 ? 1 : 0.8) * (0.9 + rng.next() * 0.2));
			const seasons = style === 2 ? 3 : rng.int(1, 2);
			const goal = tier === 'A' ? { kind: 'top' as const, target: rep >= 4 ? 4 : 10, label: rep >= 4 ? 'G4 na liga' : 'Top 10 na liga' } : { kind: 'acesso' as const, target: 4, label: 'Acesso de divisão' };
			out.push({
				id: `${season}-${slot}-${k}`,
				brand,
				slot,
				monthly,
				seasons,
				bonus: style === 0 ? null : { label: goal.label, kind: goal.kind, target: goal.target, amount: roundMoney(monthly * (style === 2 ? 8 : 4)) },
				requirement: style === 0 ? { label: 'Não terminar na metade de baixo da tabela', maxPosition: 12 } : null
			});
		}
	}
	return out;
}

// ─────────────────────────────────────────────────────────────── torcida e público

export interface AttendanceInput {
	capacity: number;
	fanMood: number;
	price: number;
	ticketRef: number;
	opponentReputation: number;
	derby: boolean;
	competitionWeight: number;
}

/** Público de um jogo em casa (determinístico). */
export function attendance(i: AttendanceInput): number {
	const priceFactor = Math.max(0.35, Math.min(1.35, Math.pow(i.ticketRef / Math.max(1, i.price), 0.6)));
	const draw = 0.25 + i.fanMood / 150 + i.opponentReputation * 0.04 + (i.derby ? 0.18 : 0);
	return Math.round(i.capacity * Math.max(0.08, Math.min(1, draw * priceFactor * i.competitionWeight)));
}

/** Humor da torcida após um jogo. */
export function moodAfterMatch(mood: number, outcome: 'v' | 'e' | 'd', home: boolean, derby: boolean, price: number, ticketRef: number): number {
	let d = outcome === 'v' ? 2 : outcome === 'e' ? 0 : -2.5;
	if (home) d *= 1.3;
	if (derby) d *= 2;
	if (home && price > ticketRef * 1.3) d -= ((price / ticketRef - 1.3) * 10) / 2;
	return Math.max(5, Math.min(100, Math.round((mood + d) * 10) / 10));
}

/** Clássico: clubes da mesma cidade (base real). */
export function isDerby(a: string, b: string): boolean {
	const ca = getClub(a)?.city;
	const cb = getClub(b)?.city;
	return !!ca && ca === cb && !ca.includes('pendente');
}
