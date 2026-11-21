<script lang="ts">
	import LineupPitch from '#lib/ui/tactics/LineupPitch.svelte';
	import PlayerOrders from '#lib/ui/tactics/PlayerOrders.svelte';
	import type { PlayerOrder } from '#lib/domain/player-orders.ts';
	function setIndividual(id: string, order: PlayerOrder | null) {
		const next = { ...tactic.playerOrders };
		if (order) next[id] = order;
		else delete next[id];
		tactic.playerOrders = Object.keys(next).length ? next : undefined;
	}
	import { universeCoach } from '#lib/domain/matchday.ts';
	import { untrack } from 'svelte';
	import { beforeNavigate, goto, invalidate } from '$app/navigation';
	import { api, isVersionConflict, withCareerVersion } from '#lib/api.ts';
	import { pickBench } from '#lib/engine/teams.ts';
	import { positionFit } from '#lib/domain/positions.ts';
	import type { SquadPlayer } from '#lib/domain/squad.ts';
	import {
		autoLineup,
		FORMATION_IDS,
		FORMATIONS,
		lineupFamiliarity,
		MATCH_BENCH_SIZE,
		MENTALITY_LABELS,
		sameTactic,
		tacticKey,
		type FormationId,
		type Tactic
	} from '#lib/domain/tactics.ts';
	import type { Career } from '#lib/domain/career.ts';
	import { animate } from '#lib/motion/motion.svelte.ts';
	import { playerKit } from '#lib/pixel/kits.ts';
	import { notify } from '#lib/stores/island.svelte.ts';
	import { markClean, markDirty } from '#lib/stores/unsaved.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import MentalityScale from '#lib/ui/MentalityScale.svelte';
	import Meter from '#lib/ui/Meter.svelte';
	import Modal from '#lib/ui/Modal.svelte';
	import Panel from '#lib/ui/Panel.svelte';
	import Pixel from '#lib/ui/Pixel.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';
	import StylePicker from '#lib/ui/StylePicker.svelte';
	import { analyze, type Tip } from '#lib/domain/assistant.ts';
	import { resolveRoles, teamMastery } from '#lib/domain/tactical.ts';
	import { overridesOf, presetInstructions, type TacticalInstructions } from '#lib/engine/instructions.ts';
	import { ROLES, type RoleId } from '#lib/engine/roles.ts';
	import AssistantPanel from '#lib/ui/tactics/AssistantPanel.svelte';
	import Crest from '#lib/ui/Crest.svelte';
	import { getClub } from '#lib/domain/clubs.ts';
	import { formatLong } from '#lib/domain/dates.ts';
	import { DIVISION_LABELS, type DivisionId } from '#lib/domain/league.ts';
	import { SPONSOR_SLOTS, type SponsorSlot } from '#lib/domain/club.ts';
	import { formatExactMoney } from '#lib/domain/market.ts';
	import { INSTRUCTION_KEYS, INSTRUCTION_LABELS, optionIndex, paramsFromInstructions } from '#lib/engine/instructions.ts';
	import { STYLE_LABELS } from '#lib/domain/tactics.ts';
	import { count, enter } from '#lib/motion/actions.ts';
	import InstructionsEditor from '#lib/ui/tactics/InstructionsEditor.svelte';
	import MasteryPanel from '#lib/ui/tactics/MasteryPanel.svelte';
	import RolePicker from '#lib/ui/tactics/RolePicker.svelte';
	import TacticalOverlay from '#lib/ui/tactics/TacticalOverlay.svelte';

	let { data } = $props();
	const base = $derived(`/carreira/${data.career.id}`);
	const v = $derived(data.view);
	let behavior = $state(true);
	let sidebar = $state<'banco' | 'estilo' | 'funcao'>('banco');
	let showReserves = $state(false);
	let workspace = $state<'instrucoes' | 'dominio' | 'auxiliar' | 'partida' | 'comercial'>('instrucoes');
	const workspaceOptions = [
		{ value: 'instrucoes', label: 'Instruções' }, { value: 'dominio', label: 'Domínio tático' },
		{ value: 'auxiliar', label: 'Auxiliar' }, { value: 'partida', label: 'Pré-jogo' },
		{ value: 'comercial', label: 'Comercial' }
	] as const;
	const byId = $derived(new Map(v.squad.map((p) => [p.id, p])));
	const DIRTY_KEY = 'tactic';

	// Estado de edição local (salvo explicitamente). Sempre com instruções e funções explícitas.
	type EditTactic = Tactic & { instructions: TacticalInstructions; roles: RoleId[]; bench: string[] };
	function editable(t: Tactic): EditTactic {
		const c = structuredClone($state.snapshot(t)) as Tactic;
		return { ...c, bench: c.bench ?? pickBench(v.squad, c.lineup), instructions: c.instructions ?? presetInstructions(c.mentality, c.style), roles: resolveRoles(c.formation, c.roles) };
	}
	let tactic = $state<EditTactic>(untrack(() => editable(data.view.tactic)));
	const savedKey = (career: Career) => career.data.tactic ? tacticKey(career.data.tactic) : null;
	const saveBase = (career: Career) => ({ clubId: career.clubId, season: career.season, version: career.version, key: savedKey(career) });
	let basedOn = untrack(() => saveBase(data.career));
	let mode = $state<'simples' | 'avancada'>(untrack(() => (data.view.tactic.instructions ? 'avancada' : 'simples')));
	// Mudar mentalidade/estilo troca o preset, mas mantém os ajustes avançados (nada é apagado em silêncio).
	let lastPreset = untrack(() => presetInstructions(tactic.mentality, tactic.style));
	$effect(() => {
		const next = presetInstructions(tactic.mentality, tactic.style);
		if (JSON.stringify(next) === JSON.stringify(lastPreset)) return;
		const custom = overridesOf(untrack(() => tactic.instructions), lastPreset);
		tactic.instructions = { ...next, ...custom };
		lastPreset = next;
	});
	const preset = $derived(presetInstructions(tactic.mentality, tactic.style));
	const customCount = $derived(Object.keys(overridesOf(tactic.instructions, preset)).length);
	const mastery = $derived(teamMastery(v.tactical, tactic.formation, tactic.style, tactic.lineup, tactic.instructions));
	const tips = $derived(
		analyze({
			squad: v.squad,
			tactic,
			tactical: v.tactical,
			fitness: v.fitness,
			recent: data.recent ?? [],
			clubId: data.career.clubId,
			nextOpponent: v.upcoming ? (v.upcoming.home === data.career.clubId ? v.upcoming.away : v.upcoming.home) : null,
			careerSeed: data.career.seed,
					opponentCoach: (() => { const o = v.upcoming ? (v.upcoming.home === data.career.clubId ? v.upcoming.away : v.upcoming.home) : null; return o ? universeCoach(data.career, o) : null; })(),
			season: data.career.season,
			firstSeason: v.firstSeason,
			dismissed: data.career.data.dismissedTips
		})
	);
	type Selection = { kind: 'slot'; index: number } | { kind: 'bench' | 'reserve'; id: string };
	let selection = $state<Selection | null>(null);
	const selectedSlot = $derived(selection?.kind === 'slot' ? selection.index : null);
	const sidebarOptions = $derived([
		{ value: 'banco' as const, label: 'Convocação' }, { value: 'estilo' as const, label: 'Estilo' },
		...(selectedSlot !== null ? [{ value: 'funcao' as const, label: 'Função do titular' }] : [])
	]);
	const sidebarView = $derived(sidebar === 'funcao' && selectedSlot === null ? 'banco' : sidebar);
	let saving = $state(false);
	let leaveModal = $state(false);
	let pendingHref: string | null = null;

	// Três estados distintos:
	//  • tactic        → o que está sendo editado nesta tela;
	//  • data.view.tactic → o último estado CONFIRMADO pelo servidor (é o que o motor usa);
	//  • changed       → há diferença entre os dois (indicador de pendência).
	const changed = $derived(!sameTactic(tactic, editable(data.view.tactic)));
	const dirty = $derived(changed || !v.tacticSaved);
	const slots = $derived(FORMATIONS[tactic.formation]);
	const bench = $derived(tactic.bench.map((id) => byId.get(id)).filter((p): p is SquadPlayer => !!p));
	const reserves = $derived(v.squad.filter((p) => !tactic.lineup.includes(p.id) && !tactic.bench.includes(p.id)).sort((a, b) => b.overall - a.overall));
	const selectedPlayer = $derived(selection ? byId.get(selection.kind === 'slot' ? tactic.lineup[selection.index] : selection.id) : undefined);
	const familiarity = $derived(lineupFamiliarity(tactic.formation, tactic.lineup, v.squad));

	$effect(() => {
		if (changed) markDirty(DIRTY_KEY, 'Tática não salva');
		else markClean(DIRTY_KEY);
		return () => markClean(DIRTY_KEY);
	});

	beforeNavigate((nav) => {
		if (!changed || saving || !nav.to || nav.willUnload) return;
		nav.cancel();
		pendingHref = nav.to.url.pathname + nav.to.url.search + nav.to.url.hash;
		leaveModal = true;
	});

	function changeFormation(f: FormationId) {
		const current = tactic.lineup.map((id) => byId.get(id)).filter((p): p is SquadPlayer => !!p);
		tactic.lineup = autoLineup(f, current.length === 11 ? current : v.squad);
		tactic.bench = tactic.bench.filter((id) => !tactic.lineup.includes(id));
		tactic.formation = f;
		tactic.roles = resolveRoles(f);
	}

	function swap(target: Selection) {
		const src = selection;
		selection = null;
		if (!src) return;
		const lineup = [...tactic.lineup];
		const nextBench = [...tactic.bench];
		const idOf = (item: Selection) => item.kind === 'slot' ? lineup[item.index] : item.id;
		const a = idOf(src), b = idOf(target);
		if (!a || !b || a === b) return;
		const benchIndexes = [nextBench.indexOf(a), nextBench.indexOf(b)];
		if (src.kind === 'slot') lineup[src.index] = b;
		if (target.kind === 'slot') lineup[target.index] = a;
		if (benchIndexes[0] >= 0) nextBench[benchIndexes[0]] = b;
		if (benchIndexes[1] >= 0) nextBench[benchIndexes[1]] = a;
		tactic.lineup = lineup;
		tactic.bench = nextBench;
		const idx = target.kind === 'slot' ? target.index : src.kind === 'slot' ? src.index : -1;
		const el = document.querySelector(`[data-slot="${idx}"]`);
		if (el) void animate(el, { scale: 1 }, { spring: 'snappy', from: { scale: 0.86 } });
	}

	function clickSlot(index: number) {
		if (!selection) selection = { kind: 'slot', index };
		else if (selection.kind === 'slot' && selection.index === index) selection = null;
		else swap({ kind: 'slot', index });
	}

	function clickOffPitch(kind: 'bench' | 'reserve', id: string) {
		if (!selection || (selection.kind === 'reserve' && kind === 'reserve')) {
			selection = isSel(kind, id) ? null : { kind, id };
		} else if (isSel(kind, id)) selection = null;
		else swap({ kind, id });
	}

	// Arrastar e soltar (mouse); o clique em dois passos é a alternativa acessível.
	function onDragStart(e: DragEvent, src: Selection) {
		selection = src;
		e.dataTransfer?.setData('text/plain', JSON.stringify(src));
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}
	function onDrop(e: DragEvent, target: Selection) {
		e.preventDefault();
		swap(target);
	}

	function fitTone(p: SquadPlayer | undefined, i: number) {
		if (!p) return 'bad';
		const fit = positionFit(p.position, slots[i].position);
		return fit === 1 ? 'good' : fit >= 0.6 ? 'ok' : 'bad';
	}

	async function save() {
		if (saving) return; // nunca dois salvamentos ao mesmo tempo
		saving = true;
		const snap = $state.snapshot(tactic) as EditTactic;
		// No modo simples sem ajustes, a tática segue o preset (motor usa o preset calibrado).
		const sent: Tactic = mode === 'simples' && customCount === 0 ? { ...snap, instructions: undefined } : snap;
		try {
			const path = `/api/careers/${data.career.id}`;
			const send = (version: number) => api<{ career: Career }>(path, { method: 'PATCH', body: { version, tactic: sent } });
			const result = await send(basedOn.version).catch(async (cause) => {
				if (!isVersionConflict(cause)) throw cause;
				const { career } = await api<{ career: Career }>(path);
				if (career.season !== basedOn.season || career.clubId !== basedOn.clubId || savedKey(career) !== basedOn.key) throw cause;
				return send(career.version);
			});
			if (savedKey(result.career) !== tacticKey(sent)) throw new Error('O servidor não confirmou a tática enviada.');
			basedOn = saveBase(result.career);
			await invalidate('app:career').catch(() => {});
			notify({ icon: 'save', tone: 'success', title: 'Tática salva', detail: `${sent.formation} · ${MENTALITY_LABELS[sent.mentality]}` });
		} catch (e) {
			const conflict = e instanceof Error && 'status' in e && (e as { status: number }).status === 409;
			if (conflict) await invalidate('app:career').catch(() => {});
			notify({
				icon: 'alert',
				tone: 'error',
				title: conflict ? 'Conflito ao salvar a tática' : e instanceof Error ? e.message : 'Falha ao salvar',
				detail: conflict ? 'O rascunho foi mantido. Confira se a tática ou o clube mudou em outra tela.' : 'Suas alterações continuam aqui.',
				duration: 6000
			});
		} finally {
			saving = false;
		}
	}

	function reset() {
	basedOn = saveBase(data.career);
	tactic = editable(data.view.tactic);
	lastPreset = presetInstructions(tactic.mentality, tactic.style);
	selection = null;
	}
	
	function restorePreset() {
	tactic.instructions = { ...preset };
	}
	
	function setRole(slot: number, role: RoleId) {
	const roles = [...tactic.roles];
	roles[slot] = role;
	tactic.roles = roles;
	}
	
	function applyTip(t: Tip) {
	if (!t.action) return;
	if (t.action.type === 'formation') changeFormation(t.action.formation);
	else if (t.action.type === 'role') setRole(t.action.slot, t.action.role);
	else if (t.action.type === 'training') void goto(`/carreira/${data.career.id}/treinos`);
	}
	
	async function dismissTip(t: Tip) {
	try {
	await withCareerVersion(data.career.id, data.career.version, (version) => api(`/api/careers/${data.career.id}`, { method: 'PATCH', body: { version, dismissTip: t.id } }));
	await invalidate('app:career');
	} catch {
	notify({ icon: 'alert', tone: 'error', title: 'Não foi possível ignorar agora' });
	}
	}

	function isSel(kind: Selection['kind'], key: number | string) {
		if (!selection || selection.kind !== kind) return false;
		return selection.kind === 'slot' ? selection.index === key : selection.id === key;
	}



	// ── Plano ativo: o que o motor vai usar (mesmos parâmetros do desenho no campo)
	const engine = $derived(paramsFromInstructions(tactic.mentality, tactic.style, tactic.instructions));
	const behaviour = $derived(
		[
			{ k: 'Linha defensiva', v: `${Math.round(engine.defLine)} m do gol` },
			{ k: 'Comprimento do bloco', v: `${Math.round(engine.blockLength)} m` },
			{ k: 'Pressão', v: `${engine.pressers} atleta${engine.pressers > 1 ? 's' : ''} a ${Math.round(engine.pressDistance)} m` },
			{ k: 'Marcação', v: engine.manMarking ? 'Individual' : 'Por zona' },
			engine.counterPress ? { k: 'Após perder', v: 'Contrapressão' } : null
		].filter((x): x is { k: string; v: string } => !!x)
	);
	const overrides = $derived(
		INSTRUCTION_KEYS.filter((k) => tactic.instructions[k] !== preset[k]).map((k) => ({
			k,
			label: INSTRUCTION_LABELS[k].label,
			now: INSTRUCTION_LABELS[k].options[optionIndex(k, tactic.instructions[k])],
			was: INSTRUCTION_LABELS[k].options[optionIndex(k, preset[k])]
		}))
	);

	// ── Próxima partida (dados do calendário real da carreira)
	const up = $derived(v.upcoming);
	const oppId = $derived(up ? (up.home === data.career.clubId ? up.away : up.home) : null);
	const compLabel = (c: string) => (c === 'copa-do-brasil' ? 'Copa do Brasil' : (DIVISION_LABELS[c as DivisionId] ?? c));
	const daysTo = $derived(up ? Math.round((Date.parse(up.date) - Date.parse(data.career.gameDate)) / 86_400_000) : null);
	const starters = $derived(tactic.lineup.map((id) => byId.get(id)).filter((p): p is SquadPlayer => !!p));
	const avgCondition = $derived(starters.length ? Math.round(starters.reduce((s, p) => s + p.condition, 0) / starters.length) : 0);
	const tired = $derived(starters.filter((p) => p.condition < 75).length);
	const opponent = $derived(
		up && oppId ? { clubId: oppId, date: up.date, time: up.time, home: up.home === data.career.clubId, competition: compLabel(up.competition), coach: universeCoach(data.career, oppId) } : null
	);

	// ── Comercial (resumo; a negociação completa fica em Finanças)
	const club = $derived(data.manage?.club);
	const sponsorMonthly = $derived(club ? club.sponsors.reduce((s, x) => s + x.monthly, 0) : 0);
	const bestOffers = $derived(
		club
			? (Object.keys(SPONSOR_SLOTS) as SponsorSlot[])
					.map((slot) => club.sponsorOffers.filter((o) => o.slot === slot).sort((a, b) => b.monthly - a.monthly)[0])
					.filter((o) => !!o)
			: []
	);
