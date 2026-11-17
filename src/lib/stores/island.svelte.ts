import type { IconName } from '#lib/ui/icons.ts';

/**
 * Dynamic Island do BRASFC: uma única cápsula no topo que comunica o que
 * está acontecendo agora (salvamentos, conexões, novas versões).
 * Substitui pilhas de toasts por um ponto fixo e previsível.
 */
export type IslandTone = 'neutral' | 'success' | 'info' | 'warning' | 'error' | 'gold';

export interface IslandActivity {
	id: string;
	icon: IconName;
	title: string;
	detail?: string;
	tone?: IslandTone;
	/** ms; padrão 3200. Ignorado em atividades persistentes. */
	duration?: number;
	action?: { label: string; run: () => void };
}

interface IslandState {
	transient: IslandActivity | null;
	persistent: Record<string, IslandActivity>;
	context: string;
}

export const island = $state<IslandState>({ transient: null, persistent: {}, context: '' });

const queue: IslandActivity[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;

function showNext() {
	timer = null;
	const next = queue.shift() ?? null;
	island.transient = next;
	if (next) timer = setTimeout(showNext, next.duration ?? 3200);
}

/** Mensagem passageira (salvou, erro, etc.). Mensagens iguais seguidas são agrupadas. */
export function notify(activity: Omit<IslandActivity, 'id'> & { id?: string }) {
	const item: IslandActivity = { ...activity, id: activity.id ?? `n${++seq}` };
	if (island.transient && island.transient.title === item.title && !queue.length) {
		island.transient = item;
		if (timer) clearTimeout(timer);
		timer = setTimeout(showNext, item.duration ?? 3200);
		return;
	}
	queue.push(item);
	if (queue.length > 4) queue.splice(0, queue.length - 4);
	if (!timer) showNext();
}

export function dismissTransient() {
	if (timer) clearTimeout(timer);
	showNext();
}

/** Estado contínuo (ex.: conectado a uma sala, nova versão disponível). */
export function setPersistent(key: string, activity: Omit<IslandActivity, 'id'> | null) {
	if (activity) island.persistent[key] = { ...activity, id: `p-${key}` };
	else delete island.persistent[key];
}

export function setIslandContext(text: string) {
	island.context = text;
}

/** O que a ilha mostra agora: passageira > persistente mais recente > contexto. */
export function currentActivity(): IslandActivity | null {
	if (island.transient) return island.transient;
	const keys = Object.keys(island.persistent);
	return keys.length ? island.persistent[keys[keys.length - 1]] : null;
}
