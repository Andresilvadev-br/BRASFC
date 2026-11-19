import { afterEach, expect, it, vi } from 'vitest';
import { ApiError, api, connectionIssue, retryAfterMs, retryDelay } from '#lib/api.ts';
import { limitedResponse, RateLimiter } from '#lib/server/http.ts';

afterEach(() => vi.unstubAllGlobals());

it('isolates operation budgets and returns the real remaining limit', () => {
	const limit = new RateLimiter(2, 60_000);
	expect(limit.retryAfter('a', 100)).toBe(0);
	expect(limit.retryAfter('a', 200)).toBe(0);
	expect(limit.retryAfter('a', 15_120)).toBe(45);
	expect(limit.retryAfter('b', 15_120)).toBe(0);
	expect(limit.retryAfter('a', 60_100)).toBe(0);
	expect(limitedResponse(45).headers.get('retry-after')).toBe('45');
});

it('coalesces parallel browser reads but sends independent writes', async () => {
	vi.stubGlobal('window', {});
	let release: () => void;
	const barrier = new Promise<void>((resolve) => { release = resolve; });
	const fetcher = vi.fn(async () => { await barrier; return Response.json({ ok: true }); });
	vi.stubGlobal('fetch', fetcher);
	const requests = Array.from({ length: 12 }, () => api('/api/same'));
	expect(fetcher).toHaveBeenCalledTimes(1);
	const writes = [api('/api/same', { body: { version: 1 } }), api('/api/same', { body: { version: 2 } })];
	expect(fetcher).toHaveBeenCalledTimes(3);
	requests.push(api('/api/same'));
	expect(fetcher).toHaveBeenCalledTimes(4);
	release!();
	await Promise.all([...requests, ...writes]);
	await api('/api/same');
	expect(fetcher).toHaveBeenCalledTimes(5);
});

it('keeps rate limits, backend failures and loss of network distinct', async () => {
	vi.stubGlobal('navigator', { onLine: true });
	const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ message: 'Aguarde.' }, {
		status: 429, headers: { 'retry-after': '9', 'x-request-id': 'test-429' }
	})).mockResolvedValueOnce(Response.json({ message: 'Falhou.' }, { status: 500 })).mockRejectedValue(new TypeError());
	vi.stubGlobal('fetch', fetcher);
	const limited = await api('/test').catch((error) => error);
	expect(limited).toMatchObject({ status: 429, retryAfterMs: 9000, requestId: 'test-429' });
	expect(connectionIssue(limited)).toBe('limited');
	expect(connectionIssue(await api('/test').catch((error) => error))).toBe('server');
	expect(connectionIssue(await api('/test').catch((error) => error))).toBe('reconnecting');
	vi.stubGlobal('navigator', { onLine: false });
	expect(connectionIssue(await api('/test').catch((error) => error))).toBe('offline');
	expect(retryDelay(2, 9000, () => .5)).toBe(9150);
	expect(retryAfterMs('Thu, 01 Jan 1970 00:00:09 GMT', 1000)).toBe(8000);
	expect(new ApiError('Falha', 500).status).toBe(500);
});

it('honors the server cooldown and rejects a non-JSON response as an unconfirmed write', async () => {
	vi.stubGlobal('window', {});
	const fetcher = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 429, headers: { 'retry-after': '2' } }))
		.mockResolvedValueOnce(new Response('<html>Site unavailable</html>', { status: 200 }));
	vi.stubGlobal('fetch', fetcher);
	await expect(api('/cooldown', { body: {} })).rejects.toMatchObject({ status: 429, retryAfterMs: 2000 });
	await expect(api('/cooldown', { body: {} })).rejects.toMatchObject({ status: 429 });
	expect(fetcher).toHaveBeenCalledTimes(1);
	await expect(api('/another-operation', { body: {} })).rejects.toMatchObject({ status: 502 });
	expect(fetcher).toHaveBeenCalledTimes(2);
});
