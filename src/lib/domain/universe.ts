import { COACH_PROFILES, type CoachStyleId } from '#lib/engine/ai-coach.ts';
import { boardProfileOf, BOARD_PROFILES, confidenceAfterMatch, type BoardProfile } from './club.ts';
import { getClub } from './clubs.ts';
import { clubCoach } from './coaches.ts';
import { createRng, deriveSeed } from './rng.ts';
import { randomName } from './squad.ts';
import { FORMATION_IDS, type FormationId } from './tactics.ts';

/**
 * Futebol brasileiro vivo (Dev 0.5).
 *
 * Estado persistido na carreira (`careers.data.universe`) que evolui a cada rodada e temporada
 * a partir dos RESULTADOS SIMULADOS — nada de eventos sorteados sem causa:
 *  - cada clube da IA tem filosofia, projeto, horizonte, técnico, formação e domínio dela;
 *  - diretorias perdem a confiança com maus resultados (pelo perfil) e demitem técnicos;
 *  - técnicos (fictícios) têm reputação, histórico e trocam de clube;
 *  - notícias e recordes nascem dos fatos da simulação.
 * Os técnicos reais continuam pendentes na base de dados: aqui todos são do universo BRASFC.
 */
export const UNIVERSE_VERSION = 1;

export type Philosophy = 'formadora' | 'compradora' | 'vendedora' | 'tradicional' | 'sustentavel';
export const PHILOSOPHY_INFO: Record<Philosophy, { label: string; text: string }> = {
	formadora: { label: 'Formadora', text: 'Aposta na base e dá minutos a jovens.' },
	compradora: { label: 'Investidora', text: 'Gasta para reforçar o elenco já.' },
	vendedora: { label: 'Vendedora', text: 'Valoriza atletas e vende bem.' },
	tradicional: { label: 'Tradicional', text: 'Elenco experiente, poucas mudanças.' },
	sustentavel: { label: 'Sustentável', text: 'Cresce dentro do orçamento.' }
};

export type ProjectKind = 'titulo' | 'crescimento' | 'manutencao' | 'reconstrucao' | 'crise';
export const PROJECT_INFO: Record<ProjectKind, { label: string; horizon: 'curto' | 'medio' | 'longo' }> = {
	titulo: { label: 'Brigar por títulos', horizon: 'curto' },
	crescimento: { label: 'Crescimento', horizon: 'medio' },
	manutencao: { label: 'Estabilidade', horizon: 'medio' },
	reconstrucao: { label: 'Reconstrução', horizon: 'longo' },
	crise: { label: 'Crise', horizon: 'curto' }
};

export interface ClubMind {
	philosophy: Philosophy;
	board: BoardProfile;
	project: ProjectKind;
	projectSince: number;
	coachId: string | null;
	formation: FormationId;
	/** domínio coletivo das formações (0–100) — aprende jogando, esquece devagar */
	mastery: Partial<Record<FormationId, number>>;
	/** confiança da diretoria no técnico (0–100) */
	confidence: number;
	/** últimos resultados, do mais antigo ao mais recente */
	form: string;
	/** rodada da última troca de técnico na temporada (evita demissões em série) */
	changedAt: number | null;
}

export interface CoachRecord {
	season: number;
	clubId: string;
	division: string | null;
	position: number | null;
	outcome: 'campeao' | 'acesso' | 'queda' | 'demitido' | 'saiu' | 'mantido';
}

export interface AiCoach {
	id: string;
	name: string;
	age: number;
	style: CoachStyleId;
	reputation: number;
	clubId: string | null;
	since: number;
	titles: number;
	history: CoachRecord[];
}

export type NewsKind = 'demissao' | 'contratacao' | 'sequencia' | 'goleada' | 'lideranca' | 'acesso' | 'queda' | 'titulo' | 'projeto' | 'mercado' | 'recorde' | 'tatica' | 'usuario';
export interface NewsItem {
	id: string;
	season: number;
	round: number;
	kind: NewsKind;
	title: string;
	body: string;
	clubs: string[];
	tone: 'boa' | 'ruim' | 'neutra';
	importance: 1 | 2 | 3;
}

