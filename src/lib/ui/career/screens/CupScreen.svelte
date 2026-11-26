<script lang="ts">
	import type { CareerScreenData } from '#lib/career/screen-data.ts';
	import { onMount, untrack } from 'svelte';
	import { CUP_FINAL_PRIZE, CUP_PHASES, CUP_PRIZE_SOURCE, cupDate, cupView } from '#lib/domain/cup.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { formatDayMonth } from '#lib/domain/dates.ts';
	import { formatMoney } from '#lib/domain/market.ts';
	import { strengthMemo } from '#lib/domain/world.ts';
	import { animate, celebrate } from '#lib/motion/motion.svelte.ts';
	import { reveal } from '#lib/motion/actions.ts';
	import Crest from '#lib/ui/Crest.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Trophy from '#lib/ui/v4/Trophy.svelte';

	let { data }: { data: CareerScreenData } = $props();
	const c = $derived(data.career);
	const v = $derived(data.view);
	const cup = $derived(v.cup);
	const participation = $derived(v.cupParticipation);
	const view = $derived(cup ? cupView(cup, v.results, c.seed, strengthMemo(data.manage.ctx)) : null);
	let phase = $state(untrack(() => (view ? Math.max(0, view.phases.findLastIndex((p) => p.ties.length > 0)) : 0)));
	let stage = $state<HTMLElement | null>(null);
	const mine = (t: [string, string]) => t.includes(c.clubId);
	const name = (id: string) => getClub(id)?.short ?? id;

	async function go(i: number) {
		if (i === phase) return;
		const dir = i > phase ? 1 : -1;
		await animate(stage, { opacity: 0, x: -24 * dir }, { spring: 'critical' });
		phase = i;
		void animate(stage, { opacity: 1, x: 0 }, { spring: 'page', from: { opacity: 0, x: 24 * dir } });
	}
	let trophyEl = $state<HTMLElement | null>(null);
	onMount(() => {
		if (view?.champion && trophyEl) {
			const r = trophyEl.getBoundingClientRect();
			setTimeout(() => celebrate(r.left + r.width / 2, r.top + r.height / 2), 400);
		}
	});
	const bracketFrom = 5; // oitavas em diante como chaveamento
	const myRun = $derived(view ? view.phases.filter((p) => p.ties.some((t) => mine(t.tie))) : []);
</script>

<svelte:head><title>Copa do Brasil · BRASFC</title></svelte:head>

