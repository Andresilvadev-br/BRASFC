<script lang="ts">
	import { estimateRange, REGION_LABELS, scoutCandidates, type Region } from '#lib/domain/academy.ts';
	import { scoutMargin, youthIntake } from '#lib/domain/club.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { currentClubOf, findPlayer, formatMoney } from '#lib/domain/market.ts';
	import { POSITION_INFO, type Position } from '#lib/domain/positions.ts';
	import { reveal } from '#lib/motion/actions.ts';
	import { clubAction } from '#lib/client/club.ts';
	import Button from '#lib/ui/Button.svelte';
	import Crest from '#lib/ui/Crest.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';
	import Sparkline from '#lib/ui/v4/Sparkline.svelte';

	let { data } = $props();
	const c = $derived(data.career);
	const m = $derived(data.manage);
	const club = $derived(m.club);
	let tab = $state<'base' | 'olheiros' | 'relatorios'>('base');
	let busy = $state(false);
	let msg = $state('');
	const POS: Array<Position | 'qualquer'> = ['qualquer', 'GOL', 'LD', 'ZAG', 'LE', 'VOL', 'MC', 'MEI', 'PD', 'PE', 'ATA'];
	const margin = $derived(Math.max(2, 8 - club.infra.base.level));
	const candidates = $derived(scoutCandidates(c.seed, c.season).filter((s) => !club.scouts.some((x) => x.id === s.id)));
	const missions = $state<Record<string, { region: Region; position: Position | 'qualquer'; maxAge: number }>>({});
	$effect.pre(() => {
		for (const s of club.scouts) missions[s.id] ??= { region: s.region, position: s.position, maxAge: s.maxAge };
	});

	async function act(body: Record<string, unknown>, ok?: string) {
		busy = true;
		msg = '';
		try {
			const r = await clubAction(c.id, c.version, body);
			msg = ok ?? r.message;
		} catch (e) {
			msg = (e as Error).message;
		} finally {
			busy = false;
		}
	}
	const reports = $derived([...club.reports].reverse());
</script>

<svelte:head><title>Base e olheiros · {data.view.club.name} · BRASFC</title></svelte:head>

<section class="hero glass" use:reveal>
	<div>
		<span class="eyebrow-gold">Planejamento de longo prazo</span>
		<h1 class="display">Base e olheiros</h1>
		<p class="muted">Jovens do universo BRASFC (fictícios). A turma anual depende da estrutura da base ({youthIntake(club.infra.base.level)} por ano no nível atual); craques são raros. Olheiros enxergam melhor com mais estrutura e mais experiência.</p>
	</div>
	<div class="row">
		<span class="chip">Base nível {club.infra.base.level}</span>
		<span class="chip">CT nível {club.infra.ct.level}</span>
		<span class="chip">Observação nível {club.infra.observacao.level} · {club.scouts.length}/{club.infra.observacao.level} olheiros</span>
		<span class="chip">Minutos de jovens na temporada: {club.youthMinutes}</span>
	</div>
</section>

<div class="tabs"><Segmented label="Seção" bind:value={tab} options={[{ value: 'base', label: `Base (${club.academy.length})` }, { value: 'olheiros', label: `Olheiros (${club.scouts.length})` }, { value: 'relatorios', label: `Relatórios (${club.reports.length})` }]} /></div>

