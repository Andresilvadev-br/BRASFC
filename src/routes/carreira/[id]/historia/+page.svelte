<script lang="ts">
	import { onMount } from 'svelte';
	import { clubHistory } from '#lib/client/club.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { DIVISION_LABELS, type DivisionId } from '#lib/domain/league.ts';
	import { findPlayer, formatMoney } from '#lib/domain/market.ts';
	import { reveal } from '#lib/motion/actions.ts';
	import Crest from '#lib/ui/Crest.svelte';
	import Trophy from '#lib/ui/v4/Trophy.svelte';
	import SeasonCompare from '#lib/ui/v4/SeasonCompare.svelte';

	let { data } = $props();
	const c = $derived(data.career);
	const v = $derived(data.view);
	type H = Awaited<ReturnType<typeof clubHistory>>;
	let hist = $state<H | null>(null);
	let failed = $state(false);
	onMount(() => {
		clubHistory(c.id).then((h) => (hist = h)).catch(() => (failed = true));
	});
	const COMP: Record<string, string> = { ...DIVISION_LABELS, 'copa-do-brasil': 'Copa do Brasil' };
	const seasons = $derived([...new Set((hist?.history ?? []).map((h) => h.season))].sort((a, b) => b - a));
	const titles = $derived(v.seasons.filter((s) => s.outcome === 'campeao' || s.outcome === 'acesso'));
	const cupTitles = $derived((hist?.history ?? []).filter((h) => h.kind === 'temporada-usuario' && h.data.cupChampion));
	const awards = $derived((hist?.history ?? []).filter((h) => h.kind === 'premio'));
	const bigDeals = $derived([...(hist?.transfers ?? [])].filter((t) => t.fee > 0 && (t.kind === 'compra' || t.kind === 'venda' || t.kind === 'ia')).sort((a, b) => b.fee - a.fee).slice(0, 8));
	const office = $derived(data.office.office);
	const revealed = $derived((data.manage.club.revealed ?? []).map((r) => ({ ...r, now: findPlayer(data.manage.ctx, r.id) })).reverse());
	const rec = $derived(data.office.universe?.records ?? null);
	const scorerName = (id: string) => (id === 'eu' ? c.personName : (findPlayer(data.manage.ctx, id)?.name ?? id));
</script>

<svelte:head><title>História · BRASFC</title></svelte:head>

