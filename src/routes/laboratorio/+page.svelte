<script lang="ts">
	import { CLUBES_2026, toGameClub, type Serie } from '#lib/data/brasil.ts';
	import type { Club } from '#lib/domain/clubs.ts';
	import { generateSquadFor } from '#lib/domain/squad.ts';
	import { FORMATION_IDS, FORMATIONS, type FormationId, type Mentality, type PlayStyle } from '#lib/domain/tactics.ts';
	import type { MatchResult, Side } from '#lib/engine/types.ts';
	import { buildTeamSetup } from '#lib/engine/teams.ts';
	import { setIslandContext } from '#lib/stores/island.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Crest from '#lib/ui/Crest.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import MatchCenter from '#lib/ui/match/MatchCenter.svelte';
	import MentalityScale from '#lib/ui/MentalityScale.svelte';
	import ScreenHeader from '#lib/ui/ScreenHeader.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';
	import StylePicker from '#lib/ui/StylePicker.svelte';

	$effect(() => setIslandContext('Laboratório'));

	type Pick = { id: string; formation: FormationId; mentality: Mentality; style: PlayStyle };
	const clubs = CLUBES_2026.map((c) => ({ real: c, game: toGameClub(c) }));
	const byId = new Map(clubs.map((c) => [c.real.id, c]));

	let serie = $state<Serie>('A');
	let picking = $state<Side>('home');
	let home = $state<Pick>({ id: 'flamengo', formation: '4-3-3', mentality: 'equilibrada', style: 'posse' });
	let away = $state<Pick>({ id: 'palmeiras', formation: '4-2-3-1', mentality: 'equilibrada', style: 'contra-ataque' });
	let control = $state<'home' | 'away' | 'none'>('home');
	let stage = $state<'setup' | 'match' | 'done'>('setup');
	let seed = $state(0);
	let result = $state<MatchResult | null>(null);

	const current = $derived(picking === 'home' ? home : away);

	function choose(id: string) {
		if (picking === 'home') home.id = id;
		else away.id = id;
		if (home.id === away.id) {
			if (picking === 'home') away.id = clubs.find((c) => c.real.id !== id)!.real.id;
			else home.id = clubs.find((c) => c.real.id !== id)!.real.id;
		}
	}

	function setup(p: Pick) {
		const c = byId.get(p.id)!;
		return buildTeamSetup(
			{ id: c.game.id, name: c.game.name, short: c.game.short, colors: c.game.colors },
			generateSquadFor(c.game, 2026, { pending: true }),
			{ formation: p.formation, mentality: p.mentality, style: p.style }
		);
	}

	let teams = $state.raw<{ home: ReturnType<typeof setup>; away: ReturnType<typeof setup> } | null>(null);

	function start(newSeed = true) {
		if (newSeed || !seed) seed = (Math.random() * 2 ** 31) >>> 0;
		teams = { home: setup(home), away: setup(away) };
		result = null;
		stage = 'match';
	}

	function finished(r: MatchResult) {
		result = r;
		stage = 'done';
	}

	const club = (id: string): Club => byId.get(id)!.game;
</script>

<svelte:head><title>Laboratório · BRASFC</title></svelte:head>

