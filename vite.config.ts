/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
	version: string;
};

/** Commit atual: GIT_SHA (CI/Docker) ou git local; "local" se nenhum estiver disponível. */
function gitSha(): string {
	if (process.env.GIT_SHA) return process.env.GIT_SHA.slice(0, 12);
	try {
		return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.trim();
	} catch {
		return 'local';
	}
}

const APP_VERSION = pkg.version;
const GIT_SHA = gitSha();
const BUILD_TIME = process.env.BUILD_TIME || new Date().toISOString();

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter({ out: 'build', precompress: true }),
			// O service worker é registrado pelo app (só na versão publicada) — ver src/lib/stores/updates.svelte.ts.
			serviceWorker: { register: false },
			version: {
				name: `${APP_VERSION}+${GIT_SHA}`,
				pollInterval: 60_000
			},
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:', 'blob:'],
					'font-src': ['self'],
					'connect-src': ['self'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'frame-ancestors': ['none']
				}
			}
		})
	],
	define: {
		__APP_VERSION__: JSON.stringify(APP_VERSION),
		__GIT_SHA__: JSON.stringify(GIT_SHA),
		__BUILD_TIME__: JSON.stringify(BUILD_TIME)
	},
	server: {
		port: 5173,
		strictPort: false
	},
	test: {
		include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
		environment: 'node',
		// Testes estatísticos simulam centenas de partidas.
		testTimeout: 180_000,
		hookTimeout: 30_000
	}
});
