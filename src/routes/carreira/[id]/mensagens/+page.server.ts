import { getDb } from '#lib/server/db/index.ts';
import { listMessages } from '#lib/server/repos/careers.ts';
import { logRequestFailure } from '#lib/server/request-error.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, locals, request }) => {
	const { career, messages } = await parent();
	try {
		return { messages: await listMessages(await getDb(), locals.profile!.id, career.id), messagesUnavailable: false };
	} catch (cause) {
		logRequestFailure(locals.requestId, 'caixa de mensagens', request.method, cause);
		return { messages, messagesUnavailable: true };
	}
};
