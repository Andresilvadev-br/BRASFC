import { randomUUID } from 'node:crypto';
import type { SquadPlayer } from '#lib/domain/squad.ts';
import { cleanPresetName, defaultPresetName, MAX_PRESETS, presetFromTactic, type TacticPreset } from '#lib/domain/tactic-presets.ts';
import { sanitizeTactic } from '#lib/domain/tactics.ts';

/** Biblioteca "Minhas Táticas": as mesmas regras na carreira individual e na carreira online. */
export class PresetError extends Error {
	constructor(readonly status: number, message: string) {
		super(message);
	}
}
function refuse(status: number, message: string): never {
	throw new PresetError(status, message);
}

export function applyPresetOperation(presets: TacticPreset[], raw: unknown, ctx: { squad: SquadPlayer[]; clubId: string; season: number }): { presets: TacticPreset[]; message: string } {
	if (!raw || typeof raw !== 'object') refuse(400, 'Operação de tática inválida.');
	const op = raw as Record<string, unknown>;
	const find = () => {
		const p = presets.find((x) => x.id === op.id);
		if (!p) refuse(404, 'Tática salva não encontrada.');
		return p;
	};
	const now = new Date().toISOString();
	const fromBody = () => {
		const tactic = sanitizeTactic(op.tactic, ctx.squad);
		if (!tactic) refuse(400, 'Tática inválida para este elenco.');
		return tactic;
	};
	switch (op.op) {
		case 'save': {
			if (presets.length >= MAX_PRESETS) refuse(422, `A biblioteca comporta até ${MAX_PRESETS} táticas. Exclua ou substitua uma delas.`);
			const tactic = fromBody();
			const name = cleanPresetName(op.name) ?? defaultPresetName(tactic);
			if (presets.some((p) => p.name.toLowerCase() === name.toLowerCase())) refuse(422, 'Já existe uma tática com este nome. Escolha outro ou substitua a existente.');
			const preset = presetFromTactic(tactic, { id: randomUUID(), name, clubId: ctx.clubId, season: ctx.season, now });
			return { presets: [...presets, preset], message: `Tática "${name}" salva na biblioteca.` };
		}
		case 'replace': {
			const old = find();
			const tactic = fromBody();
			const preset = { ...presetFromTactic(tactic, { id: old.id, name: old.name, clubId: ctx.clubId, season: ctx.season, now }), createdAt: old.createdAt };
			return { presets: presets.map((p) => (p.id === old.id ? preset : p)), message: `"${old.name}" foi substituída pela tática atual.` };
		}
		case 'rename': {
			const old = find();
			const name = cleanPresetName(op.name);
			if (!name) refuse(422, 'Dê um nome com 2 a 48 caracteres.');
			if (presets.some((p) => p.id !== old.id && p.name.toLowerCase() === name.toLowerCase())) refuse(422, 'Já existe uma tática com este nome.');
			return { presets: presets.map((p) => (p.id === old.id ? { ...p, name, updatedAt: now } : p)), message: `Tática renomeada para "${name}".` };
		}
		case 'duplicate': {
			if (presets.length >= MAX_PRESETS) refuse(422, `A biblioteca comporta até ${MAX_PRESETS} táticas.`);
			const old = find();
			let name = cleanPresetName(`${old.name} (cópia)`) ?? old.name;
			for (let k = 2; presets.some((p) => p.name.toLowerCase() === name.toLowerCase()); k++) name = cleanPresetName(`${old.name} (cópia ${k})`) ?? `${old.name} ${k}`;
			return { presets: [...presets, { ...structuredClone(old), id: randomUUID(), name, createdAt: now, updatedAt: now }], message: `Cópia "${name}" criada.` };
		}
		case 'delete': {
			const old = find();
			return { presets: presets.filter((p) => p.id !== old.id), message: `"${old.name}" foi excluída da biblioteca.` };
		}
		default:
			refuse(400, 'Operação de tática desconhecida.');
	}
}
