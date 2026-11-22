<script lang="ts">
	import { invalidate } from '$app/navigation';
	import Button from '#lib/ui/Button.svelte';
	import { COACH_PROFILES } from '#lib/engine/ai-coach.ts';
	import { BOARD_PROFILES } from '#lib/domain/club.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { divLabel, PHILOSOPHY_INFO, PROJECT_INFO, type NewsKind, type ProjectKind } from '#lib/domain/universe.ts';
	import { reveal } from '#lib/motion/actions.ts';
	import Crest from '#lib/ui/Crest.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Donut from '#lib/ui/v4/Donut.svelte';
	import Gauge from '#lib/ui/v4/Gauge.svelte';

	let { data } = $props();
	const u = $derived(data.universe);
	type Filter = 'tudo' | 'tecnicos' | 'titulos' | 'recordes' | 'projetos' | 'voce';
	let filter = $state<Filter>('tudo');
	let query = $state('');
	const FILTERS: Array<[Filter, string, NewsKind[]]> = [
		['tudo', 'Tudo', []],
		['tecnicos', 'Técnicos', ['demissao', 'contratacao']],
		['titulos', 'Títulos e acessos', ['titulo', 'acesso', 'queda', 'lideranca']],
		['recordes', 'Recordes e fases', ['recorde', 'sequencia', 'goleada']],
		['projetos', 'Projetos', ['projeto', 'mercado', 'tatica']],
		['voce', 'Você', ['usuario']]
	];
	const news = $derived.by(() => {
		if (!u) return [];
		const kinds = FILTERS.find((f) => f[0] === filter)![2];
		const q = query.trim().toLowerCase();
		return [...u.news]
			.reverse()
			.filter((n) => (!kinds.length || kinds.includes(n.kind)) && (!q || n.title.toLowerCase().includes(q) || n.clubs.some((c) => (getClub(c)?.name ?? c).toLowerCase().includes(q))))
			.slice(0, 60);
	});
	const ICON: Partial<Record<NewsKind, 'alert' | 'user' | 'trophy' | 'star' | 'chart' | 'sparkle' | 'news'>> = { demissao: 'alert', contratacao: 'user', titulo: 'trophy', recorde: 'star', sequencia: 'chart', projeto: 'sparkle', lideranca: 'trophy', usuario: 'star' };
	const seasonNow = $derived(data.career.season);
	const sackings = $derived(u ? u.news.filter((n) => n.kind === 'demissao' && n.season === seasonNow) : []);
	const topCoaches = $derived(u ? Object.values(u.coaches).sort((a, b) => b.reputation - a.reputation).slice(0, 8) : []);
	const PCOLORS: Record<ProjectKind, string> = { titulo: '#e8b86a', crescimento: '#10b981', manutencao: '#5b8db8', reconstrucao: '#a78bfa', crise: '#ef4444' };
	const projects = $derived.by(() => {
		if (!u) return [];
		const n: Record<string, number> = {};
		for (const m of Object.values(u.clubs)) n[m.project] = (n[m.project] ?? 0) + 1;
		return (Object.keys(PROJECT_INFO) as ProjectKind[]).filter((k) => n[k]).map((k) => ({ label: PROJECT_INFO[k].label, value: n[k], color: PCOLORS[k] }));
	});
	// Explorador de clubes: qualquer clube do universo, começando pelo próximo adversário.
	const opp = $derived(data.view.upcoming ? (data.view.upcoming.home === data.career.clubId ? data.view.upcoming.away : data.view.upcoming.home) : null);
	let picked = $state<string | null>(null);
	const focus = $derived(picked ?? opp ?? data.career.clubId);
	const mind = $derived(u?.clubs[focus] ?? null);
	const coach = $derived(mind?.coachId ? (u?.coaches[mind.coachId] ?? null) : null);
	const divisionClubs = $derived(Object.entries(data.view.league.divisions) as Array<[string, string[]]>);
	const rec = $derived(u?.records);
	const titleRank = $derived(rec ? Object.entries(rec.titles).sort((a, b) => b[1] - a[1]).slice(0, 5) : []);
</script>

<svelte:head><title>Notícias e mundo · BRASFC</title></svelte:head>

