<script lang="ts">
	import { untrack } from 'svelte';
	import { computeOverall } from '#lib/engine/attributes.ts';
	import { overridesOf, presetInstructions, type TacticalInstructions } from '#lib/engine/instructions.ts';
	import type { Match } from '#lib/engine/match.ts';
	import type { Decision, Side } from '#lib/engine/types.ts';
	import { positionFit } from '#lib/domain/positions.ts';
	import { FORMATION_IDS, FORMATIONS, STYLE_LABELS, STYLES, type FormationId, type Mentality, type PlayStyle } from '#lib/domain/tactics.ts';
	import type { PlayerOrder, PlayerOrders as PlayerOrdersMap } from '#lib/domain/player-orders.ts';
	import type { TacticPreset } from '#lib/domain/tactic-presets.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { pop, portal } from '#lib/motion/actions.ts';
	import Button from '../Button.svelte';
	import Crest from '../Crest.svelte';
	import MentalityScale from '../MentalityScale.svelte';
	import FormationBoard from '../match/FormationBoard.svelte';
	import InstructionsEditor from '../tactics/InstructionsEditor.svelte';
	import PlayerOrders from '../tactics/PlayerOrders.svelte';

	/**
	 * Comando tático durante a partida (0.13): elenco e banco · campo tático · estratégia.
	 * Tudo vira decisão do motor (a mesma que o jogo grava e reproduz): substituições, posições,
	 * formação, mentalidade, estilo, pressão e instruções coletivas, ordens individuais e capitães.
	 * No intervalo as mudanças valem na hora; com a bola rolando entram na próxima parada.
	 */
	let { match, side, version, coach, title = 'Comando tático', presets = [], onclose, onconfirm }: {
		match: Match; side: Side; version: number; coach: string; title?: string; presets?: TacticPreset[];
		onclose?: () => void; onconfirm: () => void;
	} = $props();

	let tick = $state(0); // atualiza a tela depois de cada decisão
	const v = $derived(version + tick);
	const team = $derived.by(() => { void v; return match.teams[side]; });
	const interval = $derived.by(() => { void v; return match.phase === 'half_time'; });
	const club = $derived(getClub(team.setup.id));
	const LEVELS = ['Mínima', 'Baixa', 'Moderada', 'Alta', 'Máxima'];
	const LINE = ['Muito baixa', 'Baixa', 'Média', 'Alta', 'Muito alta'];

	// Rascunho da estratégia (aplicado ao confirmar).
	let formation = $state<FormationId>(untrack(() => match.teams[side].tactic.formation));
	let mentality = $state<Mentality>(untrack(() => match.teams[side].tactic.mentality));
	let style = $state<PlayStyle>(untrack(() => match.teams[side].tactic.style));
	let instructions = $state<TacticalInstructions>(untrack(() => ({ ...match.teams[side].instructions })));
	let preset = $state.raw(untrack(() => presetInstructions(match.teams[side].tactic.mentality, match.teams[side].tactic.style)));
	let captains = $state<string[]>(untrack(() => [...(match.teams[side].tactic.captains ?? [])]));
	let orders = $state<Record<string, PlayerOrder | null>>({});
	let advanced = $state(false);
	let selected = $state<string | null>(null);
	let message = $state('');

	// Mentalidade/estilo trocam o preset e preservam os ajustes manuais (mesma regra da tela de Táticas).
	$effect(() => {
		const next = presetInstructions(mentality, style);
		const prev = untrack(() => preset);
		if (JSON.stringify(next) === JSON.stringify(prev)) return;
		const custom = overridesOf(untrack(() => instructions), prev);
		instructions = { ...next, ...custom };
		preset = next;
	});

	const result = $derived.by(() => { void v; return match.result(); });
	const onPitch = $derived.by(() => { void v; return match.onPitch(side); });
	const bench = $derived.by(() => { void v; return match.bench(side); });
	const subsLeft = $derived.by(() => { void v; return match.subsLeft(side); });
	const pendingOut = $derived.by(() => { void v; return match.pending(side).flatMap((d) => (d.type === 'sub' ? [d.outId] : [])); });
	const familiarity = $derived(team.setup.familiarity?.execution);
	const squad = $derived(team.setup.players.map((p) => ({ id: p.id, name: p.shortName, position: p.position })));
	/** ordens individuais em vigor + as alteradas nesta janela (null remove a ordem) */
	const currentOrders = $derived.by(() => {
		const out: PlayerOrdersMap = { ...(team.tactic.playerOrders ?? {}) };
		for (const [id, o] of Object.entries(orders)) { if (o) out[id] = o; else delete out[id]; }
		return out;
	});
	const minute = $derived.by(() => { void v; return match.phase === 'half_time' ? 'Intervalo' : match.clock(); });

	function decide(d: Decision) {
		message = (interval ? match.prepareInterval(side, d) : (match.submit(side, d), undefined)) ?? '';
		tick++;
	}
	function sub(outId: string, inId: string, slot?: number) { decide({ type: 'sub', outId, inId, ...(slot !== undefined ? { slot } : {}) }); }
	function move(playerId: string, slot: number) { decide({ type: 'move', playerId, slot }); }
	function swap(first: string, second: string) {
		message = match.swapPositions(side, first, second) ?? '';
		tick++;
	}

	/** Atletas em campo nos slots da nova formação (goleiro no 0; com expulsões, vagas nas posições menos críticas). */
	function lineupFor(f: FormationId): string[] {
		const slots = FORMATIONS[f];
		const gk = match.teams[side].gkId;
		const rest = match.onPitch(side).filter((s) => s.id !== gk).map((s) => s.id);
		const used = new Set<string>();
		const lineup: string[] = new Array(slots.length).fill('');
		lineup[0] = match.onPitch(side).some((s) => s.id === gk) ? gk : '';
		const PRIORITY = ['ZAG', 'LD', 'LE', 'VOL', 'MC', 'MEI', 'PD', 'PE', 'ATA'];
		const order = slots.map((_, i) => i).slice(1).sort((a, b) => PRIORITY.indexOf(slots[a].position) - PRIORITY.indexOf(slots[b].position));
		for (const i of order) {
			const pick = rest.filter((id) => !used.has(id)).sort((a, b) => positionFit(match.player(b)!.position, slots[i].position) - positionFit(match.player(a)!.position, slots[i].position))[0];
			if (!pick) break;
			used.add(pick);
			lineup[i] = pick;
		}
		return lineup;
	}

	function applyPreset(id: string) {
		const p = presets.find((x) => x.id === id);
		if (!p) return;
		formation = p.formation;
		mentality = p.mentality;
		style = p.style;
		preset = presetInstructions(p.mentality, p.style);
		instructions = { ...p.instructions };
	}

	function confirm() {
		const t = match.teams[side].tactic;
		const before = JSON.stringify(match.teams[side].instructions);
		if (formation !== t.formation) decide({ type: 'formation', value: formation, lineup: lineupFor(formation) });
		if (mentality !== t.mentality) decide({ type: 'mentality', value: mentality });
		if (style !== t.style) decide({ type: 'style', value: style });
		if (JSON.stringify(instructions) !== before || mentality !== t.mentality || style !== t.style) decide({ type: 'instructions', value: $state.snapshot(instructions) as TacticalInstructions });
		if (JSON.stringify(captains) !== JSON.stringify(t.captains ?? [])) decide({ type: 'captains', order: [...captains] });
		for (const [playerId, order] of Object.entries(orders)) decide({ type: 'individual', playerId, order });
		orders = {};
		onconfirm();
	}
