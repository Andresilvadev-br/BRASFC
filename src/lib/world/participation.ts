import type { ParticipationStatus } from './contract.ts';

export const STATUS_LABEL: Record<ParticipationStatus, string> = {
	'aguardando-estreia': 'Aguardando estreia',
	'em-disputa': 'Em disputa',
	classificado: 'Classificado',
	eliminado: 'Eliminado',
	'nao-classificado': 'Não classificado',
	campeao: 'Campeão'
};
