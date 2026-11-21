<script lang="ts">
	import type { Snippet } from 'svelte';
	import { boardExpectation } from '#lib/domain/career.ts';
	import { getClub, LEAGUE } from '#lib/domain/clubs.ts';
	import { COPA_2026, IDENTIDADE, realClub } from '#lib/data/brasil.ts';
	import { BRASIL_DIVISIONS, DIVISION_LABELS, type DivisionId } from '#lib/domain/league.ts';
	import type { ClubLineup } from '#lib/domain/club-selection.ts';
	import { formatMoney } from '#lib/domain/market.ts';
	import { POSITION_INFO, type Position } from '#lib/domain/positions.ts';
	import { enter, pop } from '#lib/motion/actions.ts';
	import Button from '../Button.svelte';
	import Crest from '../Crest.svelte';
	import Segmented from '../Segmented.svelte';
	import Stars from '../Stars.svelte';
	import LineupPitch from '../tactics/LineupPitch.svelte';

	let { clubs, clubId = $bindable(null), blocked = {}, lineup, loading = false, error, retry, top, mode, position, season,
		transferBudget, wageBudget, coach, prefetch, playerOverall, busy = false }: {
		clubs: ReadonlyArray<{ id: string; division: DivisionId }>;
		clubId?: string | null;
		blocked?: Record<string, string>;
		lineup?: ClubLineup;
		loading?: boolean;
		error?: string;
		retry?: () => void;
		top?: Snippet;
		mode: 'coach' | 'assistant' | 'player';
		position: Position;
		season: number;
		transferBudget?: number;
		wageBudget?: number;
		coach?: string;
		prefetch?: (ids: string[]) => void;
		playerOverall?: number;
		busy?: boolean;
	} = $props();

	type RosterTab = 'starters' | 'bench' | 'all';
	let tab = $state<RosterTab>('starters');
	let division = $state<DivisionId | null>(null);
	let search = $state('');
	let listOpen = $state(false);
	const divisions = $derived(clubs.some((entry) => entry.division === LEAGUE.id) ? [LEAGUE.id] : BRASIL_DIVISIONS);
	const active = $derived(division && divisions.some((entry) => entry === division) ? division
		: clubs.find((entry) => entry.id === clubId)?.division ?? divisions[0]);
	const options = $derived(divisions.map((value) => ({ value, label: DIVISION_LABELS[value] })));
	const teams = $derived(clubs.filter((entry) => entry.division === active)
		.flatMap(({ id }) => { const club = getClub(id); return club ? [club] : []; })
		.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
	const index = $derived(teams.findIndex((team) => team.id === clubId));
	const club = $derived(teams[index]);
	const institution = $derived(club && realClub(club.id));
	const identity = $derived(club && IDENTIDADE[club.id]);
	const players = $derived(lineup ? [...lineup.starters.flatMap((slot) => slot.player ? [slot.player] : []), ...lineup.bench, ...lineup.reserves] : []);
	const competition = $derived(players.filter((player) => player.position === position || player.secondary?.includes(position)));
	const highest = $derived(Math.max(0, ...competition.map((player) => player.overall)));
	const normalized = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
	const filtered = $derived(teams.filter((team) => normalized(`${team.name} ${team.short} ${realClub(team.id)?.uf ?? ''}`).includes(normalized(search))));
	const rosterTabs: Array<{ value: RosterTab; label: string }> = [
		{ value: 'starters', label: 'Titulares' }, { value: 'bench', label: 'Banco' }, { value: 'all', label: 'Elenco' }
	];

	function changeDivision(value: DivisionId) {
		if (busy) return;
		division = value;
		search = '';
	}

	function browse(offset: number) {
		if (teams.length && !busy) clubId = teams[(Math.max(index, 0) + offset + teams.length) % teams.length].id;
	}

	$effect(() => {
		if (index < 0) clubId = teams.find((team) => !blocked[team.id])?.id ?? teams[0]?.id ?? null;
	});
	$effect(() => {
		if (!prefetch || !lineup || index < 0 || teams.length < 2) return;
		const ids = new Set([teams[(index + 1) % teams.length].id, teams[(index + teams.length - 1) % teams.length].id]);
		prefetch([...ids]);
	});
</script>

<section class="selector" aria-label="Seleção de clube" style:--club-color={club?.colors.primary ?? 'var(--emerald)'}>
	<header>
		<div class="country"><span aria-hidden="true">🇧🇷</span><strong>Brasil</strong><small>{season}</small></div>
		{#if top}{@render top()}{/if}
	</header>
	<div class="content">
		<div class="club">
			<div class="browse">
				<Button icon="chevronLeft" aria-label="Clube anterior" disabled={busy || teams.length < 2} onclick={() => browse(-1)} />
				<div class="identity" aria-live="polite">
					{#if club}
						{#key club.id}
							<div class="crest" use:pop><Crest {club} size={108} /></div>
							<div use:enter={{ y: 5 }}><h2>{club.name}</h2>
								<p>{institution ? [institution.cidade, institution.uf].filter(Boolean).join(' · ') || 'Localização pendente' : club.city}</p></div>
						{/key}
						<Stars value={club.reputation} />
						{#if identity && !identity.escudo}<small class="quiet">Símbolo provisório</small>{/if}
					{:else}<p>Nenhum clube nesta divisão.</p>{/if}
				</div>
				<Button icon="chevronRight" aria-label="Próximo clube" disabled={busy || teams.length < 2} onclick={() => browse(1)} />
			</div>
			<div class="find">
				<Button variant="ghost" size="sm" disabled={busy} aria-expanded={listOpen} onclick={() => (listOpen = !listOpen)}>Buscar clube</Button>
				{#if club}<small>{index + 1} / {teams.length}</small>{/if}
			</div>
			{#if listOpen}
				<div class="search">
					<input aria-label="Buscar clube por nome ou estado" placeholder="Nome, sigla ou UF" bind:value={search} />
					<div class="results">
						{#each filtered as team (team.id)}
							<button type="button" disabled={busy} aria-pressed={team.id === clubId} onclick={() => { clubId = team.id; listOpen = false; }}>{team.name}</button>
						{:else}<p>Nenhum clube encontrado.</p>{/each}
					</div>
				</div>
			{/if}

			{#if club}
				<dl class="facts">
					<div><dt>Estádio</dt><dd>{institution ? institution.estadio ?? 'Pendente' : club.stadium}</dd></div>
					<div><dt>Força do elenco</dt><dd>{lineup?.strength ?? '—'}</dd></div>
					{#if coach || lineup?.opening}<div><dt>Técnico</dt><dd>{coach ?? 'Indisponível na súmula'}</dd></div>{/if}
					{#if mode === 'coach'}
						<div><dt>Objetivo da diretoria</dt><dd>{boardExpectation(club, DIVISION_LABELS[active])}</dd></div>
						{#if transferBudget !== undefined}<div><dt>Transferências</dt><dd>{formatMoney(transferBudget)}</dd></div>{/if}
						{#if wageBudget}<div><dt>Orçamento salarial</dt><dd>{formatMoney(wageBudget)}/mês</dd></div>{/if}
					{:else if mode === 'player'}
						<div><dt>Competições</dt><dd>{DIVISION_LABELS[active]}{season === COPA_2026.temporada && COPA_2026.participantes.some((entry) => entry.clube === club.id) ? ' · Copa do Brasil' : ''}</dd></div>
						<div><dt>{POSITION_INFO[position].label}</dt><dd>{!lineup || lineup.coverage === 'incomplete' ? 'Concorrência indisponível' : `${competition.length} concorrente(s)`}</dd></div>
						<div><dt>Entrada no elenco</dt><dd>Em avaliação pela comissão</dd></div>
						{#if playerOverall !== undefined && lineup && lineup.coverage !== 'incomplete'}
							<div><dt>Perspectiva de titularidade</dt><dd>{highest - playerOverall > 7 ? 'Disputa difícil' : 'Disputa aberta'}</dd></div>
						{/if}
					{/if}
				</dl>
				{#if identity && !identity.cores}<p class="quiet">Cores provisórias</p>{/if}
				{#if blocked[club.id]}<p class="restriction" role="status">{blocked[club.id]}</p>{/if}
			{/if}
		</div>

		<div class="lineup" aria-busy={loading}>
			<div class="lineup-title">
				<h3>Escalação</h3>
				{#if lineup && lineup.coverage !== 'incomplete'}<strong>{lineup.formation}</strong>{/if}
			</div>
			{#if lineup && lineup.coverage !== 'incomplete'}
				<div class="tabs"><Segmented label="Visualização do elenco" options={rosterTabs} bind:value={tab} /></div>
				<p class="quiet">
					{#if lineup.opening}
						<a href={lineup.opening.source} target="_blank" rel="noreferrer">Súmula de {lineup.opening.asOf.split('-').reverse().join('/')}</a>
						{#if lineup.opening.modeledTactics} · Posições de jogo estimadas{/if}
						{#if lineup.opening.lineupAdjusted} · Titulares ajustados por mudança de clube{/if}
					{:else if lineup.coverage === 'simulation'}
						Elenco de simulação
					{/if}
					 · Notas BRASFC
				</p>
				{#if tab === 'starters'}
					{#key clubId}
						<div class="pitch" use:enter={{ y: 4 }}>
							<LineupPitch>
								{#each lineup.starters as slot (slot.x + ':' + slot.y)}
									<div class="starter" style:left="{slot.x}%" style:top="{slot.y}%"
										title={slot.player ? `${slot.player.name} · Origem: ${slot.player.position} · Nota BRASFC: ${slot.player.overall}` : 'Vaga sem atleta documentado'}>
										<strong>{slot.position}{#if slot.player} <span>{slot.player.overall}</span>{/if}</strong>
										{#if slot.player}<small aria-label={slot.player.name}>{slot.player.shortName}</small>{/if}
									</div>
								{/each}
							</LineupPitch>
						</div>
					{/key}
				{:else}
					<div class="roster">
						{#each (tab === 'bench' ? lineup.bench : players) as player (player.id)}
							<div class="athlete">
								<span class="number">{player.number}</span>
								<div><strong>{player.name}</strong><small>
									{player.position}{#if player.secondary?.length} · {player.secondary.join(', ')}{/if}
									{#if player.age !== undefined} · {player.age} anos{/if}{#if player.nationality} · {player.nationality}{/if}
									{#if tab === 'all'} · {lineup.bench.some((entry) => entry.id === player.id) ? 'Banco' : lineup.reserves.some((entry) => entry.id === player.id) ? 'Reserva' : 'Titular'}{/if}
									{#if player.contractUntil} · Até {player.contractUntil}{/if}
								</small></div><b>{player.overall}</b>
							</div>
						{:else}<p>Sem atletas nesta lista.</p>{/each}
					</div>
				{/if}
			{:else if lineup}
				<div class="notice" role="status"><strong>Elenco real pendente</strong><p>Este clube ainda precisa de uma relação de atletas verificada. A carreira usa vagas simuladas, identificadas por posição e número.</p></div>
			{:else if error}
				<div class="notice"><p role="alert">{error}</p>{#if retry}<Button size="sm" onclick={retry}>Tentar novamente</Button>{/if}</div>
			{:else}
				<div class="notice"><p role="status">{loading ? 'Carregando escalação…' : 'Selecione um clube para ver os titulares.'}</p></div>
			{/if}
		</div>
	</div>
	<footer>
		<strong>Liga</strong>
		{#if options.length > 1}
			<Segmented label="Liga" {options} value={active} onchange={changeDivision} />
		{:else}<span>{DIVISION_LABELS[active]}</span>{/if}
	</footer>
</section>

<style>
	@property --club-color { syntax: '<color>'; inherits: true; initial-value: #3bd3ac; }
	.selector { display: grid; grid-template-columns: minmax(0, 1fr); width: 100%; min-width: 0; overflow: hidden; border: 1px solid var(--line-strong); border-radius: var(--radius-xl); background: var(--surface); box-shadow: var(--shadow-2); transition: --club-color 220ms ease; }
	header, footer { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 10px clamp(12px, 2.4vw, 22px); }
	header { justify-content: space-between; border-bottom: 1px solid var(--line); }
	footer { border-top: 1px solid var(--line); }
	.country, .find { display: flex; align-items: center; gap: 10px; }
	.find { justify-content: space-between; border-bottom: 1px solid var(--line); }
	.quiet, small, p, dt { color: var(--text-2); font-size: var(--fs-sm); }
	.content { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); }
	.club, .lineup { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr); align-content: start; gap: 8px; padding: clamp(12px, 2.4vw, 22px); }
	.club { background: radial-gradient(ellipse at 50% 18%, color-mix(in srgb, var(--club-color) 35%, transparent), transparent 72%); }
	.browse { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 6px; }
	.browse :global(.btn) { padding: 0 8px; }
	.identity { display: grid; justify-items: center; gap: 4px; text-align: center; }
	.identity h2 { margin: 0; line-height: 1; overflow-wrap: anywhere; }
	.crest { line-height: 0; }
	p, dl, dd { margin: 0; }
	.restriction { color: var(--warning); }
	.facts div { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 5px 0; }
	.facts dd { text-align: right; font-size: var(--fs-sm); font-weight: 600; overflow-wrap: anywhere; }
	.search input { width: 100%; padding: 8px; border: 1px solid var(--line-strong); border-radius: var(--radius-m); background: var(--surface-sunken); }
	.results { display: grid; max-height: 150px; overflow: auto; }
	.results button { padding: 7px 9px; text-align: left; }
	.results button:hover, .results button[aria-pressed='true'] { background: var(--surface-3); }
	.lineup { border-left: 1px solid var(--line); background: var(--surface-sunken); }
	.lineup-title { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
	.lineup-title h3 { margin: 0; }
	.lineup-title strong { color: var(--emerald-strong); }
	.tabs, .pitch { min-width: 0; }
	.pitch :global(.pitch) { width: 100%; aspect-ratio: 1.48; min-height: 275px; }
	.starter { position: absolute; transform: translate(-50%, -50%); display: grid; justify-items: center; width: 19%; color: #fff; text-align: center; text-shadow: 0 1px 4px #05150e; }
	.starter strong { font-size: 11px; padding: 2px 4px; border-radius: 4px; background: #0b2219; white-space: nowrap; }
	.starter strong span { color: #b4f8d5; }
	.starter small { color: #fff; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
	.roster { max-height: 356px; overflow: auto; }
	.athlete { display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 6px 3px; border-bottom: 1px solid var(--line); }
	.athlete small { display: block; font-size: var(--fs-xs); }
	.athlete .number, .athlete b { color: var(--emerald-strong); }
	.quiet a { text-decoration: underline; }
	.notice { padding: 16px; border: 1px solid var(--line); border-radius: var(--radius-m); background: var(--surface); }
	@media (prefers-reduced-motion: reduce) { .selector { transition: none; } }
	@media (max-width: 740px) {
		.content { grid-template-columns: minmax(0, 1fr); }
		.crest :global(.crest) { width: 68px; height: 68px; }
		.lineup { border-left: 0; border-top: 1px solid var(--line); }
		.pitch :global(.pitch) { aspect-ratio: 1.04; }
		footer :global(.seg) { min-width: 0; flex: 1 1 245px; }
		footer :global(.seg button) { flex: 1; padding-inline: 8px; }
	}
</style>