</script>

<div class="overlay" use:portal role="dialog" aria-modal="true" aria-labelledby="tc-title" style:--c={club?.colors.primary ?? '#10B981'}>
	<div class="window" use:pop>
		<header>
			<div class="who"><Crest clubId={team.setup.id} size={30} /><div><h2 id="tc-title">{title}</h2><small>{coach} · {team.setup.name}</small></div></div>
			<span class="state">{minute} · Pausado</span>
		</header>

		<div class="cols">
			<section class="col squad" aria-label="Elenco e banco">
				<h3>Em campo</h3>
				<ul>
					{#each onPitch as s (s.id)}
						{@const p = match.player(s.id)!}
						{@const st = result.players[s.id]}
						<li class:hurt={s.injured}>
							<span class="pos">{p.position}</span>
							<span class="nm" title={p.name}>{p.shortName}{#if s.injured} <b class="tag">lesionado</b>{/if}{#if s.yellow} <b class="card"></b>{/if}</span>
							<span class="ovr" title="Força na posição">{computeOverall(p.attributes, p.position)}</span>
							<span class="rt" title="Nota na partida">{st?.minutes ? st.rating.toFixed(1) : '—'}</span>
							<span class="bar" title="Condição {Math.round(s.condition)}%"><i style:width="{s.condition}%" class:low={s.condition < 60}></i></span>
						</li>
					{/each}
				</ul>
				<h3>Banco <small>{subsLeft} {subsLeft === 1 ? 'troca' : 'trocas'}</small></h3>
				<ul>
					{#each bench as p (p.id)}
						<li><span class="pos">{p.position}</span><span class="nm">{p.shortName}</span><span class="ovr">{computeOverall(p.attributes, p.position)}</span><span class="rt"></span><span class="bar"><i style:width="{p.condition}%"></i></span></li>
					{:else}<li class="muted">Sem reservas disponíveis.</li>{/each}
				</ul>
			</section>

			<section class="col pitch" aria-label="Escalação">
				<h3>Escalação · {team.tactic.formation}</h3>
				<FormationBoard compact {match} {side} version={v} players={result.players} color={club?.colors.primary}
					bind:selected canSub={subsLeft > 0} {pendingOut} onsub={sub} onswap={swap} onmove={move} />
				<p class="hint">Toque em dois atletas para trocar de posição; em quem sai e depois num reserva para substituir.</p>
				{#if pendingOut.length}<p class="hint warn">Substituição aguardando a bola parar.</p>{/if}
				{#if message}<p class="hint warn" role="status">{message}</p>{/if}
			</section>

			<section class="col strategy" aria-label="Estratégia">
				<h3>Estratégia</h3>
				{#if presets.length}
					<label><span>Minhas táticas</span>
						<select onchange={(e) => applyPreset(e.currentTarget.value)}><option value="">Aplicar tática salva…</option>{#each presets as p (p.id)}<option value={p.id}>{p.name}</option>{/each}</select>
					</label>
				{/if}
				<label><span>Formação{#if onPitch.length < 11} · {onPitch.length} em campo{/if}</span>
					<select bind:value={formation}>{#each FORMATION_IDS as f (f)}<option value={f}>{f}</option>{/each}</select>
				</label>
				<div class="field"><span>Mentalidade</span><MentalityScale bind:value={mentality} /></div>
				<label><span>Estilo</span>
					<select bind:value={style}>{#each STYLES as s (s)}<option value={s}>{STYLE_LABELS[s]}</option>{/each}</select>
				</label>
				<div class="pair">
					<label><span>Pressão</span><select bind:value={instructions.pressao}>{#each LEVELS as l, i (l)}<option value={i + 1}>{l}</option>{/each}</select></label>
					<label><span>Linha defensiva</span><select bind:value={instructions.linha}>{#each LINE as l, i (l)}<option value={i + 1}>{l}</option>{/each}</select></label>
				</div>
				<button type="button" class="more" aria-expanded={advanced} onclick={() => (advanced = !advanced)}>{advanced ? '▾' : '▸'} Instruções coletivas, individuais e capitães</button>
				{#if advanced}
					<div class="adv">
						<InstructionsEditor bind:value={instructions} {preset} />
						<PlayerOrders {squad} lineup={team.tactic.lineup} order={captains} instructions={currentOrders}
							slotPositions={FORMATIONS[team.tactic.formation].map((s) => s.position)}
							oncaptains={(ids) => (captains = ids)} oninstruction={(id, o) => (orders = { ...orders, [id]: o })} />
					</div>
				{/if}
			</section>
		</div>

		<footer>
			<span>{subsLeft} {subsLeft === 1 ? 'substituição restante' : 'substituições restantes'}</span>
			{#if familiarity !== undefined}<span>Familiaridade: {Math.round(familiarity)}%</span>{/if}
			<span class="grow"></span>
			{#if onclose}<Button variant="ghost" onclick={onclose}>Voltar sem mudar a estratégia</Button>{/if}
			<Button variant="primary" icon="check" onclick={confirm}>Confirmar e continuar</Button>
		</footer>
	</div>
</div>

<style>
	.overlay { position: fixed; inset: 0; z-index: 800; display: grid; place-items: center; padding: 16px; background: rgb(6 9 11 / .78); }
	.window { width: min(1280px, 100%); max-height: calc(var(--app-h, 100vh) - 32px); display: grid; grid-template-rows: auto minmax(0, 1fr) auto; background: #101418; border: 1px solid var(--line-strong); border-radius: 16px; box-shadow: 0 24px 60px #000a; overflow: hidden; }
	header, footer { display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: #1C252B; }
	header { justify-content: space-between; border-bottom: 1px solid var(--line); }
	.who { display: flex; align-items: center; gap: 10px; }
	h2 { margin: 0; font-size: var(--fs-lg); letter-spacing: .04em; text-transform: uppercase; }
	.who small { color: var(--text-3); }
	.state { color: #E8B86A; font-variant-numeric: tabular-nums; font-weight: 600; }
	.cols { display: grid; grid-template-columns: minmax(230px, 300px) minmax(0, 1fr) minmax(250px, 320px); gap: 12px; padding: 12px; min-height: 0; overflow: auto; }
	.col { min-width: 0; background: #1C252B; border-radius: 12px; padding: 10px 12px; overflow: auto; }
	h3 { margin: 4px 0 8px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--emerald-strong, #34d399); display: flex; justify-content: space-between; }
	h3 small { color: var(--text-3); text-transform: none; letter-spacing: 0; }
	ul { list-style: none; margin: 0 0 10px; padding: 0; display: grid; gap: 2px; }
	li { display: grid; grid-template-columns: 34px minmax(0, 1fr) 26px 30px 46px; align-items: center; gap: 6px; padding: 3px 4px; border-radius: 6px; font-size: 13px; }
	li:nth-child(odd) { background: rgb(255 255 255 / .03); }
	li.hurt { background: rgb(239 68 68 / .12); }
	.pos { font-size: 11px; color: var(--text-3); font-weight: 700; }
	.nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.tag { font-size: 10px; color: #f87171; font-weight: 600; }
	.card { display: inline-block; width: 7px; height: 10px; background: #facc15; border-radius: 1px; vertical-align: middle; }
	.ovr, .rt { text-align: right; font-variant-numeric: tabular-nums; }
	.rt { color: #E8B86A; }
	.bar { height: 5px; border-radius: 3px; background: rgb(255 255 255 / .08); overflow: hidden; }
	.bar i { display: block; height: 100%; background: #10B981; }
	.bar i.low { background: #E8B86A; }
	.muted { color: var(--text-3); display: block; }
	.pitch { display: grid; align-content: start; gap: 6px; }
	.hint { margin: 0; font-size: 12px; color: var(--text-3); }
	.hint.warn { color: #E8B86A; }
	.strategy { display: grid; align-content: start; gap: 8px; }
	label, .field { display: grid; gap: 4px; font-size: 12px; color: var(--text-3); }
	select { height: 32px; padding: 0 8px; border-radius: 8px; border: 1px solid var(--line-strong); background: #101418; color: #E7EDF0; font: inherit; font-size: 13px; }
	.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
	.more { justify-self: start; background: none; border: 0; color: var(--emerald-strong, #34d399); font: inherit; font-size: 13px; cursor: pointer; padding: 4px 0; }
	.adv { display: grid; gap: 10px; }
	footer { border-top: 1px solid var(--line); font-size: 13px; color: var(--text-2); }
	.grow { flex: 1; }
	@media (max-width: 1100px) { .cols { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .pitch { grid-column: 1 / -1; grid-row: 1; } }
</style>