export interface Records {
	biggestWin: { season: number; round: number; home: string; away: string; homeGoals: number; awayGoals: number; competition: string } | null;
	titles: Record<string, number>;
	bestCampaign: { season: number; clubId: string; division: string; points: number; games: number } | null;
	longestStreak: { season: number; clubId: string; wins: number } | null;
}

export interface SeasonLogEntry {
	season: number;
	champions: Record<string, string>;
	promoted: string[];
	relegated: string[];
	sackings: number;
	moves: number;
}

export interface UniverseState {
	v: number;
	season: number;
	clubs: Record<string, ClubMind>;
	coaches: Record<string, AiCoach>;
	news: NewsItem[];
	records: Records;
	log: SeasonLogEntry[];
	/** sequência de vitórias em andamento por clube (para recordes e notícias) */
	streaks: Record<string, number>;
	/** líder atual de cada divisão (notícia só quando muda) */
	leaders?: Record<string, string>;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const NEWS_CAP = 160;
const STYLE_IDS = Object.keys(COACH_PROFILES) as CoachStyleId[];

function philosophyOf(seed: number, clubId: string, board: BoardProfile): Philosophy {
	const rep = getClub(clubId)?.reputation ?? 2;
	const rng = createRng(deriveSeed(seed, 'filosofia', clubId));
	if (board === 'formadora') return 'formadora';
	if (board === 'rigida') return rng.chance(0.6) ? 'sustentavel' : 'vendedora';
	if (board === 'ambiciosa' || board === 'imediatista') return rep >= 3 && rng.chance(0.7) ? 'compradora' : 'tradicional';
	if (board === 'projeto') return rng.chance(0.5) ? 'formadora' : 'sustentavel';
	return rng.pick(['tradicional', 'vendedora', 'sustentavel'] as const);
}

function projectFor(rep: number, tierRank: number, philosophy: Philosophy): ProjectKind {
	if (tierRank <= 2 && rep >= 4) return 'titulo';
	if (philosophy === 'formadora' || philosophy === 'sustentavel') return 'crescimento';
	return 'manutencao';
}

function newCoach(seed: number, key: string, season: number, style: CoachStyleId | null, reputation: number, clubId: string | null): AiCoach {
	const rng = createRng(deriveSeed(seed, 'tecnico', key));
	const { name } = randomName(rng);
	return {
		id: `tec-${key}`,
		name,
		age: rng.int(38, 64),
		style: style ?? rng.pick(STYLE_IDS),
		reputation: clamp(Math.round(reputation), 5, 95),
		clubId,
		since: season,
		titles: 0,
		history: []
	};
}

export interface UniverseSetup {
	coachNameFor?: (clubId: string) => string | undefined;
	seed: number;
	season: number;
	firstSeason: number;
	/** clubes por divisão (ordem A → E) */
	divisions: Record<string, string[]>;
	userClub: string | null;
	/** formação preferida do perfil do técnico, ajustada ao elenco */
	formationFor: (clubId: string, style: CoachStyleId) => FormationId;
}

const TIER_REP: Record<string, number> = { 'serie-a': 58, 'serie-b': 44, 'serie-c': 34, 'serie-d': 24 };

/** Estado inicial: um técnico por clube (perfil igual ao da 0.4, agora com nome e carreira) e uma lista de livres. */
export function initialUniverse(s: UniverseSetup): UniverseState {
	const clubs: Record<string, ClubMind> = {};
	const coaches: Record<string, AiCoach> = {};
	let tierRank = 0;
	for (const [division, ids] of Object.entries(s.divisions)) {
		tierRank++;
		for (const id of ids) {
			const board = boardProfileOf(s.seed, id);
			const philosophy = philosophyOf(s.seed, id, board);
			const rep = getClub(id)?.reputation ?? 2;
			const legacy = clubCoach(s.seed, id, s.season, s.firstSeason);
			const style = legacy.profile.id as CoachStyleId;
			const formation = s.formationFor(id, style);
			let coachId: string | null = null;
			if (id !== s.userClub) {
				const c = newCoach(s.seed, `${id}-${s.season}`, s.season - Math.min(legacy.tenure, 4), style, (TIER_REP[division] ?? 20) + rep * 3, id);
				c.name = s.coachNameFor?.(id) ?? c.name;
				coaches[c.id] = c;
				coachId = c.id;
			}
			clubs[id] = {
				philosophy,
				board,
				project: projectFor(rep, tierRank, philosophy),
				projectSince: s.season,
				coachId,
				formation,
				mastery: { [formation]: clamp(52 + legacy.tenure * 5, 40, 74) },
				confidence: 60,
				form: '',
				changedAt: null
			};
		}
	}
	for (let k = 0; k < 24; k++) {
		const c = newCoach(s.seed, `livre-${s.season}-${k}`, s.season, null, 18 + (k % 8) * 6, null);
		coaches[c.id] = c;
	}
	return { v: UNIVERSE_VERSION, season: s.season, clubs, coaches, news: [], records: { biggestWin: null, titles: {}, bestCampaign: null, longestStreak: null }, log: [], streaks: {} };
}

/** Saves antigos ou corrompidos: valida a forma; se não servir, o servidor recria. */
export function sanitizeUniverse(raw: unknown): UniverseState | null {
	if (!raw || typeof raw !== 'object') return null;
	const u = raw as UniverseState;
	if (u.v !== UNIVERSE_VERSION || !u.clubs || typeof u.clubs !== 'object' || !u.coaches || typeof u.coaches !== 'object' || !Array.isArray(u.news)) return null;
	return {
		...u,
		news: u.news.slice(-NEWS_CAP),
		log: Array.isArray(u.log) ? u.log.slice(-60) : [],
		streaks: u.streaks && typeof u.streaks === 'object' ? u.streaks : {},
		records: u.records ?? { biggestWin: null, titles: {}, bestCampaign: null, longestStreak: null }
	};
}

/** Estado necessário para a central e o próximo jogo. O explorador carrega o universo completo. */
export function universePreview(raw: unknown, clubIds: string[]): UniverseState | undefined {
	const universe = sanitizeUniverse(raw);
	if (!universe) return undefined;
	const clubs: UniverseState['clubs'] = {};
	const coaches: UniverseState['coaches'] = {};
	for (const id of clubIds) {
		const club = universe.clubs[id];
		if (!club) continue;
		clubs[id] = club;
		const coach = club.coachId ? universe.coaches[club.coachId] : null;
		if (coach) coaches[coach.id] = { ...coach, history: [] };
	}
	return { ...universe, clubs, coaches, news: universe.news.slice(-3), log: [], streaks: {} };
}

/** Técnico do clube (nome e perfil) — `null` para o clube do usuário. */
export function coachOf(u: UniverseState | null | undefined, clubId: string): AiCoach | null {
	const id = u?.clubs[clubId]?.coachId;
	return id ? (u!.coaches[id] ?? null) : null;
}

/** Domínio coletivo da formação em uso (vira EXECUÇÃO no motor, nunca gols). */
export function aiExecution(u: UniverseState | null | undefined, clubId: string): number | null {
	const m = u?.clubs[clubId];
	if (!m) return null;
	return clamp(m.mastery[m.formation] ?? 45, 35, 82);
}

export interface RoundResult {
	home: string;
	away: string;
	homeGoals: number;
	awayGoals: number;
	competition: string;
}

export interface RoundContext {
	seed: number;
	season: number;
	round: number;
	/** passo de liga (domingo) — copas não mudam a classificação */
	league: boolean;
	results: RoundResult[];
	/** classificação atual de cada divisão (ids na ordem) */
	tables: Record<string, string[]>;
	divisionOf: (clubId: string) => string | null;
	strengthOf: (clubId: string) => number;
	userClub: string | null;
	formationFor: (clubId: string, style: CoachStyleId) => FormationId;
}

const SACK_FLOOR = 28;

function pushNews(u: UniverseState, n: Omit<NewsItem, 'id'>) {
	const id = `${n.season}:${n.round}:${n.kind}:${n.clubs.join('-')}`;
	if (u.news.some((x) => x.id === id)) return;
	u.news.push({ ...n, id });
	if (u.news.length > NEWS_CAP) u.news.splice(0, u.news.length - NEWS_CAP);
}

const clubName = (id: string) => getClub(id)?.name ?? id;

/** Melhor técnico livre que aceita o clube (reputação compatível com o porte). */
function pickReplacement(u: UniverseState, clubId: string, division: string | null): AiCoach | null {
	const rep = getClub(clubId)?.reputation ?? 2;
	const ceiling = (TIER_REP[division ?? ''] ?? 20) + rep * 6 + 14;
	const free = Object.values(u.coaches)
		.filter((c) => !c.clubId && c.age < 70 && c.reputation <= ceiling)
		.sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id));
	return free[0] ?? null;
}

