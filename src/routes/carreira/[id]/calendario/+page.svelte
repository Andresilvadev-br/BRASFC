<script lang="ts">
	import { untrack } from 'svelte';
	import { getClub } from '#lib/domain/clubs.ts';
	import { formatLong, monthGrid, monthLabel, toDate } from '#lib/domain/dates.ts';
	import { animate } from '#lib/motion/motion.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Crest from '#lib/ui/Crest.svelte';
	import Panel from '#lib/ui/Panel.svelte';

	let { data } = $props();
	const c = $derived(data.career);
	const v = $derived(data.view);

	const start = untrack(() => toDate(data.career.gameDate));
	let year = $state(start.getUTCFullYear());
	let month = $state(start.getUTCMonth());
	let grid: HTMLDivElement | undefined = $state();

	const days = $derived(monthGrid(year, month));
	const byDate = $derived(new Map(v.clubFixtures.map((f) => [f.date, f])));
	const monthFixtures = $derived(v.clubFixtures.filter((f) => toDate(f.date).getUTCMonth() === month && toDate(f.date).getUTCFullYear() === year));
	let selected = $state<string | null>(null);
	const selFixture = $derived(selected ? byDate.get(selected) : (monthFixtures[0] ?? null));

	function shift(delta: number) {
		const d = new Date(Date.UTC(year, month + delta, 1));
		year = d.getUTCFullYear();
		month = d.getUTCMonth();
		selected = null;
		if (grid) void animate(grid, { opacity: 1, x: 0 }, { spring: 'page', from: { opacity: 0, x: 24 * delta } });
	}
	const WEEK = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
</script>

<svelte:head><title>Calendário · {v.club.name} · BRASFC</title></svelte:head>

<div class="head" data-umx-enter>
	<div>
		<span class="eyebrow">Temporada {c.season}</span>
		<h1>Calendário</h1>
	</div>
	<div class="nav">
		<Button variant="secondary" icon="chevronLeft" onclick={() => shift(-1)} aria-label="Mês anterior" />
		<strong class="month">{monthLabel(year, month)}</strong>
		<Button variant="secondary" icon="chevronRight" onclick={() => shift(1)} aria-label="Próximo mês" />
	</div>
</div>

<div class="layout">
	<Panel pad={false} index={0}>
		<div class="cal" bind:this={grid}>
			{#each WEEK as w (w)}<div class="wh">{w}</div>{/each}
			{#each days as d (d)}
				{@const f = byDate.get(d)}
				{@const dt = toDate(d)}
				<button
					type="button"
					class="cell"
					class:out={dt.getUTCMonth() !== month}
					class:today={d === c.gameDate}
					class:match={!!f}
					class:sel={(selFixture?.date ?? '') === d && !!f}
					disabled={!f}
					onclick={() => (selected = d)}
					aria-label={f ? `${formatLong(d)}: jogo contra ${getClub(f.home === c.clubId ? f.away : f.home)?.name}` : formatLong(d)}
				>
					<span class="dn num">{dt.getUTCDate()}</span>
					{#if f}
						{@const opp = f.home === c.clubId ? f.away : f.home}
						<span class="m">
							<Crest clubId={opp} size={30} />
							<span class="ha">{f.home === c.clubId ? 'Casa' : 'Fora'}</span>
						</span>
					{:else if d === c.gameDate}
						<span class="now">Hoje</span>
					{/if}
				</button>
			{/each}
		</div>
	</Panel>

	<Panel title="Jogo selecionado" icon="whistle" index={1}>
		{#if selFixture}
			{@const opp = selFixture.home === c.clubId ? selFixture.away : selFixture.home}
			<div class="sel-card">
				<Crest clubId={opp} size={80} />
				<span class="eyebrow">Rodada {selFixture.round} · {selFixture.home === c.clubId ? 'em casa' : 'fora de casa'}</span>
				<strong>{getClub(opp)?.name}</strong>
				<span class="muted">{formatLong(selFixture.date)} · {selFixture.time}</span>
				<span class="subtle">{getClub(selFixture.home)?.stadium}</span>
			</div>
		{:else}
			<p class="muted">Nenhum jogo neste mês.</p>
		{/if}
		<p class="legend subtle"><span class="lg match"></span> Jogo da Liga <span class="lg today"></span> Data atual</p>
	</Panel>
</div>

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: var(--sp-4);
		flex-wrap: wrap;
		margin-bottom: var(--sp-5);
	}
	h1 {
		font-size: var(--fs-3xl);
		text-transform: uppercase;
		font-weight: 800;
	}
	.nav {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}
	.month {
		min-width: 170px;
		text-align: center;
		font-family: var(--font-display);
		font-size: var(--fs-xl);
		text-transform: uppercase;
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 320px;
		gap: var(--sp-4);
		align-items: start;
	}
	.cal {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 4px;
		padding: var(--sp-4);
	}
	.wh {
		text-align: center;
		font-size: var(--fs-xs);
		font-weight: 700;
		color: var(--text-3);
		text-transform: uppercase;
		padding-bottom: var(--sp-2);
	}
	.cell {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		min-height: 86px;
		padding: 6px 8px;
		border-radius: var(--radius-s);
		border: 1px solid var(--line);
		background: var(--surface-sunken);
		text-align: left;
	}
	.cell:disabled {
		cursor: default;
	}
	.out {
		opacity: 0.35;
	}
	.dn {
		font-size: var(--fs-sm);
		font-weight: 600;
		color: var(--text-2);
	}
	.match {
		background: linear-gradient(160deg, rgb(232 184 106 / 0.16), var(--surface-sunken));
		border-color: rgb(232 184 106 / 0.35);
	}
	.match:hover {
		border-color: var(--gold);
	}
	.sel {
		box-shadow: 0 0 0 2px var(--gold);
	}
	.today {
		border-color: var(--emerald);
		box-shadow: inset 0 0 0 1px var(--emerald);
	}
	.m {
		display: flex;
		align-items: center;
		gap: 6px;
		align-self: center;
		margin-top: auto;
	}
	.ha {
		font-size: 11px;
		font-weight: 700;
		color: var(--gold);
		text-transform: uppercase;
	}
	.now {
		margin-top: auto;
		font-size: 11px;
		font-weight: 700;
		color: var(--emerald-strong);
		text-transform: uppercase;
	}
	.sel-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		text-align: center;
		padding: var(--sp-3) 0 var(--sp-4);
	}
	.sel-card strong {
		font-family: var(--font-display);
		font-size: var(--fs-2xl);
		text-transform: uppercase;
	}
	.legend {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--fs-xs);
		border-top: 1px solid var(--line);
		padding-top: var(--sp-3);
	}
	.lg {
		width: 12px;
		height: 12px;
		border-radius: 3px;
		margin-left: var(--sp-2);
	}
	.lg.match {
		background: var(--gold-soft);
		border: 1px solid var(--gold);
	}
	.lg.today {
		border: 1px solid var(--emerald);
	}
	@media (max-width: 1000px) {
		.layout {
			grid-template-columns: 1fr;
		}
		.cell {
			min-height: 64px;
		}
	}
</style>
