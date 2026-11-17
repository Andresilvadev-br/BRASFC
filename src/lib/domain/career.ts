import { isAppearance, type Appearance } from './appearance.ts';
import { getClub, LEAGUE, type Club } from './clubs.ts';
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

export interface PlayerProfile {
	age: number;
	overall: number;
	potential: number;
	number: number;
	reputation: number;
}

export interface CareerData {
	appearance?: Appearance;
	position?: Position;
	player?: PlayerProfile;
	tactic?: Tactic;
	trainingFocus?: TeamFocus;
	playerFocus?: PlayerFocus;
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

	const clubId = typeof v.clubId === 'string' ? v.clubId : '';
	if (!getClub(clubId)) errors.clubId = 'Escolha um clube.';

	let appearance: Appearance | undefined;
	if (v.appearance !== undefined) {
		if (isAppearance(v.appearance)) appearance = { ...v.appearance };
		else errors.appearance = 'Aparência inválida.';
	}

	let position: Position | undefined;
	if (mode === 'player') {
		if (isPosition(v.position)) position = v.position;
		else errors.position = 'Escolha a posição do seu jogador.';
		if (!appearance) errors.appearance ??= 'Defina a aparência do seu jogador.';
	}

	if (Object.keys(errors).length) return { ok: false, errors };
	return { ok: true, value: { mode: mode as CareerMode, personName, clubId, appearance, position } };
}

/** Dados iniciais persistidos de uma carreira nova. */
export function initialCareerData(input: CreateCareerInput, seed: number): CareerData {
	const data: CareerData = { appearance: input.appearance };
	if (input.mode === 'player' && input.position) {
		const rng = createRng(deriveSeed(seed, 'player'));
		const overall = rng.int(54, 60);
		data.position = input.position;
		data.player = {
			age: 18,
			overall,
			potential: Math.min(92, overall + rng.int(18, 28)),
			number: input.position === 'GOL' ? 31 : rng.int(26, 39),
			reputation: 1
		};
		data.playerFocus = input.position === 'GOL' ? 'goleiro' : 'fisico';
	} else {
		data.trainingFocus = 'equilibrado';
	}
	return data;
}

export const CAREER_START = { date: SEASON_START, season: LEAGUE.season } as const;

export function boardExpectation(club: Club): string {
	return [
		'',
		'permanecer na Liga BRASFC',
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
	const date = SEASON_START;
	const firstRound = formatLong(FIRST_ROUND);
	const disclaimer: NewMessage = {
		kind: 'normal',
		sender: 'Equipe BRASFC',
		subject: 'Sobre esta versão (Dev 0.1)',
		body:
			'Esta é a primeira versão técnica do BRASFC. Clubes, elencos, notícias e classificação são dados demonstrativos e fictícios. ' +
			'O motor de partidas, as finanças e o avanço do calendário chegam nas próximas etapas. Sua carreira, sua tática e suas mensagens já ficam salvas.',
		gameDate: date
	};

	if (input.mode === 'coach') {
		return [
			{
				kind: 'important',
				sender: `Diretoria — ${club.name}`,
				subject: `Bem-vindo ao ${club.name}`,
				body: `${input.personName}, é um prazer anunciar você como novo treinador. A expectativa da diretoria para 2027 é ${boardExpectation(club)}. Conte conosco.`,
				gameDate: date
			},
			{
				kind: 'important',
				sender: LEAGUE.name,
				subject: 'Calendário da temporada 2027 divulgado',
				body: `A ${LEAGUE.name} 2027 começa no(a) ${firstRound.toLowerCase()}. São 38 rodadas em turno e returno com 20 clubes.`,
				gameDate: date
			},
			{
				kind: 'normal',
				sender: 'Auxiliar técnico',
				subject: 'Primeira semana de pré-temporada',
				body: 'Preparei uma escalação inicial com base nas posições do elenco. Revise a central tática quando puder — o relatório da escalação fica disponível lá.',
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
			body: 'Sua avaliação física foi registrada. Escolha seu foco de treino individual na área de treinamentos.',
			gameDate: date
		},
		disclaimer
	];
}
