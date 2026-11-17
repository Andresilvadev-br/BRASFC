import { getClub } from '#lib/domain/clubs.ts';
import { COACH_KIT, type Kit } from './sprites.ts';

export function clubKit(clubId: string): Kit {
	const club = getClub(clubId);
	if (!club) return { shirt: '#10B981', trim: '#E7EDF0', shorts: '#101418', socks: '#10B981' };
	return { shirt: club.colors.primary, trim: club.colors.secondary, shorts: club.colors.shorts, socks: club.colors.socks };
}

/** Uniforme de treinador: traje grafite com detalhe na cor do clube. */
export function coachKit(clubId?: string): Kit {
	const club = clubId ? getClub(clubId) : undefined;
	return club ? { ...COACH_KIT, trim: club.colors.primary === '#111827' ? '#E7EDF0' : club.colors.primary } : COACH_KIT;
}

/** Goleiro usa camisa de cor contrastante (dourado BRASFC ou verde-limão se o clube já for amarelado). */
export function keeperKit(clubId: string): Kit {
	const k = clubKit(clubId);
	const n = parseInt(k.shirt.slice(1), 16);
	const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
	const yellowish = r > 170 && g > 140 && b < 120;
	const shirt = yellowish ? '#84CC16' : '#E8B86A';
	return { shirt, trim: '#15110E', shorts: '#15110E', socks: shirt };
}

export function playerKit(clubId: string, position: string): Kit {
	return position === 'GOL' ? keeperKit(clubId) : clubKit(clubId);
}
