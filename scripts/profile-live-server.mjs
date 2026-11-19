/** Optional preload for an isolated round benchmark. It never accelerates a public listener. */
import { writeFileSync } from 'node:fs';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

const factor = Number(process.env.BRASFC_TEST_CLOCK_FACTOR ?? 1);
if (!['127.0.0.1', 'localhost'].includes(process.env.HOST) || !Number.isFinite(factor) || factor < 1) {
	throw new Error('Configure um servidor descartável em loopback e um fator de relógio válido.');
}
if (factor !== 1) {
	const realNow = Date.now.bind(Date);
	const start = realNow();
	Date.now = () => start + (realNow() - start) * factor;
}
const loop = monitorEventLoopDelay({ resolution: 10 });
const initial = performance.eventLoopUtilization();
const start = performance.now();
loop.enable();
process.once('exit', () => {
	loop.disable();
	const output = process.env.BRASFC_TEST_SERVER_REPORT;
	if (!output) return;
	const cpu = process.cpuUsage();
	const toMs = (ns) => Number((ns / 1_000_000).toFixed(1));
	writeFileSync(output, JSON.stringify({
		clockFactor: factor, durationMs: performance.now() - start,
		cpuMs: { user: cpu.user / 1000, system: cpu.system / 1000 },
		maxRssBytes: process.resourceUsage().maxRSS * 1024,
		eventLoopUtilization: performance.eventLoopUtilization(initial).utilization,
		eventLoopDelayMs: { samples: loop.count, p50: toMs(loop.percentile(50)), p95: toMs(loop.percentile(95)), p99: toMs(loop.percentile(99)), max: toMs(loop.max) }
	}, null, 2));
});
