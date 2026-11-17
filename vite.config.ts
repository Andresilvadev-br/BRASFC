/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, isRunnableDevEnvironment, type Plugin } from 'vite';

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

/**
 * Em desenvolvimento, o WebSocket de tempo real é anexado ao servidor do Vite.
 * O hub é carregado pelo mesmo runner SSR usado pelo SvelteKit, então compartilha
 * banco e estado com as rotas da API. Em produção, quem faz isso é server/index.js.
 */
function realtimeDevPlugin(): Plugin {
	return {
		name: 'brasfc-realtime-dev',
		apply: 'serve',
		configureServer(server) {
			server.httpServer?.on('upgrade', async (req, socket, head) => {
				if (!req.url?.startsWith('/ws/')) return; // HMR do Vite segue intacto
				try {
					const ssr = server.environments.ssr;
					if (!isRunnableDevEnvironment(ssr)) throw new Error('Ambiente SSR não executável');
					const mod = (await ssr.runner.import('/src/lib/server/realtime/hub.ts')) as typeof import('./src/lib/server/realtime/hub.ts');
					mod.getRealtimeHub().handleUpgrade(req, socket, head);
				} catch (err) {
					server.config.logger.error(`[realtime] ${(err as Error).message}`);
					socket.destroy();
				}
			});
		}
	};
}

export default defineConfig({
	plugins: [
		realtimeDevPlugin(),
		sveltekit({
			adapter: adapter({ out: 'build', precompress: true }),
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
					'connect-src': ['self', 'ws:', 'wss:'],
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
		testTimeout: 20_000,
		hookTimeout: 30_000
	}
});
