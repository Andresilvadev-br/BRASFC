import { ROSTER_CATALOG, type RosterCatalogId } from '#lib/data/roster-catalog.ts';
import type { UniverseState } from './universe.ts';
import type { OfficeState } from './office.ts';
import { isAppearance, type Appearance } from './appearance.ts';
import { CLUBES_2026, TEMPORADA_2026 } from '#lib/data/brasil.ts';
import { CLUBS, getClub, LEAGUE, type Club } from './clubs.ts';
import type { TrainingPlan } from './drills.ts';
import { DIVISION_LABELS, divisionOf, firstRoundDate, initialLeague, seasonStartDate, type LeagueState, type SeasonSummary, type World } from './league.ts';
import type { TacticalState } from './tactical.ts';
import { initialCup, type CupState } from './cup.ts';
import type { ClubState } from './management.ts';
import type { MarketState } from './market.ts';
import { initialPlayerCareer, type PlayerCareerState } from './careerlife.ts';
import { formatLong } from './dates.ts';
import { isPosition, POSITION_INFO, type Position } from './positions.ts';
import { createRng, deriveSeed } from './rng.ts';
import { FIRST_ROUND, SEASON_START } from './season.ts';
import type { Tactic } from './tactics.ts';
import type { PlayerFocus, TeamFocus } from './training.ts';

export const CAREER_MODES = ['coach', 'player'] as const;
export type CareerMode = (typeof CAREER_MODES)[number];

export const MODE_LABELS: Record<CareerMode, string> = {
	coach: 'Carreira de Treinador',
	player: 'Carreira de Jogador'
};

export type DominantFoot = 'direito' | 'esquerdo';

export interface PlayerProfile {
	nationality?: string;
	foot?: DominantFoot;
	age: number;
	overall: number;
	potential: number;
	number: number;
	reputation: number;
}

export interface CareerData {
/** Edição imutável do elenco inicial. Ausente em saves legados. */
rosterCatalog?: RosterCatalogId;
appearance?: Appearance;
position?: Position;
player?: PlayerProfile;
tactic?: Tactic;
trainingFocus?: TeamFocus;
playerFocus?: PlayerFocus;
// ── Dev 0.3
/** mundo da carreira; ausente = liga fictícia (saves da Dev 0.1/0.2) */
world?: World;
/** divisões da temporada em andamento */
league?: LeagueState;
/** primeira temporada da carreira */
firstSeason?: number;
/** domínio tático progressivo do clube */
tactical?: TacticalState | null;
/** plano semanal de treinos */
trainingPlan?: TrainingPlan;
/** condição física persistente de cada atleta do clube */
fitness?: Record<string, number>;
/** resumo das temporadas encerradas */
seasons?: SeasonSummary[];
/** recomendações do auxiliar que o usuário dispensou */
dismissedTips?: string[];
// ── Dev 0.4
/** Copa do Brasil da temporada em andamento (sorteios e entradas) */
cup?: CupState;
/** gestão do clube: finanças, diretoria, patrocínios, estrutura, base e olheiros */
club?: ClubState;
/** mercado: transferências, contratos e atletas criados pela carreira */
market?: MarketState;
/** carreira de jogador: contrato, empresário, propostas, objetivos e prêmios */
playerCareer?: PlayerCareerState;
// ── Dev 0.5
/** futebol brasileiro vivo: clubes da IA, técnicos, notícias e recordes */
universe?: UniverseState;
/** gabinete do treinador: contrato, reuniões, coletivas, marcos e histórico */
office?: OfficeState;
}

export interface Career {
	id: string;
	mode: CareerMode;
	personName: string;
	clubId: string;
	seed: number;
	season: number;
	gameDate: string;
	data: CareerData;
	version: number;
	createdAt: string;
	updatedAt: string;
	unreadMessages?: number;
}

