<script lang="ts">
	import { sanitizeDiscipline, suspensionLabel } from '#lib/domain/discipline.ts';
	import { ATTRIBUTE_LABELS, GOALKEEPING, MENTAL, PHYSICAL, TECHNICAL, type AttributeKey } from '#lib/engine/attributes.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { formatMoney, ROLE_LABELS, wageDemand, type ContractRole, type RosterPlayer } from '#lib/domain/market.ts';
	import { POSITION_INFO, SECTOR_LABELS, type Sector } from '#lib/domain/positions.ts';
	import { formatSquadAge, MORALE_LABELS, sectorOf, visibleSquadAge } from '#lib/domain/squad.ts';
	import { FORMATIONS } from '#lib/domain/tactics.ts';
	import { reveal } from '#lib/motion/actions.ts';
	import { playerKit } from '#lib/pixel/kits.ts';
	import { clubAction } from '#lib/client/club.ts';
	import { pickBench } from '#lib/engine/teams.ts';
	import { MATCH_BENCH_SIZE } from '#lib/domain/tactics.ts';
	import Button from '#lib/ui/Button.svelte';
	import Pixel from '#lib/ui/Pixel.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';
	import PlayerCard from '#lib/ui/v4/PlayerCard.svelte';
	import Sheet from '#lib/ui/v4/Sheet.svelte';

	let { data } = $props();
	const c = $derived(data.career);
	// Disciplina: suspensões pendentes por competição e amarelos acumulados (registro do servidor).
	const discipline = $derived(sanitizeDiscipline(c.data.discipline, c.season));
	const suspensions = $derived(new Map(discipline.suspensions.map((s) => [s.playerId, `${suspensionLabel(s)} (${s.competition === 'copa-do-brasil' ? 'Copa do Brasil' : 'campeonato'})`])));
	const v = $derived(data.view);
	const m = $derived(data.manage);
	const coach = $derived(c.mode === 'coach');
	const fit = $derived(new Map(v.squad.map((p) => [p.id, p.condition])));
	/** Elenco com contrato (gestão) + condição física (semana). */
	const players = $derived(
		v.squad.map((p) => {
			const r = m.roster.find((x) => x.id === p.id);
			return { ...p, contract: r?.contract ?? null, value: r?.value ?? 0, loan: r?.loan } as typeof p & { contract: RosterPlayer['contract'] | null; value: number; loan?: RosterPlayer['loan'] };
		})
	);
	let view = $state<'campo' | 'cartoes' | 'lista'>('campo');
	let filter = $state<'todos' | Sector>('todos');
	let selectedId = $state<string | null>(null);
	let sheet = $state(false);
	const ORDER = ['GOL', 'LD', 'ZAG', 'LE', 'VOL', 'MC', 'MEI', 'PD', 'PE', 'ATA'];
	const list = $derived(players.filter((p) => filter === 'todos' || sectorOf(p.position) === filter).sort((a, b) => ORDER.indexOf(a.position) - ORDER.indexOf(b.position) || b.overall - a.overall));
	const shape = $derived(FORMATIONS[v.tactic.formation]);
	const slots = $derived(v.tactic.lineup.map((id, i) => ({ id, p: players.find((x) => x.id === id), x: shape[i]?.x ?? 50, y: shape[i]?.y ?? 50, pos: shape[i]?.position })));
	// Mesma relação da Central de Táticas: banco salvo ou, sem ele, o banco automático do motor.
	const benchIds = $derived(new Set((v.tactic.bench ?? pickBench(v.squad, v.tactic.lineup)).filter((id) => !v.tactic.lineup.includes(id))));
	const byOrder = (a: (typeof players)[number], b: (typeof players)[number]) => ORDER.indexOf(a.position) - ORDER.indexOf(b.position) || b.overall - a.overall;
	const bench = $derived(players.filter((p) => benchIds.has(p.id)).sort(byOrder));
	const reserves = $derived(players.filter((p) => !v.tactic.lineup.includes(p.id) && !benchIds.has(p.id)).sort(byOrder));
	const status = (id: string) => (v.tactic.lineup.includes(id) ? 'Titular' : benchIds.has(id) ? 'Banco' : 'Fora da relação');
	const sel = $derived(players.find((p) => p.id === selectedId) ?? null);
	const avg = (k: 'age' | 'overall') => Math.round(players.reduce((s, p) => s + p[k], 0) / Math.max(1, players.length));
	const wages = $derived(players.reduce((s, p) => s + (p.contract?.wage ?? 0), 0));

	// renovação
	let wage = $state(0);
	let years = $state(3);
	let role = $state<ContractRole>('rotacao');
	let busy = $state(false);
	let msg = $state('');
	let confirmRelease = $state(false);
	function open(id: string) {
		selectedId = id;
		const p = players.find((x) => x.id === id);
		if (p?.contract) {
			role = p.contract.role;
			years = p.age >= 31 ? 2 : 3;
			wage = wageDemand(p, m.tier, v.club.reputation, role, years);
		}
		msg = '';
		confirmRelease = false;
		sheet = true;
	}
	async function act(body: Record<string, unknown>) {
		busy = true;
		msg = '';
		try {
			msg = (await clubAction(c.id, c.version, body)).message;
			if (body.action === 'rescindir') sheet = false;
		} catch (e) {
			msg = (e as Error).message;
		} finally {
			busy = false;
		}
	}
	const groups: Array<[string, readonly AttributeKey[]]> = [
		['Técnica', TECHNICAL],
		['Físico', PHYSICAL],
		['Mental', MENTAL],
		['Goleiro', GOALKEEPING]
	];
	const contractLabel = (p: (typeof players)[number]) => (p.loan ? `Emprestado pelo ${getClub(p.loan.from)?.short ?? p.loan.from} até ${p.loan.until}` : p.contract ? `${ROLE_LABELS[p.contract.role]} · até ${p.contract.until}` : '');
