import { presetInstructions, sanitizeInstructions, type TacticalInstructions } from '#lib/engine/instructions.ts';
import { isRoleId, ROLES, type RoleId } from '#lib/engine/roles.ts';
import { fitsOrder, isPlayerOrder, type PlayerOrder, type PlayerOrders } from './player-orders.ts';
import { bestBench, bestEleven } from './lineup-optimizer.ts';
import type { SquadPlayer } from './squad.ts';
import { FORMATIONS, isFormation, normalizeMentality, normalizeStyle, STYLE_LABELS, MENTALITY_LABELS, type FormationId, type Mentality, type PlayStyle, type Tactic } from './tactics.ts';
import { resolveRoles } from './tactical.ts';

/**
 * Biblioteca "Minhas Táticas" (Carreira de Treinador 2.0).
 *
 * O preset guarda a IDEIA de jogo, não os jogadores: formação, mentalidade, estilo, todas as
 * instruções coletivas, funções e ordens individuais POR POSIÇÃO do desenho. Escalação, banco e
 * capitães ficam como referência do clube de origem e só são reaproveitados lá; em outro elenco
 * o servidor e a tela recalculam os melhores nomes para cada posição.
 */
export const MAX_PRESETS = 24;
export const PRESET_NAME_MAX = 48;

export interface TacticPreset {
	id: string;
	name: string;
	formation: FormationId;
	mentality: Mentality;
	style: PlayStyle;
	instructions: TacticalInstructions;
	roles: RoleId[];
	/** ordem individual de cada slot do desenho (independe de quem ocupa a posição) */
	slotOrders: Array<PlayerOrder | null>;
	/** referência do clube onde foi salvo (escalação, banco e capitães) */
	origin: { clubId: string; season: number; lineup: string[]; bench: string[]; captains: string[] };
	createdAt: string;
	updatedAt: string;
}

export function cleanPresetName(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const name = raw.replace(/\s+/g, ' ').trim().slice(0, PRESET_NAME_MAX);
	return name.length >= 2 ? name : null;
}

export function defaultPresetName(t: Pick<Tactic, 'formation' | 'style' | 'mentality'>): string {
	return `${t.formation} — ${STYLE_LABELS[t.style] ?? t.style}`;
}

/** Cria o preset a partir da tática atual (validada no servidor com o elenco). */
export function presetFromTactic(t: Tactic, o: { id: string; name: string; clubId: string; season: number; now: string }): TacticPreset {
	const roles = resolveRoles(t.formation, t.roles);
	const slotOrders = t.lineup.map((id) => t.playerOrders?.[id] ?? null);
	return {
		id: o.id,
		name: o.name,
		formation: t.formation,
		mentality: t.mentality,
		style: t.style,
		instructions: t.instructions ?? presetInstructions(t.mentality, t.style),
		roles,
		slotOrders,
		origin: { clubId: o.clubId, season: o.season, lineup: [...t.lineup], bench: [...(t.bench ?? [])], captains: [...(t.captains ?? [])] },
		createdAt: o.now,
		updatedAt: o.now
	};
}

export function sanitizePresets(raw: unknown): TacticPreset[] {
	if (!Array.isArray(raw)) return [];
	const out: TacticPreset[] = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;
		const p = item as Partial<TacticPreset>;
		const name = cleanPresetName(p.name);
		const mentality = normalizeMentality(p.mentality);
		const style = normalizeStyle(p.style);
		if (typeof p.id !== 'string' || !name || !isFormation(p.formation) || !mentality || !style) continue;
		const size = FORMATIONS[p.formation].length;
		const roles = Array.isArray(p.roles) && p.roles.length === size && p.roles.every(isRoleId) ? p.roles : resolveRoles(p.formation);
		const slotOrders = Array.isArray(p.slotOrders) && p.slotOrders.length === size ? p.slotOrders.map((o) => (isPlayerOrder(o) ? o : null)) : new Array(size).fill(null);
		const o = p.origin;
		out.push({
			id: p.id.slice(0, 64),
			name,
			formation: p.formation,
			mentality,
			style,
			instructions: sanitizeInstructions(p.instructions, presetInstructions(mentality, style)),
			roles,
			slotOrders,
			origin: {
				clubId: typeof o?.clubId === 'string' ? o.clubId : '',
				season: Number.isInteger(o?.season) ? o!.season : 0,
				lineup: Array.isArray(o?.lineup) ? o!.lineup.filter((x) => typeof x === 'string').slice(0, 11) : [],
				bench: Array.isArray(o?.bench) ? o!.bench.filter((x) => typeof x === 'string').slice(0, 12) : [],
				captains: Array.isArray(o?.captains) ? o!.captains.filter((x) => typeof x === 'string').slice(0, 11) : []
			},
			createdAt: typeof p.createdAt === 'string' ? p.createdAt : '',
			updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : ''
		});
		if (out.length >= MAX_PRESETS) break;
	}
	return out;
}

