/**
 * Tipagem mínima da Ultra Motion X 1.3.0 (o pacote é JavaScript puro, sem .d.ts).
 * Cobre apenas a superfície usada pelo BRASFC; ver docs/ULTRA-MOTION-X.md.
 */
declare module 'ultra-motion-x' {
	export type SpringName = 'snappy' | 'responsive' | 'gentle' | 'expressive' | 'critical' | 'page' | 'capsule' | 'wobble';
	export type SpringSpec = SpringName | { response: number; damping: number };
	export type Channel = 'x' | 'y' | 'scale' | 'scaleX' | 'scaleY' | 'rotate' | 'opacity';
	export type Props = Partial<Record<Channel, number>> & Record<`--${string}`, number>;

	export interface AnimateOptions {
		spring?: SpringSpec;
		from?: Props;
		velocity?: Props;
		delay?: number;
		driver?: 'auto' | 'frame' | 'compositor';
		decorative?: boolean;
		units?: Record<string, string>;
	}

	export interface MotionHandle {
		readonly finished: Promise<boolean>;
		readonly active: boolean;
		cancel(): void;
	}

	export interface MotionProfile {
		id: 'ultra' | 'balanced' | 'performance';
		label: string;
		stagger: number;
		cursorLight: boolean;
	}

	export interface MotionBudget {
		readonly profile: MotionProfile;
		readonly profileId: MotionProfile['id'];
		setProfile(id: MotionProfile['id'], opts?: { persist?: boolean; source?: string }): Promise<void>;
		allowDecor(): boolean;
	}

	export interface TransitionCoordinator {
		prewarm(container: Element): void;
		navigate(opts: { from?: Element | null; to?: Element | null; swap?: () => void; direction?: number }): {
			finished: Promise<boolean>;
			shared: number;
		};
	}

	export interface CapsuleMorph {
		morphTo(shape: { width?: number; height?: number; radius?: number }): Promise<boolean>;
		swap(next: Element | null): Promise<boolean>;
		destroy(): void;
	}

	export interface LiquidIndicator {
		moveTo(pos: number, size: number, opts?: { instant?: boolean }): void;
		destroy(): void;
	}

	export interface SurfaceMaterial {
		bind(root?: Element | Document): () => void;
	}

	export interface EffectsLayer {
		burst(opts: { x: number; y: number; count?: number; color?: string; speed?: number; life?: number; size?: number }): void;
		wave(opts: { x: number; y: number; color?: string; radius?: number; life?: number; width?: number }): void;
	}

	export interface UltraMotionX {
		readonly VERSION: string;
		readonly ready: Promise<void>;
		readonly budget: MotionBudget;
		readonly transitions: TransitionCoordinator;
		readonly effects: EffectsLayer | null;
		bind(target?: Element | Document): () => void;
		animate(el: Element, props: Props, opts?: AnimateOptions): MotionHandle;
		set(el: Element, values: Props): void;
		capsule(el: HTMLElement, opts?: { spring?: SpringSpec; width?: number; height?: number; radius?: number }): CapsuleMorph;
		indicator(el: HTMLElement, opts?: { axis?: 'x' | 'y'; spring?: SpringSpec; stretch?: number; cross?: string }): LiquidIndicator;
		surface(opts?: { selector?: string; tilt?: number; spring?: SpringSpec; maxTiltSize?: number }): SurfaceMaterial;
		metrics(): unknown;
		destroy(): void;
	}

	export interface CreateOptions {
		root?: Document | null;
		accent?: string;
		mode?: 'dark' | 'light';
		bridge?: boolean;
		intent?: boolean;
		effects?: boolean;
		monitor?: boolean;
		profile?: MotionProfile['id'];
		profileKey?: string;
		intentSelector?: string;
	}

	export const VERSION: string;
	export function createUltraMotionX(options?: CreateOptions): UltraMotionX;
}