{#if tab === 'base'}
	<div class="grid-auto" style="--min:250px">
		{#each club.academy as y, i (y.id)}
			{@const pot = estimateRange(y.potential, margin, `${c.id}:${y.id}:pot`)}
			<article class="youth glass" data-umx-surface use:reveal={{ index: i % 12 }}>
				<div class="spread">
					<span class="ovr">{y.overall}</span>
					<span class="pos">{y.position}</span>
				</div>
				<h3>{y.name}</h3>
				<p class="muted">{POSITION_INFO[y.position].label} · {y.age} anos · desde {y.joinedSeason}</p>
				<div class="spread">
					<span class="small">Potencial estimado <b>{pot[0]}–{pot[1]}</b></span>
					<Sparkline values={[...y.log.map((l) => l.overall), y.overall].slice(-10)} width={90} height={26} label="Evolução de {y.name}" />
				</div>
				<div class="prog" title="Progresso para o próximo ponto"><i style="width:{Math.round(y.progress * 100)}%"></i></div>
				<div class="row">
					<Button size="sm" variant="primary" loading={busy} onclick={() => act({ action: 'base-promover', youthId: y.id })}>Promover</Button>
					<Button size="sm" variant="ghost" disabled={busy} onclick={() => act({ action: 'base-dispensar', youthId: y.id }, `${y.name} foi dispensado.`)}>Dispensar</Button>
				</div>
			</article>
		{:else}
			<p class="muted glass pad">Nenhum jovem na base agora. A próxima turma chega no início da temporada.</p>
		{/each}
	</div>
{:else if tab === 'olheiros'}
	<div class="grid-auto" style="--min:300px">
		{#each club.scouts as s (s.id)}
			{@const ms = missions[s.id]}
			<article class="scout glass" use:reveal>
				<div class="spread"><h3>{s.name}</h3><span class="stars" title="Julgamento {s.judgement}/20">{'★'.repeat(Math.round(s.judgement / 4))}<span class="off">{'★'.repeat(5 - Math.round(s.judgement / 4))}</span></span></div>
				<p class="muted small">Margem dos relatórios: ±{scoutMargin(club.infra.observacao.level, s.judgement)} · {formatMoney(s.wage)}/mês</p>
				{#if ms}
					<label>Região <select bind:value={ms.region}>{#each Object.entries(REGION_LABELS) as [k, l] (k)}<option value={k}>{l}</option>{/each}</select></label>
					<label>Posição <select bind:value={ms.position}>{#each POS as p (p)}<option value={p}>{p === 'qualquer' ? 'Qualquer' : p}</option>{/each}</select></label>
					<label>Idade até <b>{ms.maxAge}</b><input type="range" min="17" max="35" bind:value={ms.maxAge} /></label>
					<div class="row">
						<Button size="sm" variant="secondary" loading={busy} onclick={() => act({ action: 'olheiro-missao', scoutId: s.id, region: ms.region, position: ms.position, maxAge: ms.maxAge }, 'Missão atualizada.')}>Salvar missão</Button>
						<Button size="sm" variant="ghost" disabled={busy} onclick={() => act({ action: 'olheiro-dispensar', scoutId: s.id }, 'Olheiro dispensado.')}>Dispensar</Button>
					</div>
				{/if}
			</article>
		{/each}
	</div>
	<h2 class="display section">Disponíveis para contratar</h2>
	<div class="grid-auto" style="--min:220px">
		{#each candidates as s (s.id)}
			<article class="scout glass" data-umx-surface>
				<h3>{s.name}</h3>
				<span class="stars">{'★'.repeat(Math.round(s.judgement / 4))}<span class="off">{'★'.repeat(5 - Math.round(s.judgement / 4))}</span></span>
				<p class="muted small">Julgamento {s.judgement}/20 · {REGION_LABELS[s.region]} · {formatMoney(s.wage)}/mês</p>
				<Button size="sm" variant="secondary" loading={busy} disabled={club.scouts.length >= club.infra.observacao.level} onclick={() => act({ action: 'olheiro-contratar', scoutId: s.id }, `${s.name} contratado.`)}>Contratar</Button>
			</article>
		{/each}
	</div>
	{#if club.scouts.length >= club.infra.observacao.level}<p class="muted small">Para ter mais olheiros, melhore a estrutura de observação (Clube → Estrutura).</p>{/if}
{:else}
	<div class="grid-auto" style="--min:260px">
		{#each reports as r, i (r.playerId + r.round)}
			{@const p = findPlayer(m.ctx, r.playerId)}
			{@const owner = currentClubOf(m.ctx, r.playerId)}
			<article class="report glass" data-verdict={r.verdict} use:reveal={{ index: i % 12 }}>
				<div class="spread"><span class="verdict">{r.verdict}</span>{#if owner}<Crest clubId={owner} size={26} />{/if}</div>
				<h3>{p?.name ?? r.playerId}</h3>
				<p class="muted small">{p ? `${p.position} · ${p.age} anos` : ''} · {owner ? (getClub(owner)?.name ?? owner) : 'sem clube'}</p>
				<div class="ranges"><div><span>Nível</span><b>{r.overall[0]}–{r.overall[1]}</b></div><div><span>Potencial</span><b>{r.potential[0]}–{r.potential[1]}</b></div></div>
				<p>{r.note}</p>
				<a class="link" href="/carreira/{c.id}/mercado">Abrir no mercado →</a>
			</article>
		{:else}
			<p class="muted glass pad">Contrate olheiros e defina missões: os relatórios chegam toda semana.</p>
		{/each}
	</div>
{/if}
{#if msg}<p class="msg" role="status">{msg}</p>{/if}

<style>
	.hero {
		padding: var(--sp-6);
		display: grid;
		gap: var(--sp-4);
		margin-bottom: var(--sp-4);
		background:
			radial-gradient(80% 120% at 100% 0%, rgb(34 211 238 / 0.1), transparent 60%),
			var(--glass);
	}
	h1 {
		font-size: var(--fs-3xl);
		margin: 6px 0;
	}
	.tabs {
		margin-bottom: var(--sp-4);
	}
	.pad {
		padding: var(--sp-5);
	}
	.youth,
	.scout,
	.report {
		padding: var(--sp-4);
		display: grid;
		gap: 8px;
		align-content: start;
	}
	h3 {
		margin: 0;
		font-size: var(--fs-md);
	}
	.ovr {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 2rem;
		line-height: 1;
	}
	.pos {
		font-size: 11px;
		font-weight: 800;
		padding: 2px 7px;
		border-radius: 6px;
		background: var(--emerald-soft);
		color: var(--emerald-strong);
	}
	.small {
		font-size: var(--fs-xs);
	}
	.prog {
		height: 6px;
		border-radius: 6px;
		background: rgb(231 237 240 / 0.08);
		overflow: hidden;
	}
	.prog i {
		display: block;
		height: 100%;
		background: linear-gradient(90deg, var(--emerald), #22d3ee);
	}
	.stars {
		color: var(--gold);
		letter-spacing: 2px;
	}
	.stars .off {
		color: rgb(231 237 240 / 0.15);
	}
	label {
		display: grid;
		gap: 4px;
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	select {
		background: var(--surface-sunken);
		color: var(--text);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-s);
		padding: 6px 8px;
	}
	input[type='range'] {
		accent-color: var(--emerald);
	}
	.section {
		margin: var(--sp-6) 0 var(--sp-3);
		font-size: var(--fs-2xl);
	}
	.verdict {
		font-size: 11px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		padding: 3px 8px;
		border-radius: 6px;
		background: rgb(231 237 240 / 0.08);
	}
	.report[data-verdict='recomendado'] .verdict {
		background: var(--emerald-soft);
		color: var(--emerald-strong);
	}
	.report[data-verdict='observar'] .verdict {
		background: var(--gold-soft);
		color: var(--gold);
	}
	.ranges {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.ranges div {
		display: grid;
		padding: 8px;
		border-radius: var(--radius-s);
		background: rgb(10 13 16 / 0.4);
	}
	.ranges span {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--text-3);
		font-weight: 700;
	}
	.report p {
		margin: 0;
	}
	.link {
		color: var(--emerald-strong);
		font-weight: 600;
		font-size: var(--fs-sm);
	}
	.msg {
		margin-top: var(--sp-4);
		color: var(--text-2);
	}
</style>
