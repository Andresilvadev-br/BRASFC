<script lang="ts">
	import { POSITION_INFO, SECTOR_LABELS, type Sector } from '#lib/domain/positions.ts';
	import { MORALE_LABELS, sectorOf, type SquadPlayer } from '#lib/domain/squad.ts';
	import { playerKit } from '#lib/pixel/kits.ts';
	import { animate } from '#lib/motion/motion.svelte.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import DemoTag from '#lib/ui/DemoTag.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Meter from '#lib/ui/Meter.svelte';
	import Panel from '#lib/ui/Panel.svelte';
	import Pixel from '#lib/ui/Pixel.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';
	import Unavailable from '#lib/ui/Unavailable.svelte';

	let { data } = $props();
	const v = $derived(data.view);
	const starters = $derived(new Set(v.tactic.lineup));

	let filter = $state<'todos' | Sector>('todos');
	let selectedId = $state<string | null>(null);
	let sortKey = $state<'position' | 'overall' | 'age' | 'condition'>('position');
	let detail: HTMLElement | undefined = $state();

	const ORDER = ['GOL', 'LD', 'ZAG', 'LE', 'VOL', 'MC', 'MEI', 'PD', 'PE', 'ATA'];
	const list = $derived(
		v.squad
			.filter((p) => filter === 'todos' || sectorOf(p.position) === filter)
			.sort((a, b) =>
				sortKey === 'position'
					? ORDER.indexOf(a.position) - ORDER.indexOf(b.position) || b.overall - a.overall
					: sortKey === 'age'
						? a.age - b.age
						: b[sortKey] - a[sortKey]
			)
	);
	const selected = $derived<SquadPlayer>(v.squad.find((p) => p.id === selectedId) ?? list[0] ?? v.squad[0]);

	function pick(id: string) {
		selectedId = id;
		if (detail) void animate(detail, { opacity: 1, x: 0 }, { spring: 'snappy', from: { opacity: 0.4, x: 10 } });
	}
	const avg = (k: 'age' | 'overall') => Math.round(v.squad.reduce((s, p) => s + p[k], 0) / v.squad.length);
</script>

<svelte:head><title>Elenco · {v.club.name} · BRASFC</title></svelte:head>

<div class="head" data-umx-enter>
	<div>
		<span class="eyebrow">{v.club.name}</span>
		<h1>Elenco</h1>
		<p class="muted">{v.squad.length} atletas · idade média {avg('age')} · nota média {avg('overall')}</p>
	</div>
	<div class="tools">
		<DemoTag label="Elenco fictício" />
		<Segmented
			label="Filtrar por setor"
			bind:value={filter}
			options={[{ value: 'todos', label: 'Todos' }, ...(['goleiro', 'defesa', 'meio', 'ataque'] as const).map((s) => ({ value: s, label: SECTOR_LABELS[s] }))]}
		/>
	</div>
</div>

