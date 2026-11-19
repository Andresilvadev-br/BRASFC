import { api, withCareerVersion } from '#lib/api.ts';
import { invalidate } from '$app/navigation';
import type { Career } from '#lib/domain/career.ts';

export interface ClubActionResult {
	career: Career;
	message: string;
	negotiation: { club_answer: string; player_answer: string | null; message: string; done: boolean } | null;
}

/** Envia uma ação de gestão ao servidor (validada lá) e recarrega a carreira. Erros viram mensagem. */
export async function clubAction(careerId: string, version: number, body: Record<string, unknown>): Promise<ClubActionResult> {
	const json = await withCareerVersion(careerId, version, (v) => api<ClubActionResult>(`/api/careers/${careerId}/club`, { body: { version: v, ...body } }));
	await invalidate('app:career');
	return json;
}

export async function clubHistory(careerId: string) {
	const res = await fetch(`/api/careers/${careerId}/club`, { headers: { accept: 'application/json' } });
	if (!res.ok) throw new Error('Não foi possível carregar o histórico.');
	return (await res.json()) as {
		ledger: Array<{ season: number; gameDate: string; category: string; amount: number; description: string }>;
		transfers: Array<{ season: number; gameDate: string; playerId: string; playerName: string; from: string | null; to: string | null; kind: string; fee: number; wage: number }>;
		history: Array<{ season: number; kind: string; competition: string; data: Record<string, unknown> }>;
	};
}
