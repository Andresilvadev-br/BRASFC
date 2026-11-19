const temporary = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'EPIPE',
	'CONNECTION_CLOSED', 'CONNECTION_ENDED', 'CONNECTION_DESTROYED', 'CONNECT_TIMEOUT', '57P01', '57P02', '57P03', '53300']);

function errorCode(cause: unknown): string | undefined {
	if (cause && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string' && /^[A-Z0-9_]+$/.test(cause.code)) return cause.code;
}

export function isTemporaryServiceFailure(cause: unknown) {
	const code = errorCode(cause);
	return !!code && (temporary.has(code) || /^08[A-Z0-9]{3}$/.test(code));
}

export function logRequestFailure(id: string, operation: string, method: string, cause: unknown) {
	console.error(JSON.stringify({ level: 'error', id, operation, method, code: errorCode(cause),
		name: cause instanceof Error ? cause.name : undefined,
		stack: cause instanceof Error ? cause.stack?.split('\n').slice(1, 7).map((line) => line.trim()) : undefined }));
}
