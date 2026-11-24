import { getContext, setContext } from 'svelte';
import type { Career } from '#lib/domain/career.ts';
import type { NegotiationLog } from '#lib/domain/management.ts';
import type { Tactic } from '#lib/domain/tactics.ts';
import type { TrainingPlan } from '#lib/domain/drills.ts';
import type { SyncChannel } from '#lib/stores/sync.svelte.ts';

/**
 * Dev 0.12 · camada única entre as telas da carreira e o armazenamento.
 *
 * As mesmas telas (Elenco, Táticas, Treinos, Finanças, Clube, Base, Comissão e Gabinete) rodam na
 * carreira offline e na carreira online. Elas nunca chamam a API diretamente: pedem à porta.
 *  - `local`: o save da carreira (servidor local no offline, API de carreiras no navegador);
 *  - `online`: o universo compartilhado da liga (comandos autoritativos com revisão e idempotência).
 * As regras de futebol e de gestão são as mesmas dos dois lados (domínio compartilhado no servidor).
 */
export type PortFeature = 'job-market' | 'presets' | 'board-requests';

export interface ClubActionOutcome {
	message: string;
	career?: Career;
	negotiation?: NegotiationLog | null;
}

/** `queued`: a conexão caiu e a alteração ficou na fila local (Hybrid Save Engine) */
export interface SaveOutcome {
	ok: boolean;
	message?: string;
	queued?: boolean;
}

export interface CareerPort {
	kind: 'local' | 'online';
	/** link para outra tela da mesma carreira */
	href(section: string, hash?: string): string;
	/** ações de gestão do clube (mercado, contratos, base, finanças, gabinete…), validadas no servidor */
	clubAction(body: Record<string, unknown>): Promise<ClubActionOutcome>;
	/** salva a tática; `base` é a tática sobre a qual o rascunho foi feito (detecta edição concorrente) */
	saveTactic(tactic: Tactic, base: Tactic): Promise<SaveOutcome>;
	saveTrainingPlan(plan: TrainingPlan): Promise<SaveOutcome>;
	/** operações da biblioteca "Minhas Táticas" */
	presetOp(op: Record<string, unknown>): Promise<{ message: string; queued?: boolean }>;
	/** dispensar uma dica do auxiliar (preferência do treinador) */
	dismissTip(id: string): Promise<void>;
	/** recarrega os dados oficiais da tela */
	refresh(): Promise<void>;
	supports(feature: PortFeature): boolean;
	/** canal de sincronização (fila local + estado para os indicadores) */
	readonly sync?: SyncChannel | null;
}

const KEY = Symbol('brasfc.career-port');

export function provideCareerPort(port: CareerPort): CareerPort {
	setContext(KEY, port);
	return port;
}

export function careerPort(): CareerPort {
	const port = getContext<CareerPort | undefined>(KEY);
	if (!port) throw new Error('Tela de carreira sem porta de armazenamento (provideCareerPort).');
	return port;
}
