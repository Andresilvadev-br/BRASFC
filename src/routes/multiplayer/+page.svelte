<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { api } from '#lib/api.ts';
	import { createRoomConnection } from '#lib/realtime/client.svelte.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { notify, setIslandContext } from '#lib/stores/island.svelte.ts';
	import { enter } from '#lib/motion/actions.ts';
	import Button from '#lib/ui/Button.svelte';
	import Badge from '#lib/ui/Badge.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import ScreenHeader from '#lib/ui/ScreenHeader.svelte';

	let { data } = $props();
	const inviteCode = untrack(() => page.url.searchParams.get('codigo') ?? '');
	let panel = $state<'list' | 'create' | 'join'>(inviteCode ? 'join' : 'list');
	let name = $state('');
	let code = $state(inviteCode);
	let mode = $state<'coach' | 'player'>('coach');
	let max = $state<number | undefined>(8);
	let inviteOnly = $state(false);
	let assistantsRequired = $state(false);
	let busy = $state(false);
	let failure = $state('');
	let query = $state('');
	let users = $state<Array<{ id: string; username: string; display_name: string }>>([]);
	const conn = createRoomConnection();
	const pending = $derived(data.social?.invites.filter((invite) => invite.recipient === data.profile?.id && invite.status === 'pending').length ?? 0);
	const statuses = { pending:'Pendente', accepted:'Aceito', declined:'Recusado', cancelled:'Cancelado', expired:'Expirado' };

	$effect(() => setIslandContext('Multiplayer'));
	onMount(() => {
		if (data.profile?.username) conn.start();
		return conn.stop;
	});
	$effect(() => {
		if (conn.state.status === 'online') {
			conn.state.inboxVersion;
			void invalidate('app:rooms').catch(() => {});
		}
	});

	async function act(run: () => Promise<void>) {
		if (busy) return;
		busy = true;
		failure = '';
		try { await run(); }
		catch (error) { failure = error instanceof Error ? error.message : 'Não foi possível concluir.'; }
		finally { busy = false; }
	}

	async function create() {
		const { room } = await api<{ room: { code: string } }>('/api/rooms', { body: { name, mode, max, inviteOnly, assistantsRequired } });
		await goto(`/multiplayer/sala/${room.code}`);
	}
	async function join() {
		const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
		if (clean.length !== 6) throw new Error('O código tem 6 caracteres.');
		await api(`/api/rooms/${clean}`, { method: 'POST' });
		await goto(`/multiplayer/sala/${clean}`);
	}
	async function social(body: Record<string, unknown>) {
		const response = await api<{ code?: string }>('/api/social', { body });
		if (body.action === 'accept' && response.code) await goto(`/multiplayer/sala/${response.code}`);
		else {
			await invalidate('app:rooms');
			notify({ icon:'check', tone:'success', title:'Ação confirmada' });
		}
	}
</script>

