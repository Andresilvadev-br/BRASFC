<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { api, ApiError } from '#lib/api.ts';
	import { DEFAULT_APPEARANCE, type Appearance } from '#lib/domain/appearance.ts';
	import AppearanceEditor from '#lib/ui/career/AppearanceEditor.svelte';
	import { careerStart, type Career } from '#lib/domain/career.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import Segmented from '#lib/ui/Segmented.svelte';
	import { initialLeague, type DivisionId } from '#lib/domain/league.ts';
	import { catalogClub, ROSTER_CATALOG } from '#lib/data/roster-catalog.ts';
	import { initialClubState } from '#lib/domain/management.ts';
	import { clubLineup, initialClubTactic } from '#lib/domain/club-selection.ts';
	import { careerBaseSquad } from '#lib/domain/squad.ts';
	import ClubSelector from '#lib/ui/career/ClubSelector.svelte';
	import { coachKit } from '#lib/pixel/kits.ts';
	import { notify, setIslandContext } from '#lib/stores/island.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Logo from '#lib/ui/Logo.svelte';
	import Pixel from '#lib/ui/Pixel.svelte';
	import Presentation from '#lib/ui/Presentation.svelte';
	import Stadium from '#lib/ui/Stadium.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Dev 0.12: o BRASFC tem uma única carreira — a de treinador.
	type Step = 'perfil' | 'clube';
	const STEPS: Array<{ id: Step; label: string }> = [
		{ id: 'perfil', label: 'Treinador' },
		{ id: 'clube', label: 'Clube' }
	];
	const mode = 'coach' as const;

	let step = $state<Step>('perfil');
	let personName = $state('');
	let appearance = $state<Appearance>({ ...DEFAULT_APPEARANCE });
	let clubId = $state<string | null>(null);
	let errors = $state<Record<string, string>>({});
	let saving = $state(false);
	let created = $state<Career | null>(null);

	const stepIndex = $derived(STEPS.findIndex((s) => s.id === step));
	const previewKit = $derived(coachKit(clubId ?? undefined));
	let world = $state<'brasil' | 'brasfc'>('brasil');
	const league = $derived(initialLeague(world, careerStart(world).season));
	const selectionClubs = $derived(Object.entries(league.divisions).flatMap(([division, ids]) =>
		ids.map((id) => ({ id, division: division as DivisionId }))));
	const clubDivision = $derived(selectionClubs.find((entry) => entry.id === clubId)?.division);
	const catalog = $derived(world === 'brasil' ? ROSTER_CATALOG : undefined);
	const rosterCache = new Map<string, ReturnType<typeof clubLineup>>();
	const lineup = $derived(step === 'clube' && clubId ? previewClub(clubId, data.previewSeed, catalog) : undefined);
	const coach = $derived(clubId ? catalogClub(catalog, clubId)?.coach : undefined);
	const finances = $derived(clubId && step === 'clube' ? initialClubState(data.previewSeed, clubId, clubDivision ?? null, league.season) : undefined);

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

	function validateProfile(): boolean {
		const name = personName.trim();
		errors = {};
		if (name.length < 2) errors.personName = 'Digite seu nome (pelo menos 2 letras).';
		else if (name.length > 40) errors.personName = 'Use no máximo 40 caracteres.';
		return Object.keys(errors).length === 0;
	}

	function next() {
		if (step === 'perfil' && validateProfile()) step = 'clube';
	}

	function back() {
		if (step === 'clube') step = 'perfil';
		else void goto('/menu');
	}

	async function create() {
		if (!clubId || saving || created) return;
		saving = true;
		errors = {};
		try {
			const res = await api<{ career: Career }>('/api/careers', {
				body: { mode, personName, clubId, appearance, world, previewSeed: data.previewSeed }
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
			<span>{step === 'perfil' ? 'Menu' : 'Voltar'}</span>
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
		{#if step === 'perfil'}
			<div class="split">
				<div class="form" data-umx-enter>
					<span class="eyebrow">Passo 1 de 2 · Carreira de treinador</span>
					<h1>Quem é o novo treinador?</h1>

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
				<h1>Escolha seu clube</h1>
			</div>
			{#key world}
				<ClubSelector clubs={selectionClubs} bind:clubId {lineup} {coach}
					season={league.season} transferBudget={finances?.transferBudget} wageBudget={finances?.wageBudget} busy={saving || !!created}
					prefetch={(ids) => ids.forEach((id) => previewClub(id, data.previewSeed, catalog))}>
					{#snippet top()}
						<Segmented label="Base de clubes" bind:value={world} onchange={() => (clubId = null)}
							options={[{ value: 'brasil', label: 'Clubes nacionais' }, { value: 'brasfc', label: 'Liga fictícia' }]} />
					{/snippet}
				</ClubSelector>
			{/key}
			<div class="actions finish">
				<Button variant="primary" size="lg" icon="play" disabled={!clubId} loading={saving} onclick={create}>Iniciar carreira de treinador</Button>
			</div>
		{/if}
	</main>
</div>

{#if created}
	<Presentation
		clubId={created.clubId}
		eyebrow="Novo treinador"
		title={`Bem-vindo, ${created.personName}`}
		subtitle={`${getClub(created.clubId)?.name} · Temporada ${created.season}`}
		{appearance}
		kit={coachKit(created.clubId)}
		ondone={afterPresentation}
	/>
{/if}

<style>

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
