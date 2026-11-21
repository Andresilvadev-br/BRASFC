import type { Action } from 'svelte/action';

type Options = { move?: (from: string, to: string) => void; touchOnly?: boolean };

/** Pointer drag for positions. The same controls also support two clicks or taps. */
export const reposition: Action<HTMLElement, Options> = (node, options) => {
	let press: { id: number; from: string; x: number; y: number; moving: boolean } | undefined;
	let suppressClick = false;
	let resetClick: ReturnType<typeof setTimeout> | undefined;
	const positionOf = (target: EventTarget | null) => {
		const button = target instanceof Element ? target.closest<HTMLElement>('[data-reposition]') : null;
		return button && node.contains(button) ? button.dataset.reposition : undefined;
	};
	function down(event: PointerEvent) {
		if (!event.isPrimary || event.button !== 0 || !options.move || (options.touchOnly && event.pointerType === 'mouse')) return;
		const from = positionOf(event.target);
		if (from === undefined) return;
		suppressClick = false;
		press = { id: event.pointerId, from, x: event.clientX, y: event.clientY, moving: false };
	}
	function motion(event: PointerEvent) {
		if (!press || press.id !== event.pointerId || press.moving) return;
		if (Math.hypot(event.clientX - press.x, event.clientY - press.y) >= 7) {
			press.moving = true;
			node.setPointerCapture(event.pointerId);
			node.dataset.draggingPosition = press.from;
		}
	}
	function cancel(event: PointerEvent) {
		if (press?.id !== event.pointerId) return;
		press = undefined;
		delete node.dataset.draggingPosition;
	}
	function up(event: PointerEvent) {
		if (!press || press.id !== event.pointerId) return;
		const { from, moving } = press;
		cancel(event);
		if (!moving) return;
		const to = positionOf(node.ownerDocument.elementFromPoint(event.clientX, event.clientY));
		suppressClick = true;
		clearTimeout(resetClick);
		resetClick = setTimeout(() => { suppressClick = false; }, 350);
		if (to !== undefined && from !== to) options.move?.(from, to);
	}
	function click(event: MouseEvent) {
		if (!suppressClick || event.detail === 0) return;
		suppressClick = false;
		event.preventDefault();
		event.stopImmediatePropagation();
	}
	node.addEventListener('pointerdown', down);
	node.addEventListener('pointermove', motion);
	node.addEventListener('pointerup', up);
	node.addEventListener('pointercancel', cancel);
	node.addEventListener('lostpointercapture', cancel);
	node.addEventListener('click', click, true);
	return {
		update(next) { options = next; },
		destroy() {
			clearTimeout(resetClick);
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointermove', motion);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', cancel);
			node.removeEventListener('lostpointercapture', cancel);
			node.removeEventListener('click', click, true);
		}
	};
};
