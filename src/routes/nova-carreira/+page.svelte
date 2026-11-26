<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { api, ApiError } from '#lib/api.ts';
	import { DEFAULT_APPEARANCE, type Appearance } from '#lib/domain/appearance.ts';
	import AppearanceEditor from '#lib/ui/career/AppearanceEditor.svelte';
	import type { Career } from '#lib/domain/career.ts';
	import { getClub, registerClubs } from '#lib/domain/clubs.ts';
	import Segmented from '#lib/ui/Segmented.svelte';
	import { BRASIL_DIVISIONS, DIVISION_LABELS, divisionMatchCount, initialLeague, type BrasilDivision, type DivisionId } from '#lib/domain/league.ts';
	import { cupMatchCount, initialCup } from '#lib/domain/cup.ts';
	import type { RosterCatalogId } from '#lib/data/roster-catalog.ts';
	import type { ClubLineup } from '#lib/domain/club-selection.ts';
	import { coachKit } from '#lib/pixel/kits.ts';
	import { notify, setIslandContext } from '#lib/stores/island.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Logo from '#lib/ui/Logo.svelte';
	import Pixel from '#lib/ui/Pixel.svelte';
	import Presentation from '#lib/ui/Presentation.svelte';
	import Stadium from '#lib/ui/Stadium.svelte';
	import CountryPicker, { formatSeconds, impactOf } from '#lib/ui/world/CountryPicker.svelte';
	import Flag from '#lib/ui/world/Flag.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Dev 0.12: o BRASFC tem uma única carreira — a de treinador.
	type Step = 'ligas' | 'perfil' | 'clube';
	const STEPS: Array<{ id: Step; label: string }> = [
		{ id: 'ligas', label: 'Países' },
		{ id: 'perfil', label: 'Treinador' },
		{ id: 'clube', label: 'Clube' }
	];
	const mode = 'coach' as const;

	let step = $state<Step>('ligas');
	// 0.13: carreira local com vários treinadores — cada um cria o seu e escolhe o clube, em sequência.
	type Draft = { personName: string; appearance: Appearance; clubId: string };
	let drafts = $state<Draft[]>([]);
	let addAnother = $state(false);
	const coachNumber = $derived(drafts.length + 1);
	/** clubes já escolhidos por outro treinador desta carreira */
	const blocked = $derived(Object.fromEntries(drafts.map((d) => [d.clubId, `Já escolhido por ${d.personName}. Cada treinador comanda um clube diferente.`])));
	let personName = $state('');
	let appearance = $state<Appearance>({ ...DEFAULT_APPEARANCE });
	let clubId = $state<string | null>(null);
	let errors = $state<Record<string, string>>({});
	let saving = $state(false);
	let created = $state<Career | null>(null);

	const stepIndex = $derived(STEPS.findIndex((s) => s.id === step));
	const previewKit = $derived(coachKit(clubId ?? undefined));
	let world = $state<'brasil' | 'brasfc'>('brasil');
	// World Database: ativar um país ativa todas as divisões. No Brasil, o ajuste fino do PR #32 continua como opção avançada.
	let countries = $state<string[]>(['bra']);
	let divisions = $state<BrasilDivision[]>([...BRASIL_DIVISIONS]);
	let includeCup = $state(true);
	const league = $derived(initialLeague(world, data.seasons[world]));
	const available = $derived(world === 'brasil' ? BRASIL_DIVISIONS : ['liga-brasfc'] as const);
	const brazilActive = $derived(countries.includes('bra'));
	const selected = $derived<readonly DivisionId[]>(world === 'brasil' ? (brazilActive ? divisions : []) : available);
	const foreign = $derived(world === 'brasil' ? data.countries.filter((c) => c.code !== 'bra' && c.playable && countries.includes(c.code)) : []);
	// Clubes estrangeiros de países ativos e jogáveis (World Database), registrados para escudo, nome e cores.
	$effect.pre(() => registerClubs(data.foreignClubs));
	const foreignClubs = $derived(data.foreignClubs.filter((c) => foreign.some((country) => c.division.startsWith(`league/${country.code}/`))).map((c) => ({ id: c.id, division: c.division })));
	const divisionLabels = $derived(Object.fromEntries(foreign.flatMap((c) => c.divisions.map((d) => [d.id, `${c.name} · ${d.name}`]))));
	const selectionClubs = $derived([...selected.flatMap((division) => (league.divisions[division] ?? []).map((id) => ({ id, division: division as string }))), ...foreignClubs]);
	const canAddCoach = $derived(coachNumber < data.maxCoaches && coachNumber < selectionClubs.length);
	const cupMatches = $derived(world === 'brasil' && brazilActive && includeCup ? cupMatchCount(initialCup(league.season)) : 0);
	const matches = $derived(selected.reduce((sum, div) => sum + divisionMatchCount(league, div), cupMatches) + foreign.reduce((sum, c) => sum + c.load.matches, 0));
	const impact = $derived(impactOf(matches));
	/** custo por partida informado pela estimativa do servidor (o mesmo para todos os países) */
	const msPerMatch = $derived.by(() => { const c = data.countries.find((x) => x.load.matches); return c ? c.load.seasonMs / c.load.matches : 2.5; });
	const kbPerMatch = $derived.by(() => { const c = data.countries.find((x) => x.load.matches); return c ? c.load.saveKb / c.load.matches : 0.35; });
	const clubDivision = $derived(selectionClubs.find((entry) => entry.id === clubId)?.division);
	let tools = $state.raw<Awaited<ReturnType<typeof clubTools>>>();
	let loadingClubs = $state(false);
	let clubLoadError = $state(false);
	const catalog = $derived(world === 'brasil' ? tools?.ROSTER_CATALOG : undefined);
	const rosterCache = new Map<string, ClubLineup>();
	/** elenco estrangeiro vem do catálogo no servidor ao criar a carreira; a prévia local cobre os clubes nativos */
	const isWorldClub = $derived(!!clubId?.startsWith('world/'));
	const lineup = $derived(step === 'clube' && clubId && tools && !isWorldClub ? previewClub(clubId, data.previewSeed, catalog, tools) : undefined);
	const coach = $derived(step === 'clube' && clubId ? tools?.catalogClub(catalog, clubId)?.coach : undefined);
	const finances = $derived(clubId && step === 'clube' ? tools?.initialClubState(data.previewSeed, clubId, isWorldClub ? null : (clubDivision as DivisionId | undefined) ?? null, league.season) : undefined);

	async function clubTools() {
		const [component, catalog, management, lineup, squad] = await Promise.all([
			import('#lib/ui/career/ClubSelector.svelte'),
			import('#lib/data/roster-catalog.ts'),
			import('#lib/domain/management.ts'),
			import('#lib/domain/club-selection.ts'),
			import('#lib/domain/squad.ts')
		]);
		return { Selector: component.default, catalogClub: catalog.catalogClub, ROSTER_CATALOG: catalog.ROSTER_CATALOG, initialClubState: management.initialClubState, clubLineup: lineup.clubLineup, initialClubTactic: lineup.initialClubTactic, careerBaseSquad: squad.careerBaseSquad };
	}

	async function loadClubs() {
		if (tools || loadingClubs) return;
		loadingClubs = true;
		clubLoadError = false;
		try {
			tools = await clubTools();
		} catch {
			clubLoadError = true;
		} finally {
			loadingClubs = false;
		}
	}

	function previewClub(id: string, seed: number, version: RosterCatalogId | undefined, { careerBaseSquad, clubLineup, initialClubTactic, catalogClub }: NonNullable<typeof tools>) {
		const key = `${id}:${seed}:${version}`;
		let preview = rosterCache.get(key);
		if (!preview) {
			const squad = careerBaseSquad(id, seed, version);
			preview = clubLineup(squad, initialClubTactic(version, id, squad), catalogClub(version, id));
			rosterCache.set(key, preview);
		}
		return preview;
	}

	onMount(() => setIslandContext('Nova carreira'));

	function toggleDivision(division: DivisionId) {
		if (division === 'liga-brasfc') return;
		divisions = divisions.includes(division) ? divisions.filter((id) => id !== division) : [...divisions, division];
		if (clubId && !selectionClubs.some((entry) => entry.id === clubId)) clubId = null;
		errors = {};
	}

	function validateProfile(): boolean {
		const name = personName.trim();
		errors = {};
		if (name.length < 2) errors.personName = 'Digite seu nome (pelo menos 2 letras).';
		else if (name.length > 40) errors.personName = 'Use no máximo 40 caracteres.';
		return Object.keys(errors).length === 0;
	}

	function next() {
		if (step === 'ligas' && selected.length) step = 'perfil';
		else if (step === 'perfil' && validateProfile()) {
			step = 'clube';
			void loadClubs();
		}
	}

	function back() {
		if (step === 'clube') step = 'perfil';
		else if (drafts.length) {
			// Volta ao treinador anterior (desfaz a confirmação dele).
			const last = drafts.at(-1)!;
			drafts = drafts.slice(0, -1);
			personName = last.personName;
			appearance = { ...last.appearance };
			clubId = last.clubId;
			addAnother = true;
			step = 'clube';
		} else if (step === 'perfil') step = 'ligas';
		else void goto('/menu');
	}

	async function create() {
		if (!clubId || saving || created || blocked[clubId] || !clubDivision) return;
		if (addAnother && canAddCoach) {
			// Guarda este treinador e recomeça o fluxo para o próximo (mesmo mundo, outro clube).
			drafts = [...drafts, { personName: personName.trim(), appearance: { ...appearance }, clubId }];
			notify({ icon: 'check', tone: 'success', title: `Treinador ${drafts.length} confirmado`, detail: `${drafts.at(-1)!.personName} · ${getClub(clubId)?.name}` });
			personName = '';
			appearance = { ...DEFAULT_APPEARANCE };
			clubId = null;
			addAnother = false;
			step = 'perfil';
			return;
		}
		saving = true;
		errors = {};
		const all = [...drafts, { personName: personName.trim(), appearance, clubId }];
		try {
			const [first, ...others] = all;
			const res = await api<{ career: Career }>('/api/careers', {
				body: { mode, personName: first.personName, clubId: first.clubId, appearance: first.appearance, world, leagueSelection: { divisions: [...selected], cup: world === 'brasil' && brazilActive && includeCup }, ...(world === 'brasil' ? { worldSelection: { countries: [...countries] } } : {}), previewSeed: data.previewSeed, ...(others.length ? { others } : {}) }
			});
			created = res.career;
		} catch (e) {
			if (e instanceof ApiError && e.errors) {
				errors = e.errors;
				if (['personName', 'appearance'].some((field) => e.errors?.[field])) step = 'perfil';
			}
			notify({ icon: 'alert', tone: 'error', title: e instanceof Error ? e.message : 'Não foi possível criar a carreira.' });
		} finally {
			saving = false;
		}
	}

	async function afterPresentation() {
		if (!created) return;
		notify({ icon: 'check', tone: 'success', title: 'Carreira criada e salva', detail: getClub(created.clubId)?.name });
		await goto(`/carreira/${created.id}`, { invalidateAll: true });
	}

	function onKey(e: KeyboardEvent) {
		if (created) return;
		if (e.key === 'Escape') {
			const t = e.target as HTMLElement;
			if (t.tagName === 'INPUT') return t.blur();
			back();
		}
	}
