<script lang="ts">
	import { getClub } from '#lib/domain/clubs.ts';
	import { formatShort } from '#lib/domain/dates.ts';
	import type { StoredRoundResult } from '#lib/domain/league.ts';
	import type { TournamentView } from '#lib/domain/tournaments.ts';
	import StandingsTable from '#lib/ui/career/StandingsTable.svelte';
	import ParticipationBadge from '#lib/ui/world/ParticipationBadge.svelte';

	let { tournament, results, clubId }: { tournament: TournamentView; results: StoredRoundResult[]; clubId: string } = $props();
	const key = (match: { round: number; home: string; away: string }) => `${match.round}:${match.home}:${match.away}`;
	const scores = $derived(new Map(results.filter((match) => match.competition === tournament.competition.id).map((match) => [key(match), match])));
	const fixtures = $derived(Map.groupBy(tournament.fixtures, (match) => match.round));
	const name = (id: string) => getClub(id)?.name ?? id;
</script>

<div class="status">
	<ParticipationBadge participation={tournament.participation} />
	{#if tournament.champion}<strong>Campeão · {name(tournament.champion)}</strong>{/if}
</div>
<div class="groups">
	{#each tournament.tables as table, index (index)}
		<section class="glass group">
			<h2>Grupo {String.fromCharCode(65 + index)}</h2>
			<StandingsTable rows={table} highlight={clubId} up={2} down={0} />
		</section>
	{/each}
</div>
<div class="games">
	{#each [...fixtures] as [round, matches] (round)}
		<section class="glass round">
			<h2>{matches[0].phase} · {formatShort(matches[0].date)}</h2>
			{#each matches as match (key(match))}
				{@const score = scores.get(key(match))}
				<div class="fixture" class:mine={match.home === clubId || match.away === clubId}>
					<span>{name(match.home)}</span>
					<b>{score ? `${score.homeGoals} × ${score.awayGoals}` : '×'}</b>
					<span>{name(match.away)}</span>
				</div>
			{/each}
			{#each tournament.phases.find((phase) => phase.rounds.at(-1) === round)?.outcomes ?? [] as outcome, i (i)}
				{#if outcome?.extraTime}<p class="muted">Prorrogação · {outcome.extraTime[0]} × {outcome.extraTime[1]}</p>{/if}
				{#if outcome?.penalties}<p class="muted">{name(outcome.winner)} venceu nos pênaltis por {Math.max(outcome.penalties.home, outcome.penalties.away)} a {Math.min(outcome.penalties.home, outcome.penalties.away)}.</p>{/if}
			{/each}
		</section>
	{/each}
</div>

<style>
	.status { display: flex; flex-wrap: wrap; align-items: center; gap: .6rem; margin-bottom: 1rem; }
	.groups, .games { display: grid; gap: .8rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 23rem), 1fr)); }
	.games { margin-top: 1rem; }
	.group, .round { padding: .8rem; min-width: 0; }
	h2 { font-size: .96rem; margin: 0 0 .5rem; }
	.fixture { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: .6rem; padding: .3rem .4rem; font-size: .84rem; }
	.fixture span:first-child { text-align: right; }
	.fixture.mine { background: color-mix(in srgb, var(--emerald-strong) 16%, transparent); border-radius: .3rem; }
	.muted { font-size: .82rem; margin: .4rem 0 0; }
</style>