export interface PresetApplication {
	tactic: Tactic;
	/** o elenco atual é o mesmo do preset (escalação reaproveitada) */
	sameSquad: boolean;
	/** o que precisa ser revisto pelo treinador */
	review: string[];
	/** diferenças em relação à tática atual (para a prévia) */
	changes: string[];
}

/**
 * Aplica o preset ao elenco atual. Nunca usa IDs de jogadores de outro clube: quem não está no
 * elenco (ou está suspenso) dá lugar ao melhor encaixe; ordens individuais seguem a POSIÇÃO.
 */
export function applyPreset(p: TacticPreset, current: Tactic, squad: SquadPlayer[], o: { clubId: string; unavailable?: Set<string>; fitness?: Record<string, number> }): PresetApplication {
	const unavailable = o.unavailable ?? new Set<string>();
	const available = squad.filter((x) => !unavailable.has(x.id));
	const ids = new Set(available.map((x) => x.id));
	const review: string[] = [];
	const sameClub = p.origin.clubId === o.clubId;
	const reusable = sameClub && p.origin.lineup.length === FORMATIONS[p.formation].length && p.origin.lineup.every((id) => ids.has(id));
	let lineup: string[];
	let bench: string[];
	if (reusable) {
		lineup = [...p.origin.lineup];
		bench = p.origin.bench.filter((id) => ids.has(id) && !lineup.includes(id));
	} else {
		lineup = bestEleven(p.formation, available, { fitness: o.fitness });
		bench = bestBench(available, lineup, { fitness: o.fitness });
		if (sameClub) review.push('Alguns titulares do preset não estão disponíveis; as vagas foram preenchidas pelo melhor encaixe.');
		else review.push('Preset de outro clube: os titulares foram escolhidos no elenco atual pelo melhor encaixe em cada posição.');
	}
	const byId = new Map(available.map((x) => [x.id, x]));
	const slots = FORMATIONS[p.formation];
	const playerOrders: PlayerOrders = {};
	p.slotOrders.forEach((order, i) => {
		const pl = byId.get(lineup[i]);
		if (!order || !pl) return;
		if (fitsOrder(order, pl.position) && fitsOrder(order, slots[i].position)) playerOrders[pl.id] = order;
		else review.push(`A ordem individual de ${slots[i].position} não combina com ${pl.shortName}; ficou sem ordem.`);
	});
	const captains = sameClub ? p.origin.captains.filter((id) => ids.has(id)) : [];
	if (!sameClub && p.origin.captains.length) review.push('Capitães são escolhidos por pessoa: defina a hierarquia no elenco atual.');
	const roles = p.roles.map((r, i) => (ROLES[r]?.positions.includes(slots[i].position) ? r : resolveRoles(p.formation)[i]));
	const tactic: Tactic = { formation: p.formation, lineup, bench, mentality: p.mentality, style: p.style, instructions: { ...p.instructions }, roles, ...(captains.length ? { captains } : {}), ...(Object.keys(playerOrders).length ? { playerOrders } : {}) };
	const changes: string[] = [];
	if (current.formation !== tactic.formation) changes.push(`Formação: ${current.formation} → ${tactic.formation}`);
	if (current.mentality !== tactic.mentality) changes.push(`Mentalidade: ${MENTALITY_LABELS[current.mentality]} → ${MENTALITY_LABELS[tactic.mentality]}`);
	if (current.style !== tactic.style) changes.push(`Estilo: ${STYLE_LABELS[current.style]} → ${STYLE_LABELS[tactic.style]}`);
	const swapped = lineup.filter((id) => !current.lineup.includes(id)).length;
	if (swapped) changes.push(`${swapped} ${swapped === 1 ? 'titular novo' : 'titulares novos'}`);
	changes.push('Instruções coletivas, funções e ordens por posição do preset');
	return { tactic, sameSquad: reusable, review, changes };
}

/** Mini-desenho do preset (pontos 0–100) para o card. */
export function presetShape(p: Pick<TacticPreset, 'formation'>): Array<{ x: number; y: number; position: string }> {
	return FORMATIONS[p.formation].map((s) => ({ x: s.x, y: s.y, position: s.position }));
}