<section class="cabinet glass gold" use:reveal>
	<div class="head">
		<span class="eyebrow-gold">Sala de troféus</span>
		<h1 class="display">História da carreira</h1>
		<p class="muted">Conquistas, campeões e recordes ficam guardados ao longo de todas as temporadas.</p>
	</div>
	<div class="shelf">
		{#each titles as t, i (t.season + t.division)}
			<div class="item" use:reveal={{ index: i }}>
				<Trophy kind={t.outcome === 'campeao' ? 'taca' : 'medalha'} size={88} label="{t.outcome === 'campeao' ? 'Campeão' : 'Acesso'} {COMP[t.division] ?? t.division} {t.season}" />
				<strong>{t.outcome === 'campeao' ? 'Campeão' : 'Acesso'}</strong>
				<span>{COMP[t.division] ?? t.division} {t.season}</span>
			</div>
		{/each}
		{#each cupTitles as t (t.season)}
			<div class="item"><Trophy kind="copa" size={88} label="Copa do Brasil {t.season}" /><strong>Campeão</strong><span>Copa do Brasil {t.season}</span></div>
		{/each}
		{#each awards as a (a.season + a.competition)}
			<div class="item"><Trophy kind="estrela" size={72} label={a.competition} /><strong>{a.competition}</strong><span>{a.season}</span></div>
		{/each}
		{#if !titles.length && !cupTitles.length && !awards.length}
			<div class="item empty"><Trophy kind="taca" size={88} muted label="Prateleira vazia" /><span class="muted">A primeira conquista vai aparecer aqui.</span></div>
		{/if}
	</div>
</section>

{#if v.seasons.length}
	<h2 class="display section">Suas temporadas</h2>
	<div class="seasons">
		{#each [...v.seasons].reverse() as s, i (s.season)}
			<article class="season glass" data-o={s.outcome} use:reveal={{ index: i }}>
				<span class="yr display">{s.season}</span>
				<span>{COMP[s.division] ?? s.division}</span>
				<strong class="pos-n">{s.position}º</strong>
				<span class="muted">{s.points} pts em {s.played} jogos</span>
				<span class="tag">{s.outcome === 'campeao' ? 'Campeão' : s.outcome === 'acesso' ? 'Acesso' : s.outcome === 'rebaixado' ? 'Rebaixado' : 'Permanência'}</span>
			</article>
		{/each}
	</div>
{/if}

<section class="legacy" aria-labelledby="lg">
	<h2 id="lg" class="display section">Legado</h2>
	<div class="lgrid">
		<div class="glass pad wide" use:reveal>
			<span class="eyebrow-gold">Temporada a temporada</span>
			{#if v.seasons.length}
				<SeasonCompare seasons={v.seasons} labels={COMP} />
			{:else}
				<p class="muted">A comparação entre temporadas aparece ao fim da primeira.</p>
			{/if}
		</div>
		<div class="glass pad" use:reveal={{ index: 1 }}>
			<span class="eyebrow-gold">Marcos do treinador</span>
			<p class="big">{office.milestones.length}</p>
			<ul class="list">
				{#each [...office.milestones].reverse().slice(0, 6) as ms (ms.key)}<li><strong>{ms.label}</strong> <small class="muted">{ms.season}</small></li>{:else}<li class="muted">Ainda nenhum.</li>{/each}
			</ul>
			<a class="link" href="/carreira/{c.id}/gabinete">Gabinete completo →</a>
		</div>
		<div class="glass pad" use:reveal={{ index: 2 }}>
			<span class="eyebrow-gold">Revelados pela base</span>
			<p class="big">{revealed.length}</p>
			<ul class="list">
				{#each revealed.slice(0, 6) as r (r.id)}
					<li><strong>{r.name}</strong> <small class="muted">{r.position} · subiu em {r.season} com {r.overall}{r.now ? ` · hoje ${r.now.overall}` : ''}</small></li>
				{:else}
					<li class="muted">Promova jovens da base para começar a lista.</li>
				{/each}
			</ul>
		</div>
		{#if rec}
			<div class="glass pad" use:reveal={{ index: 3 }}>
				<span class="eyebrow-gold">Recordes do universo</span>
				<ul class="list">
					{#if rec.biggestWin}<li>Maior goleada: <strong>{getClub(rec.biggestWin.home)?.short} {rec.biggestWin.homeGoals}×{rec.biggestWin.awayGoals} {getClub(rec.biggestWin.away)?.short}</strong> <small class="muted">{rec.biggestWin.season}</small></li>{/if}
					{#if rec.longestStreak}<li>Maior sequência: <strong>{rec.longestStreak.wins} vitórias</strong> <small class="muted">{getClub(rec.longestStreak.clubId)?.name}, {rec.longestStreak.season}</small></li>{/if}
					{#if rec.bestCampaign}<li>Melhor campanha: <strong>{rec.bestCampaign.points} pts</strong> <small class="muted">{getClub(rec.bestCampaign.clubId)?.name}, {rec.bestCampaign.season}</small></li>{/if}
					{#if !rec.biggestWin && !rec.longestStreak}<li class="muted">Os recordes aparecem conforme a carreira avança.</li>{/if}
				</ul>
			</div>
		{/if}
	</div>
</section>

{#if failed}<p class="muted">Não foi possível carregar o histórico agora.</p>{/if}
{#if hist}
	{#each seasons as yr (yr)}
		{@const rows = hist.history.filter((h) => h.season === yr)}
		<h2 class="display section">Temporada {yr}</h2>
		<div class="grid-auto" style="--min:220px">
			{#each rows.filter((h) => h.kind === 'campeao') as h (h.competition)}
				<article class="champ glass" data-umx-surface use:reveal>
					<span class="small muted">{COMP[h.competition] ?? h.competition}</span>
					<div class="row"><Crest clubId={String(h.data.clubId)} size={40} /><strong>{getClub(String(h.data.clubId))?.name ?? h.data.clubId}</strong></div>
					{#if h.data.runnerUp}<span class="small muted">Vice: {getClub(String(h.data.runnerUp))?.name ?? h.data.runnerUp}</span>{/if}
				</article>
			{/each}
			{#each rows.filter((h) => h.kind === 'artilharia') as h (h.competition)}
				<article class="champ glass" use:reveal>
					<span class="small muted">Artilharia · {COMP[h.competition] ?? h.competition}</span>
					<ol class="scorers">
						{#each (h.data.players as Array<{ playerId: string; clubId?: string; goals: number }>).slice(0, 5) as p (p.playerId)}
							<li><span>{scorerName(p.playerId)}</span>{#if p.clubId}<Crest clubId={p.clubId} size={18} />{/if}<b>{p.goals}</b></li>
						{/each}
					</ol>
				</article>
			{/each}
		</div>
	{:else}
		<p class="muted glass pad">Os campeões e artilheiros entram aqui quando a primeira temporada termina.</p>
	{/each}

	{#if bigDeals.length}
		<h2 class="display section">Transferências marcantes</h2>
		<div class="deals">
			{#each bigDeals as t, i (i)}
				<div class="deal glass" use:reveal={{ index: i }}>
					<strong>{t.playerName}</strong>
					<span class="row">{#if t.from}<Crest clubId={t.from} size={20} />{/if}→{#if t.to}<Crest clubId={t.to} size={20} />{/if}</span>
					<b class="money">{formatMoney(t.fee)}</b>
					<span class="small muted">{t.season}</span>
				</div>
			{/each}
		</div>
	{/if}
{/if}

<style>
	.cabinet {
		padding: var(--sp-6);
		background:
			radial-gradient(60% 100% at 50% 0%, rgb(232 184 106 / 0.18), transparent 70%),
			var(--glass);
	}
	h1 {
		font-size: var(--fs-3xl);
		margin: 6px 0;
	}
	.shelf {
		margin-top: var(--sp-5);
		display: flex;
		gap: var(--sp-5);
		flex-wrap: wrap;
		padding: var(--sp-4) var(--sp-3) var(--sp-3);
		border-radius: var(--radius-m);
		background: linear-gradient(180deg, transparent 75%, rgb(232 184 106 / 0.08) 75%, rgb(10 13 16 / 0.6));
	}
	.item {
		display: grid;
		justify-items: center;
		gap: 2px;
		min-width: 120px;
		text-align: center;
	}
	.item span {
		font-size: var(--fs-xs);
		color: var(--text-2);
	}
	.item.empty {
		opacity: 0.8;
	}
	.section {
		margin: var(--sp-6) 0 var(--sp-3);
		font-size: var(--fs-2xl);
	}
	.pad {
		padding: var(--sp-5);
	}
	.seasons {
		display: grid;
		gap: 8px;
	}
	.season {
		display: grid;
		grid-template-columns: 80px 1fr 60px 1fr auto;
		gap: var(--sp-3);
		align-items: center;
		padding: 10px var(--sp-4);
	}
	.yr {
		font-size: var(--fs-xl);
		color: var(--text-3);
	}
	.pos-n {
		font-family: var(--font-display);
		font-size: var(--fs-xl);
	}
	.tag {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		padding: 4px 8px;
		border-radius: 6px;
		background: rgb(231 237 240 / 0.07);
	}
	.season[data-o='campeao'] .tag {
		background: var(--gold-soft);
		color: var(--gold);
	}
	.season[data-o='acesso'] .tag {
		background: var(--emerald-soft);
		color: var(--emerald-strong);
	}
	.season[data-o='rebaixado'] .tag {
		background: var(--danger-soft);
		color: var(--danger);
	}
	.champ {
		padding: var(--sp-4);
		display: grid;
		gap: 8px;
	}
	.small {
		font-size: var(--fs-xs);
	}
	.scorers {
		margin: 0;
		padding-left: 18px;
		display: grid;
		gap: 4px;
		font-size: var(--fs-sm);
	}
	.scorers li span {
		margin-right: 6px;
	}
	.scorers b {
		float: right;
	}
	.deals {
		display: grid;
		gap: 8px;
	}
	.deal {
		display: grid;
		grid-template-columns: 1fr auto auto auto;
		gap: var(--sp-4);
		align-items: center;
		padding: 10px var(--sp-4);
	}
	.money {
		font-family: var(--font-display);
		font-size: var(--fs-lg);
		color: var(--gold);
	}
	@media (max-width: 700px) {
		.season {
			grid-template-columns: 60px 1fr auto;
		}
		.deal {
			grid-template-columns: 1fr auto;
		}
	}
	.lgrid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--sp-4);
	}
	.lgrid .wide {
		grid-column: 1 / -1;
	}
	.big {
		font: 800 2.4rem/1 'Barlow Condensed', sans-serif;
		margin: 6px 0;
	}
	.list {
		list-style: none;
		margin: 0 0 8px;
		padding: 0;
		display: grid;
		gap: 6px;
		font-size: var(--fs-sm);
	}
	@media (max-width: 900px) {
		.lgrid {
			grid-template-columns: 1fr;
		}
	}
</style>
