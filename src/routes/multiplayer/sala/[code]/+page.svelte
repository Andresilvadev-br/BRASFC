<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { api } from '#lib/api.ts';
	import { HAIR_STYLES } from '#lib/domain/appearance.ts';
	import { clubKit, coachKit } from '#lib/pixel/kits.ts';
	import { createRng, hashString } from '#lib/domain/rng.ts';
	import { createRoomConnection } from '#lib/realtime/client.svelte.ts';
	import LeagueInvite from '#lib/ui/career/LeagueInvite.svelte';
	import { getClub } from '#lib/domain/clubs.ts';
	import { enter } from '#lib/motion/actions.ts';
	import { notify } from '#lib/stores/island.svelte.ts';
	import ConnectedWorld from '#lib/ui/ConnectedWorld.svelte';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Modal from '#lib/ui/Modal.svelte';
	import Pixel from '#lib/ui/Pixel.svelte';
	import ScreenHeader from '#lib/ui/ScreenHeader.svelte';

	let { data } = $props();
	const conn = createRoomConnection(untrack(() => data.room.code), (notice) => notify({ id: notice.id, icon:'mail', title:notice.title, action: {
		label: notice.destination === 'chat' ? 'Abrir comunicação' : 'Abrir Central social',
		run: () => void goto(notice.destination === 'chat' && notice.code ? `/multiplayer/sala/${notice.code}?secao=comunicacao` : '/multiplayer#social')
	} }));
	const s = conn.state;
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
		leagueName={data.room.name} chatVersions={s.chatVersion} membership={s.room?.members} online={s.status === 'online'} onactivity={conn.setActivity}>
		{#snippet connection()}
			<div class="status" role="status">
					<span class="conn" data-s={s.status}><span class="led"></span>{s.status === 'online' ? 'Conectado em tempo real' : s.status === 'reconnecting' ? 'Reconectando…' : s.status === 'offline' ? 'Sem conexão de rede' : s.status === 'unavailable' ? 'Servidor temporariamente indisponível' : 'Conectando…'}</span>
					{#if s.status === 'unavailable'}<Button size="sm" onclick={conn.start}>Reconectar</Button>{/if}
					{#if s.error}<span class="err">{s.error}</span>{/if}
				</div>
		{/snippet}
		{#snippet lobby(world, controls)}
		{@const members = world.members}
		{@const coaches = new Set(members.filter((member) => member.assignment?.role === 'coach').map((member) => member.assignment?.club))}
		{@const total = s.room?.maxMembers ?? data.room.maxMembers}
		{@const participants = s.room?.members ?? members}
		{@const seated = participants.map((m) => ({ id: m.profileId, name: m.displayName, assignment: members.find((member) => member.profileId === m.profileId)?.assignment })).filter((m) => m.assignment)}
		{@const readyCount = seated.filter((m) => m.assignment?.ready).length}
		{@const offlineSeated = seated.filter((m) => { const live = participants.find((p) => p.profileId === m.id); return !(s.status === 'online' && live && 'online' in live && live.online === true); })}
		<div class="layout">
			<div class="lobby-main">
				<section class="lobby" aria-label="Jogadores na sala">
					<header class="lobby-title"><div><h2>Participantes</h2><span class="muted small">{participants.length}/{total} vagas</span></div>
						{#if !isOwner}<Button variant="ghost" icon="exit" onclick={() => (leaveOpen = true)}>Sair do universo</Button>{/if}
					</header>
					{#if seated.length}
						<div class="readiness" role="status" aria-live="polite">
							<div class="ring" style:--p={readyCount / seated.length}><span>{readyCount}<small>/{seated.length}</small></span></div>
							<div class="ready-copy">
								<strong>{readyCount === seated.length ? (offlineSeated.length ? 'Prontos, mas há desconectados' : 'Todos prontos e online') : `${readyCount} de ${seated.length} ${seated.length === 1 ? 'participante pronto' : 'participantes prontos'}`}</strong>
								{#if offlineSeated.length}<small class="offline-note">Sem conexão agora: {offlineSeated.map((m) => m.name).join(', ')}. A partida segue a regra de presença da liga, confirmada pelo servidor.</small>{/if}
								<span class="pips">
									{#each seated as m (m.id)}
										<span class="pip" class:ok={m.assignment?.ready} class:away={offlineSeated.includes(m)} title="{m.name} · {m.assignment?.ready ? 'Pronto' : 'Aguardando'}{offlineSeated.includes(m) ? ' · desconectado' : ''}">{#if m.assignment?.ready}<Icon name="check" size={11} stroke={3} />{/if}<em>{m.name}</em></span>
									{/each}
								</span>
							</div>
						</div>
					{/if}
					<div class="bench">
						{#each participants as m, i (m.profileId)}
							{@const assignment = members.find((member) => member.profileId === m.profileId)?.assignment}
							{@const connected = s.status === 'online' && 'online' in m && m.online === true}
							<div class="member" use:enter={{ index: i }} class:offline={!connected} class:ready={assignment?.ready} style:--club={assignment ? getClub(assignment.club)?.colors.primary ?? 'var(--surface-3)' : 'var(--surface-3)'}>
								<div class="spot"><span class="presence" class:on={connected} aria-hidden="true"></span>
									<Pixel variant="full" appearance={assignment?.appearance ?? look(m.profileId)} clubId={assignment?.club} styled
										kit={assignment ? assignment.role === 'player' ? clubKit(assignment.club) : coachKit(assignment.club)
											: { shirt: SHIRTS[i % SHIRTS.length], trim: '#E7EDF0', shorts: '#101418', socks: SHIRTS[i % SHIRTS.length] }} size={68} ball={false} />
								</div>
								<strong>{m.displayName}{#if m.profileId === data.profileId} <small>(você)</small>{/if}</strong>
								<small class="member-club">{assignment ? getClub(assignment.club)?.name ?? assignment.club : 'Participação pendente'}</small>
								<span class="tags">
									{#if assignment}<Badge tone={assignment.ready ? 'emerald' : 'neutral'}>{assignment.ready ? 'Pronto' : 'Aguardando prontidão'}</Badge>{/if}
									{#if assignment}<Badge tone="neutral">{assignment.role === 'coach' ? 'Treinador' : assignment.role === 'assistant' ? 'Auxiliar' : 'Jogador'}</Badge>{/if}
									{#if m.role === 'owner'}<Badge tone="gold" icon="crown">Anfitrião</Badge>{/if}
									<Badge tone={connected ? 'emerald' : 'neutral'}>{connected ? 'Online' : s.status === 'online' ? 'Offline' : 'Sem confirmação de presença'}</Badge>
								</span>
							</div>
						{/each}

					</div>

				</section>
				{@render controls()}
			</div>

			<aside class="invite">
				<h2>Convites da liga</h2>
				{#if !world.inviteOpen}<p class="muted small">Convites fechados pelo anfitrião.</p>
				{:else if data.room.inviteOnly}<p class="muted small">Entrada por convite da conta BRASFC.</p>
				{:else}
					<div class="code" aria-label="Código da liga {data.room.code}">{#each data.room.code.split('') as ch}<span>{ch}</span>{/each}</div>
					<div class="invite-actions">
						<Button size="sm" variant="secondary" icon="copy" onclick={() => copy()}>Copiar código</Button>
						<Button size="sm" variant="ghost" icon="link" onclick={() => copy(true)}>Copiar link</Button>
					</div>
				{/if}
				{#if world.inviteOpen && data.profile?.username && world.current && (isOwner || world.current.role === 'coach')}
					<details><summary>Convidar amigos</summary>
						<LeagueInvite code={data.room.code} owner={isOwner} coach={world.current.role === 'coach'} mode={world.entryMode}
							teams={world.clubs.filter((team) => !coaches.has(team.id) && !world.reservations.some((item) => item.club === team.id && item.role === 'coach'))} />
					</details>
				{/if}
				{#if world.outgoing.length}
					<details><summary>Pendentes · {world.outgoing.length}</summary>
						{#each world.outgoing as item (item.id)}
							<p class="muted small">@{item.username} · {item.role === 'assistant' ? 'Auxiliar técnico' : item.role === 'coach' || world.entryMode === 'coach' ? 'Treinador' : world.entryMode === 'player' ? 'Atleta' : 'Participante'}{item.club ? ` · ${getClub(item.club)?.name ?? item.club}` : ''}</p>
						{/each}
					</details>
				{/if}
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
		gap: 10px;
		align-items: start;
	}
	.lobby-main { display: grid; align-content: start; gap: 10px; min-width: 0; }
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
		position: relative;
		display: grid;
		grid-template-columns: 56px minmax(0, 1fr);
		gap: 4px 10px;
		align-content: center;
		padding: 10px;
		min-width: 0;
		border: 1px solid var(--line);
		border-radius: var(--radius-m);
		background: linear-gradient(110deg, color-mix(in srgb, var(--club) 28%, transparent), transparent 55%), var(--surface-sunken);
		overflow: hidden;
		transition: border-color var(--dur-2) var(--ease-out);
	}
	.member::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 3px; background: var(--club); }
	.member.ready { border-color: var(--emerald-line); }
	.member.offline { opacity: 0.8; }
	.spot { position: relative; grid-row: span 3; align-self: center; justify-self: center; display: grid; place-items: center; width: 56px; height: 60px; border-radius: 12px; background: radial-gradient(70% 60% at 50% 80%, rgb(255 255 255 / .08), transparent), rgb(0 0 0 / .25); }
	.presence { position: absolute; right: 2px; bottom: 2px; width: 11px; height: 11px; border-radius: 50%; background: var(--text-3); border: 2px solid var(--surface-sunken); transition: background var(--dur-3) var(--ease-out); }
	.presence.on { background: var(--emerald-strong); }
	.readiness { display: flex; align-items: center; justify-content: center; gap: 16px; flex-wrap: wrap; margin: 0 auto 16px; padding: 12px 18px; max-width: 640px; border-radius: 16px; background: rgb(0 0 0 / .25); border: 1px solid var(--line); }
	.ring { --p: 0; display: grid; place-items: center; width: 64px; height: 64px; border-radius: 50%; background: conic-gradient(var(--emerald-strong) calc(var(--p) * 360deg), rgb(231 237 240 / .1) 0); transition: background .5s var(--ease-out); }
	.ring span { display: grid; place-items: center; grid-auto-flow: column; align-items: baseline; width: 52px; height: 52px; border-radius: 50%; background: var(--surface); font-family: var(--font-display); font-weight: 800; font-size: 1.35rem; }
	.ring small { font-size: .8rem; color: var(--text-3); }
	.ready-copy { display: grid; gap: 6px; min-width: 0; }
	.ready-copy strong { font-family: var(--font-display); font-size: var(--fs-xl); text-transform: uppercase; letter-spacing: .02em; }
	.pips { display: flex; flex-wrap: wrap; gap: 5px; }
	.pip { display: inline-flex; align-items: center; gap: 5px; max-width: 150px; padding: 2px 9px 2px 4px; border-radius: 99px; border: 1px dashed var(--line-strong); font-size: var(--fs-xs); color: var(--text-2); }
	.pip::before { content: ''; width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--line-strong); }
	.pip.ok { border-style: solid; border-color: var(--emerald-line); color: var(--emerald-strong); }
	.pip.ok::before { display: none; }
	.pip :global(svg) { width: 14px; height: 14px; padding: 1px; border-radius: 50%; background: var(--emerald); color: #04130d; }
	.pip.away { opacity: .6; }
	.offline-note { color: var(--warning); font-size: var(--fs-xs); max-width: 460px; }
	.pip em { font-style: normal; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
	.invite h2, .invite p { margin: 0; }
	.invite h2 { font-size: var(--fs-xl); }
	.invite summary { cursor: pointer; font-weight: 600; }
	.invite details[open] > :global(form), .invite details p { margin-top: 9px; }
	.invite-actions { display: flex; flex-wrap: wrap; gap: 5px; }
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
		width: clamp(24px, 7vw, 36px);
		height: 42px;
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
