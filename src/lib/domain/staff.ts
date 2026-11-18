import type { Tier } from './market.ts';
import { createRng, deriveSeed } from './rng.ts';
import { randomName } from './squad.ts';

/**
 * Comissão técnica (Dev 0.5). Cada profissional tem competência (1–100), salário e contrato,
 * e o efeito dele entra nos cálculos de verdade (treino, recuperação, base, observação, preparo).
 * Cargo vago = efeito de um interino fraco, nunca zero.
 */
export const STAFF_ROLES = ['auxiliar', 'preparador', 'goleiros', 'analista', 'fisio', 'coordBase', 'chefeObs'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_INFO: Record<StaffRole, { label: string; short: string; effect: string }> = {
	auxiliar: { label: 'Auxiliar técnico', short: 'Auxiliar', effect: 'Acelera o aprendizado tático nos treinos e nos jogos e monta o plano semanal quando você delega.' },
	preparador: { label: 'Preparador físico', short: 'Preparador', effect: 'Recupera o condicionamento entre as rodadas e controla o desgaste dos treinos intensos.' },
	goleiros: { label: 'Treinador de goleiros', short: 'Goleiros', effect: 'Acelera a evolução dos goleiros ao longo das temporadas.' },
	analista: { label: 'Analista de desempenho', short: 'Analista', effect: 'Estuda o próximo adversário: o treino de preparação rende mais e o relatório fica mais preciso.' },
	fisio: { label: 'Fisioterapeuta', short: 'Fisioterapia', effect: 'Recupera mais rápido os atletas muito desgastados.' },
	coordBase: { label: 'Coordenador da base', short: 'Base', effect: 'Acelera a evolução dos jovens e reduz o risco de estagnação.' },
	chefeObs: { label: 'Chefe de observação', short: 'Observação', effect: 'Deixa os relatórios dos olheiros mais precisos e as missões mais produtivas.' }
};

export interface StaffMember {
	id: string;
	name: string;
	role: StaffRole;
	/** 1–100 */
	competence: number;
	/** salário mensal (R$) */
	wage: number;
	/** última temporada do contrato */
	until: number;
	age: number;
}

export type StaffState = Partial<Record<StaffRole, StaffMember>>;

const TIER_WAGE: Record<Tier, number> = { A: 60_000, B: 26_000, C: 11_000, D: 5_000, E: 3_000 };
const INTERIM = 28;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function staffWage(competence: number, tier: Tier): number {
	return Math.round((TIER_WAGE[tier] * (0.45 + (competence / 100) * 1.3)) / 100) * 100;
}

/** Comissão inicial: o clube já tem o básico (auxiliar, preparador, goleiros, fisioterapia). */
export function initialStaff(seed: number, clubId: string, season: number, tier: Tier, reputation: number): StaffState {
	const out: StaffState = {};
	(['auxiliar', 'preparador', 'goleiros', 'fisio'] as StaffRole[]).forEach((role, i) => {
		const rng = createRng(deriveSeed(seed, 'comissao-inicial', clubId, role));
		const competence = clamp(30 + reputation * 6 + rng.int(-8, 10), 15, 85);
		out[role] = { id: `st-${clubId}-${role}-${season}`, name: randomName(rng).name, role, competence, wage: staffWage(competence, tier), until: season + 1 + (i % 2), age: rng.int(32, 60) };
	});
	return out;
}

/** Profissionais disponíveis no mercado para um cargo (mudam a cada metade de temporada). */
export function staffCandidates(seed: number, season: number, half: 1 | 2, role: StaffRole, tier: Tier): StaffMember[] {
	const rng = createRng(deriveSeed(seed, 'comissao-mercado', season, half, role));
	const top = { A: 88, B: 76, C: 66, D: 56, E: 48 }[tier];
	return Array.from({ length: 4 }, (_, k) => {
		const competence = clamp(top - k * 9 + rng.int(-6, 6), 18, 95);
		return { id: `st-${role}-${season}-${half}-${k}`, name: randomName(rng).name, role, competence, wage: staffWage(competence, tier), until: season + 1 + (k % 2), age: rng.int(30, 62) };
	});
}

export function competenceOf(staff: StaffState | undefined, role: StaffRole): number {
	return staff?.[role]?.competence ?? INTERIM;
}

/**
 * Efeitos medidos de cada profissional (fatores ≈ 0,85–1,2). Centralizado aqui para que
 * treino, base, observação e recuperação usem os mesmos números (e os testes também).
 */
export function staffEffects(staff: StaffState | undefined) {
	const c = (r: StaffRole) => competenceOf(staff, r);
	return {
		/** multiplicador do ganho tático (treinos e jogos) */
		tacticalLearning: 0.85 + c('auxiliar') / 300,
		/** multiplicador da recuperação física semanal */
		fitnessRecovery: 0.88 + c('preparador') / 400,
		/** recuperação extra de quem está abaixo de 70% */
		physio: 0.9 + c('fisio') / 350,
		/** bônus de evolução dos goleiros por temporada */
		gkDevelopment: 0.9 + c('goleiros') / 400,
		/** preparação para o adversário: domínio extra temporário (pontos de execução) */
		opponentPrep: 1 + c('analista') / 25,
		/** multiplicador da evolução dos jovens */
		youthDevelopment: 0.85 + c('coordBase') / 300,
		/** "julgamento" extra do olheiro (reduz a margem dos relatórios) */
		scoutJudgement: c('chefeObs') / 10
	};
}

export function monthlyStaffCost(staff: StaffState | undefined): number {
	return Object.values(staff ?? {}).reduce((s, m) => s + (m?.wage ?? 0), 0);
}

export function sanitizeStaff(raw: unknown): StaffState | null {
	if (!raw || typeof raw !== 'object') return null;
	const out: StaffState = {};
	for (const role of STAFF_ROLES) {
		const m = (raw as Record<string, unknown>)[role] as StaffMember | undefined;
		if (m && typeof m.competence === 'number' && typeof m.wage === 'number' && typeof m.name === 'string') out[role] = { ...m, role, competence: clamp(m.competence, 1, 100) };
	}
	return out;
}

/** Multa rescisória: metade dos salários restantes (mínimo um mês). */
export function staffSeverance(m: StaffMember, season: number, monthsLeftInSeason: number): number {
	const months = Math.max(1, (m.until - season) * 10 + monthsLeftInSeason);
	return Math.round((m.wage * months * 0.5) / 100) * 100;
}
