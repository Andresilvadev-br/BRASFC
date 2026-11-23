import type { AnimateOptions, Props, UltraMotionX } from 'ultra-motion-x';

/**
 * Camada de integração BRASFC ↔ Ultra Motion X.
 *
 * • Carrega o motor sob demanda (só no navegador), sem bloquear a primeira pintura.
 * • Aplica a preferência de movimento: "reduzido" (do sistema ou das Configurações)
 *   troca toda animação por aplicação instantânea do estado final e desliga
 *   microinterações — a Ultra Motion X 1.3.0 não trata prefers-reduced-motion.
 * • Mantém um único ponto de acesso para telas, componentes e transições.
 */
export type MotionPreference = 'auto' | 'completo' | 'reduzido';
/**
 * Dev 0.12 · qualidade visual adaptativa. Controla efeitos (desfoque, sombras, luz, partículas,
 * inclinação 2.5D); nunca o feedback de clique nem as transições essenciais.
 */
export type QualityPreference = 'auto' | 'alto' | 'equilibrado' | 'economico' | 'ultra-economico';
export const QUALITY_PROFILE: Record<Exclude<QualityPreference, 'auto'>, MotionProfileId> = {
	alto: 'ultra',
	equilibrado: 'balanced',
	economico: 'performance',
	'ultra-economico': 'performance'
};
export type MotionProfileId = 'ultra' | 'balanced' | 'performance';

export const motion = $state({
	ready: false,
	failed: false,
	reduced: false,
	version: '' as string
});

let engine: UltraMotionX | null = null;
let loading: Promise<UltraMotionX | null> | null = null;
let unbindMicro: (() => void) | null = null;
let unbindRich: Array<() => void> = [];
let preference: MotionPreference = 'auto';
let quality: QualityPreference = 'auto';
let mediaQuery: MediaQueryList | null = null;

function systemReduced(): boolean {
	return mediaQuery?.matches ?? false;
}

function applyReduced() {
	if (!mediaQuery && typeof window !== 'undefined') {
		mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		mediaQuery.addEventListener('change', applyReduced);
	}
	motion.reduced = preference === 'reduzido' || (preference === 'auto' && systemReduced());
	if (typeof document !== 'undefined') document.documentElement.dataset.motion = motion.reduced ? 'reduced' : 'full';
	if (!engine) return;
	if (motion.reduced && unbindMicro) {
		unbindMicro();
		unbindMicro = null;
		for (const off of unbindRich) off();
		unbindRich = [];
	} else if (!motion.reduced && !unbindMicro) {
		unbindMicro = engine.bind(document);
		// Material reativo (luz + inclinação 2.5D) e atração magnética: a própria Ultra Motion X
		// só os ativa nos perfis que permitem efeitos de cursor (Ultra/Balanced).
		unbindRich = [engine.surface({ selector: '[data-umx-surface]', tilt: 3.5 }).bind(document), engine.magnetic({ selector: '[data-umx-magnet]', strength: 0.2, max: 6 }).bind(document)];
	}
	applyQuality();
}

/** Hardware de entrada (poucos núcleos e pouca memória): o modo automático começa econômico. */
function modestHardware(): boolean {
	if (typeof navigator === 'undefined') return false;
	const cores = navigator.hardwareConcurrency ?? 8;
	const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
	return cores <= 2 || memory <= 2 || (cores <= 4 && memory <= 4);
}

/** Qualidade efetivamente em uso (o automático resolve pelo hardware). */
export function effectiveQuality(): Exclude<QualityPreference, 'auto'> {
	return quality !== 'auto' ? quality : modestHardware() ? 'economico' : 'alto';
}

function applyQuality() {
	if (typeof document === 'undefined') return;
	const q = effectiveQuality();
	document.documentElement.dataset.quality = q;
	if (!engine) return;
	// No automático em hardware bom, o orçamento da Ultra Motion X ainda pode baixar o perfil sozinho.
	if (quality === 'auto' && q === 'alto') return;
	void engine.budget.setProfile(QUALITY_PROFILE[q], { persist: false, source: 'user' });
}

