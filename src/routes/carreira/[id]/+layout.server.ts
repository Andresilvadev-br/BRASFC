import { error, redirect } from '@sveltejs/kit';
import { careerCalendar } from '#lib/domain/view.ts';
import { universePreview } from '#lib/domain/universe.ts';
import { getDb } from '#lib/server/db/index.ts';
import { getCareer, isUuid, listMessages } from '#lib/server/repos/careers.ts';
import { listResults, recentUserMatches } from '#lib/server/repos/matches.ts';
import { logRequestFailure } from '#lib/server/request-error.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, params, depends, request, url }) => {
	depends('app:career');
	if (!locals.profile || !isUuid(params.id)) error(404, 'Carreira não encontrada.');
	const db = await getDb();
	const career = await getCareer(db, locals.profile.id, params.id);
	if (!career) error(404, 'Carreira não encontrada neste perfil.');
	// Um treinador desligado não pode acessar o banco de reservas ou administrar o antigo clube.
	// A Central de Propostas continua disponível e é a única tela de atuação até novo contrato.
	if (career.mode === 'coach' && career.data.club?.board.dismissed && url.pathname !== `/carreira/${career.id}/gabinete`) {
		redirect(303, `/carreira/${career.id}/gabinete`);
	}
	const degraded: string[] = [];
	const optional = async <T>(operation: string, read: Promise<T[]>): Promise<T[]> => {
		try { return await read; }
		catch (cause) {
			degraded.push(operation);
			logRequestFailure(locals.requestId, operation, request.method, cause);
			return [];
		}
	};
	const [messages, results, recentMatches] = await Promise.all([
		optional('mensagens recentes', listMessages(db, locals.profile.id, career.id, 4)),
		listResults(db, career.id, career.season),
		optional('partidas recentes', recentUserMatches(db, career.id, 5))
	]);
	if (career.data.universe) {
		const { next, upcoming } = careerCalendar(career, results);
		const clubs = [career.clubId, ...[next, upcoming].flatMap((fixture) => fixture ? [fixture.home, fixture.away] : [])];
		career.data = { ...career.data, universe: universePreview(career.data.universe, [...new Set(clubs)]) };
	}
	const recent = recentMatches.map(({ home, away, summary }) => ({ home, away, summary }));
	return { career, messages, results, recent, degraded };
};