</script>

<svelte:head><title>Nova carreira · BRASFC</title></svelte:head>
<svelte:window onkeydown={onKey} />

<div class="screen">
	<Stadium dim={0.55} parallax={false} />

	<header class="top" data-umx-enter>
		<button class="back" onclick={back} data-umx-press>
			<Icon name="arrowLeft" />
			<span>{step === 'ligas' ? 'Menu' : 'Voltar'}</span>
		</button>
		<Logo size={30} />
		<ol class="steps" aria-label="Etapas">
			{#each STEPS as s, i (s.id)}
				<li class:done={i < stepIndex} class:current={i === stepIndex} aria-current={i === stepIndex ? 'step' : undefined}>
					<span class="dot">{#if i < stepIndex}<Icon name="check" size={14} stroke={2.4} />{:else}{i + 1}{/if}</span>
					{s.label}
				</li>
			{/each}
		</ol>
	</header>

	<main class="body">
		{#if step === 'ligas'}
			<div class="intro" data-umx-enter>
				<span class="eyebrow">Passo 1 de 3 · Universo da carreira</span>
				<h1>Escolha os países</h1>
				<p class="muted">Cada país ativado entra com todas as divisões e copas, com calendário e simulação completa para todos os treinadores. Os clubes dos demais países continuam no mercado.</p>
			</div>
			<div class="split league-setup">
				<div class="form" data-umx-enter>
					<Segmented label="Universo" bind:value={world} onchange={() => (clubId = null)}
						options={[{ value: 'brasil', label: 'Mundo real' }, { value: 'brasfc', label: 'Universo fictício' }]} />
					{#if world === 'brasil'}
						<CountryPicker countries={data.countries} bind:selected={countries} />
						{#if brazilActive}
							<details class="brazil-custom">
								<summary><Flag flag="br" size={18} /> Ajustar divisões do Brasil <small class="muted">{selected.length} de {BRASIL_DIVISIONS.length}{includeCup ? ' + Copa do Brasil' : ''}</small></summary>
								<fieldset class="league-options">
									<legend class="sr-only">Divisões do Brasil</legend>
									{#each available as division (division)}
										<label class="league-option">
											<input type="checkbox" checked={selected.includes(division)} onchange={() => toggleDivision(division)} />
											<span>{DIVISION_LABELS[division]}</span>
											<small>{league.divisions[division]?.length} clubes</small>
										</label>
									{/each}
									<label class="league-option">
										<input type="checkbox" bind:checked={includeCup} />
										<span>Copa do Brasil</span>
										<small>Inclui classificados de divisões inativas</small>
									</label>
								</fieldset>
							</details>
						{/if}
					{:else}
						<fieldset class="league-options">
							<legend>Liga fictícia</legend>
							{#each available as division (division)}
								<label class="league-option">
									<input type="checkbox" checked disabled />
									<span>{DIVISION_LABELS[division]}</span>
									<small>{league.divisions[division]?.length} clubes</small>
								</label>
							{/each}
						</fieldset>
					{/if}
				</div>
				<aside class="form summary" aria-live="polite" data-umx-enter>
					<span class="eyebrow">Processamento estimado · {impact}</span>
					<strong>{matches.toLocaleString('pt-BR')} partidas na temporada</strong>
					<dl class="totals">
						<div><dt>Tempo por temporada</dt><dd>{formatSeconds(matches * msPerMatch)}</dd></div>
						<div><dt>Save por temporada</dt><dd>≈ {Math.max(1, Math.round((matches * kbPerMatch) / 1024 * 10) / 10).toLocaleString('pt-BR')} MB</dd></div>
						<div><dt>Clubes para começar</dt><dd>{selectionClubs.length}</dd></div>
					</dl>
					{#if world === 'brasil' && (brazilActive || foreign.length)}
						<ul class="chosen">
							{#if brazilActive}<li><Flag flag="br" size={18} /> Brasil <small>{selected.length} div.{includeCup ? ' + copa' : ''}</small></li>{/if}
							{#each foreign as c (c.code)}<li><Flag flag={c.flag} size={18} /> {c.name} <small>{c.divisions.length} div.</small></li>{/each}
						</ul>
					{/if}
					<p class="muted small">Estimativa no computador de referência. Mais países ativos aumentam o tempo das rodadas e o tamanho do save.</p>
					{#if !selected.length}<p class="err">Ative ao menos um país com divisão jogável para continuar.</p>{/if}
					<div class="actions">
						<Button variant="primary" size="lg" iconRight="arrowRight" disabled={!selected.length} onclick={next}>Criar treinador</Button>
					</div>
				</aside>
			</div>
		{:else if step === 'perfil'}
			<div class="split">
				<div class="form" data-umx-enter>
					<span class="eyebrow">Passo 2 de 3 · {drafts.length ? `Treinador ${coachNumber}` : 'Carreira de treinador'}</span>
					<h1>{drafts.length ? `Quem é o treinador ${coachNumber}?` : 'Quem é o novo treinador?'}</h1>
					{#if drafts.length}
						<ul class="roster" aria-label="Treinadores confirmados">
							{#each drafts as d, i (d.clubId)}
								<li><span class="n">{i + 1}</span><strong>{d.personName}</strong><small>{getClub(d.clubId)?.name}</small></li>
							{/each}
						</ul>
					{/if}

					<label class="field">
						<span>Nome do treinador</span>
						<input
							bind:value={personName}
							maxlength="40"
							autocomplete="off"
							placeholder="Ex.: Ana Ribeiro"
							aria-invalid={!!errors.personName}
							onkeydown={(e) => e.key === 'Enter' && next()}
						/>
						{#if errors.personName}<small class="err" role="alert">{errors.personName}</small>{/if}
					</label>

					<AppearanceEditor bind:appearance kit={previewKit} clubId={clubId ?? undefined} uniformOptions={false} />

					<div class="actions">
						<Button variant="primary" size="lg" iconRight="arrowRight" onclick={next}>Escolher clube</Button>
					</div>
				</div>
				<div class="preview" aria-label="Pré-visualização do personagem" data-umx-enter>
					<div class="podium">
						<div><Pixel variant="full" {appearance} kit={previewKit} clubId={clubId ?? undefined} styled size={380} idle label="Seu treinador" /></div>
					</div>
					<strong class="pname">{personName.trim() || 'Treinador'}</strong>
					<span class="muted">Treinador principal</span>
				</div>
			</div>
		{:else}
			<div class="intro" data-umx-enter>
				<span class="eyebrow">Passo 3 de 3 · Divisões ativas</span>
				<h1>{drafts.length ? `Clube do treinador ${coachNumber} · ${personName.trim()}` : 'Escolha seu clube'}</h1>
			</div>
			{#key world}
				{#if tools}
					<tools.Selector clubs={selectionClubs} labels={divisionLabels} bind:clubId {lineup} {coach} {blocked}
						season={league.season} transferBudget={finances?.transferBudget} wageBudget={finances?.wageBudget} busy={saving || !!created} />
				{:else if clubLoadError}
					<p class="err" role="alert">Não foi possível carregar os clubes.</p>
					<Button onclick={loadClubs}>Tentar novamente</Button>
				{:else}
					<p class="muted" role="status">Carregando os clubes…</p>
				{/if}
			{/key}
			<div class="actions finish">
				{#if canAddCoach}
					<label class="another">
						<input type="checkbox" bind:checked={addAnother} disabled={saving} />
						<span><strong>Adicionar outro treinador</strong><small>Carreira compartilhada no mesmo computador, em turnos</small></span>
					</label>
				{/if}
				<Button variant="primary" size="lg" icon={addAnother ? 'plus' : 'play'} disabled={!clubId || !!(clubId && blocked[clubId])} loading={saving} onclick={create}>
					{addAnother ? 'Confirmar e criar o próximo treinador' : drafts.length ? `Iniciar carreira com ${coachNumber} treinadores` : 'Iniciar carreira de treinador'}
				</Button>
			</div>
		{/if}
	</main>
</div>

{#if created}
	<Presentation
		clubId={created.clubId}
		eyebrow="Novo treinador"
		title={`Bem-vindo, ${created.personName}`}
		subtitle={`${getClub(created.clubId)?.name} · Temporada ${created.season}${drafts.length ? ` · ${drafts.length + 1} treinadores em turnos` : ''}`}
		appearance={drafts[0]?.appearance ?? appearance}
		kit={coachKit(created.clubId)}
		ondone={afterPresentation}
	/>
{/if}

<style>
	.roster { list-style: none; margin: 0 0 var(--sp-4); padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
	.roster li { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 4px; border-radius: var(--radius-pill); background: var(--surface-2); border: 1px solid var(--line); font-size: var(--fs-sm); }
	.roster .n { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--emerald); color: #06140f; font-weight: 800; font-size: 12px; }
	.roster small { color: var(--text-3); }
	.another { display: inline-flex; align-items: center; gap: 10px; margin-right: auto; padding: 8px 12px; border-radius: 12px; border: 1px solid var(--line-strong); background: var(--surface-2); cursor: pointer; }
	.another input { width: 18px; height: 18px; accent-color: var(--emerald); }
	.another span { display: grid; line-height: 1.2; }
	.another small { color: var(--text-3); font-size: var(--fs-xs, 12px); }
	.league-options { display: grid; gap: var(--sp-2); min-width: 0; border: 0; margin: 0; padding: 0; }
	.league-options legend { font-weight: 700; margin-bottom: var(--sp-3); }
	.league-option { display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(0, auto); align-items: center; gap: var(--sp-3); padding: var(--sp-3); border: 1px solid var(--line-strong); border-radius: var(--radius-m); }
	.league-option:has(:checked) { border-color: var(--emerald-line); background: var(--emerald-soft); }
	.league-option input { width: 18px; height: 18px; padding: 0; accent-color: var(--emerald); }
	.league-option small { color: var(--text-3); text-align: right; }
	.league-setup aside p { margin: 0; }
	.split.league-setup { grid-template-columns: minmax(0, 1.6fr) minmax(260px, 0.7fr); }
	@media (max-width: 980px) { .split.league-setup { grid-template-columns: minmax(0, 1fr); } .summary { position: static; } }
	.summary { position: sticky; top: var(--sp-4); }
	.totals { display: grid; gap: 6px; margin: 0; }
	.totals div { display: flex; justify-content: space-between; gap: var(--sp-3); padding: 8px 10px; border-radius: var(--radius-s, 8px); background: var(--surface-2); }
	.totals dt { color: var(--text-3); font-size: var(--fs-sm); }
	.totals dd { margin: 0; font-weight: 700; font-variant-numeric: tabular-nums; }
	.chosen { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
	.chosen li { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 6px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--line); font-size: var(--fs-sm); }
	.chosen small { color: var(--text-3); }
	.brazil-custom { border: 1px solid var(--line); border-radius: var(--radius-m); padding: 10px 12px; }
	.brazil-custom summary { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; cursor: pointer; font-weight: 600; }
	.brazil-custom summary small { font-weight: 400; }
	.brazil-custom .league-options { margin-top: var(--sp-3); }
	.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

	.screen {
		position: relative;
		min-height: var(--app-h, 100vh);
		display: flex;
		flex-direction: column;
	}
	.top {
		position: relative;
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: var(--sp-4);
		padding: 64px clamp(20px, 4vw, 56px) 0;
	}
	.back {
		justify-self: start;
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		height: 40px;
		padding: 0 14px 0 10px;
		border-radius: var(--radius-pill);
		border: 1px solid var(--line-strong);
		background: rgb(16 20 24 / 0.7);
		color: var(--text-2);
		font-weight: 600;
		font-size: var(--fs-sm);
	}
	.back:hover {
		color: var(--text);
	}
	.steps {
		justify-self: end;
		display: flex;
		gap: var(--sp-4);
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: var(--fs-sm);
		color: var(--text-3);
	}
	.steps li {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.dot {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: 1px solid var(--line-strong);
		font-size: 12px;
		font-weight: 700;
	}
	.steps .current {
		color: var(--text);
	}
	.steps .current .dot {
		background: var(--emerald);
		border-color: var(--emerald);
		color: #04140e;
	}
	.steps .done .dot {
		background: var(--emerald-soft);
		border-color: var(--emerald-line);
		color: var(--emerald-strong);
	}
	.body {
		position: relative;
		flex: 1;
		width: 100%;
		max-width: 1280px;
		margin: 0 auto;
		padding: var(--sp-7) clamp(20px, 4vw, 56px) var(--sp-8);
	}
	.intro {
		margin-bottom: var(--sp-6);
	}
	h1 {
		font-size: calc(clamp(2.25rem, 3.4vw, 3.25rem) * var(--text-scale));
		font-weight: 800;
		text-transform: uppercase;
		margin: var(--sp-2) 0;
	}
	.split {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.9fr);
		gap: var(--sp-7);
		align-items: start;
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--sp-5);
		padding: var(--sp-6);
		border-radius: var(--radius-xl);
		background: rgb(28 37 43 / 0.92);
		border: 1px solid var(--line);
		box-shadow: var(--shadow-2);
	}
	.form h1 {
		margin-top: 0;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		border: 0;
		margin: 0;
		padding: 0;
	}
	.field > span {
		font-weight: 600;
		font-size: var(--fs-sm);
		margin-bottom: var(--sp-2);
		padding: 0;
	}
	input {
		height: 50px;
		padding: 0 var(--sp-4);
		border-radius: var(--radius-m);
		border: 1px solid var(--line-strong);
		background: var(--surface-sunken);
		font-size: var(--fs-lg);
	}
	input:focus {
		outline: none;
		border-color: var(--emerald);
		box-shadow: 0 0 0 3px var(--emerald-soft);
	}
	input[aria-invalid='true'] {
		border-color: var(--danger);
	}
	.err {
		color: var(--danger);
		font-size: var(--fs-sm);
	}

	.finish { margin-top: var(--sp-4); }
	.actions {
		display: flex;
		justify-content: flex-end;
	}
	.preview {
		position: sticky;
		top: 24px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-2);
		text-align: center;
	}
	.podium {
		padding: var(--sp-6) var(--sp-6) 0;
		background: radial-gradient(60% 18% at 50% 96%, rgb(0 0 0 / 0.55), transparent 70%);
	}
	.podium :global(svg) {
		height: min(52vh, 380px);
		width: auto;
		filter: drop-shadow(0 20px 30px rgb(0 0 0 / 0.5));
	}
	.pname {
		font-family: var(--font-display);
		font-size: var(--fs-3xl);
		text-transform: uppercase;
		line-height: 1;
	}
	@media (max-width: 960px) {
		.split {
			grid-template-columns: 1fr;
		}
		.preview {
			position: static;
			order: -1;
		}
		.top {
			grid-template-columns: auto 1fr;
		}
		.top :global(.logo) {
			display: none;
		}
	}
	@media (max-width: 640px) {
		.steps {
			gap: var(--sp-2);
			font-size: var(--fs-xs);
		}
	}
	/* Telas muito estreitas: só os números, o rótulo da etapa atual continua visível. */
	@media (max-width: 420px) {
		.steps { min-width: 0; }
		.steps li:not(.current) { font-size: 0; gap: 0; }
		.steps li:not(.current) .dot { font-size: var(--fs-xs); }
	}
</style>
