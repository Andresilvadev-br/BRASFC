<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { api } from '#lib/api.ts';
	import { HAIR_STYLES } from '#lib/domain/appearance.ts';
	import { clubKit, coachKit } from '#lib/pixel/kits.ts';
	import { createRng, hashString } from '#lib/domain/rng.ts';
	import { createRoomConnection } from '#lib/realtime/client.svelte.ts';
	import { notify } from '#lib/stores/island.svelte.ts';
	import ConnectedWorld from '#lib/ui/ConnectedWorld.svelte';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Modal from '#lib/ui/Modal.svelte';
	import Pixel from '#lib/ui/Pixel.svelte';
	import ScreenHeader from '#lib/ui/ScreenHeader.svelte';

	let { data } = $props();
	const conn = createRoomConnection(untrack(() => data.room.code));
	const s = conn.state;
	let inboxSeen = 0;
	$effect(() => {
		const version = s.inboxVersion;
		if (version > inboxSeen && data.profile?.username) notify({ icon: 'mail', title: 'Central social atualizada',
			action: { label: 'Abrir convites', run: () => void goto('/multiplayer#social') } });
		inboxSeen = version;
	});
	let leaveOpen = $state(false);
	let leaving = $state(false);

	const isOwner = $derived((s.room?.ownerId ?? data.room.ownerId) === data.profileId);

	// Aparência estável por perfil (até a criação de avatar do multiplayer).
	function look(id: string) {
		const r = createRng(hashString(id));
		return { skin: r.int(0, 5), hairColor: r.int(0, 4), hairStyle: r.pick(HAIR_STYLES) };
	}
	const SHIRTS = ['#10B981', '#1F6FEB', '#DC2626', '#EAB308', '#9333EA', '#0E7490', '#EA580C', '#E7EDF0'];

	onMount(() => { conn.start(); return conn.stop; });

	async function copy(link = false) {
		try {
			await navigator.clipboard.writeText(link ? new URL(`/multiplayer?codigo=${data.room.code}`, location.origin).href : data.room.code);
			notify({ icon: 'copy', tone: 'success', title: link ? 'Link copiado' : 'Código copiado', detail: data.room.code });
		} catch {
			notify({ icon: 'info', tone: 'info', title: `Código: ${data.room.code}` });
		}
	}

	async function leave() {
		leaving = true;
		try {
			await api(`/api/rooms/${data.room.code}`, { method: 'DELETE' });
			conn.leave();
			notify({ icon: 'exit', tone: 'info', title: isOwner ? 'Sala encerrada' : 'Você saiu da sala' });
			await goto('/multiplayer', { invalidateAll: true });
		} catch (e) {
			notify({ icon: 'alert', tone: 'error', title: e instanceof Error ? e.message : 'Falha ao sair' });
		} finally {
			leaving = false;
		}
	}
</script>

<svelte:head><title>Sala {data.room.code} · BRASFC</title></svelte:head>

