/**
 * Dev 0.12 · armazenamento local persistente (Hybrid Save Engine).
 *
 * IndexedDB no navegador e no Electron (o Chromium do Electron mantém o banco no perfil do app),
 * com fallback em memória quando o armazenamento não está disponível (navegação privada, cota
 * esgotada, bloqueio do usuário). Guarda só dados já autorizados para este perfil: o snapshot da
 * própria liga, rascunhos permitidos e a fila de operações pendentes — nunca dados privados de rivais.
 */
const DB_NAME = 'brasfc-local';
const STORE = 'kv';
/** limite por registro: evita encher a cota com um snapshot inesperadamente grande */
export const MAX_ENTRY_BYTES = 4 * 1024 * 1024;

const memory = new Map<string, unknown>();
let opening: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
	if (typeof indexedDB === 'undefined') return Promise.resolve(null);
	return (opening ??= new Promise((resolve) => {
		try {
			const req = indexedDB.open(DB_NAME, 1);
			req.onupgradeneeded = () => req.result.createObjectStore(STORE);
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => resolve(null);
			req.onblocked = () => resolve(null);
		} catch {
			resolve(null);
		}
	}));
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
	return openDb().then((db) => new Promise<T | undefined>((resolve) => {
		if (!db) return resolve(undefined);
		try {
			const req = work(db.transaction(STORE, mode).objectStore(STORE));
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => resolve(undefined);
		} catch {
			resolve(undefined);
		}
	}));
}

export async function localGet<T>(key: string): Promise<T | undefined> {
	const stored = await run<T>('readonly', (store) => store.get(key) as IDBRequest<T>);
	return stored ?? (memory.get(key) as T | undefined);
}

/** Grava; devolve `false` se o valor só ficou em memória (sem persistência local disponível). */
export async function localSet(key: string, value: unknown): Promise<boolean> {
	let size = 0;
	try {
		size = JSON.stringify(value).length;
	} catch {
		return false;
	}
	if (size > MAX_ENTRY_BYTES) return false;
	memory.set(key, value);
	const ok = await run('readwrite', (store) => store.put(structuredClone(value), key));
	return ok !== undefined;
}

export async function localDelete(key: string): Promise<void> {
	memory.delete(key);
	await run('readwrite', (store) => store.delete(key));
}

/** Só para testes: zera o fallback em memória. */
export function resetLocalMemory() {
	memory.clear();
}
