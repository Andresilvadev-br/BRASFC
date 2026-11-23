import type { Career } from '#lib/domain/career.ts';
import { isUnemployed } from '#lib/domain/employment.ts';
import { simulateOtherFixtures } from '#lib/domain/matchday.ts';
import type { Fixture } from '#lib/domain/season.ts';
import { careerView } from '#lib/domain/view.ts';
import type { Db } from './db/index.ts';
import { listResults } from './repos/matches.ts';
import { getCareer } from './repos/careers.ts';
import { planRound } from './rounds.ts';

/**
 * Pré-cálculo dos demais jogos da rodada (Dev 0.12 — retorno rápido após a partida).
 *
 * Os outros jogos dependem só do estado salvo (elencos, tabela, sementes), nunca das decisões do
 * usuário. Enquanto o treinador assiste à própria partida, o servidor já os simula em pequenas
 * fatias (sem travar outras requisições). Na hora de registrar a rodada, o resultado é usado se a
 * VERSÃO do save e o passo do calendário forem os mesmos — caso contrário, tudo é recalculado.
 * O resultado é idêntico ao calculado na hora: apenas fica pronto antes.
 */
type Sim = ReturnType<typeof simulateOtherFixtures>[number];
interface Entry { key: string; fixtures: string; at: number; done: Sim[] | null; running: boolean }

const MAX_ENTRIES = 32;
const TTL_MS = 30 * 60_000;
const cache = new Map<string, Entry>();

const keyOf = (career: Pick<Career, 'id' | 'version'>, step: string) => `${career.id}:${career.version}:${step}`;
const signature = (fixtures: Fixture[]) => fixtures.map((f) => `${f.competition}:${f.round}:${f.home}:${f.away}`).join('|');

function prune(now = Date.now()) {
	for (const [k, e] of cache) if (now - e.at > TTL_MS) cache.delete(k);
	while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
}

/** Usa (e descarta) o pré-cálculo se ele corresponde exatamente a estes jogos. */
export function takePrefetched(career: Pick<Career, 'id' | 'version'>, step: string, others: Fixture[]): Sim[] | null {
	const key = keyOf(career, step);
	const entry = cache.get(key);
	if (!entry?.done) return null;
	cache.delete(key);
	return entry.fixtures === signature(others) ? entry.done : null;
}

const yieldToLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * Agenda o pré-cálculo do próximo passo da carreira (operação secundária, nunca lança erro).
 * Sempre relê o save completo do banco: telas recebem versões resumidas do universo.
 */
export function prefetchRound(db: Db, profileId: string, careerId: string): void {
	void (async () => {
		try {
			const career = await getCareer(db, profileId, careerId);
			if (!career || career.mode !== 'coach') return;
			const results = await listResults(db, career.id, career.season);
			const view = careerView(career, results);
			if (view.seasonOver || !view.step) return;
			const key = keyOf(career, view.step.key);
			if (cache.has(key)) return;
			const plan = planRound(career, results, view);
			const unemployed = isUnemployed(career);
			const mine = unemployed ? null : plan.fixtures.find((f) => f.home === career.clubId || f.away === career.clubId) ?? null;
			const others = plan.fixtures.filter((f) => f !== mine);
			const entry: Entry = { key, fixtures: signature(others), at: Date.now(), done: null, running: true };
			cache.set(key, entry);
			prune();
			const ctx = { season: career.season, firstSeason: view.firstSeason };
			const out: Sim[] = [];
			for (const f of others) {
				await yieldToLoop(); // uma partida por fatia: outras requisições seguem sendo atendidas
				if (cache.get(key) !== entry) return; // substituído ou consumido
				out.push(...simulateOtherFixtures(career, [f], ctx, { full: plan.full, strengthOf: plan.strengthOf }));
			}
			entry.done = out;
			entry.running = false;
		} catch {
			// pré-cálculo é opcional: em caso de falha, a rodada calcula tudo normalmente
		}
	})();
}

/** Só para testes e diagnóstico. */
export function prefetchState(career: Pick<Career, 'id' | 'version'>, step: string): 'pronto' | 'calculando' | 'ausente' {
	const e = cache.get(keyOf(career, step));
	return !e ? 'ausente' : e.done ? 'pronto' : 'calculando';
}