<div class="page">
	<header use:reveal>
		<span class="eyebrow-gold">Futebol brasileiro vivo</span>
		<h1 class="display">Notícias e mundo</h1>
		<p class="muted">Tudo aqui nasce dos resultados simulados: técnicos caem, projetos mudam, recordes se formam — mesmo nos clubes que você não acompanha.</p>
	</header>

	{#if data.newsUnavailable}
		<section class="empty glass pad" use:reveal>
			<div>
				<strong>Não foi possível carregar as notícias.</strong>
				<Button size="sm" onclick={() => invalidate('app:career')}>Tentar novamente</Button>
			</div>
		</section>
	{:else if !u}
		<section class="empty glass pad" use:reveal>
			<Icon name="globe" size={28} />
			<div>
				<strong>O universo começa na próxima rodada</strong>
				<p class="muted">Ao disputar o próximo passo do calendário, cada clube recebe técnico, filosofia e projeto, e as notícias passam a ser registradas.</p>
			</div>
		</section>
	{:else}
		<div class="layout">
			<section class="feed" aria-label="Notícias">
				<div class="filters" role="toolbar" aria-label="Filtrar notícias">
					{#each FILTERS as [id, label] (id)}
						<button class="chip" aria-pressed={filter === id} onclick={() => (filter = id)}>{label}</button>
					{/each}
					<input type="search" placeholder="Buscar clube ou tema" bind:value={query} aria-label="Buscar nas notícias" />
				</div>
				{#if news.length}
					<ol class="items">
						{#each news as n, i (n.id)}
							<li class="item glass tone-{n.tone}" style="--i:{Math.min(i, 12)}">
								<span class="ic"><Icon name={ICON[n.kind] ?? 'news'} size={16} /></span>
								<div class="body">
									<small>{n.round === 99 ? `Fim de ${n.season}` : n.round === 0 ? `${n.season}` : `${n.season} · rodada ${n.round}`}{n.importance >= 3 ? ' · destaque' : ''}</small>
									<strong>{n.title}</strong>
									<p>{n.body}</p>
								</div>
								<div class="crests">
									{#each n.clubs.slice(0, 2) as cl (cl)}<button class="cb" title="Ver {getClub(cl)?.name ?? cl}" onclick={() => (picked = cl)}><Crest clubId={cl} size={30} /></button>{/each}
								</div>
							</li>
						{/each}
					</ol>
				{:else}
					<p class="muted">Nenhuma notícia com esse filtro ainda.</p>
				{/if}
			</section>

			<aside class="side">
				<section class="glass pad club" use:reveal aria-label="Raio-x do clube">
					<label class="pick">
						<span>Raio-x do clube</span>
						<select bind:value={picked}>
							<option value={null}>{opp ? `Próximo adversário (${getClub(opp)?.name})` : 'Seu clube'}</option>
							{#each divisionClubs as [div, ids] (div)}
								<optgroup label={divLabel(div)}>
									{#each ids as id (id)}<option value={id}>{getClub(id)?.name ?? id}</option>{/each}
								</optgroup>
							{/each}
						</select>
					</label>
					{#if mind}
						<div class="cx">
							<Crest clubId={focus} size={56} />
							<div>
								<strong>{getClub(focus)?.name}</strong>
								<small class="muted">{PHILOSOPHY_INFO[mind.philosophy].label} · {PROJECT_INFO[mind.project].label} · diretoria {BOARD_PROFILES[mind.board].label.toLowerCase()}</small>
							</div>
						</div>
						{#if coach}
							<p class="coach"><Icon name="whistle" size={14} /> <strong>{coach.name}</strong> · {COACH_PROFILES[coach.style].label} · reputação {Math.round(coach.reputation)} · desde {coach.since}</p>
							<div class="cg">
								<Gauge value={mind.confidence} label="Confiança" size={110} />
								<div class="fm">
									<small>Sistema</small>
									<strong>{mind.formation}</strong>
									<small>Domínio {Math.round(mind.mastery[mind.formation] ?? 0)}</small>
									<div class="form" aria-label="Últimos resultados">{#each mind.form.split('') as r, k (k)}<i class={r}>{r.toUpperCase()}</i>{/each}</div>
								</div>
							</div>
						{:else}
							<p class="muted">{focus === data.career.clubId ? 'Este é o seu clube.' : 'Sem técnico no momento.'}</p>
						{/if}
					{/if}
				</section>

				<section class="glass pad" use:reveal={{ index: 1 }}>
					<h2 class="display">Dança das cadeiras {seasonNow}</h2>
					<p class="big">{sackings.length} <span>demissões</span></p>
					<ul class="mini">
						{#each sackings.slice(-5).reverse() as n (n.id)}<li><Crest clubId={n.clubs[0]} size={20} /> <span>{n.title}</span></li>{/each}
					</ul>
				</section>

				<section class="glass pad" use:reveal={{ index: 2 }}>
					<h2 class="display">Projetos dos clubes</h2>
					<Donut parts={projects} label="clubes" />
				</section>

				<section class="glass pad" use:reveal={{ index: 3 }}>
					<h2 class="display">Técnicos em alta</h2>
					<ol class="rank">
						{#each topCoaches as t, k (t.id)}
							<li><span class="n">{k + 1}</span><span class="nm">{t.name}</span>{#if t.clubId}<Crest clubId={t.clubId} size={18} />{:else}<small class="muted">livre</small>{/if}<i style="--w:{t.reputation}%"></i></li>
						{/each}
					</ol>
				</section>

				{#if rec}
					<section class="glass pad" use:reveal={{ index: 4 }}>
						<h2 class="display">Recordes</h2>
						<ul class="recs">
							{#if rec.biggestWin}<li><Icon name="star" size={14} /> Maior goleada: {getClub(rec.biggestWin.home)?.short} {rec.biggestWin.homeGoals}×{rec.biggestWin.awayGoals} {getClub(rec.biggestWin.away)?.short} ({rec.biggestWin.season})</li>{/if}
							{#if rec.longestStreak}<li><Icon name="chart" size={14} /> Maior sequência: {rec.longestStreak.wins} vitórias, {getClub(rec.longestStreak.clubId)?.name} ({rec.longestStreak.season})</li>{/if}
							{#if rec.bestCampaign}<li><Icon name="trophy" size={14} /> Melhor campanha: {getClub(rec.bestCampaign.clubId)?.name}, {rec.bestCampaign.points} pts em {rec.bestCampaign.games} jogos ({rec.bestCampaign.season})</li>{/if}
							{#each titleRank as [cl, n] (cl)}<li><Crest clubId={cl} size={18} /> {getClub(cl)?.name}: {n} título{n > 1 ? 's' : ''} na carreira</li>{/each}
							{#if !rec.biggestWin && !titleRank.length}<li class="muted">Os recordes aparecem conforme a carreira avança.</li>{/if}
						</ul>
					</section>
				{/if}
			</aside>
		</div>
	{/if}
</div>

<style>
	.page {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--sp-5);
	}
	.empty {
		display: flex;
		gap: 14px;
		align-items: center;
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 330px;
		gap: var(--sp-5);
		align-items: start;
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: var(--sp-4);
	}
	.filters input {
		flex: 1;
		min-width: min(160px, 100%);
		padding: 8px 12px;
		border-radius: 999px;
		border: 1px solid var(--line-strong);
		background: rgb(16 20 24 / 0.6);
		color: var(--text);
	}
	.items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 10px;
	}
	.item {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 12px;
		padding: 14px;
		border-left: 3px solid var(--line-strong);
		animation: rise 0.4s var(--ease-out) both;
		animation-delay: calc(var(--i) * 35ms);
	}
	.tone-boa {
		border-left-color: var(--emerald-strong);
	}
	.tone-ruim {
		border-left-color: var(--danger);
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}
	.ic {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 10px;
		background: rgb(231 237 240 / 0.06);
	}
	.body {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.body small {
		color: var(--text-3);
		font-size: var(--fs-xs);
	}
	.body p {
		margin: 0;
		color: var(--text-2);
		font-size: var(--fs-sm);
	}
	.crests {
		display: flex;
		gap: 4px;
	}
	.cb {
		background: none;
		border: 0;
		padding: 2px;
		cursor: pointer;
		border-radius: 8px;
	}
	.cb:hover,
	.cb:focus-visible {
		background: rgb(231 237 240 / 0.08);
		outline: none;
	}
	.side {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		min-width: 0;
		gap: var(--sp-4);
		position: sticky;
		top: calc(var(--desk-bar, 0px) + 80px);
	}
	.pick select {
		width: 100%;
	}
	.pick {
		display: grid;
		gap: 6px;
		font-size: var(--fs-xs);
		color: var(--text-3);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	select {
		padding: 8px;
		border-radius: 10px;
		background: #1c252b;
		color: var(--text);
		border: 1px solid var(--line-strong);
	}
	.cx {
		display: flex;
		gap: 12px;
		align-items: center;
		margin-top: 12px;
	}
	.cx div {
		display: grid;
	}
	.coach {
		display: flex;
		gap: 6px;
		align-items: center;
		flex-wrap: wrap;
		font-size: var(--fs-sm);
	}
	.cg {
		display: flex;
		gap: 12px;
		align-items: center;
	}
	.fm {
		display: grid;
		gap: 2px;
	}
	.fm strong {
		font: 700 1.6rem/1 'Barlow Condensed', sans-serif;
	}
	.form {
		display: flex;
		gap: 3px;
		margin-top: 4px;
	}
	.form i {
		width: 18px;
		height: 18px;
		display: grid;
		place-items: center;
		border-radius: 4px;
		font: 700 10px/1 sans-serif;
		font-style: normal;
		background: rgb(231 237 240 / 0.1);
	}
	.form i.v {
		background: var(--emerald-strong);
		color: #06140f;
	}
	.form i.d {
		background: var(--danger);
	}
	.big {
		font: 800 2.4rem/1 'Barlow Condensed', sans-serif;
		margin: 6px 0;
	}
	.big span {
		font-size: 1rem;
		color: var(--text-3);
	}
	.mini,
	.recs,
	.rank {
		list-style: none;
		margin: 8px 0 0;
		padding: 0;
		display: grid;
		gap: 8px;
		font-size: var(--fs-sm);
	}
	.mini li,
	.recs li {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.rank li {
		position: relative;
		display: grid;
		grid-template-columns: 18px 1fr auto;
		gap: 8px;
		align-items: center;
		padding-bottom: 6px;
	}
	.rank i {
		position: absolute;
		left: 26px;
		right: 0;
		bottom: 0;
		height: 3px;
		border-radius: 3px;
		background: linear-gradient(90deg, #10b981 var(--w), rgb(231 237 240 / 0.08) var(--w));
	}
	.n {
		color: var(--text-3);
	}
	@media (max-width: 1180px) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}
		.side {
			position: static;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.item {
			animation: none;
		}
	}
</style>
