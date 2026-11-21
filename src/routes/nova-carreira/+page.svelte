<script lang="ts">
	import PlayerIdentityFields from '#lib/ui/career/PlayerIdentityFields.svelte';
	import { isStartAge, isNationality, isDominantFoot } from '#lib/domain/player-profile.ts';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api, ApiError } from '#lib/api.ts';
	import { DEFAULT_APPEARANCE, type Appearance } from '#lib/domain/appearance.ts';
	import AppearanceEditor from '#lib/ui/career/AppearanceEditor.svelte';
	import { careerStart, initialCareerData, MODE_LABELS, type Career, type CareerMode, type DominantFoot } from '#lib/domain/career.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import Segmented from '#lib/ui/Segmented.svelte';
	import { initialLeague, type DivisionId } from '#lib/domain/league.ts';
	import { catalogClub, ROSTER_CATALOG } from '#lib/data/roster-catalog.ts';
	import { initialClubState } from '#lib/domain/management.ts';
	import { clubLineup, initialClubTactic } from '#lib/domain/club-selection.ts';
	import { careerBaseSquad } from '#lib/domain/squad.ts';
	import ClubSelector from '#lib/ui/career/ClubSelector.svelte';
	import { POSITION_INFO, type Position } from '#lib/domain/positions.ts';
	import { enter } from '#lib/motion/actions.ts';
	import { coachKit, playerKit } from '#lib/pixel/kits.ts';
	import { notify, setIslandContext } from '#lib/stores/island.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Logo from '#lib/ui/Logo.svelte';
	import Pixel from '#lib/ui/Pixel.svelte';
	import PositionPicker from '#lib/ui/PositionPicker.svelte';
	import Presentation from '#lib/ui/Presentation.svelte';
	import Stadium from '#lib/ui/Stadium.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Step = 'modo' | 'perfil' | 'clube';
	const STEPS: Array<{ id: Step; label: string }> = [
		{ id: 'modo', label: 'Modo' },
		{ id: 'perfil', label: 'Você' },
		{ id: 'clube', label: 'Clube' }
	];

	const initialMode = page.url.searchParams.get('modo');
	let mode = $state<CareerMode | null>(initialMode === 'coach' || initialMode === 'player' ? initialMode : null);
	let step = $state<Step>(initialMode === 'coach' || initialMode === 'player' ? 'perfil' : 'modo');
	let personName = $state('');
	let age = $state<number | undefined>(18);
	let nationality = $state('Brasil');
	let foot = $state<DominantFoot>('direito');
	let turned = $state(false);
	let position = $state<Position>('ATA');
	let appearance = $state<Appearance>({ ...DEFAULT_APPEARANCE });
	let clubId = $state<string | null>(null);
	let errors = $state<Record<string, string>>({});
	let saving = $state(false);
	let created = $state<Career | null>(null);

	const stepIndex = $derived(STEPS.findIndex((s) => s.id === step));
	const club = $derived(clubId ? getClub(clubId) : undefined);
	const NEUTRAL_KIT = { shirt: '#10B981', trim: '#E7EDF0', shorts: '#101418', socks: '#10B981' };
	const previewKit = $derived(
		mode === 'coach' ? coachKit(clubId ?? undefined) : clubId ? playerKit(clubId, position) : position === 'GOL' ? { shirt: '#E8B86A', trim: '#15110E', shorts: '#15110E', socks: '#E8B86A' } : NEUTRAL_KIT
	);
	let world = $state<'brasil' | 'brasfc'>('brasil');
	const league = $derived(initialLeague(world, careerStart(world).season));
	const selectionClubs = $derived(Object.entries(league.divisions).flatMap(([division, ids]) =>
		ids.map((id) => ({ id, division: division as DivisionId }))));
	const clubDivision = $derived(selectionClubs.find((entry) => entry.id === clubId)?.division);
	const catalog = $derived(world === 'brasil' ? ROSTER_CATALOG : undefined);
	const rosterCache = new Map<string, ReturnType<typeof clubLineup>>();
	const lineup = $derived(step === 'clube' && clubId ? previewClub(clubId, data.previewSeed, catalog) : undefined);
	const coach = $derived(clubId ? catalogClub(catalog, clubId)?.coach : undefined);
	const finances = $derived(mode === 'coach' && clubId && step === 'clube' ? initialClubState(data.previewSeed, clubId, clubDivision ?? null, league.season) : undefined);
	const playerOverall = $derived(mode === 'player' && clubId && step === 'clube'
		? initialCareerData({ mode, clubId, personName, position, age, world }, data.previewSeed).player?.overall : undefined);

	function previewClub(id: string, seed: number, version: typeof catalog) {
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

	function chooseMode(m: CareerMode) {
		mode = m;
		step = 'perfil';
	}

	function validateProfile(): boolean {
		const name = personName.trim();
		errors = {};
		if (name.length < 2) errors.personName = 'Digite seu nome (pelo menos 2 letras).';
		else if (name.length > 40) errors.personName = 'Use no máximo 40 caracteres.';
		if (mode === 'player') {
			if (!isStartAge(age)) errors.age = 'Escolha uma idade entre 16 e 35 anos.';
			if (!isNationality(nationality)) errors.nationality = 'Selecione uma nacionalidade disponível.';
			if (!isDominantFoot(foot)) errors.foot = 'Escolha o pé dominante.';
		}
		return Object.keys(errors).length === 0;
	}

	function next() {
		if (step === 'perfil' && validateProfile()) step = 'clube';
	}

	function back() {
		if (step === 'clube') step = 'perfil';
		else if (step === 'perfil') step = 'modo';
		else void goto('/menu');
	}

	async function create() {
		if (!mode || !clubId || saving || created) return;
		saving = true;
		errors = {};
		try {
			const res = await api<{ career: Career }>('/api/careers', {
				body: { mode, personName, clubId, appearance, world, previewSeed: data.previewSeed, ...(mode === 'player' ? { position, age, nationality, foot } : {}) }
			});
			created = res.career;
		} catch (e) {
			if (e instanceof ApiError && e.errors) {
				errors = e.errors;
				if (['personName', 'appearance', 'position', 'age', 'nationality', 'foot'].some((field) => e.errors?.[field])) step = 'perfil';
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
			<span>{step === 'modo' ? 'Menu' : 'Voltar'}</span>
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
		{#if step === 'modo'}
			<div class="intro" data-umx-enter>
				<span class="eyebrow">Passo 1 de 3</span>
				<h1>Como você quer jogar?</h1>
				<p class="muted">Você pode ter várias carreiras salvas, dos dois tipos.</p>
			</div>
			<div class="modes">
				{#each [{ id: 'coach' as const, title: 'Treinador', tagline: 'Comande o clube inteiro', items: ['Escalação e tática do time', 'Plano semanal de treinos', 'Elenco, comissão e diretoria', 'Finanças, base e olheiros'], appearance: { skin: 3, hairColor: 0, hairStyle: 'curto' as const }, kit: coachKit(), ball: false }, { id: 'player' as const, title: 'Jogador', tagline: 'Viva a carreira de um atleta', items: ['Crie seu jogador e escolha a posição', 'Treino individual e evolução', 'Lute pela titularidade', 'Contratos, empresário e imprensa'], appearance: DEFAULT_APPEARANCE, kit: { shirt: '#10B981', trim: '#E7EDF0', shorts: '#101418', socks: '#10B981' }, ball: true }] as m, i (m.id)}
					<button class="mode" onclick={() => chooseMode(m.id)} use:enter={{ index: i + 1 }} data-umx-press="0.98">
						<div class="mode-art">
							<Pixel variant="full" appearance={m.appearance} kit={m.kit} size={230} ball={m.ball} idle />
						</div>
						<div class="mode-text">
							<span class="eyebrow">{MODE_LABELS[m.id]}</span>
							<h2>{m.title}</h2>
							<p>{m.tagline}</p>
							<ul>
								{#each m.items as item (item)}
									<li>
										<Icon name="check" size={16} stroke={2.2} />{item}
									</li>
								{/each}
							</ul>
							<span class="go">Escolher <Icon name="arrowRight" size={18} /></span>
						</div>
					</button>
				{/each}
			</div>
		{:else if step === 'perfil'}
			<div class="split">
				<div class="form" data-umx-enter>
					<span class="eyebrow">Passo 2 de 3 · {mode ? MODE_LABELS[mode] : ''}</span>
					<h1>{mode === 'coach' ? 'Quem é o novo treinador?' : 'Crie seu jogador'}</h1>

					<label class="field">
						<span>Nome {mode === 'coach' ? 'do treinador' : 'do jogador'}</span>
						<input
							bind:value={personName}
							maxlength="40"
							autocomplete="off"
							placeholder={mode === 'coach' ? 'Ex.: Ana Ribeiro' : 'Ex.: Léo Duarte'}
							aria-invalid={!!errors.personName}
							onkeydown={(e) => e.key === 'Enter' && next()}
						/>
						{#if errors.personName}<small class="err" role="alert">{errors.personName}</small>{/if}
					</label>

					{#if mode === 'player'}
						<PlayerIdentityFields bind:age bind:nationality bind:foot {errors} />
						<fieldset class="field">
							<legend>Onde você joga? <span class="muted">Toque na posição no campo</span></legend>
							<PositionPicker bind:value={position} />
						</fieldset>
					{/if}

					<AppearanceEditor bind:appearance kit={previewKit} clubId={clubId ?? undefined} uniformOptions={mode === 'player'} />

					<div class="actions">
						<Button variant="primary" size="lg" iconRight="arrowRight" onclick={next}>Escolher clube</Button>
					</div>
				</div>
				<div class="preview" aria-label="Pré-visualização do personagem" data-umx-enter>
					<div class="podium">
						<div class:turned><Pixel variant="full" {appearance} kit={previewKit} clubId={clubId ?? undefined} styled size={380} ball={mode === 'player'} idle label="Seu personagem" /></div>
					</div>
					{#if mode === 'player'}
						<Button size="sm" onclick={() => (turned = !turned)} aria-pressed={turned}>Espelhar prévia</Button>
					{/if}
					<strong class="pname">{personName.trim() || (mode === 'coach' ? 'Treinador' : 'Jogador')}</strong>
					<span class="muted">{mode === 'player' ? POSITION_INFO[position].label : 'Treinador principal'}</span>
				</div>
			</div>
		{:else}
			<div class="intro" data-umx-enter>
				<h1>Escolha seu clube</h1>
			</div>
			{#key world}
				<ClubSelector clubs={selectionClubs} bind:clubId {lineup} mode={mode ?? 'coach'} {position} {playerOverall} {coach}
					season={league.season} transferBudget={finances?.transferBudget} wageBudget={finances?.wageBudget} busy={saving || !!created}
					prefetch={(ids) => ids.forEach((id) => previewClub(id, data.previewSeed, catalog))}>
					{#snippet top()}
						<Segmented label="Base de clubes" bind:value={world} onchange={() => (clubId = null)}
							options={[{ value: 'brasil', label: 'Clubes nacionais' }, { value: 'brasfc', label: 'Liga fictícia' }]} />
					{/snippet}
				</ClubSelector>
			{/key}
			<div class="actions finish">
				<Button variant="primary" size="lg" icon="play" disabled={!clubId} loading={saving} onclick={create}>{mode === 'player' ? 'Iniciar carreira de jogador' : 'Iniciar carreira de treinador'}</Button>
			</div>
		{/if}
	</main>
</div>

{#if created && mode}
	<Presentation
		clubId={created.clubId}
		eyebrow={mode === 'coach' ? 'Novo treinador' : 'Reforço da base'}
		title={`Bem-vindo, ${created.personName}`}
		subtitle={`${getClub(created.clubId)?.name} · Temporada ${created.season}`}
		{appearance}
		kit={mode === 'coach' ? coachKit(created.clubId) : playerKit(created.clubId, position)}
		ball={mode === 'player'}
		ondone={afterPresentation}
	/>
{/if}

<style>
	.turned { transform: scaleX(-1); }

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
	.modes {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--sp-6);
	}
	.mode {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: end;
		gap: var(--sp-5);
		padding: var(--sp-6) var(--sp-6) 0;
		text-align: left;
		border-radius: var(--radius-xl);
		border: 1px solid var(--line-strong);
		background:
			radial-gradient(90% 80% at 0% 100%, rgb(16 185 129 / 0.16), transparent 60%),
			linear-gradient(160deg, rgb(34 44 51 / 0.92), rgb(21 27 32 / 0.95));
		box-shadow: var(--shadow-2);
		transition:
			border-color 0.2s,
			box-shadow 0.2s;
		overflow: hidden;
	}
	.mode:hover,
	.mode:focus-visible {
		border-color: var(--emerald-line);
		box-shadow:
			var(--shadow-2),
			0 0 0 1px var(--emerald-line);
	}
	.mode-art :global(svg) {
		height: min(36vh, 230px);
		width: auto;
	}
	.mode-text {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		padding-bottom: var(--sp-6);
	}
	.mode h2 {
		font-size: calc(2.75rem * var(--text-scale));
		font-weight: 800;
		text-transform: uppercase;
		line-height: 1;
	}
	.mode p {
		font-size: var(--fs-lg);
		color: var(--text-2);
	}
	.mode ul {
		list-style: none;
		margin: var(--sp-2) 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.mode li {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		font-size: var(--fs-sm);
	}
	.mode li :global(.icon) {
		color: var(--emerald-strong);
	}
	.go {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		margin-top: var(--sp-2);
		font-family: var(--font-display);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--emerald-strong);
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
	.field > span,
	legend {
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
	legend .muted {
		font-weight: 500;
		margin-left: var(--sp-2);
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
		.modes,
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
		.mode {
			grid-template-columns: 1fr;
		}
		.mode-art {
			display: none;
		}
		.steps {
			gap: var(--sp-2);
			font-size: var(--fs-xs);
		}
	}
</style>