export function setQualityPreference(q: QualityPreference) {
	quality = q;
	applyQuality();
}

export function setMotionPreference(pref: MotionPreference) {
	preference = pref;
	applyReduced();
}


export function getMotionProfile(): MotionProfileId | null {
	return engine?.budget.profileId ?? null;
}

/** Carrega e inicializa o motor uma única vez. Falhas nunca derrubam a interface. */
export function loadMotion(): Promise<UltraMotionX | null> {
	if (typeof window === 'undefined') return Promise.resolve(null);
	loading ??= (async () => {
		try {
			const { createUltraMotionX } = await import('ultra-motion-x');
			const umx = createUltraMotionX({
				accent: '#10B981',
				mode: 'dark',
				bridge: false, // sem host nativo (WebView2) no navegador
				intent: true,
				effects: true,
				profileKey: 'brasfc.motion.profile'
			});
			await umx.ready;
			engine = umx;
			motion.version = umx.VERSION;
			motion.ready = true;
			applyReduced();
			return umx;
		} catch (err) {
			console.error('[motion] Ultra Motion X indisponível; seguindo sem animações.', err);
			motion.failed = true;
			applyReduced();
			return null;
		}
	})();
	return loading;
}

export function getMotion(): UltraMotionX | null {
	return engine;
}

/** Aplica valores diretamente (fallback sem motor). */
function applyStatic(el: HTMLElement | SVGElement, props: Props) {
	const s = el.style;
	if ('opacity' in props) s.opacity = String(props.opacity);
	if ('x' in props || 'y' in props) s.translate = `${props.x ?? 0}px ${props.y ?? 0}px`;
	if ('scale' in props) s.scale = String(props.scale);
	for (const [k, v] of Object.entries(props)) if (k.startsWith('--')) s.setProperty(k, String(v));
}

/**
 * Anima com mola. Com movimento reduzido (ou sem motor), aplica o estado final
 * imediatamente — o conteúdo nunca depende da animação para aparecer.
 */
export function animate(el: Element | null | undefined, props: Props, opts: AnimateOptions = {}): Promise<boolean> {
	if (!el) return Promise.resolve(true);
	if (motion.reduced || !engine) {
		if (engine) engine.set(el, props);
		else applyStatic(el as HTMLElement, props);
		return Promise.resolve(true);
	}
	return engine.animate(el, props, opts).finished;
}

/** Entrada padrão de conteúdo (sobe 12px + fade), com escalonamento opcional. */
export function enterIn(el: Element, { delay = 0, y = 12, spring = 'gentle' as AnimateOptions['spring'] } = {}) {
	return animate(el, { opacity: 1, y: 0 }, { spring, delay, from: { opacity: 0, y } });
}

export function staggerDelay(index: number): number {
	const step = engine?.budget.profile.stagger ?? 24;
	return Math.min(index, 12) * step;
}

/** Celebração discreta (partículas) — só com movimento completo e orçamento decorativo. */
export function celebrate(x: number, y: number, color = '#E8B86A') {
	if (motion.reduced || !engine?.effects || !engine.budget.allowDecor()) return;
	engine.effects.burst({ x, y, color, count: 28, speed: 280 });
	engine.effects.wave({ x, y, color: '#10B981', radius: 180 });
}

/** Número que anima até o valor (gráficos, saldo, notas). Sem motor/movimento: aplica direto. */
export function countTo(el: Element | null | undefined, value: number, format: (v: number) => string = (v) => Math.round(v).toLocaleString('pt-BR')) {
	if (!el) return;
	if (motion.reduced || !engine) {
		el.textContent = format(value);
		return;
	}
	void engine.number(el, value, { format, spring: 'gentle' });
}