<svelte:head><title>Multiplayer · BRASFC</title></svelte:head>
<main class="page">
	<ScreenHeader title="Multiplayer" back="/menu" />
	{#if data.offline}
		<section class="panel"><h2>Universos compartilhados</h2><p>Conecte o aplicativo ao modo online para acessar suas ligas.</p></section>
	{:else}
		<header class="hero" use:enter>
			<div><h2>Carreiras compartilhadas</h2><p>Organize sua comissão, dispute a temporada com amigos e acompanhe sua liga.</p></div>
			<Button href="/conta" variant="secondary" icon="user">{data.profile?.username ? data.profile.displayName : 'Entrar na conta'}</Button>
		</header>
		<nav class="tabs" aria-label="Ações multiplayer">
			{#each [{ id:'list', label:'Minhas ligas' }, { id:'create', label:'Criar uma liga' }, { id:'join', label:'Entrar em uma liga' }] as option (option.id)}
				<button type="button" aria-pressed={panel === option.id} onclick={() => { panel = option.id as typeof panel; failure = ''; }} data-umx-press>{option.label}</button>
			{/each}
		</nav>
		{#if failure}<p class="failure" role="alert">{failure}</p>{/if}
		{#key panel}
			<div class="grid" use:enter>
				<section class="panel">
					{#if panel === 'list'}
						<h2>Minhas ligas</h2>
						{#each data.rooms as room (room.id)}
							<a class="row" href="/multiplayer/sala/{room.code}">
								<Icon name="trophy" size={24} /><div><strong>{room.name}</strong><small>{room.members}/{room.maxMembers} participantes</small></div>
								<Badge tone={room.started ? 'emerald' : 'gold'}>{room.started ? 'Temporada em andamento' : 'No lobby'}</Badge>
							</a>
						{:else}<p>Escolha criar uma liga ou entre usando um convite.</p>{/each}
					{:else if panel === 'create'}
						<h2>Criar uma liga</h2>
						{#if !data.profile?.username}<Button href="/conta" variant="primary">Entrar ou criar conta</Button>
						{:else}
							<form onsubmit={(event) => { event.preventDefault(); void act(create); }}>
								<label>Modo inicial<select bind:value={mode}><option value="coach">Carreira de treinador</option><option value="player">Carreira de jogador</option></select></label>
								<label>Nome da liga<input bind:value={name} maxlength="40" minlength="2" required /></label>
								<div class="options"><label>Vagas<input type="number" min="2" max="16" bind:value={max} required /></label>
									<label>Entrada<select bind:value={inviteOnly}><option value={false}>Com código</option><option value={true}>Somente convidados</option></select></label></div>
								<label class="check"><input type="checkbox" bind:checked={assistantsRequired} /> Exigir prontidão dos auxiliares</label>
								<Button type="submit" variant="primary" iconRight="arrowRight" loading={busy}>Continuar para escolha do clube</Button>
							</form>
						{/if}
					{:else}
						<h2>Entrar com código</h2>
						<form onsubmit={(event) => { event.preventDefault(); void act(join); }}>
							<label>Código da liga<input bind:value={code} maxlength="8" required placeholder="ABC123" autocomplete="off" autocapitalize="characters" /></label>
							<Button type="submit" variant="primary" loading={busy}>Entrar na liga</Button>
						</form>
					{/if}
				</section>
				{#if data.social}
					<section class="panel" id="social">
						<div class="headline"><h2>Central social</h2>{#if pending}<Badge tone="emerald">{pending} convite(s) pendente(s)</Badge>{/if}</div>
						{#each data.social.invites as invite (invite.id)}
							<div class="item"><strong>{invite.name} · {statuses[invite.status]}</strong>
								<small>{invite.recipient === data.profile?.id ? invite.sender_name : 'Para ' + invite.recipient_name}
									· {invite.role === 'assistant' ? 'Auxiliar técnico' : invite.role === 'coach' ? 'Treinador' : 'Participante'}
									{invite.club ? ' · ' + (getClub(invite.club)?.name ?? invite.club) : ''}</small>
								{#if invite.status === 'pending' && invite.recipient === data.profile?.id}
									<div class="actions"><Button size="sm" variant="primary" disabled={busy} onclick={() => act(() => social({ action:'accept', id:invite.id }))}>Aceitar</Button><Button size="sm" disabled={busy} onclick={() => act(() => social({ action:'decline', id:invite.id }))}>Recusar</Button></div>
								{/if}
							</div>
						{/each}
						<h3>Amigos</h3>
						<form class="lookup" onsubmit={(event) => { event.preventDefault(); void act(async () => { users = (await api<{ users: typeof users }>(`/api/social?q=${encodeURIComponent(query)}`)).users; if (!users.length) failure = 'Nenhum usuário encontrado.'; }); }}>
							<label>Buscar por usuário<input bind:value={query} minlength="3" maxlength="24" required /></label>
							<Button type="submit" size="sm" disabled={busy}>Buscar</Button>
						</form>
						{#each users.filter((user) => !data.social?.friends.some((friend) => friend.id === user.id)) as user (user.id)}
							<div class="item friend"><span><a href="/perfil/{user.username}">{user.display_name}</a> <small>@{user.username}</small></span><Button size="sm" disabled={busy} onclick={() => act(() => social({ action:'friend', target:user.id }))}>Adicionar</Button></div>
						{/each}
						{#each data.social.friends as friend (friend.id)}
							<div class="item friend"><span><a href="/perfil/{friend.username}">{friend.display_name}</a><small>@{friend.username} · {friend.accepted ? 'Amigo' : 'Solicitação pendente'}</small></span>
								<div class="actions">{#if friend.incoming && !friend.accepted}<Button size="sm" disabled={busy} onclick={() => act(() => social({ action:'friend-accept', target:friend.id }))}>Aceitar</Button>{/if}
								<Button size="sm" variant="ghost" disabled={busy} onclick={() => act(() => social({ action:'friend-remove', target:friend.id }))}>{friend.accepted ? 'Remover' : friend.incoming ? 'Recusar' : 'Cancelar'}</Button></div>
							</div>
						{/each}
					</section>
				{/if}
			</div>
		{/key}
	{/if}
</main>

<style>
	.page { max-width: 1150px; margin: auto; padding: 42px clamp(14px, 3vw, 32px); }
	.hero, .panel { padding: clamp(14px, 2.2vw, 22px); border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); }
	.hero { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; background: linear-gradient(120deg, rgb(16 185 129 / .13), var(--surface) 64%); }
	h2 { text-transform: uppercase; }
	p, small { color: var(--muted); }
	small { display: block; }
	.tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0; }
	.tabs button { border: 1px solid var(--line); border-radius: 8px; padding: 9px 12px; cursor: pointer; }
	.tabs button[aria-pressed=true] { border-color: var(--emerald); color: var(--emerald); background: rgb(16 185 129 / .10); }
	.grid { display: grid; grid-template-columns: 1.35fr 1fr; align-items: start; gap: 12px; }
	.panel, form, form label { min-width: 0; display: grid; gap: 9px; }
	form { gap: 12px; }
	.options { display: grid; grid-template-columns: 1fr 2fr; gap: 8px; }
	form .check { display: flex; align-items: center; }
	.check input { width: auto; }
	.row, .item { min-width: 0; border: 1px solid var(--line); border-radius: 8px; padding: 10px; overflow-wrap: anywhere; }
	.row, .headline, .friend { display: flex; flex-wrap: wrap; align-items: center; gap: 9px; }
	.row > div, .friend > span { flex: 1; }
	.row:hover { border-color: var(--emerald); }
	.actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 5px; }
	.lookup { display: grid; grid-template-columns: 1fr auto; align-items: end; }
	.failure { color: #ff9d9d; margin: 8px 0; }
	@media (max-width: 720px) { .grid { grid-template-columns: 1fr; } .page { padding-top: 22px; } }
</style>