{#if s.status === 'closed'}
	<main class="page">
		<ScreenHeader title={data.room.name} eyebrow="Sala privada" back="/multiplayer" />
		<div class="closed" role="alert">
			<Icon name="info" /><span>{s.closedReason}</span>
			<Button variant="primary" href="/multiplayer">Voltar ao multiplayer</Button>
		</div>
	</main>
{:else}
	<ConnectedWorld code={data.room.code} initial={data.world} profileId={data.profileId} revision={s.worldRevision} socialRevision={s.chatVersion.league}
		leagueName={data.room.name} account={data.profile?.username} chatVersions={s.chatVersion} membership={s.room?.members} online={s.status === 'online'} onactivity={conn.setActivity}>
		{#snippet connection()}
			<div class="status" role="status">
					<span class="conn" data-s={s.status}><span class="led"></span>{s.status === 'online' ? 'Conectado em tempo real' : s.status === 'reconnecting' ? 'Reconectando…' : s.status === 'offline' ? 'Sem conexão de rede' : s.status === 'unavailable' ? 'Servidor temporariamente indisponível' : 'Conectando…'}</span>
					{#if s.status === 'unavailable'}<Button size="sm" onclick={conn.start}>Reconectar</Button>{/if}
					{#if s.error}<span class="err">{s.error}</span>{/if}
				</div>
		{/snippet}
		{#snippet lobby(members)}
		{@const total = s.room?.maxMembers ?? data.room.maxMembers}
		{@const participants = s.room?.members ?? members}
		<div class="layout">
			<section class="lobby" aria-label="Jogadores na sala">
				<header class="lobby-title"><div><h2>{data.room.name}</h2><span class="muted small">{participants.length}/{total} participantes</span></div>
					{#if !isOwner}<Button variant="ghost" icon="exit" onclick={() => (leaveOpen = true)}>Sair do universo</Button>{/if}
				</header>
				<div class="bench">
					{#each participants as m, i (m.profileId)}
						{@const assignment = members.find((member) => member.profileId === m.profileId)?.assignment}
						{@const connected = 'online' in m && m.online === true}
						<div class="member" class:offline={!connected}>
							<div class="spot">
								<Pixel variant="full" appearance={assignment?.appearance ?? look(m.profileId)} clubId={assignment?.club} styled
									kit={assignment ? assignment.role === 'player' ? clubKit(assignment.club) : coachKit(assignment.club)
										: { shirt: SHIRTS[i % SHIRTS.length], trim: '#E7EDF0', shorts: '#101418', socks: SHIRTS[i % SHIRTS.length] }} size={68} ball={false} />
							</div>
							<strong>{m.displayName}{#if m.profileId === data.profileId} <small>(você)</small>{/if}</strong>
							<span class="tags">
								{#if assignment?.ready}<Badge tone="emerald">Pronto</Badge>{/if}
								{#if assignment}<Badge tone="neutral">{assignment.role === 'coach' ? 'Treinador' : assignment.role === 'assistant' ? 'Auxiliar' : 'Jogador'}</Badge>{/if}
								{#if m.role === 'owner'}<Badge tone="gold" icon="crown">Anfitrião</Badge>{/if}
								<Badge tone={connected ? 'emerald' : 'neutral'}>{connected ? 'Online' : 'Offline'}</Badge>
							</span>
						</div>
					{/each}

				</div>

			</section>

			<aside class="invite">
				{#if data.room.inviteOnly}<p>Entrada por convite da conta BRASFC.</p>{:else}
				<span class="eyebrow">Convide seus amigos</span>
				<button class="code" onclick={() => copy()} aria-label="Copiar código {data.room.code}">
					{#each data.room.code.split('') as ch, i (i)}<span>{ch}</span>{/each}
				</button>
				<Button variant="secondary" icon="copy" onclick={() => copy()} full>Copiar código</Button>
				<Button variant="ghost" icon="link" onclick={() => copy(true)} full>Copiar link de convite</Button>
				<p class="muted small">Eles abrem Multiplayer → Entrar com código. Até {data.room.maxMembers} pessoas por sala.</p>{/if}
			</aside>
		</div>
		{/snippet}
	</ConnectedWorld>
{/if}

<Modal bind:open={leaveOpen} title={isOwner ? 'Encerrar a sala?' : 'Sair da sala?'} size="sm" description={isOwner ? 'Como anfitrião, ao sair você encerra a sala para todos.' : 'Você pode voltar depois usando o código.'}>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (leaveOpen = false)}>Ficar</Button>
		<Button variant="danger" icon="exit" loading={leaving} onclick={leave}>{isOwner ? 'Encerrar' : 'Sair'}</Button>
	{/snippet}
</Modal>

<style>
	.page {
		max-width: 1240px;
		margin: 0 auto;
		padding: 60px clamp(16px, 3vw, 40px) var(--sp-8);
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 300px;
		gap: var(--sp-4);
		align-items: start;
	}
	.lobby {
		padding: var(--sp-5);
		border-radius: var(--radius-xl);
		border: 1px solid var(--line);
		background:
			linear-gradient(180deg, transparent 62%, rgb(16 57 42 / 0.6) 62%),
			radial-gradient(80% 60% at 50% 0%, rgb(16 185 129 / 0.12), transparent 70%),
			var(--surface);
	}
	.lobby-title { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:16px; }
	.lobby-title h2 { margin:0; }
	.status {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-3);
		margin-bottom: var(--sp-4);
		font-size: var(--fs-sm);
	}
	.conn {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		color: var(--text-2);
	}
	.led {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--warning);
	}
	.conn[data-s='online'] .led {
		background: var(--emerald);
		box-shadow: 0 0 0 4px var(--emerald-soft);
	}
	.err {
		color: var(--danger);
	}
	.bench {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
		gap: 8px;
	}
	.member {
		display: grid;
		grid-template-columns: 48px minmax(0, 1fr);
		gap: 4px 8px;
		align-content: center;
		padding: 8px;
		min-width: 0;
		border: 1px solid var(--line);
		border-radius: var(--radius-m);
		background: var(--surface-sunken);
	}
	.member.offline { opacity: 0.8; }
	.spot { grid-row: span 2; align-self: center; justify-self: center; }
	.spot :global(svg) { height: 52px; width: auto; }
	.member strong {
		font-size: var(--fs-sm);
		overflow-wrap: anywhere;
	}
	.member small {
		color: var(--text-3);
		font-weight: 500;
	}
	.tags {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}
	.invite {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		padding: var(--sp-5);
		border-radius: var(--radius-xl);
		border: 1px solid var(--line);
		background: var(--surface);
	}
	.code {
		display: flex;
		justify-content: center;
		gap: 6px;
		padding: var(--sp-3);
		border: 0;
		border-radius: var(--radius-m);
		background: var(--surface-sunken);
	}
	.code span {
		display: grid;
		place-items: center;
		width: 36px;
		height: 48px;
		border-radius: 8px;
		background: var(--surface-3);
		font-family: var(--font-display);
		font-size: var(--fs-2xl);
		font-weight: 800;
		color: var(--emerald-strong);
	}
	.small {
		font-size: var(--fs-sm);
	}
	.closed {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-5);
		border-radius: var(--radius-l);
		background: var(--surface);
		border: 1px solid var(--line-strong);
	}
	@media (max-width: 900px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}
</style>
