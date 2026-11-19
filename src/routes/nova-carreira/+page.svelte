<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api, ApiError } from '#lib/api.ts';
	import {
		APPEARANCE_FIELDS,
		APPEARANCE_OPTIONS,
		DEFAULT_APPEARANCE,
		HAIR_COLORS,
		HAIR_STYLE_LABELS,
		HAIR_STYLES,
		SKIN_TONES,
		type Appearance
	} from '#lib/domain/appearance.ts';
	import { boardExpectation, MODE_LABELS, type Career, type CareerMode, type DominantFoot } from '#lib/domain/career.ts';
	import { CLUBS, getClub } from '#lib/domain/clubs.ts';
	import Segmented from '#lib/ui/Segmented.svelte';
	import { CLUBES_2026, toGameClub } from '#lib/data/brasil.ts';
	import { POSITION_INFO, type Position } from '#lib/domain/positions.ts';
	import { enter } from '#lib/motion/actions.ts';
	import { clubKit, coachKit, playerKit } from '#lib/pixel/kits.ts';
	import { notify, setIslandContext } from '#lib/stores/island.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Crest from '#lib/ui/Crest.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Logo from '#lib/ui/Logo.svelte';
	import Pixel from '#lib/ui/Pixel.svelte';
	import PositionPicker from '#lib/ui/PositionPicker.svelte';
	import Presentation from '#lib/ui/Presentation.svelte';
	import Stadium from '#lib/ui/Stadium.svelte';
	import Stars from '#lib/ui/Stars.svelte';

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
	const appearanceFields = Object.keys(APPEARANCE_OPTIONS) as Array<keyof typeof APPEARANCE_OPTIONS>;
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
	// Mundo: clubes reais (base 2026, Séries A/B/C) ou a liga fictícia da Dev 0.1/0.2.
	let world = $state<'brasil' | 'brasfc'>('brasil');
	let serie = $state<'A' | 'B' | 'C' | 'D'>('A');
	const realClubs = CLUBES_2026.map((c) => ({ real: c, game: toGameClub(c) }));
	const sortedClubs = $derived(
		world === 'brasil'
			? realClubs.filter((c) => c.real.serie === serie).map((c) => c.game).sort((a, b) => b.reputation - a.reputation || a.name.localeCompare(b.name, 'pt-BR'))
			: [...CLUBS].sort((a, b) => b.reputation - a.reputation || a.name.localeCompare(b.name, 'pt-BR'))
	);
	const competitionOf = (id: string) => {
		const r = realClubs.find((c) => c.real.id === id);
		return r ? `Série ${r.real.serie}` : 'Liga BRASFC';
	};

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
			if (age === undefined || !Number.isInteger(age) || age < 16 || age > 35) errors.age = 'Escolha uma idade entre 16 e 35 anos.';
			if (nationality.trim().length < 2) errors.nationality = 'Informe sua nacionalidade.';
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
		if (!mode || !clubId || saving) return;
		saving = true;
		errors = {};
		try {
			const res = await api<{ career: Career }>('/api/careers', {
				body: { mode, personName, clubId, appearance, world, ...(mode === 'player' ? { position, age, nationality, foot } : {}) }
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
						<div class="profile-options">
							<label class="field">Nacionalidade <input bind:value={nationality} maxlength="40" aria-invalid={!!errors.nationality} />
								{#if errors.nationality}<small class="err" role="alert">{errors.nationality}</small>{/if}
							</label>
							<label class="field">Idade <input type="number" min="16" max="35" bind:value={age} aria-invalid={!!errors.age} />
								{#if errors.age}<small class="err" role="alert">{errors.age}</small>{/if}
							</label>
							<label class="field">Pé dominante <select bind:value={foot}><option value="direito">Direito</option><option value="esquerdo">Esquerdo</option></select></label>
						</div>
						<fieldset class="field">
							<legend>Onde você joga? <span class="muted">Toque na posição no campo</span></legend>
							<PositionPicker bind:value={position} />
						</fieldset>
					{/if}

					<fieldset class="field">
						<legend>Tom de pele</legend>
						<div class="swatches">
							{#each SKIN_TONES as color, i (color)}
								<button type="button" class="swatch" class:on={appearance.skin === i} style="--c:{color}" aria-label="Tom de pele {i + 1}" aria-pressed={appearance.skin === i} onclick={() => (appearance.skin = i)}></button>
							{/each}
						</div>
					</fieldset>
					<fieldset class="field">
						<legend>Cabelo</legend>
						<div class="heads" role="radiogroup" aria-label="Estilo de cabelo">
							{#each HAIR_STYLES as h (h)}
								<button
									type="button"
									role="radio"
									class="head-opt"
									aria-checked={appearance.hairStyle === h}
									aria-label={HAIR_STYLE_LABELS[h]}
									title={HAIR_STYLE_LABELS[h]}
									onclick={() => (appearance.hairStyle = h)}
								>
									<Pixel appearance={{ ...appearance, hairStyle: h }} kit={previewKit} size={52} />
								</button>
							{/each}
						</div>
						<div class="swatches">
							{#each HAIR_COLORS as color, i (color)}
								<button type="button" class="swatch" class:on={appearance.hairColor === i} style="--c:{color}" aria-label="Cor do cabelo {i + 1}" aria-pressed={appearance.hairColor === i} onclick={() => (appearance.hairColor = i)}></button>
							{/each}
						</div>
					</fieldset>
					{#if mode === 'player'}
						<div class="profile-options">
							{#each appearanceFields as key (key)}
								<label class="field">
									{APPEARANCE_FIELDS[key]}
									<select aria-label={APPEARANCE_FIELDS[key]} value={appearance[key] ?? Object.keys(APPEARANCE_OPTIONS[key])[0]} onchange={(e) => (appearance = { ...appearance, [key]: e.currentTarget.value })}>
										{#each Object.entries(APPEARANCE_OPTIONS[key]) as [value, label] (value)}
											<option {value}>{label}</option>
										{/each}
									</select>
								</label>
							{/each}
						</div>
					{/if}

					<div class="actions">
						<Button variant="primary" size="lg" iconRight="arrowRight" onclick={next}>Escolher clube</Button>
					</div>
				</div>
				<div class="preview" aria-label="Pré-visualização do personagem" data-umx-enter>
					<div class="podium">
						<div class:turned><Pixel variant="full" {appearance} kit={previewKit} size={380} ball={mode === 'player'} idle label="Seu personagem" /></div>
					</div>
					{#if mode === 'player'}
						<Button size="sm" onclick={() => (turned = !turned)} aria-pressed={turned}>Espelhar prévia</Button>
					{/if}
					<strong class="pname">{personName.trim() || (mode === 'coach' ? 'Treinador' : 'Jogador')}</strong>
					<span class="muted">{mode === 'player' ? POSITION_INFO[position].label : 'Treinador principal'}</span>
				</div>
			</div>
		{:else}
			<div class="intro row" data-umx-enter>
				<div>
					<span class="eyebrow">Passo 3 de 3</span>
					<h1>Escolha seu clube</h1>
					<p class="muted">
						{world === 'brasil'
							? 'Clubes reais das Séries A, B, C e D de 2026 (fontes públicas), com Copa do Brasil, acesso, rebaixamento e expansão da Série C. Elencos reais ainda não foram importados: os jogadores têm nomes fictícios.'
							: 'Clubes fictícios da Liga BRASFC. A reputação define a expectativa da diretoria.'}
					</p>
					<div class="worldpick">
						<Segmented label="Mundo" bind:value={world} onchange={() => (clubId = null)} options={[{ value: 'brasil', label: 'Brasil 2026' }, { value: 'brasfc', label: 'Liga fictícia' }]} />
						{#if world === 'brasil'}
							<Segmented label="Série" bind:value={serie} options={[{ value: 'A', label: 'Série A' }, { value: 'B', label: 'Série B' }, { value: 'C', label: 'Série C' }, { value: 'D', label: 'Série D' }]} />
						{/if}
					</div>
				</div>
				<div class="confirm">
					{#if club}
						<div class="pick">
							<Crest clubId={club.id} size={44} />
							<div>
								<strong>{club.name}</strong>
								<small class="muted">{competitionOf(club.id)}{#if mode === 'coach'} · Meta: {boardExpectation(club, competitionOf(club.id))}{/if}</small>
							</div>
						</div>
					{/if}
					<Button variant="primary" size="lg" icon="play" disabled={!clubId} loading={saving} onclick={create}>Iniciar carreira</Button>
				</div>
			</div>
			<div class="clubs" role="radiogroup" aria-label="Clubes">
				{#each sortedClubs as c, i (c.id)}
					<button
						class="club"
						role="radio"
						aria-checked={clubId === c.id}
						data-active={clubId === c.id}
						onclick={() => (clubId = c.id)}
						ondblclick={create}
						use:enter={{ index: Math.min(i, 10) }}
						data-umx-hover
						style="--c:{c.colors.primary}"
					>
						<Crest club={c} size={48} />
						<span class="cname">{c.name}</span>
						<span class="ccity muted">{c.city}</span>
						<Stars value={c.reputation} />
					</button>
				{/each}
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
	.profile-options { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 120px), 1fr)); gap: 10px; }
	.profile-options :is(input, select) { width: 100%; min-width: 0; padding: .65rem; color: var(--text); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 8px; }
	.turned { transform: scaleX(-1); }

	.worldpick {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 10px;
	}
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
	.intro.row {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: var(--sp-6);
		flex-wrap: wrap;
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
	.heads {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.head-opt {
		display: grid;
		place-items: center;
		width: 64px;
		height: 64px;
		padding: 0;
		border-radius: var(--radius-m);
		border: 1px solid var(--line-strong);
		background: linear-gradient(180deg, var(--surface-3), var(--surface-2));
		overflow: hidden;
		transition: border-color 0.15s, transform 0.15s;
	}
	.head-opt:hover {
		transform: translateY(-2px);
		border-color: var(--text-3);
	}
	.head-opt[aria-checked='true'] {
		border-color: var(--emerald);
		box-shadow: 0 0 0 3px var(--emerald-soft);
	}
	.swatches {
		display: flex;
		gap: var(--sp-2);
		margin-top: var(--sp-1);
	}
	.swatch {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: 2px solid var(--surface-3);
		background: var(--c);
	}
	.swatch.on {
		border-color: var(--text);
		box-shadow: 0 0 0 3px var(--emerald);
	}
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
	.confirm {
		display: flex;
		align-items: center;
		gap: var(--sp-5);
	}
	.pick {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}
	.pick div {
		display: flex;
		flex-direction: column;
	}
	.pick small {
		font-size: var(--fs-xs);
		max-width: 280px;
	}
	.clubs {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: var(--sp-3);
	}
	.club {
		display: grid;
		grid-template-columns: auto 1fr;
		grid-template-rows: auto auto auto;
		column-gap: var(--sp-3);
		align-items: center;
		padding: var(--sp-4);
		text-align: left;
		border-radius: var(--radius-l);
		border: 1px solid var(--line);
		background: rgb(28 37 43 / 0.92);
		transition:
			border-color 0.15s,
			background 0.15s;
	}
	.club :global(.crest) {
		grid-row: 1 / 4;
	}
	.club:hover {
		background: var(--surface-2);
		border-color: var(--line-strong);
	}
	.club[data-active='true'] {
		border-color: var(--emerald);
		background: linear-gradient(160deg, rgb(16 185 129 / 0.14), rgb(28 37 43 / 0.95));
		box-shadow: 0 0 0 1px var(--emerald);
	}
	.cname {
		font-weight: 700;
		font-size: var(--fs-sm);
		line-height: 1.2;
	}
	.ccity {
		font-size: var(--fs-xs);
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
