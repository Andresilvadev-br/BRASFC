<script lang="ts">
	import { getClub } from '#lib/domain/clubs.ts';
	import { DEFAULT_APPEARANCE } from '#lib/domain/appearance.ts';
	import { coachKit } from '#lib/pixel/kits.ts';
	import { enter } from '#lib/motion/actions.ts';
	import Crest from '#lib/ui/Crest.svelte';
	import Pixel from '#lib/ui/Pixel.svelte';
	import ScreenHeader from '#lib/ui/ScreenHeader.svelte';
	let { data } = $props();
	const labels = { coach:'Treinador', assistant:'Auxiliar técnico', player:'Jogador' };
</script>

<svelte:head><title>{data.person.displayName} · BRASFC</title></svelte:head>
<main use:enter>
	<ScreenHeader title="Perfil BRASFC" back="/multiplayer#social" />
	<header><Pixel appearance={{ ...DEFAULT_APPEARANCE, skin:data.person.avatar }} kit={coachKit()} size={60} />
		<div><h2>{data.person.displayName}</h2><p>@{data.person.username}</p></div>
	</header>
	<section><h2>Ligas em comum</h2>
		{#each data.leagues as league (league.code)}
			<article>
				{#if league.club}<Crest clubId={league.club} size={32} />{/if}
				<div><strong>{league.name}</strong><p>{league.club ? getClub(league.club)?.name ?? league.club : 'Clube pendente'}
					{league.role ? ' · ' + labels[league.role] : ''}{league.season ? ' · ' + league.season : ''}</p></div>
				{#if league.status === 'open'}<a href="/multiplayer/sala/{league.code}">{league.online ? 'Online na liga' : 'Abrir liga'}</a>
				{:else}<small>Arquivada</small>{/if}
			</article>
		{:else}<p>Vocês ainda não têm ligas em comum.</p>{/each}
	</section>
</main>

<style>
	main { max-width: 750px; margin: auto; padding: 36px clamp(14px, 3vw, 24px); }
	header, article { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
	header, section { padding: 14px; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); margin-bottom: 10px; }
	article { padding-top: 10px; margin-top: 10px; border-top: 1px solid var(--line); }
	article > div { flex: 1; min-width: 110px; }
	p, small { color: var(--muted); }
	a { color: var(--emerald); }
</style>
