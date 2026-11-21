<script lang="ts">
	import { api } from '#lib/api.ts';
	import Button from '../Button.svelte';

	let { code, owner, coach, teams }: { code: string; owner: boolean; coach: boolean; teams: { id: string; name: string }[] } = $props();
	let username = $state('');
	let role = $state<'member' | 'coach' | 'assistant'>('member');
	let club = $state('');
	let hours = $state<number | undefined>(72);
	let busy = $state(false);
	let message = $state('');
	let failed = $state(false);
	let friends = $state<Array<{ username: string; display_name: string; accepted: boolean }>>();
	let loadingFriends = $state(false);
	async function loadFriends() {
		if (loadingFriends) return;
		loadingFriends = true;
		try { friends = (await api<{ friends: NonNullable<typeof friends> }>('/api/social')).friends.filter((friend) => friend.accepted); }
		catch (error) { message = error instanceof Error ? error.message : 'Lista de amigos indisponível.'; failed = true; }
		finally { loadingFriends = false; }
	}

	async function invite(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		message = '';
		failed = false;
		try {
			await api(`/api/rooms/${code}/social`, { body: { action:'invite', username, role: owner ? role : 'assistant', club, hours } });
			message = `Convite enviado para @${username.trim().toLowerCase()}.`;
			username = '';
		} catch (error) {
			failed = true;
			message = error instanceof Error ? error.message : 'Não foi possível enviar o convite.';
		} finally { busy = false; }
	}
</script>

{#if owner || coach}
	<form onsubmit={invite} data-umx-enter>
		<h3>Convidar participante</h3>
		<label>Usuário BRASFC<input bind:value={username} placeholder="nome_de_usuario" minlength="3" maxlength="24" required autocapitalize="none" /></label>
		<details ontoggle={(event) => { if (event.currentTarget.open) void loadFriends(); }}>
			<summary>Escolher um amigo</summary>
			{#if loadingFriends}<p role="status">Carregando amigos…</p>
			{:else if friends?.length}<label>Amigo
				<select value={friends.some((friend) => friend.username === username) ? username : ''}
					onchange={(event) => username = event.currentTarget.value}>
					<option value="">Selecione</option>
					{#each friends as friend (friend.username)}<option value={friend.username}>{friend.display_name} · @{friend.username}</option>{/each}
				</select></label>
			{:else if friends}<p>Seus amigos aceitos aparecerão aqui.</p>{/if}
		</details>
		{#if owner}<label>Oferecer função<select bind:value={role}><option value="member">Participante · escolhe ao entrar</option>
			<option value="coach">Treinador de outro clube</option>{#if coach}<option value="assistant">Auxiliar do meu clube</option>{/if}
		</select></label>{:else}<p>Vaga de auxiliar técnico no seu clube.</p>{/if}
		{#if owner && role === 'coach'}<label>Clube disponível<select bind:value={club} required><option value="">Escolha o clube</option>
			{#each teams as team (team.id)}<option value={team.id}>{team.name}</option>{/each}
		</select></label>{/if}
		<label>Validade em horas<input type="number" bind:value={hours} min="1" max="168" required /></label>
		{#if message}<p class:failed role={failed ? 'alert' : 'status'}>{message}</p>{/if}
		<Button type="submit" variant="primary" icon="mail" loading={busy}>Enviar convite</Button>
		<a href="/multiplayer#social">Acompanhar convites e amigos</a>
	</form>
{/if}

<style>
	form, label { display: grid; gap: 8px; min-width: 0; }
	form { gap: 10px; }
	a { color: var(--emerald); }
	.failed { color: #ff9d9d; }
</style>