<div class="layout">
	<Panel pad={false} index={0}>
		<table>
			<thead>
				<tr>
					<th class="n">Nº</th>
					<th class="who">Jogador</th>
					<th><button class:on={sortKey === 'position'} onclick={() => (sortKey = 'position')}>Pos.</button></th>
					<th><button class:on={sortKey === 'age'} onclick={() => (sortKey = 'age')}>Idade</button></th>
					<th><button class:on={sortKey === 'overall'} onclick={() => (sortKey = 'overall')}>Nota</button></th>
					<th><button class:on={sortKey === 'condition'} onclick={() => (sortKey = 'condition')}>Condição</button></th>
					<th>Moral</th>
				</tr>
			</thead>
			<tbody>
				{#each list as p (p.id)}
					<tr class:sel={p.id === selected.id} onclick={() => pick(p.id)}>
						<td class="n num">{p.number}</td>
						<td class="who">
							<button class="rowbtn" onclick={() => pick(p.id)} aria-pressed={p.id === selected.id}>
								<Pixel appearance={p.appearance} kit={playerKit(data.career.clubId, p.position)} size={34} />
								<span>{p.name}</span>
								{#if starters.has(p.id)}<span class="tit" title="Titular na tática atual">T</span>{/if}
							</button>
						</td>
						<td><span class="pos" data-sector={sectorOf(p.position)}>{p.position}</span></td>
						<td class="num">{p.age}</td>
						<td class="num ovr">{p.overall}</td>
						<td><Meter value={p.condition} compact label="Condição física" /></td>
						<td class="mor" data-m={p.morale}>{MORALE_LABELS[p.morale]}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</Panel>

	<aside class="detail" bind:this={detail}>
		<Panel tone="raised" index={1}>
			<div class="card">
				<div class="art"><Pixel variant="full" appearance={selected.appearance} kit={playerKit(data.career.clubId, selected.position)} size={210} /></div>
				<span class="eyebrow">#{selected.number} · {POSITION_INFO[selected.position].label}</span>
				<h2>{selected.name}</h2>
				<div class="nums">
					<div><small>Nota</small><strong class="num">{selected.overall}</strong></div>
					<div><small>Potencial</small><strong class="num">{selected.potential}</strong></div>
					<div><small>Idade</small><strong class="num">{selected.age}</strong></div>
				</div>
				<div class="line"><span>Condição física</span><Meter value={selected.condition} label="Condição física" /></div>
				<div class="line"><span>Moral</span><Badge tone={selected.morale === 'regular' ? 'warning' : 'emerald'}>{MORALE_LABELS[selected.morale]}</Badge></div>
				<div class="line"><span>Situação</span><span>{starters.has(selected.id) ? 'Titular' : 'Reserva'}</span></div>
			</div>
			<div class="soon">
				<Unavailable title="Atributos detalhados" detail="Técnica, físico e mental" icon="chart" />
				<Unavailable title="Contrato e salário" icon="briefcase" />
			</div>
		</Panel>
	</aside>
</div>

<p class="footnote subtle"><Icon name="info" size={14} /> Atletas gerados para demonstração; nomes são combinações aleatórias e não representam pessoas reais.</p>

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
	.tools {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 340px;
		gap: var(--sp-4);
		align-items: start;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--fs-sm);
	}
	th {
		text-align: left;
		padding: var(--sp-3) var(--sp-3);
		font-size: var(--fs-xs);
		color: var(--text-3);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 600;
		border-bottom: 1px solid var(--line-strong);
		position: sticky;
		top: 0;
		background: var(--surface);
	}
	th button {
		all: unset;
		cursor: pointer;
	}
	th button.on {
		color: var(--emerald-strong);
	}
	td {
		padding: 6px var(--sp-3);
		border-bottom: 1px solid var(--line);
		color: var(--text-2);
	}
	tr {
		cursor: pointer;
	}
	tbody tr:hover td {
		background: rgb(231 237 240 / 0.025);
	}
	tr.sel td {
		background: var(--emerald-soft) !important;
	}
	.n {
		width: 44px;
		text-align: center;
	}
	.rowbtn {
		all: unset;
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		color: var(--text);
		font-weight: 600;
		cursor: pointer;
	}
	.rowbtn:focus-visible {
		box-shadow: var(--focus);
		border-radius: 6px;
	}
	.tit {
		font-size: 10px;
		font-weight: 800;
		padding: 1px 5px;
		border-radius: 4px;
		background: var(--surface-3);
		color: var(--text-2);
	}
	.pos {
		display: inline-block;
		min-width: 40px;
		text-align: center;
		padding: 2px 6px;
		border-radius: 6px;
		font-weight: 700;
		font-size: var(--fs-xs);
	}
	.pos[data-sector='goleiro'] {
		background: var(--gold-soft);
		color: var(--gold);
	}
	.pos[data-sector='defesa'] {
		background: var(--info-soft);
		color: var(--info);
	}
	.pos[data-sector='meio'] {
		background: var(--emerald-soft);
		color: var(--emerald-strong);
	}
	.pos[data-sector='ataque'] {
		background: var(--danger-soft);
		color: var(--danger);
	}
	.ovr {
		font-weight: 700;
		color: var(--text);
	}
	.mor[data-m='excelente'] {
		color: var(--emerald-strong);
	}
	.mor[data-m='regular'] {
		color: var(--warning);
	}
	.detail {
		position: sticky;
		top: 150px;
	}
	.card {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: var(--sp-2);
	}
	.art {
		padding: var(--sp-3) var(--sp-5) 0;
		background: radial-gradient(60% 16% at 50% 96%, rgb(0 0 0 / 0.5), transparent 70%);
	}
	.art :global(svg) {
		height: 210px;
		width: auto;
	}
	.card h2 {
		font-size: var(--fs-2xl);
		text-transform: uppercase;
	}
	.nums {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		width: 100%;
		margin: var(--sp-2) 0;
	}
	.nums div {
		display: flex;
		flex-direction: column;
	}
	.nums small {
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.nums strong {
		font-family: var(--font-display);
		font-size: var(--fs-3xl);
		line-height: 1;
	}
	.line {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		padding: var(--sp-2) 0;
		border-top: 1px solid var(--line);
		font-size: var(--fs-sm);
	}
	.soon {
		display: grid;
		gap: var(--sp-2);
		margin-top: var(--sp-4);
	}
	.footnote {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin-top: var(--sp-4);
		font-size: var(--fs-xs);
	}
	@media (max-width: 1100px) {
		.layout {
			grid-template-columns: 1fr;
		}
		.detail {
			position: static;
		}
	}
</style>
