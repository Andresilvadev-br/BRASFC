/** Run only against an isolated server. See docs/VALIDACAO-0.8.md. */
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

const base = process.env.BRASFC_TEST_URL ?? 'http://127.0.0.1:4151';
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Use um servidor descartável em loopback.');
const output = process.argv[2] ?? '/tmp/brasfc-season.json';
const limit = Number(process.env.BRASFC_TEST_ROUNDS ?? 0);
assert(Number.isSafeInteger(limit) && limit >= 0 && limit <= 51);

const started = performance.now();
const report = { rounds: [], requests: {}, serverTiming: {}, clientTiming: {}, network: { connections: 0, intentionalDisconnects: 0, unexpectedDisconnects: 0 }, errors: {}, scenarios: [], maxRssBytes: 0, maxCpuPercent: 0 };
const sessions = [];
const ip = new URL(base);
let cpuStart;
const serverPid = Number(process.env.BRASFC_TEST_PID);
const measure = () => {
	if (!serverPid || process.platform !== 'linux') return;
	const stat = readFileSync(`/proc/${serverPid}/stat`, 'utf8').split(') ')[1].split(' ');
	const cpu = (Number(stat[11]) + Number(stat[12])) * 10;
	const rss = Number(readFileSync(`/proc/${serverPid}/status`, 'utf8').match(/^VmRSS:\s+(\d+)/m)?.[1]) * 1024;
	report.maxRssBytes = Math.max(report.maxRssBytes, rss);
	if (cpuStart) report.maxCpuPercent = Math.max(report.maxCpuPercent, (cpu - cpuStart.cpu) * 100 / (performance.now() - cpuStart.time));
	cpuStart = { cpu, time: performance.now() };
};
const sampler = setInterval(measure, 1000);

async function call(actor, path, payload) {
	const t0 = performance.now();
	const kind = payload?.action ?? (payload ? 'create' : 'read');
	const result = await fetch(base + path, { method: payload ? 'POST' : 'GET', headers: { origin: base, cookie: actor?.cookie ?? '',
		...(payload ? { 'content-type': 'application/json' } : {}) }, body: payload ? JSON.stringify(payload) : undefined });
	const headersAt = performance.now();
	const body = await result.json();
	const elapsed = performance.now() - t0;
	(report.requests[kind] ??= []).push(elapsed);
	if (kind === 'pulse') {
		(report.clientTiming.headers ??= []).push(headersAt - t0);
		(report.clientTiming.bodyAndJson ??= []).push(elapsed - (headersAt - t0));
		const bytes = Number(result.headers.get('content-length'));
		if (bytes) (report.clientTiming.pulseResponseBytes ??= []).push(bytes);
	}
	for (const entry of (result.headers.get('server-timing') ?? '').matchAll(/([a-z-]+);dur=([\d.]+)/g)) {
		(report.serverTiming[entry[1]] ??= []).push(Number(entry[2]));
	}
	if (!result.ok) report.errors[result.status] = (report.errors[result.status] ?? 0) + 1;
	assert(result.ok, `${kind}: ${result.status} ${JSON.stringify(body).slice(0,300)}`);
	return { body, headers: result.headers };
}

