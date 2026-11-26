import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DESKTOP_RELEASE, opensGameDirectly } from '#lib/site.ts';
import { RELEASES } from '#lib/changelog.ts';
import { gameEnabled, sitePathAllowed } from '#lib/server/mode.ts';

describe('landing page', () => {
	it('mostra a mesma versão do instalador e do jogo que serão publicadas', () => {
		const desktop = JSON.parse(readFileSync('desktop/package.json', 'utf8'));
		const game = JSON.parse(readFileSync('package.json', 'utf8'));
		expect(DESKTOP_RELEASE.version).toBe(desktop.version);
		expect(RELEASES[0].version).toBe(game.version);
		expect(DESKTOP_RELEASE.download).toMatch(/\/releases\/latest\/download\/BRASFC-Setup\.exe$/);
	});

	it('app do Windows (inclusive versões antigas) e modo offline abrem direto o jogo; navegador vê o site', () => {
		const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
		expect(opensGameDirectly(chrome, false)).toBe(false);
		expect(opensGameDirectly(null, false)).toBe(false);
		expect(opensGameDirectly(`${chrome} Electron/33.0.0 BRASFC-Desktop/1.4.9`, false)).toBe(true);
		expect(opensGameDirectly(chrome, true)).toBe(true);
	});

	it('0.13: o site público serve só apresentação/download; o jogo só no app, no dev ou na automação', () => {
		expect(gameEnabled({ NODE_ENV: 'production' }, false)).toBe(false);
		expect(gameEnabled({ NODE_ENV: 'production', BRASFC_OFFLINE: '1' }, false)).toBe(true);
		expect(gameEnabled({ NODE_ENV: 'production', BRASFC_GAME: '1' }, false)).toBe(true);
		expect(gameEnabled({ NODE_ENV: 'production' }, true)).toBe(true);
		for (const p of ['/', '/novidades', '/api/health', '/api/version', '/api/desktop', '/_app/immutable/x.js', '/landing/central.webp', '/favicon.svg', '/manifest.webmanifest']) expect(sitePathAllowed(p), p).toBe(true);
		for (const p of ['/jogar', '/menu', '/nova-carreira', '/carreira/x', '/api/careers', '/api/session', '/multiplayer', '/conta', '/laboratorio']) expect(sitePathAllowed(p), p).toBe(false);
	});
});
