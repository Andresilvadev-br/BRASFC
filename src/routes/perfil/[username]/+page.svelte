<script lang="ts">
	import { formatShort } from '#lib/domain/dates.ts';
	import { DIVISION_LABELS, type DivisionId } from '#lib/domain/league.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { DEFAULT_APPEARANCE } from '#lib/domain/appearance.ts';
	import { coachKit } from '#lib/pixel/kits.ts';
	import { enter } from '#lib/motion/actions.ts';
	import Crest from '#lib/ui/Crest.svelte';
	import Pixel from '#lib/ui/Pixel.svelte';
	import ScreenHeader from '#lib/ui/ScreenHeader.svelte';
	let { data } = $props();
	const labels = { coach:'Treinador', assistant:'Auxiliar técnico', player:'Jogador', left:'Saiu da comissão' };
	const inviteLabels = { pending: 'Pendente', accepted: 'Aceito', declined: 'Recusado', cancelled: 'Cancelado', expired: 'Expirado' };
</script>

<svelte:head><title>{data.person.displayName} · BRASFC</title></svelte:head>
<main use:enter>
	<ScreenHeader title="Perfil BRASFC" back="/multiplayer#social" />
	<header><Pixel appearance={{ ...DEFAULT_APPEARANCE, skin:data.person.avatar }} kit={coachKit()} size={60} />
		<div><h2>{data.person.displayName}</h2><p>@{data.person.username}{data.friend ? ' · Amigo' : ''}</p></div>
	</header>
	<section><h2>{data.self ? 'Minhas ligas e trajetória' : 'Ligas em comum'}</h2>
		{#each data.leagues as league (league.code)}
			<article>
				{#if league.club}<Crest clubId={league.club} size={32} />{/if}
				<div><strong>{league.name}</strong><p>{league.club ? getClub(league.club)?.name ?? league.club : 'Clube pendente'}
					{league.role ? ' · ' + labels[league.role] : ''}{league.season ? ' · ' + league.season : ''}</p></div>
				{#if league.status === 'open'}<a href="/multiplayer/sala/{league.code}">{league.online ? 'Online na liga' : 'Abrir liga'}</a>
				{:else}<small>Arquivada</small>{/if}
			</article>
			{#if league.history.length || league.awards.length}
				<details>
					<summary>Histórico e conquistas</summary>
					{#each league.history.toReversed().slice(0, 16) as item}
						<p>{formatShort(item.date)} · {getClub(item.club)?.name ?? item.club} · {labels[item.role] ?? item.role}</p>
					{/each}
					{#each league.awards.toReversed() as award}
						<p><strong>{award.season}</strong> · {award.label ?? (award.competition === 'copa-do-brasil' ? 'Campeão da Copa do Brasil' :
							'Campeão da ' + (DIVISION_LABELS[award.competition as DivisionId] ?? award.competition ?? 'liga'))}
							{award.club ? ' · ' + (getClub(award.club)?.name ?? award.club) : ''}</p>
					{/each}
				</details>
			{/if}
		{:else}<p>{data.self ? 'Você ainda não participa de nenhuma liga.' : 'Vocês ainda não têm ligas em comum.'}</p>{/each}
	</section>
	{#if data.self}
		<section><h2>Amigos</h2>
			{#each data.friends as friend (friend.id)}<p><a href="/perfil/{friend.username}">{friend.display_name}</a> · @{friend.username}</p>
			{:else}<p>Adicione amigos na <a href="/multiplayer#social">Central social</a>.</p>{/each}
		</section>
	{/if}
	{#if data.self || data.invites.length}
		<section><h2>Histórico de convites</h2>
			{#each data.invites as invite (invite.id)}
				<p>{invite.recipient === data.profileId ? 'Recebido de ' + invite.sender_name : 'Enviado para ' + invite.recipient_name}
					· {invite.name} · {inviteLabels[invite.status]}</p>
			{:else}<p>Seus convites aparecerão aqui.</p>{/each}
			<a href="/multiplayer#social">Abrir Central social</a>
		</section>
	{/if}
</main>

<style>
	main { max-width: 750px; margin: auto; padding: 36px clamp(14px, 3vw, 24px); }
	header, article { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
	header, section { padding: 14px; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); margin-bottom: 10px; }
	article { padding-top: 10px; margin-top: 10px; border-top: 1px solid var(--line); }
	article > div { flex: 1; min-width: 110px; }
	details { margin-block: 8px; }
	summary { cursor: pointer; }
	p, small { color: var(--muted); }
	a { color: var(--emerald); }
</style>
