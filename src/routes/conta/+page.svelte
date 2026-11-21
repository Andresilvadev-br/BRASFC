<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import { api } from '#lib/api.ts';
	import { DEFAULT_APPEARANCE } from '#lib/domain/appearance.ts';
	import { coachKit } from '#lib/pixel/kits.ts';
	import Button from '#lib/ui/Button.svelte';
	import Pixel from '#lib/ui/Pixel.svelte';
	import ScreenHeader from '#lib/ui/ScreenHeader.svelte';
	import { enter } from '#lib/motion/actions.ts';

	let { data } = $props();
	type Mode = 'login' | 'register' | 'recover' | 'password';
	type Session = { id: string; device: string; created_at: string; current: boolean };
	let mode = $state<Mode>(untrack(() => data.profile?.username ? 'password' : 'login'));
	let busy = $state(false);
	let message = $state('');
	let failed = $state(false);
	let username = $state('');
	let displayName = $state(untrack(() => data.profile?.username ? data.profile.displayName : ''));
	let avatar = $state(untrack(() => data.profile?.avatar ?? 0));
	let password = $state('');
	let current = $state('');
	let recovery = $state('');
	let sessions = $state<Session[]>([]);

	async function refreshSessions() {
		if (data.profile?.username) sessions = (await api<{ sessions: Session[] }>('/api/account')).sessions;
		else sessions = [];
	}

	onMount(() => { void refreshSessions().catch((error) => { failed = true; message = error.message; }); });
	function formMode(next: Mode) {
		mode = next;
		message = '';
		current = '';
		password = '';
	}
	async function act(body: Record<string, unknown>) {
		if (busy) return;
		busy = true;
		message = '';
		failed = false;
		try {
			const result = await api<{ recovery?: string }>('/api/account', { body });
			recovery = result.recovery ?? '';
			password = '';
			current = '';
			await invalidateAll();
			displayName = data.profile?.username ? data.profile.displayName : '';
			avatar = data.profile?.avatar ?? 0;
			mode = data.profile?.username ? 'password' : 'login';
			await refreshSessions();
			message = 'Conta atualizada.';
		} catch (error) {
			failed = true;
			message = error instanceof Error ? error.message : 'Não foi possível concluir.';
		} finally { busy = false; }
	}
</script>

<svelte:head><title>Conta BRASFC</title></svelte:head>
<main class="page">
	<ScreenHeader title="Conta BRASFC" back="/multiplayer" />
	{#if data.offline}
		<section><h2>Modo offline</h2><p>Para entrar na sua conta e abrir suas ligas, mude o aplicativo para o modo online.</p></section>
	{:else}
		{#if message}<p class:failed role={failed ? 'alert' : 'status'}>{message}</p>{/if}
		{#if recovery}
			<section class="recovery" aria-label="Código de recuperação">
				<h2>Guarde este código de recuperação</h2>
				<p>Ele permite recuperar o acesso e será substituído quando você alterar a senha.</p>
				<code>{recovery}</code>
				<Button onclick={() => recovery = ''}>Já guardei o código</Button>
			</section>
		{/if}
		<div class="panels" use:enter>
			{#if data.profile?.username}
				<section>
					<div class="identity"><Pixel appearance={{ ...DEFAULT_APPEARANCE, skin: avatar }} kit={coachKit()} size={54} /><div><h2>{data.profile.displayName}</h2><p>@{data.profile.username}</p></div></div>
					<form onsubmit={(e) => { e.preventDefault(); void act({ action: 'profile', displayName, avatar }); }}>
						<label>Nome de exibição<input required maxlength="32" bind:value={displayName} /></label>
						<label>Avatar<select bind:value={avatar}>{#each [0,1,2,3,4,5] as id (id)}<option value={id}>Avatar {id + 1}</option>{/each}</select></label>
						<Button type="submit" loading={busy}>Salvar perfil</Button>
					</form>
					<a href="/multiplayer">Minhas ligas e amigos</a>
				</section>
				<section>
					<h2>Sessões</h2>
					{#each sessions as session (session.id)}
						<div class="session"><div><strong>{session.device}</strong><small>{session.current ? 'Sessão atual' : new Date(session.created_at).toLocaleDateString('pt-BR')}</small></div>
							<Button size="sm" disabled={busy} onclick={() => act({ action: session.current ? 'logout' : 'revoke', id: session.id })}>{session.current ? 'Sair' : 'Encerrar'}</Button>
						</div>
					{/each}
				</section>
			{/if}
			<section>
				<h2>{mode === 'register' ? 'Criar conta' : mode === 'recover' ? 'Recuperar acesso' : mode === 'password' ? 'Alterar senha' : 'Entrar'}</h2>
				{#if !data.profile?.username}
					<nav aria-label="Acesso à conta">
						{#each [{ id:'login', label:'Entrar' }, { id:'register', label:'Cadastrar' }, { id:'recover', label:'Recuperar' }] as tab (tab.id)}
							<button type="button" aria-pressed={mode === tab.id} onclick={() => formMode(tab.id as Mode)}>{tab.label}</button>
						{/each}
					</nav>
					{#if mode === 'register' && data.profile}<p>As ligas e carreiras deste perfil serão vinculadas à sua conta.</p>{/if}
				{/if}
				<form onsubmit={(e) => { e.preventDefault(); void act({ action: mode, username, displayName, current, password }); }}>
					{#if mode !== 'password'}<label>Usuário<input required minlength="3" maxlength="24" autocomplete="username" autocapitalize="none" bind:value={username} /></label>{/if}
					{#if mode === 'register'}<label>Nome de exibição<input required minlength="2" maxlength="32" autocomplete="nickname" bind:value={displayName} /></label>{/if}
					{#if mode === 'recover' || mode === 'password'}<label>{mode === 'recover' ? 'Código de recuperação' : 'Senha atual'}<input required type="password" autocomplete={mode === 'password' ? 'current-password' : 'off'} bind:value={current} /></label>{/if}
					<label>{mode === 'recover' || mode === 'password' ? 'Nova senha' : 'Senha'}<input required type="password" minlength={mode === 'login' ? 1 : 12} maxlength="128" autocomplete={mode === 'login' ? 'current-password' : 'new-password'} bind:value={password} /></label>
					<Button type="submit" variant="primary" loading={busy}>{mode === 'login' ? 'Entrar' : mode === 'register' ? 'Criar conta' : 'Salvar nova senha'}</Button>
				</form>
			</section>
		</div>
	{/if}
</main>

<style>
	.page { margin: 0 auto; max-width: 1050px; padding: 48px clamp(14px, 3vw, 32px); }
	.panels { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 12px; align-items: start; }
	section { padding: 18px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); min-width: 0; display: grid; gap: 13px; }
	form, label { display: grid; gap: 8px; }
	form { gap: 12px; }
	nav, .identity, .session { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
	nav button { cursor: pointer; padding: 8px; border: 1px solid var(--line); border-radius: 7px; }
	nav button[aria-pressed=true] { color: var(--emerald); border-color: var(--emerald); }
	p, small { color: var(--muted); }
	a { color: var(--emerald); }
	.session { justify-content: space-between; border-top: 1px solid var(--line); padding-top: 8px; }
	.session small { display: block; }
	.recovery { margin-bottom: 12px; border-color: var(--emerald); }
	code { overflow-wrap: anywhere; }
	.failed { color: #ff9d9d; }
</style>
