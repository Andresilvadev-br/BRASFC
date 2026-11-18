<script lang="ts">
	import { untrack } from 'svelte';
	import { getClub } from '#lib/domain/clubs.ts';
	import { CAREER_PLAYER_ID } from '#lib/domain/matchday.ts';
	import { playerHistory, playerTotals, type Totals } from '#lib/domain/playerstats.ts';
	import Panel from '#lib/ui/Panel.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';

	let { data } = $props();
	const c = $derived(data.career);
	const v = $derived(data.view);
	const isPlayer = $derived(c.mode === 'player');
	const seasons = $derived([...new Set(data.matches.map((m) => m.season))].sort((a, b) => b - a));
	let season = $state<string>(untrack(() => String(data.career.season)));
	const filtered = $derived(season === 'todas' ? data.matches : data.matches.filter((m) => String(m.season) === season));
	const totals = $derived(playerTotals(filtered));
	const nameOf = (id: string) => v.squad.find((p) => p.id === id)?.name ?? 'Ex-atleta';
	const short = (id: string) => v.squad.find((p) => p.id === id)?.shortName ?? '—';
	const leaders = (key: keyof Totals, min = 1) =>
		Object.entries(totals)
			.filter(([, t]) => (t[key] as number) >= min)
			.sort((a, b) => (b[1][key] as number) - (a[1][key] as number))
			.slice(0, 5);
	const boards = $derived([
		{ title: 'Artilheiros', key: 'goals' as const, fmt: (t: Totals) => `${t.goals}` },
		{ title: 'Assistências', key: 'assists' as const, fmt: (t: Totals) => `${t.assists}` },
		{ title: 'Melhor nota média', key: 'rating' as const, fmt: (t: Totals) => t.rating.toFixed(2), min: 0 },
		{ title: 'Desarmes', key: 'tackles' as const, fmt: (t: Totals) => `${t.tackles}` }
	]);
	const ratingBoard = $derived(
		Object.entries(totals)
			.filter(([, t]) => t.games >= Math.max(1, Math.floor(filtered.length / 3)))
			.sort((a, b) => b[1].rating - a[1].rating)
			.slice(0, 5)
	);
	const me = $derived(playerHistory(data.matches, CAREER_PLAYER_ID));
	const meSeason = $derived(season === 'todas' ? me.all : (me.seasons.find((s) => String(s.season) === season)?.totals ?? null));
	const record = $derived.by(() => {
		let w = 0, d = 0, l = 0, gf = 0, ga = 0;
		for (const m of filtered) {
			const home = m.home === c.clubId;
			const f = home ? m.homeGoals : m.awayGoals;
			const a = home ? m.awayGoals : m.homeGoals;
			gf += f;
			ga += a;
			if (f > a) w++;
			else if (f === a) d++;
			else l++;
		}
		return { w, d, l, gf, ga, n: filtered.length };
	});
	const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
</script>

<svelte:head><title>Estatísticas · {v.club.name} · BRASFC</title></svelte:head>

