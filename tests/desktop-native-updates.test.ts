import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
const { desktopUpdates } = createRequire(import.meta.url)('../desktop/updates.js');

describe('atualizador nativo', () => {
	it('consulta e baixa uma vez, usa progresso real e só reinicia após encerrar gravações', async () => {
		const updater = Object.assign(new EventEmitter(), {
			checkForUpdates: vi.fn(async () => updater.emit('update-available', { version: '1.3.0' })),
			downloadUpdate: vi.fn(async () => undefined), quitAndInstall: vi.fn()
		});
		let busy = true;
		const sequence: string[] = [];
		const controller = desktopUpdates({ updater, publish: vi.fn(), persist: vi.fn(), automatic: false,
			canInstall: () => !busy, drain: async () => { sequence.push('drain'); } });
		try {
			await Promise.all([controller.check(true), controller.check(true)]);
			expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
			expect(updater.downloadUpdate).not.toHaveBeenCalled();
			await Promise.all([controller.download(), controller.download()]);
			expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
			updater.emit('download-progress', { percent: 42 });
			expect(controller.get().progress).toBe(42);
			updater.emit('update-downloaded', { version: '1.3.0' });
			expect(await controller.install()).toBe(false);
			busy = false;
			updater.quitAndInstall.mockImplementation(() => { sequence.push('install'); });
			expect(await controller.install()).toBe(true);
			expect(sequence).toEqual(['drain', 'install']);
			expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true);
		} finally { controller.close(); }
	});
});
