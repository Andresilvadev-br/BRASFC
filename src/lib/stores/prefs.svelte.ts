import { setMotionPreference, type MotionPreference, type MotionProfileId } from '#lib/motion/motion.svelte.ts';

/**
 * Preferências deste dispositivo (localStorage). Não são dados de carreira:
 * ficam no navegador, como volume e brilho num console.
 */
export type IntroMode = 'sempre' | 'sessao' | 'nunca';
export type TextScale = 100 | 112 | 125;

export interface Prefs {
	motion: MotionPreference;
	motionProfile: MotionProfileId;
	intro: IntroMode;
	textScale: TextScale;
}

const KEY = 'brasfc.prefs.v1';
const DEFAULTS: Prefs = { motion: 'auto', motionProfile: 'ultra', intro: 'sessao', textScale: 100 };

export const prefs = $state<Prefs>({ ...DEFAULTS });

function read(): Partial<Prefs> {
	try {
		const raw = localStorage.getItem(KEY);
		return raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
	} catch {
		return {};
	}
}

function sanitize(p: Partial<Prefs>): Prefs {
	return {
		motion: ['auto', 'completo', 'leve', 'reduzido'].includes(p.motion as string) ? (p.motion as MotionPreference) : DEFAULTS.motion,
		motionProfile: ['ultra', 'balanced', 'performance'].includes(p.motionProfile as string)
			? (p.motionProfile as MotionProfileId)
			: DEFAULTS.motionProfile,
		intro: ['sempre', 'sessao', 'nunca'].includes(p.intro as string) ? (p.intro as IntroMode) : DEFAULTS.intro,
		textScale: [100, 112, 125].includes(p.textScale as number) ? (p.textScale as TextScale) : DEFAULTS.textScale
	};
}

export function loadPrefs() {
	Object.assign(prefs, sanitize(read()));
	applyPrefs();
}

export function savePrefs(patch: Partial<Prefs>) {
	Object.assign(prefs, sanitize({ ...prefs, ...patch }));
	try {
		localStorage.setItem(KEY, JSON.stringify(prefs));
	} catch {
		/* navegação privada: vale só para esta sessão */
	}
	applyPrefs();
}

function applyPrefs() {
	setMotionPreference(prefs.motion);
	document.documentElement.style.setProperty('--text-scale', String(prefs.textScale / 100));
}

/** A abertura deve tocar agora? */
export function shouldPlayIntro(): boolean {
	if (prefs.intro === 'nunca') return false;
	if (prefs.intro === 'sempre') return true;
	try {
		return sessionStorage.getItem('brasfc.intro.seen') !== '1';
	} catch {
		return true;
	}
}

export function markIntroSeen() {
	try {
		sessionStorage.setItem('brasfc.intro.seen', '1');
	} catch {
		/* sem armazenamento de sessão */
	}
}

// No navegador, as preferências valem desde o primeiro quadro.
if (typeof window !== 'undefined') loadPrefs();
