<script lang="ts">
	import CareerModeCards from '#lib/ui/career/CareerModeCards.svelte';
	import { goto, invalidate } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { api } from '#lib/api.ts';
	import { createRoomConnection } from '#lib/realtime/client.svelte.ts';
	import { DEFAULT_LEAGUE_OPTIONS, LEAGUE_SEASONS, leagueOptions, type LeagueOptions } from '#lib/domain/league-options.ts';
	import Crest from '#lib/ui/Crest.svelte';
	import SelectCard from '#lib/ui/cards/SelectCard.svelte';
	import { getClub } from '#lib/domain/clubs.ts';
	import { notify, setIslandContext } from '#lib/stores/island.svelte.ts';
	import { enter } from '#lib/motion/actions.ts';
	import Button from '#lib/ui/Button.svelte';
	import DeleteLeague from '#lib/ui/career/DeleteLeague.svelte';
	import Badge from '#lib/ui/Badge.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Logo from '#lib/ui/Logo.svelte';

	let { data } = $props();
	type Panel = 'list' | 'create' | 'join' | 'social';
	type Mode = 'coach' | 'player';
	const tabs = [
		{ id: 'list', label: 'Minhas ligas', icon: 'trophy' },
		{ id: 'create', label: 'Criar liga', icon: 'plus' },
		{ id: 'join', label: 'Entrar', icon: 'link' }
	] as const;
	const panel = $derived<Panel>(page.url.hash === '#social' ? 'social' :
		page.url.searchParams.get('aba') === 'criar' ? 'create' :
		page.url.searchParams.get('aba') === 'entrar' || page.url.searchParams.has('codigo') ? 'join' : 'list');
	const editCode = $derived(page.url.searchParams.get('liga'));
	const existing = $derived(editCode ? data.rooms.find((room) => room.code === editCode && room.ownerId === data.profile?.id) : undefined);
	const mode = $derived.by(() => {
		if (existing?.entryMode === 'coach' || existing?.entryMode === 'player') return existing.entryMode;
		const value = page.url.searchParams.get('modo');
		return value === 'coach' || value === 'player' ? value : null;
	});
	const modeLabel = (value?: string) => value === 'coach' ? 'Carreira de Treinador' : value === 'player' ? 'Carreira de Jogador' : 'Universo legado';
	const pendingInvites = $derived(data.social?.invites.filter((invite) => invite.recipient === data.profile?.id && invite.status === 'pending') ?? []);
	const draftId = $derived(mode && `brasfc:league:${data.profile?.id}:${editCode ?? mode}`);
	let hydrated = $state<string | null>(null);
	let heading: HTMLElement | undefined = $state();
	let creationKey = $state('');
	let name = $state('');
	let code = $state('');
	let max = $state<number | undefined>(8);
	let inviteOnly = $state(false);
	let assistantsRequired = $state(false);
	let rules = $state<LeagueOptions>({ ...DEFAULT_LEAGUE_OPTIONS });
	let inviteSeed = '';
	$effect(() => {
		const value = page.url.searchParams.get('codigo') ?? '';
		if (value !== inviteSeed) { code = value; inviteSeed = value; }
	});
	$effect(() => {
		if (!draftId || !mode || hydrated === draftId) return;
		let saved;
		try { saved = JSON.parse(sessionStorage.getItem(draftId) ?? 'null'); } catch { /* sessão pode estar indisponível */ }
		creationKey = typeof saved?.creationKey === 'string' ? saved.creationKey : crypto.randomUUID();
		name = typeof saved?.name === 'string' ? saved.name : existing?.name ?? '';
		max = Number.isInteger(saved?.max) ? saved.max : existing?.maxMembers ?? 8;
		inviteOnly = saved?.inviteOnly ?? existing?.inviteOnly ?? false;
		assistantsRequired = saved?.assistantsRequired ?? existing?.assistantsRequired ?? false;
		rules = leagueOptions(saved?.rules ?? existing?.leagueOptions) ?? { ...DEFAULT_LEAGUE_OPTIONS };
		hydrated = draftId;
	});
	$effect(() => {
		if (!draftId || hydrated !== draftId) return;
		const draft = JSON.stringify({ creationKey, name, max, inviteOnly, assistantsRequired, rules });
		try { sessionStorage.setItem(draftId, draft); } catch { /* o servidor mantém o rascunho criado */ }
	});
	const panelUrl = (choice: Panel) => choice === 'create' ? '/multiplayer?aba=criar' :
		choice === 'join' ? '/multiplayer?aba=entrar' : choice === 'social' ? '/multiplayer#social' : '/multiplayer';
	async function go(url: string) {
		failure = '';
		await goto(url);
		await tick();
		heading?.focus();
	}
	function chooseMode(choice: Mode) {
		void go(`/multiplayer?aba=criar&modo=${choice}`);
	}
	let busy = $state(false);
	let failure = $state('');
	let query = $state('');
	let users = $state<Array<{ id: string; username: string; display_name: string }>>([]);
	const conn = createRoomConnection(undefined, (notice) => notify({ id: notice.id, icon:'mail', title:notice.title, action: {
		label: notice.destination === 'chat' ? 'Abrir comunicação' : 'Abrir Central social',
		run: () => void goto(notice.destination === 'chat' && notice.code ? `/multiplayer/sala/${notice.code}?secao=comunicacao` : '/multiplayer#social')
	} }));
	const pending = $derived(pendingInvites.length);
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
		if (!mode || !draftId || hydrated !== draftId) return;
		const body = { name, mode, max, inviteOnly, assistantsRequired: mode === 'coach' && assistantsRequired, rules: $state.snapshot(rules), creationKey };
		const { room } = await api<{ room: { code: string } }>(existing ? `/api/rooms/${existing.code}` : '/api/rooms',
			{ method: existing ? 'PATCH' : 'POST', body });
		try { sessionStorage.removeItem(draftId); } catch { /* o rascunho é opcional */ }
		await goto(`/multiplayer?aba=criar&modo=${mode}&liga=${room.code}`, { replace: true, refreshAll: true, reset: false });
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
	<div class="masthead"><Button href="/menu" size="sm" variant="ghost" icon="arrowLeft">Menu</Button><Logo size={26} /></div>
	{#if data.offline}
		<section class="panel"><h2>Universos compartilhados</h2><p>Conecte o aplicativo ao modo online para acessar suas ligas.</p></section>
	{:else}
		<header class="hero" use:enter>
			<div><h1>Carreiras Compartilhadas</h1><p>Monte uma liga e dispute a temporada com seus amigos.</p></div>
			<div class="hero-actions">
				<Button href="/conta" size="sm" variant="secondary" icon="user">{data.profile?.username ? data.profile.displayName : 'Entrar na conta'}</Button>
				{#if data.social}
					<Button href="/multiplayer#social" size="sm" variant="ghost" icon="mail">Central Social{pending ? ` · ${pending}` : ''}</Button>
				{/if}
			</div>
		</header>
		<nav class="tabs" aria-label="Ações multiplayer">
			{#each tabs as tab (tab.id)}
				<a href={panelUrl(tab.id)} aria-current={panel === tab.id ? 'page' : undefined} data-umx-press>
					<Icon name={tab.icon} size={16} />{tab.label}
				</a>
			{/each}
		</nav>
		{#if failure}<p class="failure" role="alert">{failure}</p>{/if}
		{#key panel}
			<section class="panel" class:mode-step={panel === 'create' && !mode} use:enter>
				{#if panel === 'list'}
					<h2 tabindex="-1" bind:this={heading}>Minhas ligas</h2>
					<div class="league-grid">
					{#each data.rooms as room, index (room.id)}
						{@const club = room.club ? getClub(room.club) : undefined}
						<article class="league-card" class:archived={room.status === 'closed'} style:--club={club?.colors.primary ?? 'var(--emerald-deep)'} use:enter={{ index }}>
							<header class="league-top">
								<div class="league-mark">{#if room.club}<Crest clubId={room.club} size={40} />{:else}<Icon name="trophy" size={24} />{/if}</div>
								<div class="league-info"><strong>{room.name}</strong>
									<small>{room.club ? `${room.athlete ? `${room.athlete} · ` : ''}${club?.name ?? room.club}` : 'Sem clube definido'}</small>
								</div>
								<Badge tone={room.status === 'closed' ? 'neutral' : room.started ? 'emerald' : 'gold'}>{room.status === 'closed' ? 'Arquivada' : room.started ? 'Em andamento' : 'Preparação'}</Badge>
							</header>
							<dl class="league-facts">
								<div><dt>Modalidade</dt><dd>{modeLabel(room.entryMode)}</dd></div>
								{#if room.season}<div><dt>Temporada</dt><dd>{room.season}</dd></div>{/if}
								<div><dt>Participantes</dt><dd>{room.members}/{room.maxMembers}</dd></div>
							</dl>
							<span class="seats" aria-hidden="true">{#each Array.from({ length: Math.min(room.maxMembers, 12) }, (_, i) => i) as seat (seat)}<i class:on={seat < room.members}></i>{/each}</span>
							<footer class="room-action">
								{#if room.status === 'open'}<Button href={`/multiplayer/sala/${room.code}`} size="sm" variant="primary" iconRight="arrowRight">Continuar</Button>{/if}
								{#if room.ownerId === data.profile?.id}<DeleteLeague code={room.code} name={room.name} removed={() => invalidate('app:rooms')} />{/if}
							</footer>
						</article>
					{:else}<p class="empty-leagues">Crie uma liga ou entre usando um convite.</p>{/each}
					</div>
				{:else if panel === 'create'}
					{#if !data.profile?.username}
						<h2 tabindex="-1" bind:this={heading}>Criar uma liga</h2>
						<Button href="/conta" variant="primary">Entrar ou criar conta</Button>
					{:else if editCode && !existing?.editable}
						<h2 tabindex="-1" bind:this={heading}>Configuração da liga</h2>
						<p>{existing ? 'Sua liga já passou pela configuração.' : 'Esse rascunho não está disponível.'}</p>
						{#if existing?.status === 'open'}<Button href={`/multiplayer/sala/${existing.code}`}>Continuar na liga</Button>{:else}<Button href="/multiplayer">Minhas ligas</Button>{/if}
					{:else if !mode}
						<h2 tabindex="-1" bind:this={heading}>Criar uma liga</h2>
						<CareerModeCards {chooseMode} />
					{:else}
						<div class="configure" use:enter>
							<div class="config-top">
								<h2 tabindex="-1" bind:this={heading}>Nova liga <small>{modeLabel(mode)}</small></h2>
								{#if !existing}<Button size="sm" variant="ghost" icon="arrowLeft" disabled={busy} onclick={() => go(panelUrl('create'))}>Voltar</Button>{/if}
							</div>
							<form class="config-form" onsubmit={(event) => { event.preventDefault(); void act(create); }}>
								<div class="config-main">
									<section class="cfg">
										<h3 class="section-title">Identidade</h3>
										<label class="name-field">Nome da liga<input bind:value={name} maxlength="40" minlength="2" placeholder="Ex.: Liga dos amigos" required /></label>
									</section>
									<section class="cfg">
										<h3 class="section-title">Participação</h3>
										<div class="seats-row">
											<span class="cfg-label">Vagas</span>
											<div class="stepper" role="group" aria-label="Vagas da liga">
												<button type="button" onclick={() => (max = Math.max(2, Number(max) - 1))} disabled={Number(max) <= 2} aria-label="Menos uma vaga" data-umx-press><Icon name="chevronLeft" size={16} /></button>
												<input type="number" min="2" max="16" bind:value={max} required aria-label="Número de vagas" />
												<button type="button" onclick={() => (max = Math.min(16, Number(max) + 1))} disabled={Number(max) >= 16} aria-label="Mais uma vaga" data-umx-press><Icon name="chevronRight" size={16} /></button>
											</div>
											<span class="seat-pips" aria-hidden="true">{#each Array.from({ length: 16 }, (_, i) => i) as i (i)}<i class:on={i < Number(max)}></i>{/each}</span>
										</div>
										<div class="choice-grid two" role="radiogroup" aria-label="Privacidade">
											<SelectCard icon="link" title="Entrada com código" description="Quem tiver o código ou o link pode entrar enquanto houver vaga." selected={!inviteOnly} onselect={() => (inviteOnly = false)} />
											<SelectCard icon="lock" title="Somente convidados" description="Só entra quem receber convite da sua conta BRASFC." selected={inviteOnly} onselect={() => (inviteOnly = true)} />
										</div>
										{#if mode === 'coach'}
											<label class="switch"><input type="checkbox" role="switch" bind:checked={assistantsRequired} /><span class="knob" aria-hidden="true"></span><span><strong>Exigir prontidão dos auxiliares</strong><small>A rodada só começa quando os auxiliares também confirmarem.</small></span></label>
										{/if}
									</section>
									<section class="cfg">
										<h3 class="section-title">Temporada e competição</h3>
										<span class="cfg-label">Temporada inicial</span>
										<div class="pills" role="radiogroup" aria-label="Temporada inicial">
											{#each LEAGUE_SEASONS as year (year)}<button type="button" role="radio" aria-checked={rules.season === year} onclick={() => (rules.season = year)} data-umx-press>{year}</button>{/each}
										</div>
										{#if rules.season !== 2026}<small class="muted">A temporada usa a base de clubes de 2026.</small>{/if}
										<div class="choice-grid two" role="radiogroup" aria-label="Calendário">
											<SelectCard icon="calendar" title="Domingo e quarta" description="Ligas no domingo · Copa na quarta" selected={rules.calendar === 'sunday'} onselect={() => (rules.calendar = 'sunday')} />
											<SelectCard icon="calendar" title="Sábado e terça" description="Ligas no sábado · Copa na terça" selected={rules.calendar === 'saturday'} onselect={() => (rules.calendar = 'saturday')} />
										</div>
										<div class="choice-grid two" role="radiogroup" aria-label="Competições">
											<SelectCard icon="trophy" title="Séries A–D e Copa" description="Brasileirão completo e Copa do Brasil" selected={rules.competition === 'league-and-cup'} onselect={() => (rules.competition = 'league-and-cup')} />
											<SelectCard icon="field" title="Somente Séries A–D" description="Calendário só com o Brasileirão" selected={rules.competition === 'league'} onselect={() => (rules.competition = 'league')} />
										</div>
										<span class="cfg-label">Dificuldade da IA</span>
										<div class="pills" role="radiogroup" aria-label="Dificuldade da IA">
											{#each [['accessible', 'Acessível'], ['standard', 'Padrão'], ['advanced', 'Avançada']] as [value, label] (value)}
												<button type="button" role="radio" aria-checked={rules.difficulty === value} onclick={() => (rules.difficulty = value as typeof rules.difficulty)} data-umx-press>{label}</button>
											{/each}
										</div>
									</section>
								</div>
								<aside class="config-preview" aria-label="Prévia da liga">
									<span class="eyebrow">Prévia</span>
									<strong class="preview-name display">{name.trim() || 'Sua liga'}</strong>
									<span class="preview-mode"><Icon name={mode === 'player' ? 'shirt' : 'whistle'} size={14} />{modeLabel(mode)}</span>
									<dl>
										<div><dt>Temporada</dt><dd>{rules.season}</dd></div>
										<div><dt>Vagas</dt><dd>{max}</dd></div>
										<div><dt>Entrada</dt><dd>{inviteOnly ? 'Convite' : 'Código'}</dd></div>
										<div><dt>IA</dt><dd>{rules.difficulty === 'accessible' ? 'Acessível' : rules.difficulty === 'advanced' ? 'Avançada' : 'Padrão'}</dd></div>
									</dl>
									<small class="muted">{rules.competition === 'league' ? 'Séries A–D' : 'Séries A–D e Copa do Brasil'} · {rules.calendar === 'saturday' ? 'sábado e terça' : 'domingo e quarta'}</small>
									<Button type="submit" variant="primary" iconRight="arrowRight" disabled={hydrated !== draftId} loading={busy} full>{existing ? 'Salvar e continuar' : mode === 'player' ? 'Continuar para o atleta' : 'Continuar para o clube'}</Button>
								</aside>
							</form>
						</div>
					{/if}
				{:else if panel === 'join'}
					<h2 tabindex="-1" bind:this={heading}>Entrar em uma liga</h2>
					<form class="join" onsubmit={(event) => { event.preventDefault(); void act(join); }}>
						<label>Código da liga<input bind:value={code} maxlength="8" required placeholder="ABC123" autocomplete="off" autocapitalize="characters" spellcheck="false" /></label>
						<Button type="submit" variant="primary" loading={busy}>Entrar com código</Button>
					</form>
					<h3>Convites recebidos</h3>
					{@render invitations(pendingInvites)}
				{:else}
					<h2 id="social" tabindex="-1" bind:this={heading}>Central Social</h2>
					{#if data.social}
						<h3>Convites</h3>
						{@render invitations(data.social.invites)}
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
					{:else}<Button href="/conta" variant="primary">Entrar na conta</Button>{/if}
				{/if}
			</section>
		{/key}
	{/if}
</main>

{#snippet invitations(items: NonNullable<typeof data.social>['invites'])}
	{#each items as invite (invite.id)}
		<div class="item friend">
			<span><strong>{invite.name}</strong>
				<small>{invite.recipient === data.profile?.id ? invite.sender_name : 'Para ' + invite.recipient_name} · {statuses[invite.status]}
					· {invite.role === 'assistant' ? 'Auxiliar técnico' : invite.role === 'coach' ? 'Treinador' : invite.mode === 'player' ? 'Atleta' : invite.mode === 'coach' ? 'Treinador' : 'Participante'}
					{invite.club ? ' · ' + (getClub(invite.club)?.name ?? invite.club) : ''}</small>
			</span>
			{#if invite.status === 'pending' && invite.recipient === data.profile?.id}
				<div class="actions"><Button size="sm" variant="primary" disabled={busy} onclick={() => act(() => social({ action:'accept', id:invite.id }))}>Aceitar</Button><Button size="sm" disabled={busy} onclick={() => act(() => social({ action:'decline', id:invite.id }))}>Recusar</Button></div>
			{/if}
		</div>
	{:else}<p>Sem convites para exibir.</p>{/each}
{/snippet}

<style>
	.page { max-width: 1080px; margin: auto; padding: max(12px, env(safe-area-inset-top)) clamp(12px, 3vw, 32px) max(24px, env(safe-area-inset-bottom)); }
	.masthead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
	.hero, .panel { min-width: 0; padding: clamp(14px, 3vw, 24px); border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); }
	.hero { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px 16px; background: linear-gradient(125deg, var(--emerald-soft), transparent 68%), var(--surface); }
	.hero h1 { font-size: clamp(1.75rem, 5.3vw, 3rem); line-height: .98; margin: 0 0 6px; }
	.hero p { margin: 0; }
	.hero-actions, .room-action, .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
	.tabs { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 4px; margin: 10px 0; padding: 4px; border: 1px solid var(--line); border-radius: var(--radius-m); background: var(--surface-sunken); }
	.tabs a { display: flex; gap: 5px; min-height: 42px; align-items: center; justify-content: center; text-align: center; padding: 5px; border-radius: 8px; font-size: var(--fs-sm); color: var(--text-2); text-decoration: none; line-height: 1.12; }
	.tabs a[aria-current] { box-shadow: inset 0 0 0 1px var(--emerald-line); color: var(--emerald-strong); background: var(--emerald-soft); }
	.panel, .configure, form, label { display: grid; gap: 10px; min-width: 0; }
	.panel.mode-step { border-color: transparent; background: transparent; padding-inline: 0; }
	.configure { max-width: 640px; width: 100%; margin-inline: auto; }
	.config-top { display: flex; align-items: start; justify-content: space-between; gap: 8px; }
	h2, h3 { margin: 0; }
	h2 { font-size: clamp(1.45rem, 4vw, 2rem); text-transform: uppercase; }
	h2 small { text-transform: none; font: 600 var(--fs-sm) var(--font-body); color: var(--emerald-strong); }
	p, small { color: var(--text-2); }
	p { margin: 0; }
	small { display: block; }
	label { gap: 4px; font-size: var(--fs-sm); font-weight: 600; }
	input { width: 100%; min-width: 0; max-width: 100%; min-height: 44px; padding: 7px 10px; border: 1px solid var(--line-strong); border-radius: 9px; color: var(--text); background: var(--surface-sunken); font-size: max(16px, var(--fs-base)); }
	input:focus-visible { outline: 2px solid var(--emerald-strong); outline-offset: 2px; }
	.item { min-width: 0; border: 1px solid var(--line); border-radius: 10px; padding: 9px 11px; background: var(--surface-2); overflow-wrap: anywhere; }
	.league-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: 10px; }
	.league-card { position: relative; display: grid; gap: 12px; min-width: 0; padding: 14px; border-radius: 16px; border: 1px solid var(--line); overflow: hidden; isolation: isolate;
		background: radial-gradient(120% 120% at 100% 0, color-mix(in srgb, var(--club) 30%, transparent), transparent 58%), linear-gradient(170deg, var(--surface-2), var(--surface-sunken)); }
	.league-card::before { content: ''; position: absolute; inset: 0 0 auto; height: 3px; background: linear-gradient(90deg, var(--club), transparent); }
	.league-card.archived { opacity: .72; filter: saturate(.6); }
	.league-top { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; }
	.league-mark { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: rgb(0 0 0 / .25); color: var(--emerald-strong); }
	.league-info { display: grid; min-width: 0; }
	.league-info strong { font-family: var(--font-display); font-size: var(--fs-lg); text-transform: uppercase; letter-spacing: .02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.league-info small { color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.league-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 6px; margin: 0; }
	.league-facts div { padding: 6px 8px; border-radius: 9px; background: rgb(0 0 0 / .2); }
	.league-facts dt { font-size: .6875rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--text-3); }
	.league-facts dd { margin: 0; font-weight: 700; }
	.seats { display: flex; gap: 3px; }
	.seats i { flex: 1; height: 4px; border-radius: 4px; background: rgb(231 237 240 / .1); }
	.seats i.on { background: var(--emerald-strong); }
	.room-action { justify-content: flex-start; }
	.empty-leagues { grid-column: 1 / -1; padding: 16px; border: 1px dashed var(--line-strong); border-radius: 12px; color: var(--text-2); }
	.friend { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
	.friend > span { flex: 1; }
	.join, .lookup { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; }
	.failure { color: #ff9d9d; margin: 8px 0; }
	@media (max-width: 590px) {
		.tabs a :global(.icon) { display: none; }
		.join { grid-template-columns: minmax(0, 1fr); }
	}
	.config-form { display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, 300px); gap: 16px; align-items: start; }
	.config-main { display: grid; gap: 14px; min-width: 0; }
	.cfg { display: grid; gap: 10px; padding: 14px; border-radius: 14px; border: 1px solid var(--line); background: var(--card-bg); }
	.cfg .section-title { margin: 0; font-size: var(--fs-lg); }
	.cfg-label { font-size: var(--fs-xs); font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--text-3); }
	.name-field { display: grid; gap: 6px; font-weight: 600; }
	.name-field input { font-size: max(16px, var(--fs-lg)); font-family: var(--font-display); text-transform: uppercase; letter-spacing: .02em; }
	.choice-grid { display: grid; gap: 8px; }
	.choice-grid.two { grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); }
	.seats-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 14px; }
	.stepper { display: inline-flex; align-items: center; border: 1px solid var(--line-strong); border-radius: 10px; overflow: hidden; }
	.stepper button { display: grid; place-items: center; width: 38px; height: 40px; border: 0; background: var(--surface-2); color: var(--text); }
	.stepper button:disabled { opacity: .4; }
	.stepper input { width: 52px; min-height: 40px; border: 0; border-radius: 0; text-align: center; font-family: var(--font-display); font-size: var(--fs-lg); font-weight: 800; appearance: textfield; -moz-appearance: textfield; }
	.stepper input::-webkit-inner-spin-button { -webkit-appearance: none; }
	.seat-pips { display: flex; gap: 3px; flex: 1 1 160px; }
	.seat-pips i { flex: 1; height: 6px; border-radius: 4px; background: rgb(231 237 240 / .08); transition: background var(--dur-2) var(--ease-out); }
	.seat-pips i.on { background: var(--emerald-strong); }
	.pills { display: inline-flex; flex-wrap: wrap; gap: 4px; padding: 3px; border-radius: 999px; background: var(--surface-sunken); border: 1px solid var(--line); width: fit-content; max-width: 100%; }
	.pills button { min-height: 34px; padding: 4px 14px; border: 0; border-radius: 999px; background: transparent; color: var(--text-2); font-weight: 700; font-size: var(--fs-sm); }
	.pills button[aria-checked='true'] { background: var(--emerald-soft); color: var(--emerald-strong); }
	.switch { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px; background: var(--surface-sunken); border: 1px solid var(--line); cursor: pointer; }
	.switch input { position: absolute; opacity: 0; width: 1px; height: 1px; }
	.switch .knob { position: relative; flex: none; width: 40px; height: 22px; border-radius: 99px; background: var(--surface-3); transition: background var(--dur-2) var(--ease-out); }
	.switch .knob::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--text); transition: translate var(--dur-2) var(--ease-spring); }
	.switch input:checked + .knob { background: var(--emerald); }
	.switch input:checked + .knob::after { translate: 18px 0; }
	.switch input:focus-visible + .knob { box-shadow: var(--focus); }
	.switch span:last-child { display: grid; }
	.switch small { color: var(--text-3); }
	.config-preview { position: sticky; top: 16px; display: grid; gap: 10px; padding: 16px; border-radius: 16px; border: 1px solid var(--emerald-line);
		background: radial-gradient(120% 90% at 100% 0, var(--emerald-soft), transparent 60%), linear-gradient(170deg, #182127, var(--bg-deep)); }
	.config-preview .eyebrow { color: var(--emerald-strong); }
	.preview-name { font-size: clamp(1.6rem, 3vw, 2.2rem); overflow-wrap: anywhere; }
	.preview-mode { display: inline-flex; align-items: center; gap: 6px; color: var(--text-2); font-weight: 600; }
	.config-preview dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin: 0; }
	.config-preview dl div { padding: 7px 9px; border-radius: 9px; background: rgb(0 0 0 / .25); }
	.config-preview dt { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--text-3); }
	.config-preview dd { margin: 0; font-weight: 700; }
	@media (max-width: 860px) {
		.config-form { grid-template-columns: minmax(0, 1fr); }
		.config-preview { position: static; }
	}
</style>