async function connect(actor, code) {
	const started = performance.now();
	const socket = new WebSocket(`ws://${ip.host}/ws/realtime`, { origin: base, headers: { cookie: actor.cookie } });
	actor.socket = socket;
	socket.on('close', () => { if (!actor.disconnectPlanned) report.network.unexpectedDisconnects++; });
	await new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(Error('Presença não confirmada')), 10000);
		socket.on('open', () => socket.send(JSON.stringify({ t: 'join', code })));
		socket.on('message', (raw) => {
			if (JSON.parse(String(raw)).t === 'room') {
				clearTimeout(timer); resolve();
			}
		});
		socket.on('error', reject);
	});	report.network.connections++;
	(report.clientTiming.websocketJoin ??= []).push(performance.now() - started);
}
try {
	for (let i = 0; i < 4; i++) sessions.push({ cookie: (await call(null,'/api/session',{})).headers.get('set-cookie').split(';')[0] });
	const code = (await call(sessions[0], '/api/rooms', { name: 'Validação de temporada' })).body.room.code;
	const lobby = '/api/rooms/' + code;
	const world = lobby + '/world';
	for (const actor of sessions.slice(1)) await call(actor, lobby, {});
	await Promise.all(sessions.map((actor) => connect(actor, code)));
	const state = async (actor = 0) => (await call(sessions[actor], world)).body;
	const command = async (actor, action, fields = {}, op = randomUUID()) => {
		const { revision } = (await call(sessions[actor], world + '?revision')).body;
		return (await call(sessions[actor], world, { action, revision, op, ...fields })).body;
	};
	const live = async (actor, action = 'pulse', fields = {}) => {
		const member = sessions[actor];
		const { body } = await call(member, world + (action === 'pulse' ? '?live=pulse' : '?live'), { action, known: member.matchId, ...fields });
		if (!body.session) member.matchId = undefined;
		else if (body.session.relevant?.detail) member.matchId = body.session.id;
		return body.session;
	};
	await command(0, 'assign', { role: 'coach', club: 'flamengo' });
	await command(1, 'assign', { role: 'assistant', club: 'flamengo' });
	await command(2, 'assign', { role: 'coach', club: 'palmeiras' });
	await command(3, 'assign', { role: 'player', club: 'flamengo', personName: 'Teste Temporada', position: 'ATA' });
	await command(0, 'delegate', { target: (await state()).members.find((m) => m.assignment?.role === 'assistant').profileId, value: true });
	const season = (await state()).season;
	for (let round = 0; round < (limit || 70); round++) {
		const prior = await state();
		if (prior.season !== season) break;
		for (const [i] of sessions.entries()) {
			await command(i, 'ready', { value: true });
			if (i === 0) {
				const waiting = await state();
				assert.equal(waiting.live, false);
				assert.equal(waiting.members.filter((m) => m.assignment?.ready).length, 1);
				if (round === 0) {
					await command(1, 'training', { plan: { sessions: ['posse', 'descanso', 'formacao', 'descanso', 'posse'], intensity: 'normal' } });
					await command(0, 'ready', { value: true });
					report.scenarios.push('Treino autorizado antes da partida e 1/4 prontos');
				}
			}
		}
		if (!prior.next) {
			await command(0, 'advance');
			break;
		}
		let view = await live(0);
		assert.equal(view.phase, 'LOADING');
		for (const [i] of sessions.entries()) view = await live(i, 'loaded', { session: view.id, op: randomUUID() });
		let half = false, finish = false, count = 0, maxFixtures = 0;
		while (view && count++ < 900) {
			const phase = view.phase;
			maxFixtures = Math.max(maxFixtures, view.fixtures.length);
			if (phase === 'HALF_TIME' && !half) {
				half = true;
				if (round === 0) {
					await delay(180);
					const current = await live(0);
					await live(0, 'decision', { session: current.id, sequence: current.sequence, op: randomUUID(), decision: { type: 'mentality', value: 'ofensiva' } });
					const interrupted = sessions[3].socket;
					sessions[3].disconnectPlanned = true;
					report.network.intentionalDisconnects++;
					const closed = new Promise((resolve) => interrupted.once('close', resolve));
					interrupted.close();
					await closed;
					sessions[3].disconnectPlanned = false;
					view = await live(0);
					assert.equal(view.phase, 'HALF_TIME');
					await connect(sessions[3], code);
					report.scenarios.push('Latência artificial, decisão tática e reconexão no intervalo');
				}
				for (const [i] of sessions.entries()) view = await live(i, 'confirm', { session: view.id, op: randomUUID(), value: true });
			} else if (round === 0 && phase === 'FIRST_HALF' && count === 10) {
				const frames = await Promise.all(sessions.map((_, i) => live(i)));
				assert(frames.every((frame) => frame.id === view.id));
				assert(frames.some((frame) => frame.relevant && !frame.relevant.detail));
				report.scenarios.push('Quadros incrementais sem reenviar uniformes ou elenco estável');
				report.scenarios.push('Quatro clientes concorrentes na mesma rodada');
				view = frames.at(-1);
			} else view = await live(count % sessions.length);
			finish ||= phase === 'FULL_TIME';
		}
		assert(view === null && half && finish, 'Rodada não concluída');
		const after = await state();
		assert.equal(after.live, false);
		assert(after.revision > prior.revision);
		assert.equal(new Set(after.last.map((r) => [r.competition,r.home,r.away].join(':'))).size, after.last.length);
		report.rounds.push({ round: prior.next.key, fixtures: maxFixtures, official: after.last.length, revision: after.revision });
		if (round % 5 === 0) console.log(JSON.stringify(report.rounds.at(-1)));
	}
	const after = await state();
	assert.equal(after.season, limit ? season : season + 1);
	if (limit) assert.equal(report.rounds.length, limit);
	const athlete = await state(3);
	assert.equal(athlete.current.role, 'player');
	assert(athlete.current.athlete.playerCareer);
	if (!limit) report.completedSeason = { before: season, after: after.season };
} catch (error) {
	report.failure = String(error.stack ?? error);
	process.exitCode = 1;
} finally {
	clearInterval(sampler);
	for (const actor of sessions) { actor.disconnectPlanned = true; actor.socket?.terminate(); }
	report.ms = performance.now() - started;
	const summarize = (samples) => Object.fromEntries(Object.entries(samples).map(([key, values]) => {
		values.sort((a,b) => a-b);
		const p = (ratio) => Number(values[Math.ceil(values.length * ratio) - 1].toFixed(1));
		return [key, { count: values.length, p50: p(.5), p95: p(.95), p99: p(.99) }];
	}));
	report.requests = summarize(report.requests);
	report.serverTiming = summarize(report.serverTiming);
	report.clientTiming = summarize(report.clientTiming);
	writeFileSync(output, JSON.stringify(report, null, 2));
	console.log(JSON.stringify({ ...report, rounds: report.rounds.length }));
}
