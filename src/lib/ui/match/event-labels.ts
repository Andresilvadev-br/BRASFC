import type { EventType } from '#lib/engine/types.ts';

/** Descrição em português de cada tipo de lance do motor (nunca exibir a chave técnica). */
export const EVENT_LABELS: Record<EventType, string> = {
	kickoff: 'Início de jogo',
	half_time: 'Intervalo',
	second_half: 'Segundo tempo',
	full_time: 'Fim de jogo',
	pass: 'Passe',
	pass_fail: 'Passe errado',
	interception: 'Interceptação',
	dribble: 'Drible',
	dribble_fail: 'Drible desarmado',
	tackle: 'Desarme',
	cross: 'Cruzamento',
	clearance: 'Corte da defesa',
	shot: 'Finalização',
	shot_saved: 'Defesa do goleiro',
	shot_off: 'Finalização para fora',
	shot_blocked: 'Chute bloqueado',
	goal: 'Gol',
	goal_disallowed: 'Gol anulado',
	aerial: 'Disputa aérea',
	corner: 'Escanteio',
	throw_in: 'Lateral',
	goal_kick: 'Tiro de meta',
	free_kick: 'Cobrança de falta',
	penalty: 'Pênalti',
	penalty_miss: 'Pênalti perdido',
	foul: 'Falta',
	offside: 'Impedimento',
	yellow: 'Cartão amarelo',
	red: 'Cartão vermelho',
	injury: 'Lesão',
	sub: 'Substituição',
	tactic: 'Ajuste tático'
};

/** Categoria visual do lance na linha do tempo. */
export function eventTone(type: EventType): 'goal' | 'card' | 'red' | 'chance' | 'phase' | 'neutral' {
	if (type === 'goal') return 'goal';
	if (type === 'yellow') return 'card';
	if (type === 'red' || type === 'goal_disallowed' || type === 'penalty_miss') return 'red';
	if (type === 'shot' || type === 'shot_saved' || type === 'shot_off' || type === 'shot_blocked' || type === 'penalty' || type === 'corner' || type === 'free_kick') return 'chance';
	if (type === 'half_time' || type === 'second_half' || type === 'full_time' || type === 'kickoff') return 'phase';
	return 'neutral';
}

export function eventLabel(type: string): string {
	return EVENT_LABELS[type as EventType] ?? 'Lance';
}

/** Nome legível da competição a partir do id interno. */
export function competitionLabel(id?: string): string {
	if (id === 'copa-do-brasil') return 'Copa do Brasil';
	if (id?.startsWith('serie-')) return `Série ${id.at(-1)?.toUpperCase()}`;
	return 'BRASFC';
}
