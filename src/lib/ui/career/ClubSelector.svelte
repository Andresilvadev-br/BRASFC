<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getClub, LEAGUE } from '#lib/domain/clubs.ts';
	import { BRASIL_DIVISIONS, DIVISION_LABELS, type DivisionId } from '#lib/domain/league.ts';
	import type { ClubLineup } from '#lib/domain/club-selection.ts';
	import Button from '../Button.svelte';
	import Crest from '../Crest.svelte';
	import Segmented from '../Segmented.svelte';
	import Stars from '../Stars.svelte';
	import LineupPitch from '../tactics/LineupPitch.svelte';

	let { clubs, clubId = $bindable(null), blocked = {}, lineup, previewLabel, loading = false, error, retry, summary, top }: {
		clubs: ReadonlyArray<{ id: string; division: DivisionId }>;
		clubId?: string | null;
		blocked?: Record<string, string>;
		lineup?: ClubLineup;
		previewLabel?: string;
		loading?: boolean;
		error?: string;
		retry?: () => void;
		summary?: string;
		top?: Snippet;
	} = $props();

	const selectId = $props.id();
	let division = $state<DivisionId | null>(null);
	const divisions = $derived(clubs.some((entry) => entry.division === LEAGUE.id) ? [LEAGUE.id] : BRASIL_DIVISIONS);
	const active = $derived(division && divisions.some((entry) => entry === division) ? division
		: clubs.find((entry) => entry.id === clubId)?.division ?? divisions[0]);
	const options = $derived(divisions.map((value) => ({ value, label: DIVISION_LABELS[value] })));
	const teams = $derived(clubs.filter((entry) => entry.division === active)
		.flatMap(({ id }) => { const club = getClub(id); return club ? [club] : []; })
		.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
	const index = $derived(teams.findIndex((team) => team.id === clubId));
	const club = $derived(teams[index]);

	function changeDivision(value: DivisionId) {
		division = value;
		clubId = clubs.find((entry) => entry.division === value && !blocked[entry.id])?.id
			?? clubs.find((entry) => entry.division === value)?.id ?? null;
	}

	function browse(offset: number) {
		if (teams.length) clubId = teams[(Math.max(index, 0) + offset + teams.length) % teams.length].id;
	}

	$effect(() => {
		if (index < 0) clubId = teams.find((team) => !blocked[team.id])?.id ?? teams[0]?.id ?? null;
	});
</script>

<section class="selector" aria-label="Seleção de clube">
	<header>
		<div class="country"><span>País</span><strong><span aria-hidden="true">🇧🇷</span> Brasil</strong></div>
		{#if top}{@render top()}{/if}
	</header>

	<div class="content">
		<div class="club" style:--club-color={club?.colors.primary ?? 'var(--emerald)'}>
			<label for="clubs-{selectId}">Clube</label>
			<div class="browse">
				<Button icon="chevronLeft" aria-label="Clube anterior" disabled={teams.length < 2} onclick={() => browse(-1)} />
				<div class="identity" aria-live="polite">
					{#if club}
						<Crest {club} size={108} />
						<h2>{club.name}</h2>
						<span>{club.city}</span>
						<Stars value={club.reputation} />
					{:else}
						<p>Nenhum clube nesta divisão.</p>
					{/if}
				</div>
				<Button icon="chevronRight" aria-label="Próximo clube" disabled={teams.length < 2} onclick={() => browse(1)} />
			</div>
			<select id="clubs-{selectId}" value={clubId ?? ''} disabled={!teams.length} onchange={(event) => (clubId = event.currentTarget.value)}>
				{#each teams as team (team.id)}
					<option value={team.id}>{team.name}{blocked[team.id] ? ' · indisponível' : ''}</option>
				{/each}
			</select>
			{#if club && blocked[club.id]}<p class="restriction" role="status">{blocked[club.id]}</p>{:else if summary}<p>{summary}</p>{/if}
		</div>

		<div class="lineup" aria-busy={loading}>
			<div class="lineup-title">
				<div><h3>Escalação</h3>{#if previewLabel}<span>{previewLabel}</span>{/if}</div>
				{#if lineup}<strong>{lineup.formation}</strong>{/if}
			</div>
			{#if lineup}
				<div class="pitch">
					<LineupPitch>
						{#each lineup.starters as slot, index (index)}
							<div class="starter" style:left="{slot.x}%" style:top="{slot.y}%" title={slot.name}>
								<strong>{slot.position}{#if slot.overall !== undefined} <span>{slot.overall}</span>{/if}</strong>
								{#if slot.shortName}<small aria-label={slot.name}>{slot.shortName}</small>{/if}
							</div>
						{/each}
					</LineupPitch>
				</div>
			{:else if error}
				<p role="alert">{error}</p>
				{#if retry}<Button size="sm" onclick={retry}>Tentar novamente</Button>{/if}
			{:else}
				<p role="status">{loading ? 'Carregando escalação…' : 'Selecione um clube para ver os titulares.'}</p>
			{/if}
		</div>
	</div>

	<footer>
		<strong>Liga</strong>
		{#if options.length > 1}
			<Segmented label="Liga" {options} value={active} onchange={changeDivision} />
		{:else}
			<span>{DIVISION_LABELS[active]}</span>
		{/if}
	</footer>
</section>

<style>
	.selector { display: grid; min-width: 0; overflow: hidden; border: 1px solid var(--line-strong); border-radius: var(--radius-xl); background: var(--surface); box-shadow: var(--shadow-2); }
	header, footer { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; padding: 12px clamp(12px, 2.5vw, 24px); }
	header { justify-content: space-between; border-bottom: 1px solid var(--line); }
	footer { border-top: 1px solid var(--line); }
	.country { display: flex; align-items: center; gap: 10px; }
	.country span, .lineup-title span, .identity > span, p { color: var(--text-2); font-size: var(--fs-sm); }
	.content { display: grid; grid-template-columns: minmax(235px, 2fr) minmax(0, 3fr); }
	.club, .lineup { min-width: 0; display: grid; align-content: start; gap: 10px; padding: clamp(12px, 2.5vw, 24px); }
	.club { background: radial-gradient(ellipse at 50% 35%, color-mix(in srgb, var(--club-color) 28%, transparent), transparent 72%); }
	.club label { font-weight: 700; }
	.browse { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 5px; }
	.browse :global(.btn) { padding: 0 8px; }
	.identity { display: grid; justify-items: center; gap: 6px; min-height: 165px; text-align: center; }
	.identity h2 { margin: 0; line-height: 1.05; overflow-wrap: anywhere; }
	select { width: 100%; min-width: 0; padding: 10px; color: var(--text); background: var(--surface-sunken); border: 1px solid var(--line-strong); border-radius: var(--radius-m); }
	p { margin: 0; }
	.restriction { color: var(--warning); }
	.lineup { border-left: 1px solid var(--line); background: var(--surface-sunken); }
	.lineup-title { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
	.lineup-title h3 { margin: 0; }
	.lineup-title strong { color: var(--emerald-strong); white-space: nowrap; }
	.pitch :global(.pitch) { width: 100%; aspect-ratio: 1.55; min-height: 270px; }
	.starter { position: absolute; transform: translate(-50%, -50%); display: grid; justify-items: center; width: 20%; color: #fff; text-align: center; text-shadow: 0 1px 4px #05150e; }
	.starter strong { font-size: 11px; padding: 2px 4px; border-radius: 4px; background: #0b2219; white-space: nowrap; }
	.starter strong span { color: #b4f8d5; }
	.starter small { width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
	@media (max-width: 650px) {
		.content { grid-template-columns: minmax(0, 1fr); }
		.identity { min-height: 0; }
		.identity :global(.crest) { width: 68px; height: 68px; }
		.lineup { border-left: 0; border-top: 1px solid var(--line); }
	}
</style>
