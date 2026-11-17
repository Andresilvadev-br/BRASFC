<script lang="ts">
	import { getClub } from '#lib/domain/clubs.ts';
	import type { StandingRow } from '#lib/domain/season.ts';
	import Crest from '../Crest.svelte';

	let { rows, highlight, compact = false, limit }: { rows: StandingRow[]; highlight: string; compact?: boolean; limit?: number } = $props();

	/** No modo compacto mostra o topo e garante a linha do seu clube. */
	const visible = $derived.by(() => {
		if (!limit) return rows;
		const top = rows.slice(0, limit);
		if (top.some((r) => r.clubId === highlight)) return top;
		const mine = rows.find((r) => r.clubId === highlight);
		return mine ? [...rows.slice(0, limit - 1), mine] : top;
	});
	const zone = (pos: number) => (pos <= 4 ? 'top' : pos > rows.length - 4 ? 'down' : '');
</script>

<table class:compact>
	<thead>
		<tr>
			<th class="pos">#</th>
			<th class="team">Clube</th>
			{#if !compact}
				<th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th>
			{/if}
			<th title="Saldo de gols">SG</th>
			<th title="Pontos">Pts</th>
		</tr>
	</thead>
	<tbody>
		{#each visible as r (r.clubId)}
			{@const club = getClub(r.clubId)}
			<tr class:me={r.clubId === highlight} data-zone={zone(r.position)}>
				<td class="pos num">{r.position}</td>
				<td class="team">
					<Crest clubId={r.clubId} size={22} />
					<span>{compact ? club?.name : club?.name}</span>
					{#if r.clubId === highlight}<em>Você</em>{/if}
				</td>
				{#if !compact}
					<td class="num">{r.played}</td><td class="num">{r.won}</td><td class="num">{r.drawn}</td><td class="num">{r.lost}</td>
					<td class="num">{r.goalsFor}</td><td class="num">{r.goalsAgainst}</td>
				{/if}
				<td class="num">{r.goalDiff}</td>
				<td class="num pts">{r.points}</td>
			</tr>
		{/each}
	</tbody>
</table>

<style>
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--fs-sm);
	}
	th {
		text-align: right;
		font-weight: 600;
		font-size: var(--fs-xs);
		color: var(--text-3);
		padding: 0 var(--sp-2) var(--sp-2);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	td {
		text-align: right;
		padding: 7px var(--sp-2);
		border-top: 1px solid var(--line);
		color: var(--text-2);
	}
	th.pos,
	td.pos {
		text-align: center;
		width: 34px;
	}
	th.team,
	td.team {
		text-align: left;
	}
	td.team {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		color: var(--text);
		font-weight: 600;
		min-width: 0;
	}
	td.team span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	em {
		font-style: normal;
		font-size: 11px;
		padding: 1px 7px;
		border-radius: 9px;
		background: var(--emerald-soft);
		color: var(--emerald-strong);
		flex: none;
	}
	.pts {
		color: var(--text);
		font-weight: 700;
	}
	tr.me td {
		background: rgb(16 185 129 / 0.08);
	}
	tr[data-zone='top'] td.pos {
		box-shadow: inset 3px 0 0 var(--emerald);
	}
	tr[data-zone='down'] td.pos {
		box-shadow: inset 3px 0 0 var(--danger);
	}
</style>
