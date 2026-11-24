<script lang="ts">
	import { pop, enter } from '#lib/motion/actions.ts';
	import { onMount } from 'svelte';
	import Crest from './Crest.svelte';
	import type { RoomActivity } from '#lib/realtime/protocol.ts';

	type Friend = { id: string; name: string; club: string; role: string; online: boolean; ready: boolean; activity?: RoomActivity; activityUntil?: number };
	let { friends, loading = false, status = 'online', syncing = false }: { friends: Friend[]; loading?: boolean; status?: string; syncing?: boolean } = $props();
	let open = $state(false);
	// Durante a partida a ilha se recolhe sozinha para não disputar atenção com o jogo.
	$effect(() => {
		if (loading) open = false;
	});
	const sync = $derived(status === 'reconnecting' ? { text: 'Reconectando…', tone: 'warn' }
		: status === 'offline' ? { text: 'Sem conexão: alterações locais aguardam', tone: 'bad' }
		: status === 'unavailable' ? { text: 'Servidor indisponível', tone: 'bad' }
		: status !== 'online' ? { text: 'Conectando…', tone: 'warn' }
		: syncing ? { text: 'Sincronizando…', tone: 'warn' } : { text: 'Sincronizado', tone: 'ok' });
	let now = $state(0);
	const activity: Record<RoomActivity, string> = { rodada: 'Na Central da Rodada', carreira: 'Na central do clube', mercado: 'Negociando transferências', admin: 'Administrando a liga',
		escalacao: 'Administrando o elenco', taticas: 'Configurando táticas', contratos: 'Analisando contratos', base: 'Observando a base',
		financas: 'Administrando finanças', clube: 'Cuidando do clube', treinos: 'Planejando treinos', preparacao: 'Preparando a próxima partida' };
	const ready = $derived(friends.filter((friend) => friend.online && friend.ready).length);
	const online = $derived(friends.filter((friend) => friend.online).length);

	onMount(() => {
		now = Date.now();
		const timer = setInterval(() => { now = Date.now(); }, 1000);
		return () => clearInterval(timer);
	});

	function detail(friend: Friend) {
		if (!friend.online) return 'Ausente';
		if (loading) return 'Na partida';
		if (friend.ready) return 'Pronto para avançar';
		return friend.activity && (friend.activityUntil ?? 0) > now ? activity[friend.activity] : 'Online';
	}
</script>

<aside class="island" aria-label="Prontidão dos amigos" use:pop>
	<button aria-expanded={open} onclick={() => (open = !open)}>
		<span class="dot"></span>
		{#key ready}<strong use:pop>{ready}/{friends.length} prontos</strong>{/key}
		<span>{loading ? 'Partida em andamento' : `${online} online`}</span>
		<span class="sync {sync.tone}" title={sync.text}><i></i>{loading ? '' : sync.text}</span>
		<span aria-hidden="true">{open ? '−' : '+'}</span>
	</button>
	{#if open}
		<div class="friends" use:enter>
			{#each friends as friend (friend.id)}
				<div class="friend">
					<Crest clubId={friend.club} size={35} />
					<div><strong>{friend.name}</strong><small>{friend.role}</small></div>
					<span class:ready={friend.ready && friend.online}>{detail(friend)}</span>
				</div>
			{/each}
		</div>
	{/if}
</aside>

<style>
	.island{position:sticky;top:8px;justify-self:center;z-index:30;max-width:min(100%,430px);color:#eefaf4}
	button{width:100%;display:flex;gap:10px;align-items:center;justify-content:center;background:#0d1816;color:inherit;border:1px solid #326053;border-radius:999px;padding:10px 16px;cursor:pointer;box-shadow:0 8px 25px #0005;font:inherit}
	.dot{width:7px;height:7px;border-radius:50%;background:#46df93;flex:none}
	.sync{display:inline-flex;align-items:center;gap:5px;font-size:.78rem;color:#a6b8b2;white-space:nowrap}
	.sync i{width:6px;height:6px;border-radius:50%;background:#46df93}
	.sync.warn i{background:#f5c451}.sync.bad i{background:#ef4444}.sync.warn,.sync.bad{color:#f5d89a}
	.friends{margin-top:5px;background:#101a18;border:1px solid #326053;border-radius:18px;padding:8px 12px;box-shadow:0 8px 25px #0006}
	.friend{display:grid;grid-template-columns:35px 1fr auto;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #234038}
	.friend:last-child{border-bottom:0}.friend small{display:block;color:#a6b8b2}.friend span{font-size:.8rem;color:#b9cbc5;text-align:right}.friend .ready{color:#67e6a6}
	@media(max-width:460px){button{gap:6px;padding-inline:10px;font-size:.82rem}.friend{grid-template-columns:29px 1fr auto}}
</style>
