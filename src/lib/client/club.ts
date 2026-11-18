import { invalidate } from '$app/navigation';
import type { Career } from '#lib/domain/career.ts';

export interface ClubActionResult {
	career: Career;
	message: string;
	negotiation: { club_answer: string; player_answer: string | null; message: string; done: boolean } | null;
}

/** Envia uma ação de gestão ao servidor (validada lá) e recarrega a carreira. Erros viram mensagem. */
export async function clubAction(careerId: string, version: number, body: Record<string, unknown>): Promise<ClubActionResult> {
	const res = await fetch(`/api/careers/${careerId}/club`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ version, ...body })
	});
	const json = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error((json as { message?: string }).message ?? `Erro ${res.status}`);
	await invalidate('app:career');
	return json as ClubActionResult;
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
