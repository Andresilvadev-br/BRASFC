<script lang="ts">
	import { getClub } from '#lib/domain/clubs.ts';
	import { DIVISION_LABELS, type DivisionId, competitionName } from '#lib/domain/league.ts';
	import { formatLong, relativeDays } from '#lib/domain/dates.ts';
	import type { Fixture } from '#lib/domain/season.ts';
	import Crest from '../Crest.svelte';

	/** Destaque do próximo compromisso: confronto em evidência, data e contexto. */
	let { fixture, clubId, today }: { fixture: Fixture; clubId: string; today: string } = $props();

	const home = $derived(getClub(fixture.home)!);
	const away = $derived(getClub(fixture.away)!);
	const isHome = $derived(fixture.home === clubId);
	const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
</script>

<div class="fixture">
	<div class="meta">
		<span class="comp">{competitionName(fixture.competition)} · Rodada {fixture.round}</span>
		<span class="when"><strong>{cap(relativeDays(today, fixture.date))}</strong> · {formatLong(fixture.date)} · {fixture.time}</span>
	</div>
	<div class="versus">
		<div class="side" class:me={home.id === clubId}>
			<Crest clubId={home.id} size={76} />
			<strong>{home.name}</strong>
		</div>
		<div class="vs">
			<span>VS</span>
			<small>{isHome ? 'Em casa' : 'Fora'}</small>
		</div>
		<div class="side" class:me={away.id === clubId}>
			<Crest clubId={away.id} size={76} />
			<strong>{away.name}</strong>
		</div>
	</div>
	<div class="venue">{home.stadium} · {home.city}</div>
</div>

<style>
	.fixture {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}
	.meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.comp {
		font-family: var(--font-display);
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--gold);
		font-size: var(--fs-sm);
	}
	.when {
		color: var(--text-2);
		font-size: var(--fs-sm);
	}
	.when strong {
		color: var(--text);
	}
	.versus {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: var(--sp-4);
	}
	.side {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-2);
		text-align: center;
	}
	.side strong {
		font-family: var(--font-display);
		font-size: var(--fs-xl);
		text-transform: uppercase;
		line-height: 1.05;
		color: var(--text-2);
	}
	.side.me strong {
		color: var(--text);
	}
	.vs {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.vs span {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: var(--fs-3xl);
		color: var(--text-3);
		line-height: 1;
	}
	.vs small {
		font-size: var(--fs-xs);
		color: var(--text-3);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.venue {
		text-align: center;
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
</style>