<main class="page">
	<ScreenHeader title="Laboratório" eyebrow="Partida rápida">
		{#snippet actions()}
			{#if stage !== 'setup'}
				<Button variant="ghost" icon="arrowLeft" onclick={() => (stage = 'setup')}>Trocar times</Button>
			{/if}
		{/snippet}
	</ScreenHeader>

	{#if stage === 'setup'}
		<p class="note">
			<Icon name="info" />
			<span>Clubes reais das Séries A, B e C de 2026, conferidos em fontes públicas. Os <strong>elencos reais ainda não foram importados</strong>:
			os jogadores têm <strong>nomes fictícios</strong> e força estimada pelo BRASFC — não são os atletas reais dos clubes.</span>
		</p>

		<div class="versus">
			{#each [['home', home], ['away', away]] as [side, p] (side)}
				{@const s = side as Side}
				{@const pk = p as Pick}
				<button class="slot" class:on={picking === s} onclick={() => (picking = s)} aria-pressed={picking === s}>
					<span class="lbl">{s === 'home' ? 'Mandante' : 'Visitante'}</span>
					<Crest club={club(pk.id)} size={64} />
					<strong>{club(pk.id).name}</strong>
					<span class="sub">Série {byId.get(pk.id)!.real.serie} · força {'★'.repeat(club(pk.id).reputation)}</span>
				</button>
				{#if s === 'home'}<span class="x">×</span>{/if}
			{/each}
		</div>

		<section class="picker" aria-label="Escolha o clube {picking === 'home' ? 'mandante' : 'visitante'}">
			<div class="ph">
				<h2>Escolha o {picking === 'home' ? 'mandante' : 'visitante'}</h2>
				<Segmented
					label="Série"
					options={[
						{ value: 'A', label: 'Série A' },
						{ value: 'B', label: 'Série B' },
						{ value: 'C', label: 'Série C' }
					]}
					bind:value={serie}
				/>
			</div>
			<div class="crests">
				{#each clubs.filter((c) => c.real.serie === serie) as c (c.real.id)}
					<button
						class="club"
						class:on={current.id === c.real.id}
						class:other={(picking === 'home' ? away.id : home.id) === c.real.id}
						onclick={() => choose(c.real.id)}
						title="{c.real.nome}{c.real.cidade ? ` · ${c.real.cidade}-${c.real.uf}` : ' · cidade pendente'}"
					>
						<Crest club={c.game} size={40} />
						<span>{c.real.nome}</span>
					</button>
				{/each}
			</div>
		</section>

		<section class="tactic">
			<h2>Tática do {picking === 'home' ? 'mandante' : 'visitante'}</h2>
			<div class="tgrid">
				<div>
					<h3>Formação</h3>
					<div class="forms">
						{#each FORMATION_IDS as f (f)}
							<button class="form" class:on={current.formation === f} onclick={() => (current.formation = f)} aria-pressed={current.formation === f}>
								<svg viewBox="0 0 100 100" aria-hidden="true">
									{#each FORMATIONS[f] as s, i (i)}<circle cx={s.x} cy={s.y} r="7" />{/each}
								</svg>
								<span>{f}</span>
							</button>
						{/each}
					</div>
					<h3>Mentalidade</h3>
					<MentalityScale bind:value={current.mentality} />
				</div>
				<div>
					<h3>Estilo</h3>
					<StylePicker bind:value={current.style} compact />
				</div>
			</div>
		</section>

		<section class="go">
			<Segmented
				label="Quem você comanda"
				options={[
					{ value: 'home', label: `Comandar ${club(home.id).short}` },
					{ value: 'away', label: `Comandar ${club(away.id).short}` },
					{ value: 'none', label: 'Só assistir' }
				]}
				bind:value={control}
			/>
			<Button variant="primary" size="lg" icon="whistle" onclick={() => start()}>Começar partida</Button>
		</section>
	{:else if teams}
		{#if stage === 'done' && result}
			<section class="post" aria-label="Resumo da partida">
				<div class="final">
					<Crest club={club(home.id)} size={56} />
					<strong>{result.homeGoals} × {result.awayGoals}</strong>
					<Crest club={club(away.id)} size={56} />
				</div>
				<p class="verdict">
					{teams.home.name}
					{result.homeGoals > result.awayGoals ? 'vence' : result.homeGoals < result.awayGoals ? 'perde para o' : 'empata com o'}
					{teams.away.name}.
				</p>
				<div class="mini">
					<span>Finalizações <b>{result.stats.home.shots} – {result.stats.away.shots}</b></span>
					<span>xG <b>{result.stats.home.xg.toFixed(2)} – {result.stats.away.xg.toFixed(2)}</b></span>
					<span>Passes certos <b>{result.stats.home.passesCompleted} – {result.stats.away.passesCompleted}</b></span>
				</div>
				<p class="seed">Semente {seed}: repetir a semente com as mesmas decisões reproduz exatamente a partida.</p>
				<div class="btns">
					<Button variant="primary" icon="refresh" onclick={() => start()}>Jogar de novo</Button>
					<Button icon="arrowLeft" onclick={() => (stage = 'setup')}>Trocar times</Button>
				</div>
			</section>
		{/if}
		{#key seed}
			<MatchCenter home={teams.home} away={teams.away} {seed} control={control === 'none' ? null : control} onfinish={finished} />
		{/key}
	{/if}
</main>

<style>
	.page {
		max-width: 1320px;
		margin: 0 auto;
		padding: var(--sp-6, 24px) 16px 48px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.note {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		margin: 0;
		padding: 10px 14px;
		border-radius: 12px;
		background: var(--gold-soft);
		color: var(--text-2);
		font-size: var(--fs-sm);
	}
	.versus {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 16px;
	}
	.x {
		font-family: var(--font-display);
		font-size: var(--fs-2xl);
		color: var(--text-3);
	}
	.slot {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		min-width: 0;
		width: min(280px, 42vw);
		padding: 14px;
		border: 0;
		border-radius: 16px;
		background: var(--surface);
		color: var(--text);
		font: inherit;
		cursor: pointer;
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.slot.on {
		box-shadow: inset 0 0 0 2px var(--emerald);
		background: var(--surface-2);
	}
	.slot strong {
		font-family: var(--font-display);
		font-size: var(--fs-xl);
		text-align: center;
	}
	.lbl,
	.sub {
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.sub {
		color: var(--gold);
	}
	h2 {
		font-family: var(--font-display);
		font-size: var(--fs-xl);
		margin: 0;
	}
	h3 {
		margin: 0 0 8px;
		font-size: var(--fs-sm);
		color: var(--text-3);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.picker,
	.tactic {
		padding: 16px;
		border-radius: 16px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.ph {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 10px;
	}
	.crests {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
		gap: 8px;
	}
	.club {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 10px 6px;
		border: 0;
		border-radius: 12px;
		background: var(--surface-2);
		color: var(--text-2);
		font: inherit;
		font-size: var(--fs-xs);
		text-align: center;
		cursor: pointer;
		transition: transform 0.15s ease;
	}
	.club:hover {
		transform: translateY(-2px);
		color: var(--text);
	}
	.club.on {
		box-shadow: inset 0 0 0 2px var(--emerald);
		color: var(--text);
	}
	.club.other {
		opacity: 0.45;
	}
	.tgrid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 20px;
	}
	.forms {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 16px;
	}
	.form {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		width: 78px;
		padding: 6px;
		border: 0;
		border-radius: 10px;
		background: var(--surface-2);
		color: var(--text);
		font: inherit;
		font-weight: 600;
		font-size: var(--fs-sm);
		cursor: pointer;
	}
	.form svg {
		width: 56px;
		height: 56px;
		background: #124432;
		border-radius: 6px;
	}
	.form circle {
		fill: var(--text);
	}
	.form.on {
		box-shadow: inset 0 0 0 2px var(--emerald);
	}
	.form.on circle {
		fill: var(--emerald-strong);
	}
	.go {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 12px;
	}
	.post {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 20px;
		border-radius: 16px;
		background: linear-gradient(180deg, var(--surface-2), var(--surface));
		box-shadow: inset 0 0 0 1px var(--emerald-line);
	}
	.final {
		display: flex;
		align-items: center;
		gap: 18px;
	}
	.final strong {
		font-family: var(--font-display);
		font-size: var(--fs-3xl);
	}
	.verdict {
		margin: 0;
		font-size: var(--fs-lg);
	}
	.mini {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
		justify-content: center;
		color: var(--text-2);
		font-size: var(--fs-sm);
	}
	.seed {
		margin: 0;
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.btns {
		display: flex;
		gap: 8px;
	}
	@media (max-width: 760px) {
		.tgrid {
			grid-template-columns: 1fr;
		}
	}
</style>