function hire(u: UniverseState, ctx: { seed: number; season: number; round: number; formationFor: RoundContext['formationFor'] }, clubId: string, coach: AiCoach | null, division: string | null) {
	const mind = u.clubs[clubId];
	const c = coach ?? newCoach(ctx.seed, `${clubId}-${ctx.season}-${ctx.round}`, ctx.season, null, (TIER_REP[division ?? ''] ?? 20) + 4, null);
	u.coaches[c.id] = { ...c, clubId, since: ctx.season };
	mind.coachId = c.id;
	const before = mind.formation;
	mind.formation = ctx.formationFor(clubId, c.style);
	// Formação nova: o elenco aproveita o que sabe de sistemas parecidos, mas precisa se adaptar.
	mind.mastery[mind.formation] = Math.max(mind.mastery[mind.formation] ?? 0, before === mind.formation ? (mind.mastery[before] ?? 50) - 4 : 40);
	mind.confidence = 62;
	mind.changedAt = ctx.round;
	return { coach: u.coaches[c.id], formationChanged: before !== mind.formation, before };
}

/**
 * Uma rodada no universo: forma, confiança das diretorias, aprendizado tático, demissões,
 * contratações, recordes e notícias — tudo derivado dos resultados.
 */
export function universeAfterRound(prev: UniverseState, ctx: RoundContext): UniverseState {
	const u: UniverseState = structuredClone(prev);
	for (const r of ctx.results) {
		const diff = r.homeGoals - r.awayGoals;
		// Recorde de goleada (todas as competições).
		const margin = Math.abs(diff);
		const best = u.records.biggestWin;
		if (margin >= 4 && (!best || margin > Math.abs(best.homeGoals - best.awayGoals) || (margin === Math.abs(best.homeGoals - best.awayGoals) && r.homeGoals + r.awayGoals > best.homeGoals + best.awayGoals))) {
			u.records.biggestWin = { season: ctx.season, round: ctx.round, ...r };
			const [w, l] = diff > 0 ? [r.home, r.away] : [r.away, r.home];
			pushNews(u, { season: ctx.season, round: ctx.round, kind: 'recorde', title: `Maior goleada da era BRASFC: ${clubName(w)} ${Math.max(r.homeGoals, r.awayGoals)}×${Math.min(r.homeGoals, r.awayGoals)} ${clubName(l)}`, body: 'O placar passa a ser o recorde do universo desta carreira.', clubs: [w, l], tone: 'neutra', importance: 2 });
		}
		for (const [club, gf, ga, opp] of [[r.home, r.homeGoals, r.awayGoals, r.away], [r.away, r.awayGoals, r.homeGoals, r.home]] as const) {
			const mind = u.clubs[club];
			if (!mind) continue;
			const out: 'v' | 'e' | 'd' = gf > ga ? 'v' : gf === ga ? 'e' : 'd';
			mind.form = (mind.form + out).slice(-6);
			u.streaks[club] = out === 'v' ? (u.streaks[club] ?? 0) + 1 : 0;
			const streak = u.streaks[club];
			const ls = u.records.longestStreak;
			if (streak >= 6 && (!ls || streak > ls.wins)) {
				u.records.longestStreak = { season: ctx.season, clubId: club, wins: streak };
				pushNews(u, { season: ctx.season, round: ctx.round, kind: 'recorde', title: `${clubName(club)} chega a ${streak} vitórias seguidas`, body: 'É a maior sequência de vitórias registrada nesta carreira.', clubs: [club], tone: 'boa', importance: 2 });
			} else if (streak === 5 && club !== ctx.userClub) {
				pushNews(u, { season: ctx.season, round: ctx.round, kind: 'sequencia', title: `${clubName(club)} vence a quinta seguida`, body: `Embalado, o time de ${coachOf(u, club)?.name ?? 'seu técnico'} sobe de produção.`, clubs: [club], tone: 'boa', importance: 1 });
			}
			// Aprendizado tático da IA: cada jogo consolida o sistema em uso; os outros esquecem devagar.
			const cur = mind.mastery[mind.formation] ?? 45;
			mind.mastery[mind.formation] = r1(clamp(cur + 1.6 * Math.pow(1 - cur / 100, 1.3), 0, 92));
			for (const f of FORMATION_IDS) if (f !== mind.formation && (mind.mastery[f] ?? 0) > 30) mind.mastery[f] = r1((mind.mastery[f] ?? 0) - 0.15);
			if (club === ctx.userClub || !mind.coachId) continue;
			const diffStrength = ctx.strengthOf(club) - ctx.strengthOf(opp) + (club === r.home ? 2 : -2);
			let delta = confidenceAfterMatch(mind.board, out, diffStrength, false);
			// Pressão de sequência (cultura do futebol brasileiro): 3+ derrotas nos últimos 5 jogos pesam mais.
			const lastFive = mind.form.slice(-5);
			if (out === 'd' && [...lastFive].filter((x) => x === 'd').length >= 3) delta -= 2.5 * BOARD_PROFILES[mind.board].results;
			if (out === 'v' && mind.confidence < 50) delta += 1;
			mind.confidence = r1(clamp(mind.confidence + delta, 0, 100));
		}
	}
	if (!ctx.league) return u;

	// Posição na tabela pesa (só depois de algumas rodadas, e conforme o projeto).
	for (const [division, table] of Object.entries(ctx.tables)) {
		const n = table.length;
		if (n < 8 || ctx.round < 6) continue;
		table.forEach((club, i) => {
			const mind = u.clubs[club];
			if (!mind || club === ctx.userClub || !mind.coachId) return;
			const rep = getClub(club)?.reputation ?? 2;
			const expected = clamp(Math.round(n * (1 - (rep - 1) / 5)), 1, n);
			const gap = (expected - (i + 1)) / n; // >0: acima do esperado
			mind.confidence = r1(clamp(mind.confidence + gap * 1.2 * BOARD_PROFILES[mind.board].results, 0, 100));
		});
		// Liderança: notícia só quando o líder MUDA (a partir da 8ª rodada).
		const leader = table[0];
		const prevLeader = u.leaders?.[division];
		u.leaders = { ...(u.leaders ?? {}), [division]: leader };
		if (ctx.round >= 8 && leader && prevLeader && prevLeader !== leader && u.clubs[leader]) pushNews(u, { season: ctx.season, round: ctx.round, kind: 'lideranca', title: `${clubName(leader)} assume a liderança da ${divLabel(division)}`, body: `Passa o ${clubName(prevLeader)} na tabela.`, clubs: [leader, prevLeader], tone: 'neutra', importance: division === 'serie-a' ? 2 : 1 });
	}

	// Demissões: confiança abaixo do limite do perfil, com carência após troca recente.
	for (const [club, mind] of Object.entries(u.clubs)) {
		if (club === ctx.userClub || !mind.coachId) continue;
		const patience = BOARD_PROFILES[mind.board].patience;
		const limit = SACK_FLOOR * (1.3 - patience * 0.3);
		if (mind.confidence >= limit) continue;
		if (mind.changedAt !== null && ctx.round - mind.changedAt < 6) continue;
		if (ctx.round < 5) continue;
		const division = ctx.divisionOf(club);
		const old = u.coaches[mind.coachId];
		if (old) {
			u.coaches[old.id] = { ...old, clubId: null, reputation: clamp(old.reputation - 4, 5, 95), history: [...old.history, { season: ctx.season, clubId: club, division, position: (ctx.tables[division ?? '']?.indexOf(club) ?? -1) + 1 || null, outcome: 'demitido' }] };
		}
		const recent = mind.form.slice(-5);
		const losses = [...recent].filter((x) => x === 'd').length;
		const { coach, formationChanged } = hire(u, ctx, club, pickReplacement(u, club, division), division);
		pushNews(u, {
			season: ctx.season,
			round: ctx.round,
			kind: 'demissao',
			title: `${clubName(club)} demite ${old?.name ?? 'o técnico'}`,
			body: `${losses >= 3 ? `Foram ${losses} derrotas nos últimos ${recent.length} jogos. ` : ''}A diretoria (${BOARD_PROFILES[mind.board].label.toLowerCase()}) perdeu a confiança. ${coach.name} assume${formationChanged ? ` e muda o sistema para o ${mind.formation}` : ''}.`,
			clubs: [club],
			tone: 'ruim',
			importance: getClub(club)?.reputation && getClub(club)!.reputation >= 4 ? 3 : 2
		});
	}
	return u;
}

