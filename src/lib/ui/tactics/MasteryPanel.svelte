<script lang="ts">
	import { onMount } from 'svelte';
	import { MASTERY_LABEL, teamMastery, type TacticalState } from '#lib/domain/tactical.ts';
	import { FORMATION_IDS, STYLE_LABELS, type FormationId, type PlayStyle, type Slot } from '#lib/domain/tactics.ts';
	import type { SquadPlayer } from '#lib/domain/squad.ts';
	import type { TacticalInstructions } from '#lib/engine/instructions.ts';
	import { ROLES, type RoleId } from '#lib/engine/roles.ts';
	import { count, indicator } from '#lib/motion/actions.ts';
	import { animate } from '#lib/motion/motion.svelte.ts';
	import Icon from '../Icon.svelte';

	/**
	 * Domínio tático: o quanto o time sabe executar o plano atual, como evoluiu jogo a jogo
	 * (histórico real), a comparação entre formações (sem mexer na tática em edição) e o
	 * domínio individual de cada titular. Todos os números vêm do estado tático salvo.
	 */
	let {
		state: st,
		mastery,
		formation,
		style,
		lineup = [],
		roles = [],
		slots = [],
		squad = [],
		instructions,
		onformation
	}: {
		state: TacticalState;
		mastery: { formation: number; style: number; instructions: number; cohesion: number; execution: number };
		formation: FormationId;
		style: PlayStyle;
		lineup?: string[];
		roles?: RoleId[];
		slots?: readonly Slot[];
		squad?: SquadPlayer[];
		instructions?: TacticalInstructions;
		onformation?: (f: FormationId) => void;
	} = $props();

	type Tab = 'geral' | 'formacoes' | 'atletas';
	let tab = $state<Tab>('geral');
	let body = $state<HTMLElement>();
	let ready = $state(false);
	onMount(() => requestAnimationFrame(() => (ready = true)));
	const w = (v: number) => (ready ? Math.max(0, Math.min(100, v)) : 0);

	const tone = (v: number) => (v >= 70 ? 'hi' : v >= 45 ? 'mid' : 'lo');
	const rows = $derived([
		{ key: 'f', label: `Formação ${formation}`, v: mastery.formation, tip: 'Cresce jogando e treinando o mesmo esquema. Pesa 35% na execução.' },
		{ key: 's', label: `Estilo: ${STYLE_LABELS[style]}`, v: mastery.style, tip: 'Familiaridade com o estilo de jogo. Cresce com jogos e treinos do mesmo estilo. Pesa 25%.' },
		{ key: 'i', label: 'Compreensão das instruções', v: mastery.instructions, tip: 'Cai um pouco a cada instrução alterada e volta com o tempo. Pesa 15%.' },
		{ key: 'c', label: 'Entrosamento dos titulares', v: mastery.cohesion, tip: 'Quem joga junto se entende melhor; novatos começam baixo. Pesa 25%.' }
	]);
	const history = $derived(st.history.slice(-20));
	const exec = $derived(history.map((h) => h.execution));
	const trend = $derived(exec.length >= 2 ? Math.round(exec[exec.length - 1] - exec[0]) : 0);

	const best = $derived(FORMATION_IDS.reduce((a, b) => ((st.formations[b] ?? 0) > (st.formations[a] ?? 0) ? b : a), formation));
	/** Jogos estimados para uma formação alcançar a mais dominada (mesma curva do aprendizado por jogo). */
	function adaptGames(f: FormationId) {
		let v = st.formations[f] ?? 20;
		const target = (st.formations[best] ?? 20) - 2;
		let n = 0;
		while (v < target && n < 99) {
			v += 3.2 * Math.pow(1 - v / 100, 1.3);
			n++;
		}
		return n;
	}

	// Comparação: escolher uma formação aqui NÃO altera a tática em edição.
	let compare = $state<FormationId | null>(null);
	const cmp = $derived(compare ?? formation);
	const cmpMastery = $derived(teamMastery(st, cmp, style, lineup, instructions));
	const delta = (a: number, b: number) => Math.round(a - b);

	const byId = $derived(new Map(squad.map((p) => [p.id, p])));
	const athletes = $derived(
		lineup.map((id, i) => {
			const p = byId.get(id);
			const role = roles[i];
			return { id, p, pos: slots[i]?.position ?? '', role, roleV: role ? (st.roles[id]?.[role] ?? 0) : 0, integ: st.integration[id] ?? 15 };
		})
	);
	const rolesKnown = $derived(athletes.filter((a) => a.roleV >= 65).length);

	function go(t: Tab) {
		if (t === tab) return;
		tab = t;
		requestAnimationFrame(() => {
			if (body) void animate(body, { opacity: 1, y: 0 }, { spring: 'gentle', from: { opacity: 0, y: 8 } });
		});
	}
	const R = 34;
	const C = 2 * Math.PI * R;
