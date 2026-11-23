<script lang="ts">
	import { untrack } from 'svelte';
	import { getClub } from '#lib/domain/clubs.ts';
	import { CAREER_PLAYER_ID } from '#lib/domain/matchday.ts';
	import { playerTotals, type Totals } from '#lib/domain/playerstats.ts';
	import Panel from '#lib/ui/Panel.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';

	let { data } = $props();
	const c = $derived(data.career);
	const v = $derived(data.view);
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
	const record = $derived.by(() => {
		let w = 0, d = 0, l = 0, gf = 0, ga = 0;
		for (const m of filtered) {
			const home = m.summary.mySide ? m.summary.mySide === 'home' : m.home === c.clubId;
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
	.lead .none {
		color: var(--text-3);
	}
</style>