</script>

<svelte:head><title>Táticas · {v.club.name} · BRASFC</title></svelte:head>

{#if data.career.mode !== 'coach'}
	<Panel title="Táticas">
		<p class="muted">Na carreira de jogador, a tática é definida pelo treinador do clube.</p>
	</Panel>
{:else}
	<div class="head" data-umx-enter>
		<div class="intro">
			<span class="eyebrow">Central do treinador · {v.club.name}</span>
			<h1>Táticas</h1>
			<p class="muted">Selecione dois atletas para trocar de lugar entre campo, banco e reservas. Também é possível arrastar. Selecione um titular para ajustar a função dele.</p>
		</div>
		<div class="save" class:dirty={changed}>
			<Segmented label="Nível de detalhe" bind:value={mode} options={[{ value: 'simples', label: 'Simples' }, { value: 'avancada', label: 'Avançada' }]} />
			{#if changed}<span class="pending"><Icon name="dot" size={12} /> Alterações não salvas</span>{/if}
			<Button variant="ghost" onclick={reset} disabled={!changed || saving}>Desfazer</Button>
			<Button variant="primary" icon="save" loading={saving} disabled={!dirty} onclick={save}>Salvar tática</Button>
		</div>
	</div>

	<!-- ═══ Campo + elenco/estilo ═══ -->
	<div class="center">
		<Panel pad={false} index={0} class="pitch-panel">
			<div class="pitch-tools">
				<Segmented label="Formação" value={tactic.formation} onchange={changeFormation} options={FORMATION_IDS.map((f) => ({ value: f, label: f }))} />
				<div class="tools-r">
					<div class="fam" title="Quanto os titulares estão nas posições de origem"><span>Familiaridade</span><Meter value={familiarity} label="Familiaridade tática" /></div>
					<button class="chip" aria-pressed={behavior} onclick={() => (behavior = !behavior)} title="Mostra linha, bloco, pressão e corridas que o motor vai usar">Comportamento</button>
				</div>
			</div>
			<div class="pitch-wrap">
				<LineupPitch touchOnly move={(from, to) => {
					selection = { kind: 'slot', index: Number(from) };
					swap({ kind: 'slot', index: Number(to) });
				}}>
					{#if behavior}<TacticalOverlay formation={tactic.formation} mentality={tactic.mentality} style={tactic.style} instructions={tactic.instructions} roles={tactic.roles} legend={false} />{/if}
					{#each slots as slot, i (i)}
						{@const p = byId.get(tactic.lineup[i])}
						<button
							class="slot {fitTone(p, i)}"
							class:sel={isSel('slot', i)}
							data-slot={i} data-reposition={p ? i : undefined}
							style="left:{slot.x}%; top:{slot.y}%"
							draggable="true"
							ondragstart={(e) => onDragStart(e, { kind: 'slot', index: i })}
							ondragend={() => (selection = null)}
							ondragover={(e) => e.preventDefault()}
							ondrop={(e) => onDrop(e, { kind: 'slot', index: i })}
							onclick={() => clickSlot(i)}
							aria-pressed={isSel('slot', i)}
							aria-label="{slot.position}: {p ? `Overall ${p.overall} · ${p.name}` : 'vazio'}"
						>
							{#if p}<Pixel appearance={p.appearance} kit={playerKit(data.career.clubId, p.position)} size={40} />{/if}
							<span class="rating-line">
								<span class="role">{slot.position}</span>
								{#if p}<span class="overall num" title="Overall">{p.overall}</span>{/if}
							</span>
							<span class="pname">{p?.shortName ?? '—'}</span>
							<span class="fn">{ROLES[tactic.roles[i]]?.label ?? ''}</span>
							{#if p && p.condition < 75}<span class="cond" title="Condição física: {p.condition}%">{p.condition}%</span>{/if}
						</button>
					{/each}
				</LineupPitch>
			</div>
			{#if behavior}
				<div class="legend" aria-label="Leitura do comportamento">
					{#each behaviour as b (b.k)}<span><em>{b.k}</em> {b.v}</span>{/each}
					<span class="k"><i class="run"></i>corrida</span><span class="k"><i class="sup"></i>apoio/amplitude</span><span class="k"><i class="box"></i>chegada à área</span>
				</div>
			{/if}
		</Panel>

		<div class="side">
			<Panel title="Comandos por atleta" icon="user">
				<PlayerOrders squad={v.squad} lineup={tactic.lineup} slotPositions={slots.map((slot) => slot.position)} order={tactic.captains} instructions={tactic.playerOrders}
					selected={selectedSlot === null ? '' : tactic.lineup[selectedSlot]} oninstruction={setIndividual} oncaptains={(ids) => tactic.captains = ids.length ? ids : undefined} />
			</Panel>
			<Segmented label="Escalação e estilo" options={sidebarOptions} value={sidebarView} onchange={(value) => (sidebar = value)} />
			{#key sidebarView}
			<div class="side-content" use:enter>
			{#if sidebarView === 'funcao' && selectedSlot !== null && byId.get(tactic.lineup[selectedSlot])}
				{@const sp = byId.get(tactic.lineup[selectedSlot])!}
				<Panel title="Função de {sp.shortName}" icon="user" index={1}>
					<p class="muted small">Funções que fazem sentido como {slots[selectedSlot].position}, da mais compatível para a menos. Ou clique em outro jogador para trocar de lugar.</p>
					<RolePicker player={sp} position={slots[selectedSlot].position} value={tactic.roles[selectedSlot]} familiarity={v.tactical.roles[sp.id] ?? {}} onpick={(r) => setRole(selectedSlot, r)} />
				</Panel>
			{:else if sidebarView === 'banco'}
			{#snippet athleteRow(p: SquadPlayer, kind: 'bench' | 'reserve')}
				<li>
					<button class:sel={isSel(kind, p.id)} draggable="true"
						ondragstart={(e) => onDragStart(e, { kind, id: p.id })}
						ondragend={() => (selection = null)}
						ondragover={(e) => e.preventDefault()} ondrop={(e) => onDrop(e, { kind, id: p.id })}
						onclick={() => clickOffPitch(kind, p.id)} aria-pressed={isSel(kind, p.id)}>
						<Pixel appearance={p.appearance} kit={playerKit(data.career.clubId, p.position)} size={30} />
						<span class="bn">{p.name}</span><span class="bp">{p.position}</span><span class="bo num">{p.overall}</span>
					</button>
				</li>
			{/snippet}
			<Panel title={`Banco de suplentes · ${bench.length}/${MATCH_BENCH_SIZE}`} icon="squad" index={1} class="bench-panel">
				<p class="muted small">Convocados que podem entrar durante a partida.</p>
				{#if selectedPlayer}<p class="small" role="status"><strong>{selectedPlayer.name}</strong> selecionado. Escolha outro atleta para trocar.</p>{/if}
				<ul class="bench" aria-label="Banco de suplentes">
					{#each bench as p (p.id)}{@render athleteRow(p, 'bench')}{:else}<li class="muted small">Banco vazio.</li>{/each}
				</ul>
				{#if selection?.kind === 'bench'}
					{@const id = selection.id}
					<Button size="sm" variant="ghost" onclick={() => { tactic.bench = tactic.bench.filter((item) => item !== id); selection = null; }}>Retirar do banco</Button>
				{:else if selection?.kind === 'reserve' && bench.length < MATCH_BENCH_SIZE}
					{@const id = selection.id}
					<Button size="sm" variant="secondary" onclick={() => { tactic.bench = [...tactic.bench, id]; selection = null; }}>Convocar para o banco</Button>
				{/if}
			</Panel>
			<Panel title={`Reservas fora da convocação · ${reserves.length}`} icon="squad" index={2} class="bench-panel">
				<ul class="bench" aria-label="Reservas fora da convocação">
					{#each (showReserves ? reserves : reserves.slice(0, 6)) as p (p.id)}
						{@render athleteRow(p, 'reserve')}
					{:else}
						<li class="muted small">Todos os atletas estão convocados.</li>
					{/each}
				</ul>
				{#if reserves.length > 6}
					<Button size="sm" variant="ghost" aria-expanded={showReserves} onclick={() => (showReserves = !showReserves)}>{showReserves ? 'Recolher reservas' : `Ver todas as reservas (${reserves.length})`}</Button>
				{/if}
			</Panel>
			{:else}
			<Panel title="Estilo" icon="field" index={2}>
				<div class="style">
					<span class="lbl">Mentalidade</span>
					<MentalityScale bind:value={tactic.mentality} />
					<span class="lbl">Estilo de jogo</span>
					<StylePicker bind:value={tactic.style} />
					{#if customCount}
						<p class="custom"><Icon name="info" size={14} /> {customCount} ajuste(s) avançado(s) mantido(s) sobre o padrão do estilo. <button class="link" onclick={restorePreset}>Restaurar padrão</button></p>
					{/if}
				</div>
			</Panel>
			{/if}
			</div>
			{/key}
			<div class="side-summary">
				<div><small>Condição dos titulares</small><strong>{avgCondition}%</strong></div>
				<div><small>Execução do plano</small><strong>{Math.round(mastery.execution)}/100</strong></div>
			</div>
		</div>
	</div>

	<div class="workspace">
		<Segmented label="Análise e preparação" options={[...workspaceOptions]} bind:value={workspace} />
		{#key workspace}
		<div class="below" class:plan-grid={workspace === 'instrucoes' || workspace === 'partida'} use:enter>
		{#if workspace === 'instrucoes'}
		<Panel title="Instruções" icon="tactics" index={3} class="m-instr">
			{#if mode === 'avancada'}
				<InstructionsEditor bind:value={tactic.instructions} {preset} />
			{:else}
				<div class="simple">
					<p class="muted">
						No modo simples o time segue as instruções calibradas para <strong>{MENTALITY_LABELS[tactic.mentality]}</strong> + <strong>{STYLE_LABELS[tactic.style]}</strong>.
						{#if customCount}Há {customCount} ajuste(s) seu(s) mantido(s).{/if}
					</p>
					<div class="presets">
						{#each INSTRUCTION_KEYS as k (k)}
							<span class="pi" class:mod={tactic.instructions[k] !== preset[k]}><em>{INSTRUCTION_LABELS[k].label}</em>{INSTRUCTION_LABELS[k].options[optionIndex(k, tactic.instructions[k])]}</span>
						{/each}
					</div>
					<Button variant="secondary" icon="tactics" onclick={() => (mode = 'avancada')}>Personalizar instruções</Button>
				</div>
			{/if}
		</Panel>


			<Panel title="Plano ativo" icon="field" index={4}>
				<div class="plan">
					<div class="plan-id">
						<span class="formation">{tactic.formation}</span>
						<span>{MENTALITY_LABELS[tactic.mentality]} · {STYLE_LABELS[tactic.style]}</span>
					</div>
					<dl class="kv">
						{#each behaviour as b (b.k)}<div><dt>{b.k}</dt><dd>{b.v}</dd></div>{/each}
					</dl>
					{#if overrides.length}
						<h4>Seus ajustes ({overrides.length})</h4>
						<ul class="ovr">
							{#each overrides as o (o.k)}<li><span>{o.label}</span><b>{o.now}</b><small>padrão: {o.was}</small></li>{/each}
						</ul>
					{:else}
						<p class="muted small">Sem ajustes sobre o padrão do estilo.</p>
					{/if}
				</div>
			</Panel>

		{:else if workspace === 'partida'}
			<Panel title="Próxima partida" icon="whistle" index={5}>
				{#if up && oppId}
					<div class="next">
						<div class="vs">
							<Crest clubId={up.home} size={36} />
							<span class="x">×</span>
							<Crest clubId={up.away} size={36} />
							<div class="vsi">
								<strong>{getClub(oppId)?.name}</strong>
								<small>{formatLong(up.date)} · {up.time} · {compLabel(up.competition)}{daysTo !== null && daysTo >= 0 ? ` · ${daysTo === 0 ? 'hoje' : `em ${daysTo} dia(s)`}` : ''}</small>
							</div>
						</div>
						<div class="stats">
							<div><span>Condição dos titulares</span><b use:count={{ value: avgCondition, format: (x) => `${Math.round(x)}%` }}>{avgCondition}%</b></div>
							<div><span>Abaixo de 75%</span><b class:warn={tired > 0}>{tired}</b></div>
							<div><span>Execução do plano</span><b>{Math.round(mastery.execution)}</b></div>
						</div>
						<div class="links">
							<Button variant="primary" size="sm" icon="whistle" href="{base}/partida">Preparar partida</Button>
							<Button variant="secondary" size="sm" icon="training" href="{base}/treinos">Treinos</Button>
							<Button variant="ghost" size="sm" icon="squad" href="{base}/elenco">Elenco</Button>
						</div>
					</div>
				{:else}
					<p class="muted small">Nenhum jogo do seu time no calendário desta temporada.</p>
				{/if}
			</Panel>

			<Panel title="Preparação individual" icon="squad">
				{#if starters.length}
					<p class="muted small">Titulares em ordem de condição física.</p>
					<div class="fitness-list">
						{#each [...starters].sort((a, b) => a.condition - b.condition) as athlete (athlete.id)}
							<div><span>{athlete.shortName}</span><Meter value={athlete.condition} label={`Condição de ${athlete.shortName}`} /><b>{athlete.condition}%</b></div>
						{/each}
					</div>
				{:else}<p class="muted">Selecione seus titulares para ver a condição física.</p>{/if}
			</Panel>
		{:else if workspace === 'comercial' && club}
				<Panel title="Comercial" icon="briefcase" index={6}>
					<div class="com">
						<div class="comtop">
							<div><span>Patrocínios ativos</span><b>{club.sponsors.length}/{Object.keys(SPONSOR_SLOTS).length}</b></div>
							<div><span>Receita mensal</span><b class="money">{formatExactMoney(sponsorMonthly)}</b></div>
						</div>
						{#if bestOffers.length}
							<ul class="offers">
								{#each bestOffers as o (o.id)}
									<li><span class="slotl">{SPONSOR_SLOTS[o.slot].label}</span><span class="brand">{o.brand}</span><b class="money">{formatExactMoney(o.monthly)}<small>/mês</small></b></li>
								{/each}
							</ul>
						{/if}
						<a class="more" href="{base}/financas">{bestOffers.length ? 'Comparar e assinar propostas' : 'Abrir finanças'} <Icon name="arrowRight" size={14} /></a>
					</div>
				</Panel>
		{:else if workspace === 'dominio'}
		<Panel title="Domínio tático" icon="chart" index={7} class="m-mastery">
			<MasteryPanel state={v.tactical} {mastery} formation={tactic.formation} style={tactic.style} lineup={tactic.lineup} roles={tactic.roles} {slots} squad={v.squad} instructions={tactic.instructions} onformation={changeFormation} />
		</Panel>

		{:else if workspace === 'auxiliar'}
		<Panel title="Auxiliar técnico" icon="whistle" index={8} class="m-assist">
			<AssistantPanel {tips} {opponent} prepHref="{base}/partida" onapply={applyTip} ondismiss={dismissTip} />
		</Panel>
		{/if}
		</div>
		{/key}
	</div>
{/if}

<Modal bind:open={leaveModal} title="Sair sem salvar?" description="Sua tática tem alterações que ainda não foram salvas." size="sm">
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (leaveModal = false)}>Continuar editando</Button>
		<Button
			variant="danger"
			onclick={() => {
				reset();
				markClean(DIRTY_KEY);
				leaveModal = false;
				if (pendingHref) void goto(pendingHref);
			}}>Descartar e sair</Button
		>
	{/snippet}
</Modal>

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: var(--sp-4);
		flex-wrap: wrap;
		margin-bottom: var(--sp-5);
	}
	.intro p {
		max-width: 62ch;
		font-size: var(--fs-sm);
	}
	h1 {
		font-size: var(--fs-3xl);
		text-transform: uppercase;
		font-weight: 800;
	}
	.save {
		z-index: 20;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-2);
		padding: 6px;
		border-radius: 14px;
		transition: background 0.2s, box-shadow 0.2s;
	}
	@media (min-width: 961px) {
		/* fica à mão ao rolar: logo abaixo da barra fixa da carreira */
		.save {
			position: sticky;
			top: calc(var(--desk-bar, 0px) + 74px);
		}
	}
	.save.dirty {
		background: color-mix(in srgb, var(--surface) 88%, transparent);
		backdrop-filter: blur(8px);
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.3);
	}
	.pending {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--gold);
		font-size: var(--fs-sm);
		font-weight: 600;
	}

	/* campo + lateral */
	.center {
		display: grid;
		grid-template-columns: minmax(0, 1.24fr) minmax(0, 1fr);
		gap: var(--sp-4);
		align-items: start;
	}
	.pitch-tools {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--sp-3);
		flex-wrap: wrap;
		padding: var(--sp-4) var(--sp-4) 0;
	}
	.tools-r {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}
	.fam {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.pitch-wrap {
		display: flex;
		justify-content: center;
		padding: var(--sp-4) var(--sp-4) 0;
	}
	.slot {
		position: absolute;
		z-index: 2;
		translate: -50% -50%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		width: clamp(64px, 17cqw, 100px);
		padding: 4px 4px 6px;
		border: 1px solid transparent;
		border-radius: var(--radius-m);
		background: rgb(10 13 16 / 0.55);
		cursor: grab;
		transition:
			left 0.55s cubic-bezier(0.2, 0.8, 0.2, 1),
			top 0.55s cubic-bezier(0.2, 0.8, 0.2, 1),
			background 0.15s,
			border-color 0.15s,
			box-shadow 0.15s;
	}
	.slot:hover {
		background: rgb(10 13 16 / 0.82);
		border-color: var(--line-strong);
	}
	.slot.sel {
		border-color: var(--emerald);
		box-shadow: 0 0 0 3px var(--emerald-soft), 0 10px 26px rgb(0 0 0 / 0.4);
		z-index: 3;
	}
	.role {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.06em;
		padding: 0 6px;
		border-radius: 4px;
	}
	.rating-line {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.overall {
		color: var(--text);
		font-size: 11px;
		font-weight: 800;
	}
	.good .role {
		background: var(--emerald-soft);
		color: var(--emerald-strong);
	}
	.ok .role {
		background: var(--warning-soft);
		color: var(--warning);
	}
	.bad .role {
		background: var(--danger-soft);
		color: var(--danger);
	}
	.pname {
		font-size: var(--fs-xs);
		font-weight: 600;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.fn {
		font-size: 9.5px;
		color: var(--gold);
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cond {
		position: absolute;
		top: -6px;
		right: -6px;
		font-size: 9.5px;
		font-weight: 800;
		padding: 0 4px;
		border-radius: 6px;
		background: var(--danger);
		color: #fff;
	}
	@container (max-width: 520px) {
		.slot {
			scale: 0.84;
		}
		.fn {
			display: none;
		}
	}
	@container (max-width: 400px) {
		.slot {
			scale: 0.7;
			padding: 2px 2px 4px;
		}
		.role {
			font-size: 10px;
		}
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: var(--sp-3) var(--sp-4) var(--sp-4);
	}
	.legend span {
		font-size: 11px;
		font-weight: 700;
		padding: 4px 9px;
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--text-2);
	}
	.legend em {
		font-style: normal;
		color: var(--text-3);
		font-weight: 600;
	}
	.k i {
		display: inline-block;
		width: 12px;
		height: 3px;
		border-radius: 2px;
		margin-right: 5px;
		vertical-align: 2px;
	}
	i.run {
		background: #e8b86a;
	}
	i.sup {
		background: #60a5fa;
	}
	i.box {
		background: #f472b6;
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		min-width: 0;
	}
	.bench {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 175px), 1fr));
		gap: 4px;
	}
	.bench button {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		width: 100%;
		padding: 4px var(--sp-2);
		border: 1px solid transparent;
		border-radius: var(--radius-s);
		background: transparent;
		text-align: left;
		cursor: grab;
		transition: background 0.15s, transform 0.15s;
	}
	.bench button:hover {
		background: var(--surface-2);
		transform: translateX(2px);
	}
	.bench button.sel {
		border-color: var(--emerald);
		background: var(--emerald-soft);
	}
	.bn {
		font-size: var(--fs-sm);
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.bp {
		font-size: var(--fs-xs);
		color: var(--text-3);
		font-weight: 700;
	}
	.bo {
		text-align: right;
		font-weight: 700;
	}
	.style {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}
	.lbl {
		font-size: var(--fs-sm);
		font-weight: 600;
		color: var(--text-2);
	}
	.custom {
		display: flex;
		gap: 6px;
		align-items: center;
		flex-wrap: wrap;
		margin: 0;
		font-size: var(--fs-xs);
		color: var(--gold);
	}
	.link {
		border: 0;
		background: none;
		color: var(--emerald-strong);
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}
	.small {
		font-size: var(--fs-xs);
		margin: 0 0 8px;
	}

	.workspace { margin-top: var(--sp-4); }
	.below { display: grid; gap: var(--sp-4); margin-top: 12px; align-items: start; }
	.below.plan-grid { grid-template-columns: repeat(auto-fit, minmax(min(100%, 355px), 1fr)); }
	.below > :global(.panel), .side-content { min-width: 0; }
	.side-summary {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
		padding: 14px;
		background: linear-gradient(135deg, var(--emerald-soft), var(--surface-sunken));
		border: 1px solid var(--line);
		border-radius: var(--radius-m);
	}
	.side-summary small, .side-summary strong { display: block; }
	.side-summary small { color: var(--text-2); }
	.side-summary strong { color: var(--emerald-strong); font-size: var(--fs-xl); }
	.fitness-list { display: grid; gap: 8px; }
	.fitness-list > div { display: grid; grid-template-columns: minmax(80px, 1fr) minmax(60px, 2fr) 3em; gap: 10px; align-items: center; }
	.simple {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--sp-3);
	}
	.simple p {
		margin: 0;
		font-size: var(--fs-sm);
	}
	.presets {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 150px), 1fr));
		gap: 6px;
		width: 100%;
	}
	.pi {
		display: flex;
		flex-direction: column;
		padding: 7px 10px;
		border-radius: 10px;
		background: var(--surface-2);
		font-size: var(--fs-sm);
		font-weight: 700;
	}
	.pi em {
		font-style: normal;
		font-size: 11px;
		font-weight: 600;
		color: var(--text-3);
	}
	.pi.mod {
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--gold) 50%, transparent);
		color: var(--gold);
	}
	.plan {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.plan-id {
		display: flex;
		align-items: baseline;
		gap: 10px;
		flex-wrap: wrap;
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.formation {
		font-family: var(--font-display);
		font-size: 30px;
		font-weight: 800;
		color: var(--text);
		line-height: 1;
	}
	.kv {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
		margin: 0;
	}
	.kv div {
		padding: 7px 9px;
		border-radius: 9px;
		background: var(--surface-2);
	}
	.kv dt {
		font-size: 11px;
		color: var(--text-3);
	}
	.kv dd {
		margin: 0;
		font-size: var(--fs-sm);
		font-weight: 700;
	}
	h4 {
		margin: 4px 0 0;
		font-size: var(--fs-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-3);
	}
	.ovr {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}
	.ovr li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0 8px;
		padding: 6px 9px;
		border-radius: 9px;
		background: color-mix(in srgb, var(--gold) 9%, var(--surface-2));
		font-size: var(--fs-xs);
	}
	.ovr b {
		color: var(--gold);
		text-align: right;
	}
	.ovr small {
		grid-column: 1 / -1;
		color: var(--text-3);
	}
	.next {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.vs {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.x {
		color: var(--text-3);
		font-weight: 800;
	}
	.vsi {
		display: flex;
		flex-direction: column;
		min-width: 0;
		margin-left: 4px;
	}
	.vsi strong {
		font-size: var(--fs-sm);
	}
	.vsi small {
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.stats,
	.comtop {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
		gap: 6px;
	}
	.stats div,
	.comtop div {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 7px 9px;
		border-radius: 9px;
		background: var(--surface-2);
	}
	.stats span,
	.comtop span {
		font-size: 11px;
		color: var(--text-3);
	}
	.stats b,
	.comtop b {
		font-family: var(--font-display);
		font-size: 20px;
	}
	.warn {
		color: var(--danger);
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.com {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.money {
		font-variant-numeric: tabular-nums;
	}
	.money small {
		font-size: 0.6em;
		color: var(--text-3);
		font-family: var(--font-body, inherit);
	}
	.offers {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}
	.offers li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0 8px;
		align-items: center;
		padding: 7px 9px;
		border-radius: 9px;
		background: var(--surface-2);
	}
	.slotl {
		grid-column: 1 / -1;
		font-size: 10.5px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-3);
	}
	.brand {
		font-size: var(--fs-sm);
		font-weight: 650;
		overflow-wrap: anywhere;
	}
	.offers b {
		font-size: var(--fs-sm);
	}
	.more {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		align-self: flex-start;
		color: var(--emerald-strong);
		font-size: var(--fs-sm);
		font-weight: 700;
		text-decoration: none;
	}
	.more:hover {
		text-decoration: underline;
	}

	@media (max-width: 1020px) {
		.center { grid-template-columns: minmax(0, 1fr); }
	}
	@media (max-width: 650px) {
		.save { width: 100%; }
		.pitch-wrap { padding-inline: 6px; }
	}
</style>