export interface SeasonEndContext {
	seed: number;
	season: number;
	/** classificação final por divisão */
	tables: Record<string, string[]>;
	points: Record<string, { points: number; games: number }>;
	champions: Record<string, string>;
	promoted: string[];
	relegated: string[];
	/** divisões da próxima temporada */
	next: Record<string, string[]>;
	cupChampion: string | null;
	userClub: string | null;
	formationFor: RoundContext['formationFor'];
}

/**
 * Fim de temporada: projetos mudam com acesso/queda/títulos, reputações dos técnicos sobem ou
 * caem pelo desempenho contra a expectativa, clubes grandes buscam técnicos em alta,
 * veteranos se aposentam e os recordes são consolidados.
 */
export function universeSeasonEnd(prev: UniverseState, ctx: SeasonEndContext): UniverseState {
	const u: UniverseState = structuredClone(prev);
	const round = 99;
	const divisionOf = (id: string) => Object.entries(ctx.tables).find(([, ids]) => ids.includes(id))?.[0] ?? null;
	let sackings = 0;
	let moves = 0;
	for (const n of u.news) if (n.season === ctx.season && n.kind === 'demissao') sackings++;
	// Títulos e campanhas.
	for (const [div, champ] of Object.entries(ctx.champions)) {
		u.records.titles[champ] = (u.records.titles[champ] ?? 0) + 1;
		pushNews(u, { season: ctx.season, round, kind: 'titulo', title: `${clubName(champ)} é campeão da ${divLabel(div)} ${ctx.season}`, body: `${coachOf(u, champ)?.name ? `Título sob o comando de ${coachOf(u, champ)!.name}.` : 'Título do clube.'}`, clubs: [champ], tone: 'boa', importance: div === 'serie-a' ? 3 : 2 });
	}
	if (ctx.cupChampion) {
		u.records.titles[ctx.cupChampion] = (u.records.titles[ctx.cupChampion] ?? 0) + 1;
		pushNews(u, { season: ctx.season, round, kind: 'titulo', title: `${clubName(ctx.cupChampion)} conquista a Copa do Brasil ${ctx.season}`, body: 'A taça mais democrática do país tem dono.', clubs: [ctx.cupChampion], tone: 'boa', importance: 3 });
	}
	for (const [club, p] of Object.entries(ctx.points)) {
		const div = divisionOf(club);
		if (!div || p.games < 10) continue;
		const best = u.records.bestCampaign;
		if (!best || p.points / p.games > best.points / best.games) u.records.bestCampaign = { season: ctx.season, clubId: club, division: div, points: p.points, games: p.games };
	}
	// Projetos e técnicos.
	for (const [club, mind] of Object.entries(u.clubs)) {
		const div = divisionOf(club);
		const table = div ? ctx.tables[div] : null;
		const pos = table ? table.indexOf(club) + 1 : null;
		const n = table?.length ?? 20;
		const rep = getClub(club)?.reputation ?? 2;
		const promoted = ctx.promoted.includes(club);
		const relegated = ctx.relegated.includes(club);
		const champion = Object.values(ctx.champions).includes(club) || ctx.cupChampion === club;
		const prevProject = mind.project;
		if (relegated) mind.project = rep >= 3 ? 'reconstrucao' : 'crise';
		else if (promoted) mind.project = 'crescimento';
		else if (champion) mind.project = 'titulo';
		else if (pos && pos > n * 0.75 && mind.project === 'titulo') mind.project = 'reconstrucao';
		else if (mind.project === 'crise' && pos && pos <= n / 2) mind.project = 'manutencao';
		else if (mind.project === 'reconstrucao' && ctx.season - mind.projectSince >= 2 && pos && pos <= n / 3) mind.project = 'crescimento';
		if (mind.project !== prevProject) {
			mind.projectSince = ctx.season + 1;
			if (club !== ctx.userClub && (relegated || promoted || mind.project === 'reconstrucao')) pushNews(u, { season: ctx.season, round, kind: 'projeto', title: `${clubName(club)}: ${PROJECT_INFO[mind.project].label.toLowerCase()}`, body: relegated ? 'Após a queda, a diretoria reformula o planejamento.' : promoted ? 'Com o acesso, o clube planeja crescer na nova divisão.' : 'A diretoria anuncia um novo ciclo para o elenco.', clubs: [club], tone: relegated ? 'ruim' : 'neutra', importance: 1 });
		}
		// Crise financeira muda a filosofia de clubes investidores rebaixados.
		if (relegated && mind.philosophy === 'compradora') mind.philosophy = 'sustentavel';
		mind.form = '';
		mind.changedAt = null;
		mind.confidence = r1(clamp(55 + (mind.confidence - 55) * 0.4 + (promoted || champion ? 15 : 0) - (relegated ? 10 : 0), 20, 90));
		if (!mind.coachId || club === ctx.userClub) continue;
		const coach = u.coaches[mind.coachId];
		if (!coach) continue;
		const expected = clamp(Math.round(n * (1 - (rep - 1) / 5)), 1, n);
		const delta = pos ? ((expected - pos) / n) * 18 : 0;
		const outcome: CoachRecord['outcome'] = champion ? 'campeao' : promoted ? 'acesso' : relegated ? 'queda' : 'mantido';
		coach.reputation = r1(clamp(coach.reputation + delta + (champion ? 8 : 0) + (promoted ? 5 : 0) - (relegated ? 7 : 0), 5, 95));
		if (champion) coach.titles++;
		coach.history = [...coach.history, { season: ctx.season, clubId: club, division: div, position: pos, outcome }].slice(-30);
		// Queda: técnico sai (diretorias pacientes mantêm quem está no projeto).
		if (relegated && BOARD_PROFILES[mind.board].patience < 1.4) {
			coach.clubId = null;
			coach.history[coach.history.length - 1].outcome = 'saiu';
			mind.coachId = null;
		}
	}
	// Clubes que chegam dos estaduais (acesso à Série D) entram no universo com diretoria própria.
	for (const ids of Object.values(ctx.next)) {
		for (const id of ids) {
			if (u.clubs[id]) continue;
			const board = boardProfileOf(ctx.seed, id);
			u.clubs[id] = { philosophy: philosophyOf(ctx.seed, id, board), board, project: 'crescimento', projectSince: ctx.season + 1, coachId: null, formation: '4-3-3', mastery: {}, confidence: 60, form: '', changedAt: null };
		}
	}
	// Mercado de técnicos: clubes grandes que decepcionaram buscam quem está em alta.
	const nextDiv = (id: string) => Object.entries(ctx.next).find(([, ids]) => ids.includes(id))?.[0] ?? null;
	const vacancies = Object.entries(u.clubs).filter(([club, m]) => club !== ctx.userClub && !m.coachId).map(([club]) => club);
	const ambitious = Object.entries(u.clubs)
		.filter(([club, m]) => club !== ctx.userClub && m.coachId && (getClub(club)?.reputation ?? 1) >= 4 && m.confidence < 50)
		.map(([club]) => club);
	for (const club of [...vacancies, ...ambitious].sort()) {
		const mind = u.clubs[club];
		const div = nextDiv(club);
		const rep = getClub(club)?.reputation ?? 2;
		// Candidatos: livres compatíveis ou técnicos em alta de clubes menores.
		const ceiling = (TIER_REP[div ?? ''] ?? 20) + rep * 6 + 14;
		const target = Object.values(u.coaches)
			.filter((c) => c.age < 70 && c.reputation <= ceiling && c.id !== mind.coachId && (!c.clubId || ((getClub(c.clubId)?.reputation ?? 1) < rep && c.reputation >= 50)))
			.sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id))[0];
		if (!target) {
			if (!mind.coachId) hire(u, { ...ctx, round: 0 }, club, null, div);
			continue;
		}
		const from = target.clubId;
		if (mind.coachId) {
			const old = u.coaches[mind.coachId];
			if (old) u.coaches[old.id] = { ...old, clubId: null, history: [...old.history.slice(0, -1), { ...(old.history[old.history.length - 1] ?? { season: ctx.season, clubId: club, division: div, position: null }), outcome: 'demitido' }] };
		}
		if (from && u.clubs[from]) {
			u.clubs[from].coachId = null;
			const repl = pickReplacement(u, from, nextDiv(from));
			hire(u, { ...ctx, round: 0 }, from, repl, nextDiv(from));
		}
		hire(u, { ...ctx, round: 0 }, club, target, div);
		moves++;
		pushNews(u, { season: ctx.season, round, kind: 'contratacao', title: `${target.name} é o novo técnico do ${clubName(club)}`, body: from ? `Deixa o ${clubName(from)} após boa temporada (reputação ${Math.round(target.reputation)}).` : `Estava sem clube; chega para o projeto de ${PROJECT_INFO[mind.project].label.toLowerCase()}.`, clubs: from ? [club, from] : [club], tone: 'neutra', importance: rep >= 4 ? 2 : 1 });
	}
	// Envelhecimento, aposentadoria e renovação do mercado de técnicos.
	let k = 0;
	for (const c of Object.values(u.coaches)) {
		c.age++;
		if (!c.clubId && c.age >= 70) delete u.coaches[c.id];
	}
	const free = Object.values(u.coaches).filter((c) => !c.clubId).length;
	for (; free + k < 24; k++) {
		const c = newCoach(ctx.seed, `livre-${ctx.season + 1}-${k}`, ctx.season + 1, null, 16 + (k % 6) * 5, null);
		u.coaches[c.id] = c;
	}
	u.log = [...u.log, { season: ctx.season, champions: { ...ctx.champions, ...(ctx.cupChampion ? { 'copa-do-brasil': ctx.cupChampion } : {}) }, promoted: [...ctx.promoted], relegated: [...ctx.relegated], sackings, moves }].slice(-60);
	u.streaks = {};
	u.leaders = {};
	u.season = ctx.season + 1;
	return u;
}