export interface CreateCareerInput {
mode: CareerMode;
personName: string;
clubId: string;
appearance?: Appearance;
position?: Position;
age?: number;
nationality?: string;
foot?: DominantFoot;
/** 'brasil' = clubes reais (Séries A/B/C 2026); padrão: liga fictícia */
world?: World;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

const NAME_PATTERN = /^[\p{L}][\p{L}\p{M} .'-]*$/u;

export function normalizeName(value: string): string {
	return value.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export function validateCreateCareer(input: unknown): ValidationResult<CreateCareerInput> {
	const errors: Record<string, string> = {};
	const v = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;

	const mode = v.mode;
	if (mode !== 'coach' && mode !== 'player') errors.mode = 'Escolha o modo de carreira.';

	const personName = typeof v.personName === 'string' ? normalizeName(v.personName) : '';
	if (personName.length < 2) errors.personName = 'Digite um nome com pelo menos 2 letras.';
	else if (personName.length > 40) errors.personName = 'Use no máximo 40 caracteres.';
	else if (!NAME_PATTERN.test(personName)) errors.personName = 'Use apenas letras, espaços, apóstrofo, ponto ou hífen.';

	const world: World = v.world === 'brasil' ? 'brasil' : 'brasfc';
	const clubId = typeof v.clubId === 'string' ? v.clubId : '';
	const validClub = world === 'brasil' ? CLUBES_2026.some((c) => c.id === clubId && c.serie !== 'E') : CLUBS.some((c) => c.id === clubId);
	if (!getClub(clubId) || !validClub) errors.clubId = 'Escolha um clube.';

	let appearance: Appearance | undefined;
	if (v.appearance !== undefined) {
		if (isAppearance(v.appearance)) appearance = { ...v.appearance };
		else errors.appearance = 'Aparência inválida.';
	}

	let position: Position | undefined;
	const age = v.age === undefined ? 18 : Number.isInteger(v.age) ? Number(v.age) : 0;
	const nationality = v.nationality === undefined ? 'Brasil' : typeof v.nationality === 'string' ? normalizeName(v.nationality) : '';
	const foot = v.foot === undefined ? 'direito' : v.foot;

	if (mode === 'player') {
		if (age < 16 || age > 35) errors.age = 'Escolha uma idade entre 16 e 35 anos.';
		if (nationality.length < 2 || nationality.length > 40 || !NAME_PATTERN.test(nationality)) errors.nationality = 'Informe sua nacionalidade.';
		if (foot !== 'esquerdo' && foot !== 'direito') errors.foot = 'Escolha o pé dominante.';
		if (isPosition(v.position)) position = v.position;
		else errors.position = 'Escolha a posição do seu jogador.';
		if (!appearance) errors.appearance ??= 'Defina a aparência do seu jogador.';
	}

	if (Object.keys(errors).length) return { ok: false, errors };
	return { ok: true, value: { mode: mode as CareerMode, personName, clubId, appearance, position, world, ...(mode === 'player' ? { age, nationality, foot: foot as DominantFoot } : {}) } };
}

/** Dados iniciais persistidos de uma carreira nova. */
export function initialCareerData(input: CreateCareerInput, seed: number): CareerData {
	const world = input.world ?? 'brasfc';
	const start = careerStart(world);
	const data: CareerData = { appearance: input.appearance, world, firstSeason: start.season, league: initialLeague(world, start.season), ...(world === 'brasil' ? { cup: initialCup(start.season), rosterCatalog: ROSTER_CATALOG } : {}) };
	if (input.mode === 'player' && input.position) {
		const rng = createRng(deriveSeed(seed, 'player'));
		const age = input.age ?? 18;
		const overall = rng.int(54, 60) + Math.min(12, Math.max(0, (age - 18) * 2));
		data.position = input.position;
		data.player = {
			age,
			nationality: input.nationality ?? 'Brasil',
			foot: input.foot ?? 'direito',
			overall,
			potential: Math.min(92, overall + Math.max(3, rng.int(18, 28) - Math.max(0, age - 20) * 2)),
			number: input.position === 'GOL' ? 31 : rng.int(26, 39),
			reputation: 1
		};
		data.playerCareer = initialPlayerCareer(seed, data.player, divisionOf(data.league!, input.clubId), start.season, input.clubId, start.date);
		data.playerFocus = input.position === 'GOL' ? 'goleiro' : 'fisico';
	} else {
		data.trainingFocus = 'equilibrado';
	}
	return data;
}

export const CAREER_START = { date: SEASON_START, season: LEAGUE.season } as const;

/** Início da carreira por mundo: a liga fictícia começa em 2027; a base real, em 2026. */
export function careerStart(world: World): { date: string; season: number } {
return world === 'brasil' ? { date: seasonStartDate(TEMPORADA_2026.temporada), season: TEMPORADA_2026.temporada } : { ...CAREER_START };
}

/**
 * Mundo da carreira. Carreiras antigas (antes do campo `world`) com clube real
 * ficavam na Liga BRASFC fictícia, onde o clube não existe: sem jogos nem tabela.
 * O clube decide: clube que não é da liga fictícia só pode ser do Brasil 2026.
 */
const FICTIONAL = new Set(CLUBS.map((c) => c.id));
export function careerWorld(c: Pick<Career, 'data'> & Partial<Pick<Career, 'clubId'>>): World {
	if (c.data.world === 'brasil') return 'brasil';
	return c.clubId && !FICTIONAL.has(c.clubId) && CLUBES_2026.some((r) => r.id === c.clubId) ? 'brasil' : 'brasfc';
}

export function boardExpectation(club: Club, competition: string = LEAGUE.name): string {
	return [
		'',
		`permanecer na ${competition}`,
		'terminar longe da zona de rebaixamento',
		'fazer uma campanha sólida no meio da tabela',
		'brigar pelas primeiras posições',
		'disputar o título desde a primeira rodada'
	][club.reputation];
}

export interface NewMessage {
	kind: 'important' | 'normal';
	sender: string;
	subject: string;
	body: string;
	gameDate: string;
}

/** Mensagens reais da caixa de entrada criadas junto com a carreira. */
export function welcomeMessages(input: CreateCareerInput): NewMessage[] {
	const club = getClub(input.clubId)!;
	const world = input.world ?? 'brasfc';
	const start = careerStart(world);
	const date = start.date;
	const league = initialLeague(world, start.season);
	const div = (Object.entries(league.divisions).find(([, ids]) => ids?.includes(club.id))?.[0] ?? LEAGUE.id) as keyof typeof DIVISION_LABELS;
	const comp = DIVISION_LABELS[div];
	const firstRound = formatLong(world === 'brasil' ? firstRoundDate(start.season) : FIRST_ROUND);
	const disclaimer: NewMessage = {
		kind: 'normal',
		sender: 'Equipe BRASFC',
		subject: 'Sobre os dados deste universo',
		body:
			world === 'brasil'
				? 'Clubes e cidades das Séries A, B, C e D de 2026 e os participantes da Copa do Brasil 2026 foram conferidos em fontes públicas. A seleção identifica os elencos verificados e informa quando o clube usa vagas simuladas. As notas, os contratos de jogo e a economia seguem o modelo do BRASFC. Temporadas a partir de 2027 seguem as regras anunciadas pela CBF (Série C com 24 e 28 clubes) e projeções do BRASFC quando não há regulamento.'
				: 'Os clubes e elencos desta liga são fictícios. Partidas, táticas, treinos e resultados são simulados pelo motor do BRASFC e ficam salvos na sua carreira.',
		gameDate: date
	};
	if (input.mode === 'coach') {
		return [
			{
				kind: 'important',
				sender: `Diretoria — ${club.name}`,
				subject: `Bem-vindo ao ${club.name}`,
				body: `${input.personName}, é um prazer anunciar você como novo treinador. A expectativa da diretoria para ${start.season} é ${boardExpectation(club, comp)}. Conte conosco.`,
				gameDate: date
			},
			{
				kind: 'important',
				sender: comp,
				subject: `Calendário da temporada ${start.season} divulgado`,
				body: `A ${comp} ${start.season} começa no(a) ${firstRound.toLowerCase()}.`,
				gameDate: date
			},
			{
				kind: 'normal',
				sender: 'Auxiliar técnico',
				subject: 'Primeira semana de pré-temporada',
				body: 'Preparei uma escalação inicial e um plano de treinos. O domínio tático do elenco cresce com jogos e treinos — trocar de esquema toda semana atrapalha. Veja minhas recomendações no painel.',
				gameDate: date
			},
			disclaimer
		];
	}
	const pos = input.position ? POSITION_INFO[input.position].label.toLowerCase() : 'jogador';
	return [
		{
			kind: 'important',
			sender: `Coordenação — ${club.name}`,
			subject: 'Bem-vindo ao elenco profissional',
			body: `${input.personName}, você foi promovido ao elenco principal como ${pos}. Mostre seu valor nos treinos para conquistar espaço entre os titulares.`,
			gameDate: date
		},
		{
			kind: 'normal',
			sender: 'Preparador físico',
			subject: 'Avaliação inicial concluída',
			body: 'Sua avaliação física foi registrada. Agende sessões individuais em Desenvolvimento, na central do jogador.',
			gameDate: date
		},
		disclaimer
	];
}
