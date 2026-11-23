import { BOARD_PROFILES, isDerby, type BoardProfile } from './club.ts';
import { getClub } from './clubs.ts';
import type { Tier } from './market.ts';
import { createRng, deriveSeed } from './rng.ts';
import { coachOf, PROJECT_INFO, type UniverseState } from './universe.ts';
import type { BudgetCounter, BudgetTalk } from './board-talks.ts';

/**
 * Gabinete do treinador (Dev 0.5): contrato, reputação, histórico, marcos, reuniões com a
 * diretoria e coletivas de imprensa. As escolhas têm consequências que ficam salvas.
 */
export interface CoachContract {
	until: number;
	wage: number;
}

export interface CoachSeason {
	season: number;
	clubId: string;
	division: string | null;
	position: number | null;
	outcome: 'campeao' | 'acesso' | 'queda' | 'permanece' | 'demitido' | 'saiu';
	games: number;
	wins: number;
	draws: number;
	losses: number;
	reputation: number;
}

export interface Milestone {
	key: string;
	season: number;
	round: number;
	label: string;
	detail: string;
}

export type MeetingKind = 'orcamento' | 'advertencia' | 'avaliacao' | 'renovacao';
export interface MeetingOption {
	id: string;
	label: string;
	hint: string;
}
export interface Meeting {
	id: string;
	kind: MeetingKind;
	season: number;
	round: number;
	title: string;
	context: string;
	options: MeetingOption[];
}

export interface PressQuestion {
	id: string;
	text: string;
	options: Array<{ id: string; label: string; tone: 'confiante' | 'cauteloso' | 'provocativo' | 'evasivo' }>;
}
export interface PressConference {
	id: string;
	season: number;
	round: number;
	topic: 'classico' | 'crise' | 'embalo' | 'reforco' | 'pressao' | 'decisao';
	title: string;
	questions: PressQuestion[];
}

export interface Ultimatum {
	season: number;
	untilRound: number;
	points: number;
	startPoints: number;
}

