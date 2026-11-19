import { createRng, deriveSeed, type Rng } from './rng.ts';

/**
 * Simulação RÁPIDA de partidas (Dev 0.3.1) para jogos fora da competição do usuário.
 *
 * Uma rodada do mundo Brasil tem até ~140 partidas (Séries A–D + Copa do Brasil). O motor completo
 * (segundo a segundo) leva ~130 ms por jogo; por isso, como em todo jogo de gerenciamento, os jogos
 * que o usuário não acompanha usam um modelo estatístico CALIBRADO PELO PRÓPRIO MOTOR:
 * gols ~ Poisson(λ), com λ dependente da diferença de força entre os elencos e do mando.
 * Os parâmetros vêm de `scripts/quick-calibrate.ts` (motor completo, clubes reais, técnicos da IA).
 *
 * Determinístico: mesma semente → mesmo placar (servidor e navegador concordam).
 */
export const QUICK_MODEL = {
	/** gols esperados do mandante e do visitante entre times iguais */
	home: 1.37,
	away: 0.98,
	/** sensibilidade por ponto de força (média dos 11 melhores) */
	beta: 0.088,
	/** origem dos parâmetros: 280 jogos do motor completo (2,41 gols/jogo; mandante vence 39%) */
	fonte: 'scripts/quick-calibrate.ts'
} as const;

function poisson(rng: Rng, lambda: number): number {
	const l = Math.exp(-lambda);
	let k = 0;
	let p = 1;
	do {
		k++;
		p *= rng.next();
	} while (p > l && k < 15);
	return k - 1;
}

export interface QuickResult {
	homeGoals: number;
	awayGoals: number;
}

/** Placar rápido a partir da força dos dois elencos (média dos 11 melhores). */
export function quickMatch(homeStrength: number, awayStrength: number, seed: number, neutral = false): QuickResult {
	const rng = createRng(deriveSeed(seed, 'quick'));
	const d = homeStrength - awayStrength;
	const adv = neutral ? (QUICK_MODEL.home + QUICK_MODEL.away) / 2 : 0;
	const lh = (neutral ? adv : QUICK_MODEL.home) * Math.exp(QUICK_MODEL.beta * d);
	const la = (neutral ? adv : QUICK_MODEL.away) * Math.exp(-QUICK_MODEL.beta * d);
	return { homeGoals: poisson(rng, lh), awayGoals: poisson(rng, la) };
}

/**
 * Disputa de pênaltis determinística (5 cobranças + alternadas). A chance de cada cobrança
 * depende da força dos elencos (finalizadores × goleiro) — referência real ~75%.
 */
export function penaltyShootout(homeStrength: number, awayStrength: number, seed: number): { home: number; away: number; winner: 'home' | 'away'; kicks: Array<{ side: 'home' | 'away'; scored: boolean }> } {
	const rng = createRng(deriveSeed(seed, 'penaltis'));
	const p = (att: number, def: number) => Math.max(0.6, Math.min(0.88, 0.75 + (att - def) * 0.004));
	const ph = p(homeStrength, awayStrength);
	const pa = p(awayStrength, homeStrength);
	let h = 0;
	let a = 0;
	const kicks: Array<{ side: 'home' | 'away'; scored: boolean }> = [];
	const take = (side: 'home' | 'away', scored: boolean) => {
		kicks.push({ side, scored });
		if (scored) { if (side === 'home') h++; else a++; }
	};
	for (let i = 0; i < 5; i++) {
		take('home', rng.next() < ph);
		if (h > a + (5 - i)) break; // impossível alcançar
		take('away', rng.next() < pa);
		if (a > h + (4 - i) || h > a + (4 - i)) break;
	}
	let guard = 0;
	while (h === a && guard++ < 30) {
		const sh = rng.next() < ph;
		const sa = rng.next() < pa;
		take('home', sh);
		take('away', sa);
	}
	if (h === a) take('home', true); // garantia (praticamente inalcançável)
	return { home: h, away: a, winner: h > a ? 'home' : 'away', kicks };
}
