/**
 * Registro de alterações não salvas. Usado para:
 *  • não aplicar uma atualização do jogo por cima de trabalho pendente;
 *  • avisar antes de sair de uma tela com mudanças.
 */
export const unsaved = $state<{ items: Record<string, string> }>({ items: {} });

export function markDirty(key: string, label: string) {
	unsaved.items[key] = label;
}

export function markClean(key: string) {
	delete unsaved.items[key];
}

export function hasUnsaved(): boolean {
	return Object.keys(unsaved.items).length > 0;
}

export function unsavedLabels(): string[] {
	return Object.values(unsaved.items);
}