{#if !cup || !view}
	<section class="glass pad empty">
		<h1 class="display">Copa do Brasil</h1>
		<p class="muted">Esta temporada da carreira não tem Copa do Brasil (saves anteriores à Dev 0.4 entram na Copa a partir da próxima temporada).</p>
	</section>
{:else}
	<section class="hero glass gold" use:reveal>
		<div>
			<span class="eyebrow-gold">{cup.season} · {cup.edition === 'oficial' ? 'participantes oficiais' : 'edição projetada pelo BRASFC'}</span>
			<h1 class="display">Copa do Brasil</h1>
			<p class="muted">126 clubes, nove fases. Jogo único da 1ª à 4ª fase; ida e volta da 5ª fase à semifinal; final única em campo neutro ({cup.finalVenue}). Empates vão aos pênaltis.</p>
		</div>
		<div class="run">
			{#if participation?.status === 'aguardando-estreia'}
				<span class="muted">Estreia na {participation.stage}{participation.nextDate ? ` · ${formatDayMonth(participation.nextDate)}` : ''}</span>
			{:else if myRun.length}
				<span class="small muted">Sua campanha</span>
				<div class="row">
					{#each myRun as p (p.phase.phase)}
						{@const t = p.ties.find((x) => mine(x.tie))!}
						<span class="chip" class:on={t.outcome?.winner === c.clubId} class:lost={t.outcome && t.outcome.winner !== c.clubId}>{p.phase.name}</span>
					{/each}
				</div>
			{:else}
				<span class="muted">Seu clube não está nesta edição.</span>
			{/if}
		</div>
	</section>

	<nav class="phases" aria-label="Fases">
		{#each CUP_PHASES as p, i (p.phase)}
			<button class="ph" aria-current={phase === i ? 'step' : undefined} class:done={view.phases[i].ties.length && view.phases[i].ties.every((t) => t.outcome)} class:live={view.current === i} onclick={() => go(i)} disabled={!view.phases[i].ties.length && i > view.current}>
				<span>{p.name}</span>
				<small>{formatDayMonth(cupDate(cup.season, p.matchdays[0]))}{p.legs === 2 ? ' · ida e volta' : ''}</small>
			</button>
		{/each}
	</nav>

	<div bind:this={stage}>
		{#if phase === 8}
			{@const f = view.phases[8].ties[0]}
			<section class="final glass gold" use:reveal>
				<div class="spot"></div>
				<span class="eyebrow-gold">A grande decisão</span>
				{#if f}
					<div class="duel">
						<div class="side" class:win={f.outcome?.winner === f.tie[0]}><Crest clubId={f.tie[0]} size={96} /><strong>{getClub(f.tie[0])?.name}</strong></div>
						<div class="score display">
							{#if f.legs[0]}{f.legs[0].homeGoals}<span>×</span>{f.legs[0].awayGoals}{:else}<span class="vs">×</span>{/if}
							{#if f.outcome?.penalties}<small>pênaltis {f.outcome.penalties.home}–{f.outcome.penalties.away}</small>{/if}
						</div>
						<div class="side" class:win={f.outcome?.winner === f.tie[1]}><Crest clubId={f.tie[1]} size={96} /><strong>{getClub(f.tie[1])?.name}</strong></div>
					</div>
					<p class="muted">{cup.finalVenue} · {formatDayMonth(cupDate(cup.season, 13))}</p>
				{:else}
					<p class="muted">Os finalistas saem das semifinais.</p>
				{/if}
				<div class="trophy" bind:this={trophyEl}><Trophy kind="copa" size={140} muted={!view.champion} label="Taça da Copa do Brasil (representação genérica)" /></div>
				{#if view.champion}
					<h2 class="display champ"><span class="shimmer-gold">{getClub(view.champion)?.name} campeão!</span></h2>
				{/if}
				<p class="small muted">Campeão {formatMoney(CUP_FINAL_PRIZE.champion)} · vice {formatMoney(CUP_FINAL_PRIZE.runnerUp)}. {CUP_PRIZE_SOURCE}</p>
			</section>
		{:else if phase >= bracketFrom}
			<section class="bracket" style="--cols:{9 - phase}">
				{#each view.phases.slice(phase, 8) as p, col (p.phase.phase)}
					<div class="col" style="--n:{Math.max(1, p.ties.length)}">
						<h3>{p.phase.name}</h3>
						{#each p.ties.length ? p.ties : Array.from({ length: 2 ** (8 - p.phase.phase) }, () => null) as t, i (i)}
							<div class="slot" style="--i:{i}">
								{#if t}
									<article class="tie glass" class:me={mine(t.tie)} use:reveal={{ index: col * 3 + (i % 6) }}>
										{#each [0, 1] as s (s)}
											{@const id = t.tie[s]}
											<div class="team" class:win={t.outcome?.winner === id} class:out={t.outcome && t.outcome.winner !== id}>
												<Crest clubId={id} size={22} /><span>{name(id)}</span>
												<b>{t.legs.reduce((acc, l) => acc + (l ? (l.home === id ? l.homeGoals : l.awayGoals) : 0), 0)}{t.legs.some((l) => !l) && !t.legs.some((l) => l) ? '' : ''}</b>
											</div>
										{/each}
										{#if t.outcome?.penalties}<small class="pens">pênaltis {t.outcome.penalties.home}–{t.outcome.penalties.away}</small>{/if}
									</article>
								{:else}
									<article class="tie glass ghost"><span class="muted">a definir</span></article>
								{/if}
							</div>
						{/each}
					</div>
				{/each}
			</section>
		{:else}
			{@const p = view.phases[phase]}
			<div class="spread phase-head">
				<h2 class="display">{p.phase.name}</h2>
				<span class="muted">{p.ties.length ? `${p.ties.length} confrontos` : 'Sorteio na data da fase'} · {p.phase.legs === 1 ? 'jogo único' : 'ida e volta'} · premiação {formatMoney(p.phase.prize)} por clube</span>
			</div>
			<div class="grid-auto" style="--min:230px;--gap:10px">
				{#each [...p.ties].sort((a, b) => Number(mine(b.tie)) - Number(mine(a.tie))) as t, i (t.tie.join('-'))}
					<article class="tie glass" class:me={mine(t.tie)} use:reveal={{ index: i % 12 }}>
						{#each [0, 1] as s (s)}
							{@const id = t.tie[s]}
							<div class="team" class:win={t.outcome?.winner === id} class:out={t.outcome && t.outcome.winner !== id}>
								<Crest clubId={id} size={22} /><span>{getClub(id)?.name ?? id}</span>
								<b>{t.legs[0] ? (t.legs[0].home === id ? t.legs[0].homeGoals : t.legs[0].awayGoals) : ''}</b>
							</div>
						{/each}
						{#if t.outcome?.penalties}<small class="pens">pênaltis {t.outcome.penalties.home}–{t.outcome.penalties.away}</small>{/if}
					</article>
				{:else}
					<p class="muted glass pad">Os confrontos desta fase serão sorteados quando ela começar ({formatDayMonth(cupDate(cup.season, p.phase.matchdays[0]))}).</p>
				{/each}
			</div>
		{/if}
	</div>
	<p class="small muted foot"><Icon name="info" size={14} /> Sorteios determinísticos do BRASFC (o regulamento usa potes pelo ranking da CBF). Datas compactadas no calendário semanal do jogo.</p>
{/if}

<style>
	.pad {
		padding: var(--sp-5);
	}
	.hero {
		display: grid;
		grid-template-columns: 1.4fr 1fr;
		gap: var(--sp-5);
		padding: var(--sp-6);
		margin-bottom: var(--sp-4);
		background:
			radial-gradient(70% 120% at 100% 0%, rgb(232 184 106 / 0.16), transparent 60%),
			var(--glass);
	}
	h1 {
		font-size: var(--fs-3xl);
		margin: 6px 0;
	}
	.run {
		align-self: center;
		display: grid;
		gap: 8px;
	}
	.chip.lost {
		color: var(--danger);
		border-color: rgb(248 113 113 / 0.3);
	}
	.small {
		font-size: var(--fs-xs);
	}
	.phases {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		padding-bottom: 6px;
		margin-bottom: var(--sp-4);
	}
	.ph {
		flex: none;
		display: grid;
		gap: 2px;
		padding: 10px 14px;
		border-radius: var(--radius-m);
		border: 1px solid var(--line);
		background: rgb(231 237 240 / 0.03);
		color: var(--text-2);
		cursor: pointer;
		text-align: left;
		font: inherit;
	}
	.ph span {
		font-weight: 700;
	}
	.ph small {
		font-size: 11px;
		color: var(--text-3);
	}
	.ph.done {
		border-color: rgb(16 185 129 / 0.3);
	}
	.ph.live {
		border-color: var(--gold);
		color: var(--text);
	}
	.ph[aria-current='step'] {
		background: var(--emerald-soft);
		border-color: var(--emerald-line);
		color: var(--text);
	}
	.ph:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.phase-head {
		margin-bottom: var(--sp-3);
	}
	.phase-head h2 {
		margin: 0;
		font-size: var(--fs-2xl);
	}
	.tie {
		padding: 10px 12px;
		display: grid;
		gap: 6px;
	}
	.tie.me {
		box-shadow: 0 0 0 1.5px var(--gold), var(--glow-gold);
	}
	.tie.ghost {
		min-height: 64px;
		place-items: center;
		opacity: 0.5;
	}
	.team {
		display: grid;
		grid-template-columns: 22px 1fr auto;
		gap: 8px;
		align-items: center;
		font-size: var(--fs-sm);
	}
	.team span {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.team b {
		font-variant-numeric: tabular-nums;
	}
	.team.win {
		font-weight: 800;
		color: var(--text);
	}
	.team.out {
		opacity: 0.45;
	}
	.pens {
		color: var(--gold);
		font-size: 11px;
	}
	.bracket {
		display: grid;
		grid-template-columns: repeat(var(--cols), minmax(170px, 1fr));
		gap: var(--sp-4);
		overflow-x: auto;
		padding-bottom: var(--sp-3);
	}
	.col {
		display: grid;
		grid-template-rows: auto repeat(var(--n), 1fr);
		gap: 10px;
	}
	.col h3 {
		margin: 0;
		font-size: 11px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.slot {
		position: relative;
		display: grid;
		align-items: center;
	}
	.col + .col .slot::before {
		content: '';
		position: absolute;
		left: calc(-1 * var(--sp-4));
		top: 50%;
		width: var(--sp-4);
		border-top: 1px solid var(--line-strong);
	}
	.final {
		position: relative;
		overflow: hidden;
		padding: var(--sp-7) var(--sp-6);
		display: grid;
		justify-items: center;
		text-align: center;
		gap: var(--sp-3);
		background: radial-gradient(60% 80% at 50% 0%, rgb(232 184 106 / 0.22), transparent 70%), var(--glass);
	}
	.spot {
		position: absolute;
		inset: -40% 20% auto;
		height: 90%;
		background: conic-gradient(from 180deg at 50% 0%, transparent 40%, rgb(255 241 207 / 0.08) 50%, transparent 60%);
		pointer-events: none;
	}
	.duel {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		gap: var(--sp-6);
		align-items: center;
		width: min(760px, 100%);
	}
	.side {
		display: grid;
		justify-items: center;
		gap: 8px;
		opacity: 0.85;
	}
	.side.win {
		opacity: 1;
		filter: drop-shadow(0 0 22px rgb(232 184 106 / 0.45));
	}
	.side strong {
		font-family: var(--font-display);
		font-size: var(--fs-xl);
		text-transform: uppercase;
	}
	.score {
		font-size: clamp(3rem, 7vw, 5rem);
		font-weight: 800;
		display: grid;
		justify-items: center;
	}
	.score span {
		color: var(--text-3);
		margin: 0 0.2em;
	}
	.score small {
		font-size: var(--fs-sm);
		color: var(--gold);
		font-family: var(--font-ui);
		text-transform: none;
	}
	.champ {
		font-size: var(--fs-3xl);
		margin: 0;
	}
	.foot {
		margin-top: var(--sp-5);
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.empty h1 {
		margin-top: 0;
	}
	@media (max-width: 900px) {
		.hero {
			grid-template-columns: 1fr;
		}
		.duel {
			gap: var(--sp-3);
		}
	}
</style>
