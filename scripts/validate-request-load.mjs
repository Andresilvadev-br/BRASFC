/** Run against an isolated BRASFC server in loopback. */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

const origin = process.env.BRASFC_TEST_URL ?? 'http://127.0.0.1:4151';
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
const baseline = process.argv.includes('--baseline');
const output = process.argv.find((arg, index) => index > 1 && !arg.startsWith('--'));
const call = (path, cookie = '', data, method = 'POST') => fetch(origin + path, {
	method, headers: { origin, cookie, 'content-type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data)
});
const profile = async () => {
	const response = await call('/api/session', '', {});
	assert.equal(response.status, 200);
	return response.headers.get('set-cookie').split(';')[0];
};
const cookies = await Promise.all(Array.from({ length: 9 }, profile));
const statuses = {};
const times = [];
await Promise.all(cookies.slice(0, 8).map(async (cookie) => {
	for (let i = 0; i < 16; i++) {
		const started = performance.now();
		const response = await call('/api/session', cookie, {});
		await response.json();
		times.push(performance.now() - started);
		statuses[response.status] = (statuses[response.status] ?? 0) + 1;
	}
}));
times.sort((a, b) => a - b);
const percentile = (p) => +times[Math.ceil(p * times.length) - 1].toFixed(1);
const report = { profiles: 8, requests: times.length, statuses, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99) };
if (!baseline) {
	assert.deepEqual(statuses, { 200: 128 });
	let limited;
	for (let i = 0; i < 100 && !limited; i++) {
		const response = await call('/api/session', cookies[0], {});
		if (response.status === 429) limited = response;
	}
	assert(limited, 'o limitador por perfil precisa continuar ativo');
	assert(Number(limited.headers.get('retry-after')) > 0);
	assert.match(limited.headers.get('x-request-id') ?? '', /^[0-9a-f-]+$/);
	const actor = cookies[8];
	const created = await call('/api/careers', actor, { mode: 'coach', personName: 'Teste de concorrência', clubId: 'bahia', world: 'brasil' });
	assert.equal(created.status, 201);
	const { career } = await created.json();
	const careerPath = '/api/careers/' + career.id;
	const race = await Promise.all(['A', 'B'].map((dismissTip) => call(careerPath, actor, { version: career.version, dismissTip }, 'PATCH')));
	report.concurrentWrites = race.map((response) => response.status).sort();
	assert.deepEqual(report.concurrentWrites, [200, 409]);
	const saved = await (await call(careerPath, actor, undefined, 'GET')).json();
	assert.equal(saved.career.version, career.version + 1);
	assert.equal(saved.career.data.dismissedTips.length, 1);
	report.duplicates = 0;
	report.rateProtection = limited.status;
}
if (output) writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
