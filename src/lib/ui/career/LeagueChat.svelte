<script lang="ts">
	import { api, connectionIssue } from '#lib/api.ts';
	import { enter } from '#lib/motion/actions.ts';
	import { DEFAULT_APPEARANCE } from '#lib/domain/appearance.ts';
	import { coachKit } from '#lib/pixel/kits.ts';
	import { MENTALITY_LABELS, STYLE_LABELS, FORMATIONS, type Tactic } from '#lib/domain/tactics.ts';
	import Pixel from '../Pixel.svelte';
	import Button from '../Button.svelte';

	type Channel = 'league' | 'staff';
	type Message = { seq: string; author: string; display_name: string; avatar: number; body: string; created_at: string;
		suggestion: { tactic: Tactic; tacticAtSend: Tactic } | null; status: 'pending' | 'approved' | 'declined' | null };
	type History = { messages: Message[]; older: string | null; lastRead: string };
	let { code, role, club, online, versions, roster = [], live = false }: {
		code: string; role: string; club: string; online: boolean; versions?: Record<Channel, number>; roster?: { id: string; name: string }[]; live?: boolean;
	} = $props();
	let selected = $state<Channel>('league');
	let channel = $derived(selected === 'staff' && role !== 'coach' && role !== 'assistant' ? 'league' : selected);
	let history = $state<History>();
	let message = $state('');
	let busy = $state(false);
	let failure = $state('');
	let sending = $state<{ channel: Channel; text: string; op: string } | null>(null);
	let refreshing = $state(false);
	let slot = '';
	let attempt = $state(0);
	const path = $derived(`/api/rooms/${code}/social`);

	$effect(() => {
		versions?.[channel]; online; club; attempt;
		const nextSlot = `${channel}:${channel === 'staff' ? club : ''}`;
		if (slot !== nextSlot) { slot = nextSlot; history = undefined; }
		failure = '';
		const controller = new AbortController();
		const activeChannel = channel;
		const signal = controller.signal;
		void api<History>(`${path}?channel=${activeChannel}`, { signal }).then((response) => {
			if (!signal.aborted) history = response;
		}).catch((error) => { if (!signal.aborted) failure = error instanceof Error ? error.message : 'Falha ao carregar o canal.'; });
		return () => controller.abort();
	});

	async function older() {
		const before = history?.older;
		if (!before || refreshing) return;
		refreshing = true;
		const activeChannel = channel;
		const activeSlot = slot;
		try {
			const previous = await api<History>(`${path}?channel=${activeChannel}&before=${before}`);
			if (slot === activeSlot && history) history = { ...history, older: previous.older,
				messages: [...previous.messages.filter((record) => !history?.messages.some((current) => current.seq === record.seq)), ...history.messages] };
		} catch (error) { failure = error instanceof Error ? error.message : 'Histórico indisponível.'; }
		finally { refreshing = false; }
	}

	async function change(body: Record<string, unknown>) {
		if (busy) return false;
		busy = true;
		failure = '';
		try {
			await api(path, { body });
			attempt++;
			return true;
		} catch (error) {
			failure = error instanceof Error ? error.message : 'Não foi possível concluir.';
			if (!connectionIssue(error)) sending = null;
			return false;
		} finally { busy = false; }
	}
	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy || !message.trim()) return;
		const draft = sending && sending.text === message.trim() && sending.channel === channel
			? sending : { channel, text: message.trim(), op: crypto.randomUUID() };
		sending = draft;
		if (await change({ ...draft, action:'message' })) { message = ''; sending = null; }
	}
	const playerNames = $derived(new Map(roster.map((player) => [player.id, player.name])));
	const playerName = (id?: string) => !id ? 'Vago' : playerNames.get(id) ?? 'Atleta fora do elenco atual';
	const canStaff = $derived(role === 'coach' || role === 'assistant');
	const newest = $derived(history?.messages.at(-1)?.seq);
	const unread = $derived(history?.messages.filter((record) => BigInt(record.seq) > BigInt(history?.lastRead ?? 0)).length ?? 0);
</script>

