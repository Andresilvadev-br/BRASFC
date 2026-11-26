import { api, withCareerVersion } from '#lib/api.ts';
import { invalidate, invalidateAll } from '$app/navigation';
import type { NegotiationLog } from '#lib/domain/management.ts';
import type { Career } from '#lib/domain/career.ts';

export interface ClubActionResult {
	career: Career;
	message: string;
	negotiation: NegotiationLog | null;
}

/** Envia uma ação de gestão ao servidor (validada lá) e recarrega a carreira. Erros viram mensagem. */
export async function clubAction(careerId: string, version: number, body: Record<string, unknown>): Promise<ClubActionResult> {
	const json = await withCareerVersion(careerId, version, (v) => api<ClubActionResult>(`/api/careers/${careerId}/club`, { body: { version: v, ...body } }));
	// Negociação com outro treinador humano (0.13): o controle passou ao vendedor — recarrega tudo.
	if ((json as { handoff?: boolean }).handoff) await invalidateAll();
	else await invalidate('app:career');
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
