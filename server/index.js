// Servidor de produção do BRASFC.
// HTTP do SvelteKit (adapter-node) + upgrade de WebSocket para o hub de tempo real
// no mesmo processo e na mesma porta (o Caddy encaminha os dois).
import http from 'node:http';
import { handler } from '../build/handler.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const server = http.createServer(handler);
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

server.on('upgrade', (req, socket, head) => {
	const hub = globalThis[Symbol.for('brasfc.realtime')];
	if (!hub || !req.url?.startsWith('/ws/')) {
		socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
		socket.destroy();
		return;
	}
	hub.handleUpgrade(req, socket, head);
});

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