</script>

<svelte:head><title>Elenco · {v.club.name} · BRASFC</title></svelte:head>

<div class="head" use:reveal>
	<div>
		<span class="eyebrow">{v.club.name}</span>
		<h1 class="display">Elenco</h1>
		<p class="split-count"><span class="sit st">{v.tactic.lineup.length} titulares</span><span class="sit bn">{bench.length} no banco</span><span class="sit out">{reserves.length} fora da relação</span></p>
		<p class="muted">{players.length} atletas · idade média {avg('age')} · nível médio {avg('overall')}{coach ? ` · folha ${formatMoney(wages)}/mês` : ''} · nomes fictícios do universo BRASFC</p>
	</div>
	<div class="tools">
		<Segmented label="Visão" bind:value={view} options={[{ value: 'campo', label: 'Campo' }, { value: 'cartoes', label: 'Cartões' }, { value: 'lista', label: 'Lista' }]} />
		{#if view !== 'campo'}
			<Segmented label="Setor" bind:value={filter} options={[{ value: 'todos', label: 'Todos' }, ...(['goleiro', 'defesa', 'meio', 'ataque'] as const).map((s) => ({ value: s, label: SECTOR_LABELS[s] }))]} />
		{/if}
	</div>
</div>

{#if view === 'campo'}
	<div class="campo">
		<div class="pitch glass" aria-label="Titulares no {v.tactic.formation}">
			<div class="lines"><i class="mid"></i><i class="circle"></i><i class="box top"></i><i class="box bottom"></i></div>
			{#each slots as s (s.id)}
				{#if s.p}
					<button class="chip-p" style="left:{s.x}%;top:{s.y}%" onclick={() => open(s.id)} data-umx-press>
						<span class="o">{s.p.overall}</span>
						<span class="n" title={s.p.name}>{s.p.shortName}</span>
						<span class="ps">{s.pos}{visibleSquadAge(s.p) !== null ? ` · ${visibleSquadAge(s.p)}a` : ''}</span>
						{#if suspensions.get(s.id)}<span class="susp" title={suspensions.get(s.id)}>SUSP</span>{/if}
						<i class="cond" style="--c:{fit.get(s.id) ?? 95}%" class:low={(fit.get(s.id) ?? 95) < 75}></i>
					</button>
				{/if}
			{/each}
			<span class="form display">{v.tactic.formation}</span>
		</div>
		<aside class="bench">
			{#each [{ key: 'banco', title: 'Banco', hint: `${bench.length}/${MATCH_BENCH_SIZE} relacionados · podem entrar no jogo`, rows: bench }, { key: 'fora', title: 'Fora da relação', hint: `${reserves.length} atletas · não vão para a partida`, rows: reserves }] as group (group.key)}
				<section class="group {group.key}">
					<header><h2 class="display">{group.title}</h2><small>{group.hint}</small></header>
					<div class="blist">
						{#each group.rows as p (p.id)}
							<button class="brow" onclick={() => open(p.id)} data-umx-press>
								<span class="ps">{p.position}</span><span class="nm" title={p.name}>{p.name}{visibleSquadAge(p) !== null ? ` · ${visibleSquadAge(p)} anos` : ''}</span>
								<i class="cond mini" style="--c:{fit.get(p.id) ?? 95}%" class:low={(fit.get(p.id) ?? 95) < 75} title="Condição {fit.get(p.id) ?? 95}%"></i>
								<b>{p.overall}</b>
								{#if p.contract && p.contract.until <= c.season}<span class="warn" title="Contrato termina nesta temporada">●</span>{/if}
								{#if suspensions.get(p.id)}<span class="susp" title={suspensions.get(p.id)}>SUSP</span>{/if}
							</button>
						{:else}<p class="muted none">Nenhum atleta.</p>{/each}
					</div>
				</section>
			{/each}
			{#if coach}<a class="link" href="/carreira/{c.id}/taticas">Mudar titulares, banco e esquema →</a>{/if}
		</aside>
	</div>
{:else if view === 'cartoes'}
	<div class="grid-auto" style="--min:220px">
		{#each list as p, i (p.id)}
			<div use:reveal={{ index: i % 12 }}>
				<PlayerCard
					name={p.name}
					position={p.position}
					age={visibleSquadAge(p)}
					overall={p.overall}
					potential={p.age <= 23 ? p.potential : null}
					value={coach ? p.value : null}
					contract={contractLabel(p)}
					selected={sheet && selectedId === p.id}
					tags={[status(p.id), ...(p.contract && p.contract.until <= c.season ? ['Contrato acaba'] : []), ...(m.market.listed.includes(p.id) ? ['À venda'] : []), ...((fit.get(p.id) ?? 95) < 75 ? ['Cansado'] : [])]}
					onclick={() => open(p.id)}
				/>
			</div>
		{/each}
	</div>
{:else}
	<div class="glass tablewrap">
		<table>
			<thead><tr><th>Nº</th><th>Atleta</th><th>Pos.</th><th>Situação</th><th>Idade</th><th>Nível</th><th>Condição</th><th>Moral</th>{#if coach}<th>Salário</th><th>Contrato</th><th class="r">Valor</th>{/if}</tr></thead>
			<tbody>
				{#each list as p (p.id)}
					<tr onclick={() => open(p.id)} class:starter={v.tactic.lineup.includes(p.id)}>
						<td class="num">{p.number}</td><td><strong>{p.name}</strong></td><td>{p.position}</td><td><span class="sit {status(p.id) === 'Titular' ? 'st' : status(p.id) === 'Banco' ? 'bn' : 'out'}">{status(p.id)}</span></td><td class="num">{visibleSquadAge(p) ?? '—'}</td><td class="num"><b>{p.overall}</b></td>
						<td><i class="bar" style="--c:{fit.get(p.id) ?? 95}%" class:low={(fit.get(p.id) ?? 95) < 75}></i></td>
						<td>{MORALE_LABELS[p.morale]}</td>
						{#if coach}<td class="num">{p.contract ? formatMoney(p.contract.wage) : '—'}</td><td class:warn={!!p.contract && p.contract.until <= c.season}>{p.contract?.until ?? '—'}</td><td class="r num">{formatMoney(p.value)}</td>{/if}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<Sheet bind:open={sheet} title={sel?.name ?? ''} subtitle={sel ? `#${sel.number} · ${POSITION_INFO[sel.position].label} · ${formatSquadAge(visibleSquadAge(sel))}${sel.archetype ? ` · ${sel.archetype}` : ''}` : ''} width={520}>
	{#if sel}
		<div class="top">
			<Pixel variant="full" appearance={sel.appearance} kit={playerKit(c.clubId, sel.position)} size={120} />
			<dl class="facts">
				<div><dt>Nível</dt><dd>{sel.overall}</dd></div>
				<div><dt>Potencial</dt><dd>{sel.potential}</dd></div>
				<div><dt>Condição</dt><dd>{fit.get(sel.id) ?? 95}%</dd></div>
				<div><dt>Moral</dt><dd>{MORALE_LABELS[sel.morale]}</dd></div>
				{#if coach}<div><dt>Valor</dt><dd>{formatMoney(sel.value)}</dd></div>{/if}
				{#if sel.contract}<div><dt>Salário</dt><dd>{formatMoney(sel.contract.wage)}</dd></div>{/if}
			</dl>
		</div>
		{#if sel.contract || sel.loan}<p class="contract">{contractLabel(sel)}</p>{/if}
		<div class="attrs">
			{#each groups as [label, keys] (label)}
				{#if label !== 'Goleiro' || sel.position === 'GOL'}
					<div class="ag">
						<h3>{label}</h3>
						{#each keys as k (k)}
							<div class="at"><span>{ATTRIBUTE_LABELS[k]}</span><i style="--v:{sel.attributes[k]}%" class:hi={sel.attributes[k] >= 75} class:lo={sel.attributes[k] < 50}></i><b>{Math.round(sel.attributes[k])}</b></div>
						{/each}
					</div>
				{/if}
			{/each}
		</div>
		{#if coach && sel.contract && !sel.loan && sel.id !== 'eu'}
			<div class="renew glass">
				<h3>Renovar contrato</h3>
				<p class="muted small">O atleta pede cerca de <b>{formatMoney(wageDemand(sel, m.tier, v.club.reputation, role, years))}</b>/mês nestas condições.</p>
				<label>Salário <span class="out">{formatMoney(wage)}</span><input type="range" min={Math.round(sel.contract.wage * 0.6)} max={Math.round(Math.max(sel.contract.wage, 5000) * 2.5)} step="500" bind:value={wage} /></label>
				<label>Duração <span class="out">{years} temporada{years > 1 ? 's' : ''}</span><input type="range" min="1" max="5" bind:value={years} /></label>
				<label>Participação <select bind:value={role}>{#each Object.entries(ROLE_LABELS) as [k, l] (k)}<option value={k}>{l}</option>{/each}</select></label>
				<Button variant="primary" loading={busy} onclick={() => act({ action: 'renovar', playerId: sel.id, wage, years, role })}>Propor renovação</Button>
			</div>
		{/if}
		{#if msg}<p class="msg" role="status">{msg}</p>{/if}
	{/if}
	{#snippet footer()}
		{#if coach && sel && sel.id !== 'eu'}
			<Button variant="ghost" disabled={busy} onclick={() => act({ action: 'listar', playerId: sel.id })}>{m.market.listed.includes(sel.id) ? 'Retirar da venda' : 'Pôr à venda'}</Button>
			{#if confirmRelease}
				<Button variant="danger" loading={busy} onclick={() => act({ action: 'rescindir', playerId: sel.id })}>{sel.loan ? 'Confirmar devolução' : 'Confirmar rescisão'}</Button>
			{:else}
				<Button variant="ghost" disabled={busy} onclick={() => (confirmRelease = true)}>{sel.loan ? 'Devolver empréstimo' : 'Rescindir'}</Button>
			{/if}
		{/if}
	{/snippet}
</Sheet>

<style>
	.susp { margin-left: 4px; padding: 0 5px; border-radius: 5px; background: #b91c1c; color: #fff; font: 700 0.7rem/1.5 inherit; }
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: var(--sp-4);
		flex-wrap: wrap;
		margin-bottom: var(--sp-4);
	}
	h1 {
		font-size: var(--fs-3xl);
		margin: 4px 0;
	}
	.tools {
		display: flex;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}
	.campo {
		display: grid;
		grid-template-columns: minmax(0, 1.5fr) minmax(260px, 1fr);
		gap: var(--sp-4);
	}
	.pitch {
		position: relative;
		aspect-ratio: 68 / 80;
		max-height: 74vh;
		overflow: hidden;
		background:
			repeating-linear-gradient(180deg, rgb(255 255 255 / 0.025) 0 10%, transparent 10% 20%),
			radial-gradient(80% 60% at 50% 40%, #1d5a3c, #123a28 70%, #0e2c1f);
	}
	.lines i {
		position: absolute;
		border: 2px solid rgb(255 255 255 / 0.14);
	}
	.lines .mid {
		left: 4%;
		right: 4%;
		top: 50%;
		border-width: 2px 0 0;
	}
	.lines .circle {
		left: 50%;
		top: 50%;
		width: 22%;
		aspect-ratio: 1;
		border-radius: 50%;
		translate: -50% -50%;
	}
	.lines .box {
		left: 25%;
		right: 25%;
		height: 14%;
	}
	.lines .top {
		top: 2%;
		border-top: 0;
	}
	.lines .bottom {
		bottom: 2%;
		border-bottom: 0;
	}
	.chip-p {
		position: absolute;
		translate: -50% -50%;
		display: grid;
		grid-template-columns: auto auto;
		grid-template-rows: auto auto auto;
		column-gap: 6px;
		align-items: center;
		padding: 6px 10px 5px;
		min-width: 92px;
		border-radius: 12px;
		border: 1px solid rgb(255 255 255 / 0.14);
		background: rgb(10 14 17 / 0.78);
		backdrop-filter: blur(4px);
		color: var(--text);
		cursor: pointer;
		transition: left 0.6s var(--ease-out), top 0.6s var(--ease-out), box-shadow 0.2s;
		font: inherit;
	}
	.chip-p:hover {
		box-shadow: var(--glow-emerald);
	}
	.chip-p .o {
		grid-row: 1 / 3;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 1.35rem;
	}
	.chip-p .n {
		font-weight: 700;
		font-size: var(--fs-xs);
		white-space: nowrap;
		max-width: 90px;
		overflow: hidden;
		text-overflow: ellipsis;
		text-align: left;
	}
	.chip-p .ps {
		font-size: 11px;
		font-weight: 800;
		color: var(--emerald-strong);
		text-align: left;
	}
	.cond,
	.bar {
		grid-column: 1 / -1;
		display: block;
		height: 3px;
		margin-top: 4px;
		border-radius: 3px;
		background: linear-gradient(90deg, var(--emerald) var(--c), rgb(255 255 255 / 0.1) var(--c));
	}
	.cond.low,
	.bar.low {
		background: linear-gradient(90deg, var(--gold) var(--c), rgb(255 255 255 / 0.1) var(--c));
	}
	.bar {
		width: 80px;
	}
	.form {
		position: absolute;
		right: 14px;
		bottom: 10px;
		font-size: var(--fs-xl);
		color: rgb(255 255 255 / 0.3);
	}
	.bench {
		display: grid;
		gap: var(--sp-3);
		align-content: start;
	}
	.group { display: grid; gap: 8px; padding: 12px; border-radius: var(--radius-l); border: 1px solid var(--line); background: var(--card-bg); }
	.group.banco { border-color: var(--emerald-line); }
	.group.fora { background: var(--surface-sunken); }
	.group header { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
	.group h2 { margin: 0; font-size: var(--fs-xl); }
	.group header small { color: var(--text-3); font-size: var(--fs-xs); }
	.fora .brow { opacity: 0.82; }
	.none { margin: 0; font-size: var(--fs-sm); }
	.blist {
		display: grid;
		gap: 4px;
		max-height: 34vh;
		overflow: auto;
	}
	.cond.mini { grid-column: auto; width: 34px; margin-top: 0; }
	.split-count { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 4px; }
	.sit { display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 99px; font-size: var(--fs-xs); font-weight: 700; white-space: nowrap; }
	.sit.st { background: var(--emerald-soft); color: var(--emerald-strong); }
	.sit.bn { background: var(--info-soft); color: var(--info); }
	.sit.out { background: rgb(231 237 240 / 0.06); color: var(--text-3); }
	.brow {
		display: grid;
		grid-template-columns: 40px minmax(0, 1fr) auto auto auto;
		gap: 8px;
		align-items: center;
		padding: 8px 10px;
		border-radius: var(--radius-m);
		border: 1px solid var(--line);
		background: rgb(231 237 240 / 0.03);
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.brow:hover {
		border-color: var(--emerald-line);
	}
	.brow .ps {
		font-size: 11px;
		font-weight: 800;
		color: var(--emerald-strong);
	}
	.nm {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.warn {
		color: var(--gold);
	}
	.link {
		color: var(--emerald-strong);
		font-weight: 600;
		font-size: var(--fs-sm);
	}
	.tablewrap {
		overflow: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--fs-sm);
	}
	th {
		text-align: left;
		padding: 10px;
		color: var(--text-3);
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	td {
		padding: 9px 10px;
		border-top: 1px solid var(--line);
	}
	tr {
		cursor: pointer;
	}
	tbody tr:hover {
		background: rgb(231 237 240 / 0.03);
	}
	tr.starter td:first-child {
		box-shadow: inset 3px 0 0 var(--emerald);
	}
	.r {
		text-align: right;
	}
	.top {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--sp-4);
		align-items: center;
	}
	.facts {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		margin: 0;
	}
	.facts div {
		padding: 8px;
		border-radius: var(--radius-s);
		background: rgb(10 13 16 / 0.4);
	}
	dt {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--text-3);
		font-weight: 700;
	}
	dd {
		margin: 0;
		font-weight: 700;
	}
	.contract {
		margin: var(--sp-3) 0;
		color: var(--text-2);
	}
	.attrs {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-4);
		margin: var(--sp-4) 0;
	}
	.ag h3,
	.renew h3 {
		margin: 0 0 6px;
		font-size: 11px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.at {
		display: grid;
		grid-template-columns: 1fr 70px 26px;
		gap: 6px;
		align-items: center;
		font-size: var(--fs-xs);
		color: var(--text-2);
		padding: 2px 0;
	}
	.at i {
		height: 5px;
		border-radius: 5px;
		background: linear-gradient(90deg, var(--emerald) var(--v), rgb(255 255 255 / 0.08) var(--v));
	}
	.at i.hi {
		background: linear-gradient(90deg, var(--gold) var(--v), rgb(255 255 255 / 0.08) var(--v));
	}
	.at i.lo {
		background: linear-gradient(90deg, var(--danger) var(--v), rgb(255 255 255 / 0.08) var(--v));
	}
	.at b {
		text-align: right;
		color: var(--text);
	}
	.renew {
		padding: var(--sp-4);
		display: grid;
		gap: 10px;
	}
	.renew label {
		display: grid;
		gap: 4px;
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.out {
		float: right;
		color: var(--text);
		font-weight: 700;
	}
	input[type='range'] {
		accent-color: var(--emerald);
	}
	select {
		background: var(--surface-sunken);
		color: var(--text);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-s);
		padding: 6px 8px;
	}
	.small {
		font-size: var(--fs-xs);
	}
	.msg {
		margin-top: var(--sp-3);
		color: var(--text-2);
	}
	@media (max-width: 1000px) {
		.campo {
			grid-template-columns: 1fr;
		}
		.attrs {
			grid-template-columns: 1fr;
		}
	}
</style>