</script>

<div class="mp">
	<div class="tabs" role="tablist" aria-label="Domínio tático">
		<span class="ind" use:indicator={{ axis: 'x', key: tab }}></span>
		<button role="tab" aria-selected={tab === 'geral'} onclick={() => go('geral')}>Visão geral</button>
		<button role="tab" aria-selected={tab === 'formacoes'} onclick={() => go('formacoes')}>Formações</button>
		<button role="tab" aria-selected={tab === 'atletas'} onclick={() => go('atletas')}>Atletas <span class="pill">{rolesKnown}/{lineup.length}</span></button>
	</div>

	<div class="body" bind:this={body}>
		{#if tab === 'geral'}
			<div class="overview">
				<div class="ring" title="Execução do plano: média ponderada das quatro barras ao lado">
					<svg viewBox="0 0 80 80" aria-hidden="true">
						<circle class="bg" cx="40" cy="40" r={R} />
						<circle class="fg {tone(mastery.execution)}" cx="40" cy="40" r={R} stroke-dasharray={C} stroke-dashoffset={C * (1 - w(mastery.execution) / 100)} />
					</svg>
					<span class="big" use:count={{ value: Math.round(mastery.execution) }}>{Math.round(mastery.execution)}</span>
				</div>
				<div class="what">
					<strong>{MASTERY_LABEL(mastery.execution)}</strong>
					<p>Execução do plano em campo: posicionamento, sincronia e leitura das instruções. Não garante resultado — melhora a qualidade das decisões.</p>
				</div>
			</div>
			<div class="bars">
				{#each rows as r (r.key)}
					<div class="bar" role="group" aria-label="{r.label}: {Math.round(r.v)}. {r.tip}">
						<div class="bl"><span class="l">{r.label}</span><span class="n">{Math.round(r.v)}</span></div>
						<span class="track"><span class="fill {tone(r.v)}" style="width:{w(r.v)}%"></span></span>
						<span class="tip" role="tooltip">{r.tip}</span>
					</div>
				{/each}
			</div>
			<div class="evo">
				<div class="evh">
					<span>Evolução da execução</span>
					{#if exec.length >= 2}<span class="tr" class:up={trend > 0} class:down={trend < 0}>{trend > 0 ? '▲' : trend < 0 ? '▼' : '='} {trend > 0 ? '+' : ''}{trend} em {exec.length} jogos</span>{/if}
				</div>
				{#if exec.length >= 2}
					<svg viewBox="0 0 200 50" preserveAspectRatio="none" role="img" aria-label="Execução nos últimos {exec.length} jogos: de {exec[0]} para {exec[exec.length - 1]}">
						<polyline class="area" points="0,50 {exec.map((e, i) => `${(i / (exec.length - 1)) * 200},${46 - (e / 100) * 42}`).join(' ')} 200,50" />
						<polyline class="line" points={exec.map((e, i) => `${(i / (exec.length - 1)) * 200},${46 - (e / 100) * 42}`).join(' ')} />
						{#each history as h, i (i)}
							<circle cx={(i / (exec.length - 1)) * 200} cy={46 - (h.execution / 100) * 42} r="2.6" class={h.goalsFor > h.goalsAgainst ? 'w' : h.goalsFor < h.goalsAgainst ? 'l' : 'd'}><title>{h.season} · rodada {h.round} · {h.formation} · {h.goalsFor}×{h.goalsAgainst} · execução {h.execution}</title></circle>
						{/each}
					</svg>
					<div class="legend"><span><i class="w"></i>vitória</span><span><i class="d"></i>empate</span><span><i class="l"></i>derrota</span></div>
				{:else}
					<p class="empty">O gráfico aparece depois de dois jogos oficiais com o plano registrado.</p>
				{/if}
			</div>
		{:else if tab === 'formacoes'}
			<p class="note">Toque numa formação para comparar. A tática em edição só muda se você escolher <em>Usar</em>.</p>
			<div class="forms" role="radiogroup" aria-label="Comparar formações">
				{#each FORMATION_IDS as f (f)}
					{@const v = st.formations[f] ?? 0}
					<button class="f" role="radio" aria-checked={f === cmp} class:cur={f === formation} onclick={() => (compare = f === formation ? null : f)} title="{f}: domínio {Math.round(v)}">
						<span class="col"><span class="fill {tone(v)}" style="height:{w(v)}%"></span></span>
						<span class="fl">{f}</span>
						<span class="fn">{Math.round(v)}</span>
						{#if f === formation}<span class="now">atual</span>{/if}
					</button>
				{/each}
			</div>
			<div class="cmp">
				<div class="cmph">
					<strong>{cmp}</strong>
					{#if cmp !== formation}<span class="muted">comparado ao {formation} atual</span>{:else}<span class="muted">formação em edição</span>{/if}
				</div>
				<div class="cmpgrid">
					{#each [{ l: 'Formação', a: cmpMastery.formation, b: mastery.formation }, { l: 'Estilo', a: cmpMastery.style, b: mastery.style }, { l: 'Instruções', a: cmpMastery.instructions, b: mastery.instructions }, { l: 'Entrosamento', a: cmpMastery.cohesion, b: mastery.cohesion }, { l: 'Execução', a: cmpMastery.execution, b: mastery.execution }] as c (c.l)}
						<div class="cm" class:total={c.l === 'Execução'}>
							<span>{c.l}</span>
							<b>{Math.round(c.a)}</b>
							{#if cmp !== formation && delta(c.a, c.b) !== 0}<small class:up={c.a > c.b} class:down={c.a < c.b}>{c.a > c.b ? '+' : ''}{delta(c.a, c.b)}</small>{/if}
						</div>
					{/each}
				</div>
				{#if cmp !== best && adaptGames(cmp) > 0}
					<p class="adapt"><Icon name="clock" size={14} /> O time domina mais o <strong>{best}</strong> ({Math.round(st.formations[best] ?? 0)}). No {cmp}, a adaptação leva cerca de <strong>{adaptGames(cmp)} jogo(s)</strong>; o que foi aprendido não se perde de uma vez.</p>
				{:else if cmp === best}
					<p class="adapt good"><Icon name="check" size={14} /> {cmp} é a formação mais dominada pelo elenco.</p>
				{/if}
				{#if cmp !== formation && onformation}
					<button class="use" onclick={() => { onformation?.(cmp); compare = null; }}>Usar {cmp} <Icon name="arrowRight" size={14} /></button>
				{/if}
			</div>
		{:else}
			<p class="note">Domínio de cada titular na função escolhida e o entrosamento com o grupo (65+ = função dominada).</p>
			<ul class="ath">
				{#each athletes as a (a.id)}
					<li>
						<span class="pos">{a.pos}</span>
						<span class="who"><strong>{a.p?.shortName ?? '—'}</strong><small>{a.role ? ROLES[a.role]?.label : ''}</small></span>
						<span class="mini" title="Domínio da função: {Math.round(a.roleV)}"><span class="track"><span class="fill {tone(a.roleV)}" style="width:{w(a.roleV)}%"></span></span><b>{Math.round(a.roleV)}</b></span>
						<span class="mini" title="Entrosamento: {Math.round(a.integ)}"><span class="track"><span class="fill alt" style="width:{w(a.integ)}%"></span></span><b>{Math.round(a.integ)}</b></span>
					</li>
				{/each}
			</ul>
			<div class="athlegend"><span><i class="fn-k"></i>Função</span><span><i class="in-k"></i>Entrosamento</span></div>
		{/if}
	</div>
</div>

<style>
	.mp {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.tabs {
		position: relative;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 4px;
		padding: 4px;
		border-radius: 12px;
		background: var(--surface-sunken);
	}
	.tabs .ind {
		position: absolute;
		top: 4px;
		bottom: 4px;
		left: 0;
		border-radius: 9px;
		background: var(--surface-3);
		pointer-events: none;
	}
	.tabs button {
		position: relative;
		z-index: 1;
		min-height: 34px;
		border: 0;
		background: none;
		color: var(--text-3);
		font: inherit;
		font-size: var(--fs-sm);
		font-weight: 700;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
	}
	.tabs button[aria-selected='true'] {
		color: var(--text);
	}
	.pill {
		font-size: 11px;
		padding: 0 6px;
		border-radius: 9px;
		background: var(--surface-2);
		color: var(--text-2);
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-height: 0;
	}
	.overview {
		display: flex;
		gap: 14px;
		align-items: center;
	}
	.ring {
		position: relative;
		flex: none;
		width: 92px;
		height: 92px;
		display: grid;
		place-items: center;
	}
	.ring svg {
		position: absolute;
		inset: 0;
		rotate: -90deg;
	}
	.ring circle {
		fill: none;
		stroke-width: 7;
	}
	.ring .bg {
		stroke: var(--surface-3);
	}
	.ring .fg {
		stroke-linecap: round;
		transition: stroke-dashoffset 0.9s cubic-bezier(0.2, 0.85, 0.25, 1);
	}
	.fg.hi {
		stroke: var(--emerald);
	}
	.fg.mid {
		stroke: var(--gold);
	}
	.fg.lo {
		stroke: var(--danger);
	}
	.big {
		font-family: var(--font-display);
		font-size: 34px;
		font-weight: 800;
		color: var(--text);
	}
	.what strong {
		font-size: var(--fs-md, 17px);
	}
	.what p {
		margin: 3px 0 0;
		font-size: var(--fs-xs);
		color: var(--text-3);
		line-height: 1.45;
	}
	.bars {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
		gap: 10px 16px;
	}
	.bar {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 5px;
		outline: none;
		border-radius: 6px;
	}
	.bl {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		font-size: var(--fs-xs);
	}
	.l {
		color: var(--text-2);
	}
	.n {
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}
	.track {
		display: block;
		height: 7px;
		border-radius: 4px;
		background: var(--surface-3);
		overflow: hidden;
	}
	.fill {
		display: block;
		height: 100%;
		border-radius: 4px;
		transition: width 0.8s cubic-bezier(0.2, 0.85, 0.25, 1), height 0.8s cubic-bezier(0.2, 0.85, 0.25, 1);
	}
	.fill.hi {
		background: linear-gradient(90deg, #0d9466, var(--emerald));
	}
	.fill.mid {
		background: linear-gradient(90deg, #b9893f, var(--gold));
	}
	.fill.lo {
		background: linear-gradient(90deg, #b23b3b, var(--danger));
	}
	.fill.alt {
		background: linear-gradient(90deg, #3b6fb6, #60a5fa);
	}
	.tip {
		position: absolute;
		left: 0;
		right: 0;
		top: calc(100% + 6px);
		z-index: 5;
		padding: 7px 9px;
		border-radius: 8px;
		background: var(--surface-3);
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
		font-size: var(--fs-xs);
		color: var(--text-2);
		line-height: 1.4;
		opacity: 0;
		translate: 0 -4px;
		pointer-events: none;
		transition: opacity 0.15s, translate 0.15s;
	}
	.bar:hover .tip,
	.bar:focus-visible .tip {
		opacity: 1;
		translate: 0 0;
	}
	.evo {
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--surface-2);
	}
	.evh {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		font-size: var(--fs-xs);
		color: var(--text-2);
		margin-bottom: 6px;
	}
	.tr {
		font-weight: 700;
		color: var(--text-3);
	}
	.tr.up,
	small.up {
		color: var(--emerald-strong);
	}
	.tr.down,
	small.down {
		color: var(--danger);
	}
	.evo svg {
		width: 100%;
		height: 64px;
		overflow: visible;
	}
	.evo .area {
		fill: color-mix(in srgb, var(--emerald) 12%, transparent);
		stroke: none;
	}
	.evo .line {
		fill: none;
		stroke: var(--emerald);
		stroke-width: 1.6;
		vector-effect: non-scaling-stroke;
	}
	.evo circle.w,
	.legend i.w {
		fill: var(--emerald);
		background: var(--emerald);
	}
	.evo circle.d,
	.legend i.d {
		fill: var(--gold);
		background: var(--gold);
	}
	.evo circle.l,
	.legend i.l {
		fill: var(--danger);
		background: var(--danger);
	}
	.legend,
	.athlegend {
		display: flex;
		gap: 12px;
		font-size: 11px;
		color: var(--text-3);
		margin-top: 4px;
	}
	.legend i,
	.athlegend i {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		margin-right: 4px;
	}
	.fn-k {
		background: var(--emerald);
	}
	.in-k {
		background: #60a5fa;
	}
	.empty,
	.note {
		margin: 0;
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.forms {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(58px, 1fr));
		gap: 6px;
	}
	.f {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 8px 2px 6px;
		border: 1px solid transparent;
		border-radius: 10px;
		background: var(--surface-2);
		color: var(--text-2);
		font: inherit;
		cursor: pointer;
		transition: border-color 0.2s, transform 0.2s;
	}
	.f:hover {
		transform: translateY(-2px);
	}
	.f[aria-checked='true'] {
		border-color: var(--emerald);
		color: var(--text);
		background: linear-gradient(180deg, rgb(16 185 129 / 0.14), var(--surface-2));
	}
	.f.cur:not([aria-checked='true']) {
		border-color: var(--line-strong);
	}
	.col {
		display: flex;
		align-items: flex-end;
		width: 12px;
		height: 56px;
		border-radius: 5px;
		background: var(--surface-3);
		overflow: hidden;
	}
	.col .fill {
		width: 100%;
	}
	.fl {
		font-size: 11px;
		font-weight: 800;
		white-space: nowrap;
	}
	.fn {
		font-size: 10.5px;
		color: var(--text-3);
	}
	.now {
		position: absolute;
		top: -7px;
		font-size: 9px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0 5px;
		border-radius: 6px;
		background: var(--emerald);
		color: #06281c;
	}
	.cmp {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px;
		border-radius: 12px;
		background: var(--surface-2);
	}
	.cmph {
		display: flex;
		align-items: baseline;
		gap: 8px;
		flex-wrap: wrap;
	}
	.cmph strong {
		font-family: var(--font-display);
		font-size: var(--fs-xl, 22px);
	}
	.muted {
		color: var(--text-3);
		font-size: var(--fs-xs);
	}
	.cmpgrid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
		gap: 6px;
	}
	.cm {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 7px 9px;
		border-radius: 9px;
		background: var(--surface-3);
		font-size: 11px;
		color: var(--text-3);
	}
	.cm b {
		font-family: var(--font-display);
		font-size: 20px;
		color: var(--text);
	}
	.cm.total {
		background: color-mix(in srgb, var(--emerald) 14%, var(--surface-3));
	}
	.cm small {
		font-weight: 800;
	}
	.adapt {
		display: flex;
		gap: 6px;
		align-items: flex-start;
		margin: 0;
		font-size: var(--fs-xs);
		color: var(--text-2);
		padding: 8px 10px;
		border-radius: 10px;
		background: rgb(232 184 106 / 0.1);
		line-height: 1.45;
	}
	.adapt.good {
		background: rgb(16 185 129 / 0.1);
	}
	.use {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		border: 0;
		border-radius: 999px;
		background: var(--emerald);
		color: #06281c;
		font: inherit;
		font-weight: 800;
		cursor: pointer;
		transition: transform 0.15s;
	}
	.use:hover {
		transform: translateY(-1px);
	}
	.use:active {
		transform: scale(0.97);
	}
	.ath {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}
	.ath li {
		display: grid;
		grid-template-columns: 38px minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr);
		gap: 10px;
		align-items: center;
		padding: 5px 8px;
		border-radius: 8px;
		background: var(--surface-2);
	}
	.pos {
		font-size: 11px;
		font-weight: 800;
		color: var(--emerald-strong);
	}
	.who {
		display: flex;
		flex-direction: column;
		min-width: 0;
		font-size: var(--fs-xs);
	}
	.who strong,
	.who small {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.who small {
		color: var(--gold);
		font-size: 10.5px;
	}
	.mini {
		display: grid;
		grid-template-columns: 1fr 22px;
		gap: 6px;
		align-items: center;
	}
	.mini b {
		font-size: 11px;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	@media (prefers-reduced-motion: reduce) {
		.fill,
		.ring .fg {
			transition: none;
		}
	}
</style>
