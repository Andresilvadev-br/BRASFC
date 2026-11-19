<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { api } from '#lib/api.ts';
	import { HAIR_STYLES } from '#lib/domain/appearance.ts';
	import { createRng, hashString } from '#lib/domain/rng.ts';
	import { createRoomConnection } from '#lib/realtime/client.svelte.ts';
	import { notify, setPersistent } from '#lib/stores/island.svelte.ts';
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
	let leaveOpen = $state(false);
	let leaving = $state(false);

	const isOwner = $derived((s.room?.ownerId ?? data.room.ownerId) === data.profileId);
	const empty = $derived(Math.max(0, (s.room?.maxMembers ?? data.room.maxMembers) - (s.room?.members.length ?? 0)));

	// Aparência estável por perfil (até a criação de avatar do multiplayer).
	function look(id: string) {
		const r = createRng(hashString(id));
		return { skin: r.int(0, 5), hairColor: r.int(0, 4), hairStyle: r.pick(HAIR_STYLES) };
	}
	const SHIRTS = ['#10B981', '#1F6FEB', '#DC2626', '#EAB308', '#9333EA', '#0E7490', '#EA580C', '#E7EDF0'];

	onMount(() => {
		conn.start();
		return () => {
			conn.stop();
			setPersistent('room', null);
		};
	});

	$effect(() => {
		if (s.status === 'online') {
			const online = s.room?.members.filter((m) => m.online).length ?? 0;
			setPersistent('room', { icon: 'multiplayer', tone: 'success', title: `Sala ${data.room.code}`, detail: `${online} online` });
		} else if (s.status === 'reconnecting') {
			setPersistent('room', { icon: 'refresh', tone: 'warning', title: 'Reconectando…', detail: `Sala ${data.room.code}` });
		} else if (s.status === 'closed') {
			setPersistent('room', null);
		}
	});

	async function copy() {
		try {
			await navigator.clipboard.writeText(data.room.code);
			notify({ icon: 'copy', tone: 'success', title: 'Código copiado', detail: data.room.code });
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

<div class="page">
	<ScreenHeader title={data.room.name} eyebrow="Sala privada" back="/multiplayer">
		{#snippet actions()}
			{#if !isOwner}<Button variant="ghost" icon="exit" onclick={() => (leaveOpen = true)}>Sair do universo</Button>{/if}
		{/snippet}
	</ScreenHeader>

	{#if s.status === 'closed'}
		<div class="closed" role="alert">
			<Icon name="info" />
			<span>{s.closedReason}</span>
			<Button variant="primary" href="/multiplayer">Voltar ao multiplayer</Button>
		</div>
	{:else}
		<ConnectedWorld code={data.room.code} initial={data.world} profileId={data.profileId} revision={s.worldRevision} membership={s.room?.members} />
		<div class="layout">
			<section class="lobby" aria-label="Jogadores na sala">
				<div class="status">
					<span class="conn" data-s={s.status}><span class="led"></span>{s.status === 'online' ? 'Conectado em tempo real' : s.status === 'reconnecting' ? 'Reconectando…' : 'Conectando…'}</span>
					{#if s.error}<span class="err">{s.error}</span>{/if}
				</div>
				<div class="bench">
					{#each s.room?.members ?? [] as m, i (m.profileId)}
						<div class="member" class:offline={!m.online} class:ready={m.ready}>
							<div class="spot">
								<Pixel variant="full" appearance={look(m.profileId)} kit={{ shirt: SHIRTS[i % SHIRTS.length], trim: '#E7EDF0', shorts: '#101418', socks: SHIRTS[i % SHIRTS.length] }} size={130} ball={false} />
								{#if m.ready}<span class="tick" aria-hidden="true"><Icon name="check" size={16} stroke={3} /></span>{/if}
							</div>
							<strong>{m.displayName}{#if m.profileId === s.me} <small>(você)</small>{/if}</strong>
							<span class="tags">
								{#if m.role === 'owner'}<Badge tone="gold" icon="crown">Anfitrião</Badge>{/if}
								<Badge tone={m.online ? (m.ready ? 'emerald' : 'neutral') : 'neutral'}>{m.online ? (m.ready ? 'Pronto' : 'Online') : 'Offline'}</Badge>
							</span>
						</div>
					{/each}
					{#each Array(Math.min(empty, 3)) as _, i (i)}
						<div class="member placeholder" aria-hidden="true">
							<div class="spot ghost"><Icon name="plus" size={28} /></div>
							<strong>Vaga livre</strong>
						</div>
					{/each}
				</div>

			</section>

			<aside class="invite">
				<span class="eyebrow">Convide seus amigos</span>
				<button class="code" onclick={copy} aria-label="Copiar código {data.room.code}">
					{#each data.room.code.split('') as ch, i (i)}<span>{ch}</span>{/each}
				</button>
				<Button variant="secondary" icon="copy" onclick={copy} full>Copiar código</Button>
				<p class="muted small">Eles abrem Multiplayer → Entrar com código. Até {data.room.maxMembers} pessoas por sala.</p>
			</aside>
		</div>
	{/if}
</div>

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
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-4);
		justify-content: center;
		min-height: 230px;
		align-items: flex-end;
	}
	.member {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		width: 140px;
		text-align: center;
		transition: opacity 0.2s;
	}
	.member.offline {
		opacity: 0.45;
	}
	.spot {
		position: relative;
		filter: drop-shadow(0 12px 16px rgb(0 0 0 / 0.5));
	}
	.spot :global(svg) {
		height: 130px;
		width: auto;
	}
	.ghost {
		display: grid;
		place-items: center;
		width: 90px;
		height: 130px;
		border-radius: var(--radius-l);
		border: 2px dashed var(--line-strong);
		color: var(--text-3);
		filter: none;
	}
	.placeholder strong {
		color: var(--text-3);
		font-weight: 500;
	}
	.tick {
		position: absolute;
		top: -6px;
		right: -6px;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--emerald);
		color: #04140e;
	}
	.member strong {
		font-size: var(--fs-sm);
	}
	.member small {
		color: var(--text-3);
		font-weight: 500;
	}
	.tags {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
		justify-content: center;
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
