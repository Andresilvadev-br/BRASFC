// Servidor de produção do BRASFC.
// HTTP do SvelteKit (adapter-node). No aplicativo do Windows é o jogo local; na VPS, só o site.
import http from 'node:http';
import { handler } from '../build/handler.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const server = http.createServer(handler);
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

server.listen(port, host, () => {
	console.log(`[brasfc] ouvindo em http://${host}:${port}`);
});

let closing = false;
async function shutdown(signal) {
	if (closing) return;
	closing = true;
	console.log(`[brasfc] ${signal} recebido, encerrando com segurança…`);
	const force = setTimeout(() => process.exit(1), 10_000);
	force.unref();
	server.close();
	server.closeIdleConnections?.();
	try {
		await globalThis[Symbol.for('brasfc.shutdown')]?.();
	} catch (err) {
		console.error('[brasfc] erro ao encerrar', err);
	}
	process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