export interface OfficeState {
	v: 1;
	contract: CoachContract;
	history: CoachSeason[];
	milestones: Milestone[];
	meeting: Meeting | null;
	press: PressConference | null;
	/** decisões tomadas (auditoria e linha do tempo) */
	decisions: Array<{ season: number; round: number; kind: string; choice: string; effect: string }>;
	ultimatum: Ultimatum | null;
	/** jogos oficiais como treinador (todas as temporadas) */
	totals: { games: number; wins: number; draws: number; losses: number; unbeaten: number; bestUnbeaten: number };
	/** temporada/rodada da última coletiva (evita excesso) */
	lastPress: number;
	lastMeeting: Record<string, number>;
	/** treinos planejados pelo auxiliar técnico */
	delegated?: boolean;
	/** Renovação automática quando a diretoria aprovar, sem substituir recusas explícitas. */
	autoRenewal?: boolean;
	/** Temporada em que o treinador escolheu sair ao fim do vínculo. */
	renewalDeclinedSeason?: number;
	/** Treinador 2.0: quando e por que ficou sem clube (ausente = contratado) */
	unemployedSince?: { season: number; round: number; reason: 'demitido' | 'fim-contrato' };
	/** janelas do mercado de treinadores já processadas ("temporada:rodada") */
	offerWindows?: string[];
	/** propostas novas que ainda não foram vistas na janela de destaque */
	offerAlert?: { season: number; round: number; ids: string[] } | null;
	/** última rodada (temporada*100+rodada) em que chegaram propostas */
	lastOfferAt?: number;
	/** reuniões de orçamento com a diretoria (histórico das negociações) */
	budgetTalks?: BudgetTalk[];
	/** contraproposta aguardando resposta */
	budgetCounter?: BudgetCounter | null;
	/** orçamentos no primeiro pedido da temporada (limite de +50%) */
	budgetBaseline?: { season: number; transferBudget: number; wageBudget: number };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const TIER_COACH_WAGE: Record<Tier, number> = { A: 420_000, B: 140_000, C: 45_000, D: 18_000, E: 9_000 };

export function coachWage(tier: Tier, reputation: number): number {
	return Math.round((TIER_COACH_WAGE[tier] * (0.6 + reputation / 120)) / 1000) * 1000;
}

/**
 * Linha do histórico de uma passagem (temporada × clube): os jogos são o total da carreira menos o
 * que já foi registrado em outras linhas, então saídas no meio do ano não duplicam partidas.
 */
export function seasonRow(office: Pick<OfficeState, 'totals' | 'history'>, r: { season: number; clubId: string; division: string | null; position: number | null; outcome: CoachSeason['outcome']; reputation: number }): CoachSeason {
	const others = office.history;
	const games = Math.max(0, office.totals.games - others.reduce((s, h) => s + h.games, 0));
	const wins = Math.max(0, office.totals.wins - others.reduce((s, h) => s + h.wins, 0));
	const draws = Math.max(0, office.totals.draws - others.reduce((s, h) => s + h.draws, 0));
	return { season: r.season, clubId: r.clubId, division: r.division, position: r.position, outcome: r.outcome, games, wins, draws, losses: Math.max(0, games - wins - draws), reputation: r.reputation };
}

export function initialOffice(season: number, tier: Tier, reputation: number): OfficeState {
	return {
		v: 1,
		contract: { until: season + 1, wage: coachWage(tier, reputation) },
		history: [],
		milestones: [],
		meeting: null,
		press: null,
		decisions: [],
		ultimatum: null,
		totals: { games: 0, wins: 0, draws: 0, losses: 0, unbeaten: 0, bestUnbeaten: 0 },
		lastPress: -99,
		lastMeeting: {},
		autoRenewal: false
	};
}

export function sanitizeOffice(raw: unknown, season: number, tier: Tier, reputation: number): OfficeState {
	const base = initialOffice(season, tier, reputation);
	if (!raw || typeof raw !== 'object' || (raw as OfficeState).v !== 1) return base;
	const o = raw as OfficeState;
	return {
		...base,
		...o,
		history: Array.isArray(o.history) ? o.history.slice(-80) : [],
		milestones: Array.isArray(o.milestones) ? o.milestones.slice(-200) : [],
		decisions: Array.isArray(o.decisions) ? o.decisions.slice(-200) : [],
		totals: { ...base.totals, ...(o.totals ?? {}) },
		lastMeeting: o.lastMeeting ?? {},
		autoRenewal: o.autoRenewal === true,
		renewalDeclinedSeason: Number.isInteger(o.renewalDeclinedSeason) ? o.renewalDeclinedSeason : undefined,
		unemployedSince: o.unemployedSince && Number.isInteger(o.unemployedSince.season) && Number.isInteger(o.unemployedSince.round) && (o.unemployedSince.reason === 'demitido' || o.unemployedSince.reason === 'fim-contrato') ? o.unemployedSince : undefined,
		offerWindows: Array.isArray(o.offerWindows) ? o.offerWindows.filter((k: unknown) => typeof k === 'string').slice(-12) : [],
		offerAlert: o.offerAlert && Array.isArray(o.offerAlert.ids) ? o.offerAlert : null,
		lastOfferAt: Number.isFinite(o.lastOfferAt) ? o.lastOfferAt : undefined,
		budgetTalks: Array.isArray(o.budgetTalks) ? o.budgetTalks.slice(-40) : [],
		budgetCounter: o.budgetCounter && typeof o.budgetCounter === 'object' ? o.budgetCounter : null
	};
}

const absRound = (season: number, round: number) => season * 100 + round;

/** Registra o jogo do treinador e devolve marcos alcançados. */
export function recordGame(st: OfficeState, season: number, round: number, gf: number, ga: number, ctx: { clubId: string; opponent: string; competition: string }): Milestone[] {
	const t = st.totals;
	t.games++;
	const out = gf > ga ? 'v' : gf === ga ? 'e' : 'd';
	if (out === 'v') t.wins++;
	else if (out === 'e') t.draws++;
	else t.losses++;
	t.unbeaten = out === 'd' ? 0 : t.unbeaten + 1;
	t.bestUnbeaten = Math.max(t.bestUnbeaten, t.unbeaten);
	const found: Milestone[] = [];
	const add = (key: string, label: string, detail: string) => {
		if (st.milestones.some((m) => m.key === key)) return;
		const m = { key, season, round, label, detail };
		st.milestones.push(m);
		found.push(m);
	};
	if (out === 'v' && t.wins === 1) add('primeira-vitoria', 'Primeira vitória', `${gf}×${ga} contra o ${getClub(ctx.opponent)?.name ?? ctx.opponent}`);
	for (const n of [50, 100, 200, 300, 500]) if (t.games === n) add(`jogos-${n}`, `${n} jogos como treinador`, `${t.wins} vitórias, ${t.draws} empates e ${t.losses} derrotas`);
	for (const n of [25, 50, 100, 200]) if (out === 'v' && t.wins === n) add(`vitorias-${n}`, `${n}ª vitória`, `Contra o ${getClub(ctx.opponent)?.name ?? ctx.opponent}`);
	if (t.unbeaten === 10) add(`invicto-10-${season}`, '10 jogos sem perder', `Sequência em ${season}`);
	if (out === 'v' && gf - ga >= 4) add(`goleada-${season}-${round}-${ctx.competition}`, 'Goleada histórica', `${gf}×${ga} sobre o ${getClub(ctx.opponent)?.name ?? ctx.opponent}`);
	if (out === 'v' && isDerby(ctx.clubId, ctx.opponent)) add(`classico-${season}-${round}`, 'Vitória no clássico', `Sobre o ${getClub(ctx.opponent)?.name ?? ctx.opponent}`);
	return found;
}

// ─────────────────────────────────────────────────────────────── reuniões com a diretoria

export interface BoardSnapshot {
	profile: BoardProfile;
	confidence: number;
	round: number;
	season: number;
	totalRounds: number;
	points: number;
	position: number | null;
	objectiveLabel: string | null;
	/** fim do contrato do treinador nesta temporada */
	contractEnding: boolean;
}

/** Decide se a diretoria convoca uma reunião (no máximo uma pendente; cada tipo com intervalo). */
export function maybeMeeting(st: OfficeState, b: BoardSnapshot): Meeting | null {
	if (st.meeting) return null;
	const now = absRound(b.season, b.round);
	const since = (k: MeetingKind) => now - (st.lastMeeting[k] ?? -9999);
	const p = BOARD_PROFILES[b.profile];
	const mk = (kind: MeetingKind, title: string, context: string, options: MeetingOption[]): Meeting => ({ id: `${b.season}-${b.round}-${kind}`, kind, season: b.season, round: b.round, title, context, options });
	if (b.round <= 2 && since('orcamento') > 50)
		return mk('orcamento', 'Reunião de planejamento', `A diretoria (${p.label.toLowerCase()}) apresenta o orçamento da temporada${b.objectiveLabel ? ` e a meta principal: ${b.objectiveLabel.toLowerCase()}` : ''}.`, [
			{ id: 'aceitar', label: 'Aceitar o orçamento', hint: 'Mostra alinhamento: a confiança sobe.' },
			{ id: 'pedir-mais', label: 'Pedir mais verba para contratações', hint: 'Diretorias ambiciosas cedem; as rígidas não gostam.' },
			{ id: 'investir-base', label: 'Propor investimento na base', hint: 'Parte da verba de contratações vai para a base.' }
		]);
	if (b.confidence < 32 && !st.ultimatum && since('advertencia') > 8 && b.round >= 4)
		return mk('advertencia', 'Advertência da diretoria', `A confiança está em ${Math.round(b.confidence)}. A diretoria quer explicações${b.position ? ` (o time está em ${b.position}º)` : ''}.`, [
			{ id: 'prometer', label: 'Prometer reação imediata', hint: 'Meta: 7 pontos nas próximas 5 rodadas. Se cumprir, a confiança sobe bem; se falhar, cai muito.' },
			{ id: 'pedir-tempo', label: 'Pedir tempo para o trabalho', hint: 'Funciona com diretorias pacientes; irrita as imediatistas.' },
			{ id: 'cargo', label: 'Colocar o cargo à disposição', hint: 'Diretorias que confiam no projeto costumam recusar e renovar o apoio.' }
		]);
	if (b.round === Math.floor(b.totalRounds / 2) && since('avaliacao') > 20)
		return mk('avaliacao', 'Avaliação do meio da temporada', `Metade da temporada: ${b.points} pontos${b.position ? `, ${b.position}º lugar` : ''}. A diretoria quer discutir a meta.`, [
			{ id: 'manter', label: 'Manter a meta', hint: 'Sem mudanças; quem confia no plano mantém a confiança.' },
			{ id: 'ambicao', label: 'Elevar a ambição', hint: 'Agrada diretorias ambiciosas, mas a cobrança aumenta.' },
			{ id: 'realismo', label: 'Pedir uma meta mais realista', hint: 'A pressão diminui, ao custo de alguma confiança.' }
		]);
	if (b.contractEnding && b.confidence >= 60 && b.round >= Math.floor(b.totalRounds * 0.6) && since('renovacao') > 30)
		return mk('renovacao', 'Proposta de renovação', 'Seu contrato termina nesta temporada e a diretoria quer continuar com você.', [
			{ id: 'renovar-2', label: 'Renovar por 2 temporadas', hint: 'Salário reajustado pela sua reputação.' },
			{ id: 'renovar-3', label: 'Pedir 3 temporadas e aumento', hint: 'Só com confiança alta.' },
			{ id: 'recusar', label: 'Não renovar', hint: 'Você sai ao fim da temporada e recebe propostas de outros clubes.' }
		]);
	return null;
}

export interface MeetingEffect {
	confidence: number;
	transferBudgetPct: number;
	baseInvestment: number;
	contract?: CoachContract;
	leaving?: boolean;
	ultimatum?: Ultimatum | null;
	effect: string;
	objectiveShift?: number;
}

/** Consequência de cada escolha (depende do perfil da diretoria e do momento). */
export function resolveMeeting(m: Meeting, choice: string, b: BoardSnapshot, ctx: { reputation: number; tier: Tier; season: number; transferBudget: number }): MeetingEffect {
	const p = BOARD_PROFILES[b.profile];
	const none: MeetingEffect = { confidence: 0, transferBudgetPct: 0, baseInvestment: 0, effect: '' };
	if (!m.options.some((o) => o.id === choice)) throw new Error('Opção inválida para esta reunião.');
	switch (`${m.kind}:${choice}`) {
		case 'orcamento:aceitar':
			return { ...none, confidence: 4, effect: 'Orçamento aceito; a diretoria gostou do alinhamento (+4 de confiança).' };
		case 'orcamento:pedir-mais':
			if (p.results >= 1.2 || b.confidence >= 70) return { ...none, confidence: -2, transferBudgetPct: 20, effect: 'A diretoria liberou 20% a mais para contratações, mas espera retorno em campo (−2 de confiança).' };
			return { ...none, confidence: -5, effect: `Pedido negado: a diretoria (${p.label.toLowerCase()}) não gostou da cobrança (−5 de confiança).` };
		case 'orcamento:investir-base': {
			const amount = Math.round(ctx.transferBudget * 0.15);
			return { ...none, confidence: p.youth >= 1.2 ? 6 : 1, transferBudgetPct: -15, baseInvestment: amount, effect: `R$ ${amount.toLocaleString('pt-BR')} saíram das contratações para a base${p.youth >= 1.2 ? '; a diretoria adorou (+6 de confiança)' : ''}.` };
		}
		case 'advertencia:prometer':
			return { ...none, confidence: 3, ultimatum: { season: b.season, untilRound: b.round + 5, points: 7, startPoints: b.points }, effect: 'Promessa feita: 7 pontos nas próximas 5 rodadas.' };
		case 'advertencia:pedir-tempo':
			return p.patience >= 1.1 ? { ...none, confidence: 7, effect: 'A diretoria aceitou dar mais tempo ao trabalho (+7 de confiança).' } : { ...none, confidence: -4, effect: 'A diretoria não quer esperar (−4 de confiança).' };
		case 'advertencia:cargo':
			return b.confidence >= 22 && p.patience >= 1 ? { ...none, confidence: 10, effect: 'A diretoria recusou o pedido e renovou o apoio publicamente (+10 de confiança).' } : { ...none, confidence: -100, effect: 'A diretoria aceitou: você deixou o cargo.' };
		case 'avaliacao:manter':
			return { ...none, confidence: p.patience >= 1.1 ? 2 : 0, effect: 'Meta mantida.' };
		case 'avaliacao:ambicao':
			return { ...none, confidence: p.results >= 1.2 ? 6 : 2, objectiveShift: -1, effect: 'Meta elevada: a diretoria espera uma posição acima.' };
		case 'avaliacao:realismo':
			return { ...none, confidence: -4, objectiveShift: 2, effect: 'Meta ajustada para baixo (duas posições), com alguma perda de confiança (−4).' };
		case 'renovacao:renovar-2':
			return { ...none, confidence: 3, contract: { until: ctx.season + 2, wage: coachWage(ctx.tier, ctx.reputation) }, effect: `Contrato renovado até ${ctx.season + 2}.` };
		case 'renovacao:renovar-3':
			return b.confidence >= 75 ? { ...none, confidence: 1, contract: { until: ctx.season + 3, wage: Math.round(coachWage(ctx.tier, ctx.reputation) * 1.15) }, effect: `Contrato renovado até ${ctx.season + 3}, com aumento.` } : { ...none, confidence: -3, contract: { until: ctx.season + 2, wage: coachWage(ctx.tier, ctx.reputation) }, effect: `A diretoria só aceitou 2 temporadas (até ${ctx.season + 2}) e não gostou da pressão (−3).` };
		case 'renovacao:recusar':
			return { ...none, confidence: -6, leaving: true, effect: 'Você não renovou: deixa o clube ao fim da temporada.' };
	}
	return none;
}

// ─────────────────────────────────────────────────────────────── coletivas de imprensa

export interface PressTrigger {
	season: number;
	round: number;
	clubId: string;
	nextOpponent: string | null;
	form: string;
	signedBig: string | null;
	boardWarning: boolean;
	decisive: boolean;
}

/** Coletiva só em momentos relevantes, no máximo a cada 4 rodadas. */
export function maybePress(st: OfficeState, t: PressTrigger, u: UniverseState | null): PressConference | null {
	if (st.press) return null;
	const now = absRound(t.season, t.round);
	if (now - st.lastPress < 4) return null;
	const rival = t.nextOpponent ? (getClub(t.nextOpponent)?.name ?? t.nextOpponent) : null;
	const rivalCoach = t.nextOpponent ? coachOf(u, t.nextOpponent) : null;
	const id = (topic: string) => `${t.season}-${t.round}-${topic}`;
	const recent = t.form.slice(-4);
	const losses = [...recent].filter((x) => x === 'd').length;
	const wins = [...t.form.slice(-5)].filter((x) => x === 'v').length;
	const q = (qid: string, text: string, options: PressQuestion['options']): PressQuestion => ({ id: qid, text, options });
	if (t.nextOpponent && isDerby(t.clubId, t.nextOpponent))
		return {
			id: id('classico'),
			season: t.season,
			round: t.round,
			topic: 'classico',
			title: `Coletiva antes do clássico contra o ${rival}`,
			questions: [
				q('favorito', `O ${rival} chega${rivalCoach ? ` com ${rivalCoach.name} no comando` : ''}. Quem é o favorito?`, [
					{ id: 'nos', label: 'Nós. Jogamos em casa na cabeça e no coração.', tone: 'confiante' },
					{ id: 'equilibrio', label: 'Clássico não tem favorito.', tone: 'cauteloso' },
					{ id: 'provoca', label: 'Eles que precisam provar alguma coisa.', tone: 'provocativo' }
				]),
				q('torcida', 'Qual o recado para a torcida?', [
					{ id: 'apoio', label: 'Precisamos de vocês do primeiro ao último minuto.', tone: 'confiante' },
					{ id: 'calma', label: 'Confiem no trabalho, independentemente do resultado.', tone: 'cauteloso' }
				])
			]
		};
	if (t.boardWarning || losses >= 3)
		return {
			id: id('crise'),
			season: t.season,
			round: t.round,
			topic: 'crise',
			title: 'Coletiva após a sequência ruim',
			questions: [
				q('cargo', 'Você teme pelo cargo?', [
					{ id: 'confia', label: 'Tenho a confiança da diretoria e do elenco.', tone: 'confiante' },
					{ id: 'resultado', label: 'Treinador vive de resultado. Vou buscar.', tone: 'cauteloso' },
					{ id: 'evasivo', label: 'Não vou falar sobre isso.', tone: 'evasivo' }
				]),
				q('culpa', 'O problema está no elenco?', [
					{ id: 'eu', label: 'A responsabilidade é minha.', tone: 'cauteloso' },
					{ id: 'reforcos', label: 'Precisamos de reforços.', tone: 'provocativo' }
				])
			]
		};
	if (t.signedBig)
		return {
			id: id('reforco'),
			season: t.season,
			round: t.round,
			topic: 'reforco',
			title: `Apresentação de ${t.signedBig}`,
			questions: [
				q('papel', `Qual será o papel de ${t.signedBig}?`, [
					{ id: 'titular', label: 'Chega para ser titular.', tone: 'confiante' },
					{ id: 'disputa', label: 'Vai disputar posição como todos.', tone: 'cauteloso' }
				])
			]
		};
	if (wins >= 4)
		return {
			id: id('embalo'),
			season: t.season,
			round: t.round,
			topic: 'embalo',
			title: 'Coletiva: time embalado',
			questions: [
				q('titulo', 'Dá para sonhar mais alto?', [
					{ id: 'sonhar', label: 'Sim. Este grupo pode ir longe.', tone: 'confiante' },
					{ id: 'pes-no-chao', label: 'Pés no chão, jogo a jogo.', tone: 'cauteloso' }
				])
			]
		};
	if (t.decisive && rival)
		return {
			id: id('decisao'),
			season: t.season,
			round: t.round,
			topic: 'decisao',
			title: `Coletiva antes da decisão contra o ${rival}`,
			questions: [
				q('pressao', 'Como o time lida com a pressão de uma decisão?', [
					{ id: 'pronto', label: 'Estamos prontos. Treinamos para isso.', tone: 'confiante' },
					{ id: 'respeito', label: 'Respeitamos o adversário e vamos com cautela.', tone: 'cauteloso' }
				])
			]
		};
	return null;
}

export interface PressEffect {
	fanMood: number;
	confidence: number;
	reputation: number;
	summary: string;
}

/**
 * Consequências proporcionais: confiança na véspera aumenta a cobrança; provocações agitam a
 * torcida e irritam diretorias conservadoras; evasivas desgastam com a imprensa.
 */
export function resolvePress(pc: PressConference, answers: Record<string, string>, profile: BoardProfile): PressEffect {
	let fan = 0;
	let conf = 0;
	let rep = 0;
	for (const q of pc.questions) {
		const opt = q.options.find((o) => o.id === answers[q.id]);
		if (!opt) throw new Error('Responda todas as perguntas.');
		if (opt.tone === 'confiante') {
			fan += 2;
			conf += pc.topic === 'crise' ? -1 : 1;
		} else if (opt.tone === 'cauteloso') {
			conf += 1;
		} else if (opt.tone === 'provocativo') {
			fan += pc.topic === 'classico' ? 4 : 1;
			conf += profile === 'conservadora' || profile === 'rigida' ? -3 : -1;
			rep += 0.5;
		} else {
			rep -= 1;
			conf -= 1;
		}
	}
	const parts = [fan ? `torcida ${fan > 0 ? '+' : ''}${fan}` : '', conf ? `diretoria ${conf > 0 ? '+' : ''}${conf}` : '', rep ? `reputação ${rep > 0 ? '+' : ''}${rep}` : ''].filter(Boolean);
	return { fanMood: fan, confidence: conf, reputation: rep, summary: parts.length ? parts.join(' · ') : 'Sem repercussão relevante' };
}

// ─────────────────────────────────────────────────────────────── mercado de treinadores

export interface CoachOffer {
	id: string;
	clubId: string;
	division: string;
	reason: string;
	project: string;
	wage: number;
	years: number;
	expiresSeason: number;
}

/**
 * Propostas vindas do universo: clubes com vaga ou insatisfeitos com o técnico, compatíveis com
 * a reputação do treinador e com o orçamento do nível. Nunca clubes incoerentes (ex.: gigante
 * da Série A chamando técnico recém-demitido de reputação baixa).
 */
export function coachOffers(seed: number, season: number, round: number, reputation: number, currentClub: string | null, u: UniverseState | null, divisions: Record<string, string[]>, opts: { dismissed: boolean; tierOf: (div: string) => Tier }): CoachOffer[] {
	const rng = createRng(deriveSeed(seed, 'propostas-tecnico', season, round));
	const maxRep = clamp(Math.round(reputation / 18) + (opts.dismissed ? 0 : 1), 1, 5);
	const pool: Array<{ id: string; div: string; score: number; reason: string }> = [];
	for (const [div, ids] of Object.entries(divisions)) {
		for (const id of ids) {
			if (id === currentClub) continue;
			const rep = getClub(id)?.reputation ?? 1;
			if (rep > maxRep) continue;
			if (!opts.dismissed && currentClub && rep < (getClub(currentClub)?.reputation ?? 1)) continue;
			const mind = u?.clubs[id];
			const vacancy = !!mind && !mind.coachId;
			const unhappy = !!mind && mind.confidence < 40;
			const fallback = !!u && !vacancy && !unhappy;
			// Sem vaga nem insatisfação, o clube só entra se faltarem propostas (planejamento da próxima temporada).
			pool.push({ id, div, score: rep * 10 + (vacancy ? 15 : 0) + (fallback ? -100 : 0) + rng.int(0, 9), reason: vacancy ? 'O cargo está vago e a diretoria quer você.' : unhappy || !u ? 'A diretoria está insatisfeita com o comando atual e sondou seu nome.' : 'A diretoria planeja a troca de comando e quer você no projeto.' });
		}
	}
	// Um treinador demitido sempre recebe ao menos duas propostas coerentes com a reputação.
	const strong = pool.filter((x) => x.score > -50);
	if (strong.length >= 2 || !opts.dismissed) pool.splice(0, pool.length, ...strong);
	return pool
		.sort((a, b) => b.score - a.score)
		.slice(0, 3)
		.map((x, k) => {
			const mind = u?.clubs[x.id];
			const tier = opts.tierOf(x.div);
			return {
				id: `${season}-${round}-${x.id}`,
				clubId: x.id,
				division: x.div,
				reason: x.reason,
				project: mind ? PROJECT_INFO[mind.project].label : 'Manutenção',
				wage: coachWage(tier, reputation),
				years: 1 + ((k + round) % 3),
				expiresSeason: season
			};
		});
}
