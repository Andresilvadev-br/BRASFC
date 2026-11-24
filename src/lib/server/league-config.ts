import { leagueOptions } from '#lib/domain/league-options.ts';
import { normalizeRoomName, RoomError, type LeagueConfig } from './repos/rooms.ts';

export function readLeagueConfig(body: Record<string, unknown>): { name: string; options: LeagueConfig } {
	const name = normalizeRoomName(body.name);
	if (!name) throw new RoomError('Informe um nome de 2 a 40 caracteres para a liga.', 400);
	// Dev 0.12: carreira online só de treinadores (modo ausente = treinador).
	const max = body.max;
	const mode = body.mode === undefined ? 'coach' : body.mode;
	if (mode !== 'coach' || typeof max !== 'number' || !Number.isInteger(max) || max < 2 || max > 16) {
		throw new RoomError('Escolha o modo da liga e informe de 2 a 16 vagas.', 400);
	}
	const rules = leagueOptions(body.rules);
	if (!rules) throw new RoomError('Configuração de temporada inválida.', 400);
	return { name, options: { mode, max, inviteOnly: body.inviteOnly === true,
		assistantsRequired: false, leagueOptions: rules } };
}