<section class="chat" use:enter aria-label="Comunicação multiplayer">
	<header><h2>Comunicação</h2><span>{online ? 'Em tempo real' : 'Reconectando'}</span></header>
	<nav aria-label="Canais">
		<button type="button" aria-pressed={channel === 'league'} onclick={() => selected = 'league'}>Liga</button>
		{#if canStaff}<button type="button" aria-pressed={channel === 'staff'} onclick={() => selected = 'staff'}>Comissão técnica</button>{/if}
		{#if unread && newest}<Button size="sm" variant="ghost" disabled={busy} onclick={() => change({ action: 'read', channel, seq: newest })}>{unread} nova(s) · marcar como lidas</Button>{/if}
	</nav>
	{#if failure}<p class="failure" role="alert">{failure} <button class="retry" type="button" onclick={() => attempt++}>Atualizar</button></p>{/if}
	{#if history?.older}<Button size="sm" disabled={refreshing} onclick={older}>Mostrar mensagens anteriores</Button>{/if}
	<div class="messages" role="log" aria-label="Histórico do canal" aria-live="polite">
		{#if !history && !failure}<p>Carregando mensagens…</p>{/if}
		{#each history?.messages ?? [] as entry (entry.seq)}
			<article class:suggestion={!!entry.suggestion}>
				<div class="meta"><span class="author"><Pixel appearance={{ ...DEFAULT_APPEARANCE, skin: entry.avatar }} kit={coachKit()} size={24} /><strong>{entry.display_name}</strong></span><time datetime={entry.created_at}>{new Date(entry.created_at).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' })}</time></div>
				<p>{entry.body}</p>
				{#if entry.suggestion}
					{@const before = entry.suggestion.tacticAtSend}
					{@const next = entry.suggestion.tactic}
					<details>
						<summary>Ver alterações da tática</summary>
						<dl>
							<dt>Formação</dt><dd>{before.formation} → {next.formation}</dd>
							<dt>Mentalidade</dt><dd>{MENTALITY_LABELS[before.mentality]} → {MENTALITY_LABELS[next.mentality]}</dd>
							<dt>Estilo</dt><dd>{STYLE_LABELS[before.style]} → {STYLE_LABELS[next.style]}</dd>
							{#each next.lineup as id, i (i)}
								{#if id !== before.lineup[i] || next.formation !== before.formation}
									<dt>{FORMATIONS[next.formation][i]?.position}</dt><dd>{playerName(before.lineup[i])} → {playerName(id)}</dd>
								{/if}
							{/each}
							{#if JSON.stringify(next.bench) !== JSON.stringify(before.bench)}
								<dt>Banco</dt><dd>{next.bench?.map(playerName).join(', ') || 'Seleção automática'}</dd>
							{/if}
							{#if JSON.stringify(next.roles) !== JSON.stringify(before.roles)}<dt>Funções individuais</dt><dd>Alteradas</dd>{/if}
							{#if JSON.stringify(next.instructions) !== JSON.stringify(before.instructions)}<dt>Instruções coletivas</dt><dd>Alteradas</dd>{/if}
							{#if JSON.stringify(next.playerOrders) !== JSON.stringify(before.playerOrders)}<dt>Instruções individuais</dt><dd>Alteradas</dd>{/if}
							{#if JSON.stringify(next.captains) !== JSON.stringify(before.captains)}
								<dt>Capitania</dt><dd>{next.captains?.map(playerName).join(', ') || 'Automática'}</dd>
							{/if}
						</dl>
					</details>
					<small>{entry.status === 'pending' ? 'Aguardando decisão' : entry.status === 'approved' ? 'Tática aprovada' : 'Sugestão recusada'}</small>
					{#if role === 'coach' && entry.status === 'pending'}
						<div class="actions"><Button size="sm" variant="primary" disabled={busy || live} onclick={() => change({ action:'approve', channel, seq:entry.seq })}>Aprovar tática</Button><Button size="sm" disabled={busy} onclick={() => change({ action:'decline', channel, seq:entry.seq })}>Recusar</Button></div>
						{#if live}<small>A aprovação estará disponível após a rodada.</small>{/if}
					{/if}
				{/if}
			</article>
		{:else}
			{#if history}<p>O canal está pronto para a primeira mensagem.</p>{/if}
		{/each}
	</div>
	<form onsubmit={submit}>
		<label>Mensagem<input bind:value={message} maxlength="500" placeholder={channel === 'staff' ? 'Escreva para sua comissão' : 'Escreva para a liga'} required /></label>
		<Button type="submit" variant="primary" loading={busy} disabled={!message.trim()}>Enviar</Button>
	</form>
</section>

<style>
	.chat { min-width: 0; border: 1px solid var(--line); border-radius: var(--radius-lg); padding: clamp(12px, 2vw, 20px); background: var(--surface); display: grid; gap: 10px; }
	header, nav, .meta, .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
	header, .meta { justify-content: space-between; }
	header span, time, small, p { color: var(--muted); }
	nav button { padding: 7px 9px; border: 1px solid var(--line); border-radius: 7px; cursor: pointer; }
	nav button[aria-pressed=true] { color: var(--emerald); border-color: var(--emerald); }
	.messages { display: grid; gap: 8px; max-height: 58dvh; overflow-y: auto; }
	article { padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--line); overflow-wrap: anywhere; }
	article p { color: inherit; white-space: pre-wrap; }
	.suggestion { border-color: rgb(16 185 129 / .48); }
	form { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: end; gap: 8px; }
	label { display: grid; gap: 6px; min-width: 0; }
	.author { display: flex; align-items: center; gap: 7px; }
	dl { display: grid; grid-template-columns: minmax(75px, 1fr) 2fr; gap: 4px 8px; margin: .5rem 0; font-size: var(--fs-sm); }
	dd { margin: 0; }
	summary { cursor: pointer; }
	time { font-size: var(--fs-xs); }
	.failure { color: #ff9d9d; }
	.retry { text-decoration: underline; cursor: pointer; }
</style>