<div class="head" data-umx-enter>
	<span class="eyebrow">Tudo calculado a partir dos lances das partidas disputadas</span>
	<h1>Estatísticas</h1>
	{#if seasons.length}
		<Segmented label="Temporada" bind:value={season} options={[...seasons.map((s) => ({ value: String(s), label: String(s) })), { value: 'todas', label: 'Todas' }]} />
	{/if}
</div>

{#if !data.matches.length}
	<Panel title="Ainda sem jogos" icon="chart"><p class="muted">Dispute a primeira partida para começar a acumular estatísticas.</p></Panel>
{:else}
	{#if isPlayer}
		<Panel title="Você · {c.personName}" icon="user" index={0}>
			{#if meSeason && meSeason.games}
				<div class="kpis">
					<div><b>{meSeason.games}</b><span>jogos</span></div>
					<div><b>{meSeason.starts}</b><span>como titular</span></div>
					<div><b>{meSeason.minutes}</b><span>minutos</span></div>
					<div><b>{meSeason.goals}</b><span>gols</span></div>
					<div><b>{meSeason.assists}</b><span>assistências</span></div>
					<div><b>{meSeason.rating.toFixed(2)}</b><span>nota média</span></div>
					<div><b>{meSeason.shots ? `${pct(meSeason.shotsOnTarget, meSeason.shots)}%` : '—'}</b><span>chutes no alvo ({meSeason.shots})</span></div>
					<div><b>{meSeason.passes ? `${pct(meSeason.passesCompleted, meSeason.passes)}%` : '—'}</b><span>passes certos ({meSeason.passes})</span></div>
					<div><b>{meSeason.tackles}</b><span>desarmes</span></div>
					<div><b>{meSeason.yellow}/{meSeason.red}</b><span>amarelos/vermelhos</span></div>
				</div>
			{:else}
				<p class="muted">Você ainda não entrou em campo {season === 'todas' ? '' : `em ${season}`}.</p>
			{/if}
			{#if me.seasons.length > 1}
				<h3>Por temporada</h3>
				<div class="seasons">
					{#each me.seasons as s (s.season)}
						<div><b>{s.season}</b><span>{s.totals.games} J · {s.totals.goals} G · {s.totals.assists} A · nota {s.totals.rating.toFixed(2)}</span></div>
					{/each}
				</div>
			{/if}
			{#if me.games.length}
				<h3>Jogo a jogo</h3>
				<div class="games">
					{#each me.games.slice(0, 20) as g (g.season + ':' + g.round)}
						<div class="g" title="{getClub(g.home)?.name} {g.score} {getClub(g.away)?.name}">
							<span class="r">{g.season} · R{g.round}</span>
							<span>{getClub(g.home)?.short} {g.score} {getClub(g.away)?.short}</span>
							<span class="st">{g.started ? 'titular' : 'reserva'} · {g.stats.minutes}'</span>
							<span class="nota" data-t={g.stats.rating >= 7.5 ? 'hi' : g.stats.rating < 6 ? 'lo' : ''}>{g.stats.rating.toFixed(1)}</span>
							<span class="ga">{g.stats.goals ? `⚽${g.stats.goals}` : ''}{g.stats.assists ? ` 🅰${g.stats.assists}` : ''}</span>
						</div>
					{/each}
				</div>
			{/if}
		</Panel>
	{/if}

	<div class="row">
		<Panel title="Campanha" icon="trophy" index={1}>
			<div class="kpis small">
				<div><b>{record.n}</b><span>jogos</span></div>
				<div><b class="w">{record.w}</b><span>vitórias</span></div>
				<div><b>{record.d}</b><span>empates</span></div>
				<div><b class="l">{record.l}</b><span>derrotas</span></div>
				<div><b>{record.gf}–{record.ga}</b><span>gols</span></div>
				<div><b>{pct(record.w * 3 + record.d, record.n * 3)}%</b><span>aproveitamento</span></div>
			</div>
		</Panel>
		{#each boards.slice(0, 2) as b (b.title)}
			<Panel title={b.title} icon="star" index={2}>
				<ol class="lead">
					{#each leaders(b.key) as [id, t], i (id)}
						<li class:me={id === CAREER_PLAYER_ID}><span class="pos">{i + 1}</span><span class="nm" title={nameOf(id)}>{short(id)}</span><b>{b.fmt(t)}</b><small>{t.games} J</small></li>
					{:else}
						<li class="none">—</li>
					{/each}
				</ol>
			</Panel>
		{/each}
		<Panel title="Melhor nota média" icon="star" index={3}>
			<ol class="lead">
				{#each ratingBoard as [id, t], i (id)}
					<li class:me={id === CAREER_PLAYER_ID}><span class="pos">{i + 1}</span><span class="nm" title={nameOf(id)}>{short(id)}</span><b>{t.rating.toFixed(2)}</b><small>{t.games} J</small></li>
				{/each}
			</ol>
		</Panel>
		<Panel title="Desarmes" icon="lock" index={4}>
			<ol class="lead">
				{#each leaders('tackles') as [id, t], i (id)}
					<li class:me={id === CAREER_PLAYER_ID}><span class="pos">{i + 1}</span><span class="nm" title={nameOf(id)}>{short(id)}</span><b>{t.tackles}</b><small>{t.games} J</small></li>
				{/each}
			</ol>
		</Panel>
	</div>
{/if}

<style>
	.head {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: var(--sp-5);
	}
	h1 {
		font-size: var(--fs-3xl);
		text-transform: uppercase;
		font-weight: 800;
		margin: 0;
	}
	h3 {
		margin: 14px 0 6px;
		font-size: var(--fs-xs);
		color: var(--text-3);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.kpis {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
		gap: 8px;
	}
	.kpis div {
		display: flex;
		flex-direction: column;
		padding: 10px;
		border-radius: 10px;
		background: var(--surface-2);
	}
	.kpis b {
		font-family: var(--font-display);
		font-size: var(--fs-2xl);
	}
	.kpis.small b {
		font-size: var(--fs-xl);
	}
	.kpis span {
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.kpis .w {
		color: var(--emerald-strong);
	}
	.kpis .l {
		color: var(--danger);
	}
	.row {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: var(--sp-4);
		margin-top: var(--sp-4);
	}
	.lead {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}
	.lead li {
		display: grid;
		grid-template-columns: 20px 1fr auto 32px;
		gap: 8px;
		align-items: center;
		padding: 4px 6px;
		border-radius: 6px;
		font-size: var(--fs-sm);
	}
	.lead li:first-child {
		background: var(--gold-soft);
	}
	.lead li.me {
		box-shadow: inset 0 0 0 1px var(--emerald);
	}
	.lead .pos {
		color: var(--text-3);
		font-weight: 700;
	}
	.lead .nm {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.lead small {
		color: var(--text-3);
		text-align: right;
	}
	.lead .none {
		color: var(--text-3);
	}
	.seasons {
		display: grid;
		gap: 4px;
		font-size: var(--fs-sm);
	}
	.seasons div {
		display: flex;
		gap: 10px;
	}
	.games {
		display: grid;
		gap: 4px;
	}
	.g {
		display: grid;
		grid-template-columns: 90px 1fr 110px 40px 60px;
		gap: 8px;
		align-items: center;
		padding: 5px 8px;
		border-radius: 6px;
		background: var(--surface-2);
		font-size: var(--fs-sm);
	}
	.g .r,
	.g .st {
		color: var(--text-3);
		font-size: var(--fs-xs);
	}
	.nota {
		font-family: var(--font-display);
		font-weight: 700;
		text-align: center;
	}
	.nota[data-t='hi'] {
		color: var(--emerald-strong);
	}
	.nota[data-t='lo'] {
		color: var(--danger);
	}
	@media (max-width: 640px) {
		.g {
			grid-template-columns: 70px 1fr 40px;
		}
		.g .st,
		.g .ga {
			display: none;
		}
	}
</style>