export function divLabel(div: string): string {
	return div.startsWith('serie-') ? `Série ${div.slice(6).toUpperCase()}` : div === 'copa-do-brasil' ? 'Copa do Brasil' : div;
}

/** Invariantes usados pelos testes de simulação prolongada. */
export function universeIssues(u: UniverseState): string[] {
	const issues: string[] = [];
	const owner = new Map<string, string>();
	for (const [club, m] of Object.entries(u.clubs)) {
		if (!m.coachId) continue;
		const c = u.coaches[m.coachId];
		if (!c) issues.push(`${club}: técnico ${m.coachId} inexistente`);
		else if (c.clubId !== club) issues.push(`${club}: técnico ${c.id} aponta para ${c.clubId}`);
		if (owner.has(m.coachId)) issues.push(`técnico ${m.coachId} em dois clubes`);
		owner.set(m.coachId, club);
		if (!Number.isFinite(m.confidence) || m.confidence < 0 || m.confidence > 100) issues.push(`${club}: confiança inválida`);
	}
	for (const c of Object.values(u.coaches)) {
		if (c.clubId && u.clubs[c.clubId]?.coachId !== c.id) issues.push(`técnico ${c.id} diz treinar ${c.clubId}, mas o clube tem outro`);
		if (!Number.isFinite(c.reputation)) issues.push(`técnico ${c.id}: reputação inválida`);
	}
	if (u.news.length > NEWS_CAP) issues.push('notícias acima do limite');
	return issues;
}
