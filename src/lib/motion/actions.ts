import type { Action } from 'svelte/action';
import type { AnimateOptions } from 'ultra-motion-x';
import { animate, countTo, enterIn, getMotion, loadMotion, motion, staggerDelay } from './motion.svelte.ts';

/**
 * Durante a hidratação o HTML do servidor já está na tela: animar a entrada
 * nesse momento causaria um "pisca". As entradas só rodam depois que o layout
 * raiz sinaliza que a primeira pintura terminou.
 */
let hydrated = false;
export function markHydrated() {
	hydrated = true;
}

function canAnimate() {
	return hydrated && !motion.reduced && getMotion() !== null;
}

/** use:enter — entrada com mola (sobe + fade) quando o elemento é montado. */
export const enter: Action<HTMLElement, { index?: number; delay?: number; y?: number } | undefined> = (el, params = {}) => {
	if (!canAnimate()) return;
	void enterIn(el, { delay: params.delay ?? staggerDelay(params.index ?? 0), y: params.y ?? 12 });
};

/** use:pop — entrada com escala (cartões de destaque, selos). */
export const pop: Action<HTMLElement, { delay?: number } | undefined> = (el, params = {}) => {
	if (!canAnimate()) return;
	void animate(el, { opacity: 1, scale: 1 }, { spring: 'capsule', delay: params.delay ?? 0, from: { opacity: 0, scale: 0.92 } });
};

/**
 * use:indicator — indicador líquido (Ultra Motion X) que segue o item ativo de um grupo.
 * O grupo marca o item ativo com aria-current="page", aria-selected="true" ou data-active="true".
 */
export const indicator: Action<HTMLElement, { axis?: 'x' | 'y'; key?: unknown }> = (el, params) => {
	type Liquid = ReturnType<NonNullable<ReturnType<typeof getMotion>>['indicator']>;
	let liquid: Liquid | null = null;
	let frame = 0;
	const axis = params.axis ?? 'x';
	const container = el.parentElement!;

	function place(instant = false) {
		const active = container.querySelector<HTMLElement>('[aria-current="page"],[aria-selected="true"],[data-active="true"]');
		if (!active) {
			el.style.opacity = '0';
			return;
		}
		el.style.opacity = '1';
		const pos = axis === 'x' ? active.offsetLeft : active.offsetTop;
		const size = axis === 'x' ? active.offsetWidth : active.offsetHeight;
		if (liquid && !motion.reduced) void liquid.moveTo(pos, size, { instant });
		else {
			el.style.transform = axis === 'x' ? `translate3d(${pos}px,0,0)` : `translate3d(0,${pos}px,0)`;
			if (axis === 'x') el.style.width = `${size}px`;
			else el.style.height = `${size}px`;
		}
	}

	place(true);
	void loadMotion().then((umx) => {
		if (!umx || !el.isConnected) return;
		liquid = umx.indicator(el, { axis, spring: 'responsive' });
		place(true);
	});
	const ro = new ResizeObserver(() => place(true));
	ro.observe(container);

	return {
		update() {
			if (frame) cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => { frame = 0; place(); });
		},
		destroy() {
			cancelAnimationFrame(frame);
			ro.disconnect();
			liquid?.destroy();
		}
	};
};

/** use:spring — anima propriedades quando o parâmetro muda (estados de seleção etc.). */
export const spring: Action<HTMLElement, { props: Parameters<typeof animate>[1]; opts?: AnimateOptions }> = (el, params) => {
	void animate(el, params.props, params.opts);
	return {
		update(next) {
			void animate(el, next.props, next.opts);
		}
	};
};

/** use:count — número que interpola até o valor quando ele muda (saldo, notas, públicos). */
export const count: Action<HTMLElement, { value: number; format?: (v: number) => string }> = (el, params) => {
	el.textContent = (params.format ?? ((v: number) => Math.round(v).toLocaleString('pt-BR')))(canAnimate() ? 0 : params.value);
	countTo(el, params.value, params.format);
	return {
		update(p) {
			countTo(el, p.value, p.format);
		}
	};
};

/** use:reveal — entra quando aparece na tela (painéis longos não animam fora da área visível). */
export const reveal: Action<HTMLElement, { index?: number; y?: number } | undefined> = (el, params = {}) => {
	if (!canAnimate() || typeof IntersectionObserver === 'undefined') return;
	el.style.opacity = '0';
	const io = new IntersectionObserver(
		(entries) => {
			for (const e of entries) {
				if (!e.isIntersecting) continue;
				io.disconnect();
				void enterIn(el, { delay: staggerDelay(params.index ?? 0), y: params.y ?? 16 });
			}
		},
		{ rootMargin: '40px' }
	);
	io.observe(el);
	return { destroy: () => io.disconnect() };
};
