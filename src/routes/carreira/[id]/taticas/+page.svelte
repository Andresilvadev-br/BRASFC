<script lang="ts">
	import { untrack } from 'svelte';
	import { beforeNavigate, goto, invalidate } from '$app/navigation';
	import { api } from '#lib/api.ts';
	import { positionFit } from '#lib/domain/positions.ts';
	import type { SquadPlayer } from '#lib/domain/squad.ts';
	import {
		assistantReport,
		autoLineup,
		FORMATION_IDS,
		FORMATIONS,
		lineupFamiliarity,
		MENTALITY_LABELS,
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
	import Unavailable from '#lib/ui/Unavailable.svelte';

	let { data } = $props();
	const v = $derived(data.view);
	const byId = $derived(new Map(v.squad.map((p) => [p.id, p])));
	const DIRTY_KEY = 'tactic';

	// Estado de edição local (salvo explicitamente).
	let tactic = $state<Tactic>(untrack(() => structuredClone($state.snapshot(data.view.tactic))));
	let version = $state(untrack(() => data.career.version));
	let selection = $state<{ kind: 'slot'; index: number } | { kind: 'bench'; id: string } | null>(null);
	let saving = $state(false);
	let leaveModal = $state(false);
	let pendingHref: string | null = null;

	const saved = $derived(JSON.stringify(data.view.tactic));
	const dirty = $derived(JSON.stringify(tactic) !== saved || !v.tacticSaved);
	const slots = $derived(FORMATIONS[tactic.formation]);
	const bench = $derived(v.squad.filter((p) => !tactic.lineup.includes(p.id)).sort((a, b) => b.overall - a.overall));
	const familiarity = $derived(lineupFamiliarity(tactic.formation, tactic.lineup, v.squad));
	const report = $derived(assistantReport(tactic, v.squad));

	$effect(() => {
		if (dirty && JSON.stringify(tactic) !== saved) markDirty(DIRTY_KEY, 'Tática não salva');
		else markClean(DIRTY_KEY);
		return () => markClean(DIRTY_KEY);
	});

	beforeNavigate((nav) => {
		if (JSON.stringify(tactic) === saved || saving || !nav.to || nav.willUnload) return;
		nav.cancel();
		pendingHref = nav.to.url.pathname;
		leaveModal = true;
	});

	function changeFormation(f: FormationId) {
		const current = tactic.lineup.map((id) => byId.get(id)).filter((p): p is SquadPlayer => !!p);
		tactic.lineup = autoLineup(f, current.length === 11 ? current : v.squad);
		tactic.formation = f;
	}

	function swap(target: { kind: 'slot'; index: number } | { kind: 'bench'; id: string }) {
		const src = selection;
		selection = null;
		if (!src) return;
		const lineup = [...tactic.lineup];
		if (src.kind === 'slot' && target.kind === 'slot') {
			[lineup[src.index], lineup[target.index]] = [lineup[target.index], lineup[src.index]];
		} else if (src.kind === 'bench' && target.kind === 'slot') {
			lineup[target.index] = src.id;
		} else if (src.kind === 'slot' && target.kind === 'bench') {
			lineup[src.index] = target.id;
		} else return;
		tactic.lineup = lineup;
		const idx = target.kind === 'slot' ? target.index : src.kind === 'slot' ? src.index : -1;
		const el = document.querySelector(`[data-slot="${idx}"]`);
		if (el) void animate(el, { scale: 1 }, { spring: 'snappy', from: { scale: 0.86 } });
	}

	function clickSlot(index: number) {
		if (!selection) selection = { kind: 'slot', index };
		else if (selection.kind === 'slot' && selection.index === index) selection = null;
		else swap({ kind: 'slot', index });
	}

	function clickBench(id: string) {
		if (!selection) selection = { kind: 'bench', id };
		else if (selection.kind === 'bench') selection = selection.id === id ? null : { kind: 'bench', id };
		else swap({ kind: 'bench', id });
	}

	// Arrastar e soltar (mouse); o clique em dois passos é a alternativa acessível.
	function onDragStart(e: DragEvent, src: { kind: 'slot'; index: number } | { kind: 'bench'; id: string }) {
		selection = src;
		e.dataTransfer?.setData('text/plain', JSON.stringify(src));
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}
	function onDrop(e: DragEvent, target: { kind: 'slot'; index: number } | { kind: 'bench'; id: string }) {
		e.preventDefault();
		swap(target);
	}

	function fitTone(p: SquadPlayer | undefined, i: number) {
		if (!p) return 'bad';
		const fit = positionFit(p.position, slots[i].position);
		return fit === 1 ? 'good' : fit >= 0.6 ? 'ok' : 'bad';
	}

	async function save() {
		saving = true;
		try {
			const res = await api<{ career: Career }>(`/api/careers/${data.career.id}`, {
				method: 'PATCH',
				body: { version, tactic: $state.snapshot(tactic) }
			});
			version = res.career.version;
			markClean(DIRTY_KEY);
			await invalidate('app:career');
			notify({ icon: 'save', tone: 'success', title: 'Tática salva', detail: `${tactic.formation} · ${MENTALITY_LABELS[tactic.mentality]}` });
		} catch (e) {
			notify({ icon: 'alert', tone: 'error', title: e instanceof Error ? e.message : 'Falha ao salvar' });
		} finally {
			saving = false;
		}
	}

	function reset() {
		tactic = structuredClone($state.snapshot(data.view.tactic));
		selection = null;
	}

	function isSel(kind: 'slot' | 'bench', key: number | string) {
		if (!selection || selection.kind !== kind) return false;
		return selection.kind === 'slot' ? selection.index === key : selection.id === key;
	}
</script>

<svelte:head><title>Táticas · {v.club.name} · BRASFC</title></svelte:head>

{#if data.career.mode !== 'coach'}
	<Panel title="Táticas">
		<p class="muted">Na carreira de jogador, a tática é definida pelo treinador do clube.</p>
	</Panel>
{:else}
	<div class="head" data-umx-enter>
		<div>
			<span class="eyebrow">Central tática · demonstrativa</span>
			<h1>Táticas</h1>
			<p class="muted">Clique em um jogador e depois em outro para trocar — ou arraste. A tática fica salva; o motor de partidas que a usa chega na Etapa 2.</p>
		</div>
		<div class="save">
			{#if dirty && JSON.stringify(tactic) !== saved}<span class="pending"><Icon name="dot" size={12} /> Alterações não salvas</span>{/if}
			<Button variant="ghost" onclick={reset} disabled={JSON.stringify(tactic) === saved}>Desfazer</Button>
			<Button variant="primary" icon="save" loading={saving} disabled={!dirty} onclick={save}>Salvar tática</Button>
		</div>
	</div>

	<div class="layout">
		<Panel pad={false} index={0} class="pitch-panel">
			<div class="pitch-tools">
				<Segmented label="Formação" value={tactic.formation} onchange={changeFormation} options={FORMATION_IDS.map((f) => ({ value: f, label: f }))} />
				<div class="fam"><span>Familiaridade</span><Meter value={familiarity} label="Familiaridade tática" /></div>
			</div>
			<div class="pitch" role="group" aria-label="Campo com titulares">
				<svg class="lines" viewBox="0 0 68 105" preserveAspectRatio="none" aria-hidden="true">
					<rect x="1" y="1" width="66" height="103" />
					<line x1="1" y1="52.5" x2="67" y2="52.5" />
					<circle cx="34" cy="52.5" r="9.15" />
					<rect x="13.85" y="1" width="40.3" height="16.5" />
					<rect x="13.85" y="87.5" width="40.3" height="16.5" />
					<rect x="24.85" y="1" width="18.3" height="5.5" />
					<rect x="24.85" y="98.5" width="18.3" height="5.5" />
				</svg>
				{#each slots as slot, i (i + tactic.formation)}
					{@const p = byId.get(tactic.lineup[i])}
					<button
						class="slot {fitTone(p, i)}"
						class:sel={isSel('slot', i)}
						data-slot={i}
						style="left:{slot.x}%; top:{slot.y}%"
						draggable="true"
						ondragstart={(e) => onDragStart(e, { kind: 'slot', index: i })}
						ondragover={(e) => e.preventDefault()}
						ondrop={(e) => onDrop(e, { kind: 'slot', index: i })}
						onclick={() => clickSlot(i)}
						aria-pressed={isSel('slot', i)}
						aria-label="{slot.position}: {p?.name ?? 'vazio'}"
					>
						{#if p}<Pixel appearance={p.appearance} kit={playerKit(data.career.clubId, p.position)} size={40} />{/if}
						<span class="role">{slot.position}</span>
						<span class="pname">{p?.shortName ?? '—'}</span>
					</button>
				{/each}
			</div>
		</Panel>

		<div class="side">
			<Panel title="Reservas" icon="squad" index={1}>
				<ul class="bench">
					{#each bench as p (p.id)}
						<li>
							<button
								class:sel={isSel('bench', p.id)}
								draggable="true"
								ondragstart={(e) => onDragStart(e, { kind: 'bench', id: p.id })}
								ondragover={(e) => e.preventDefault()}
								ondrop={(e) => onDrop(e, { kind: 'bench', id: p.id })}
								onclick={() => clickBench(p.id)}
								aria-pressed={isSel('bench', p.id)}
							>
								<Pixel appearance={p.appearance} kit={playerKit(data.career.clubId, p.position)} size={30} />
								<span class="bn">{p.name}</span>
								<span class="bp">{p.position}</span>
								<span class="bo num">{p.overall}</span>
							</button>
						</li>
					{/each}
				</ul>
			</Panel>
			<Panel title="Estilo" icon="field" index={2}>
				<div class="style">
					<span class="lbl">Mentalidade</span>
					<MentalityScale bind:value={tactic.mentality} />
					<span class="lbl">Estilo de jogo</span>
					<StylePicker bind:value={tactic.style} />
				</div>
			</Panel>
			<Panel title="Relatório do auxiliar" icon="whistle" index={3}>
				<ul class="report">
					{#each report as n (n.text)}
						<li data-tone={n.tone}><Icon name={n.tone === 'alerta' ? 'alert' : n.tone === 'positivo' ? 'check' : 'info'} size={16} /> {n.text}</li>
					{/each}
				</ul>
				<Unavailable title="Auxiliar humano ou IA" detail="Conversas e sugestões personalizadas" icon="user" />
			</Panel>
		</div>
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
	.head p {
		max-width: 62ch;
		font-size: var(--fs-sm);
	}
	h1 {
		font-size: var(--fs-3xl);
		text-transform: uppercase;
		font-weight: 800;
	}
	.save {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.pending {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--gold);
		font-size: var(--fs-sm);
		font-weight: 600;
	}
	.layout {
		display: grid;
		grid-template-columns: auto minmax(340px, 1fr);
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
	.fam {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.pitch {
		position: relative;
		margin: var(--sp-4);
		aspect-ratio: 68 / 96;
		height: clamp(560px, calc(100vh - 230px), 820px);
		border-radius: var(--radius-l);
		background: repeating-linear-gradient(180deg, #123e2d 0 9%, #10372a 9% 18%);
		overflow: hidden;
		box-shadow: inset 0 0 60px rgb(0 0 0 / 0.45);
	}
	.lines {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		fill: none;
		stroke: rgb(231 237 240 / 0.28);
		stroke-width: 0.35;
	}
	.slot {
		position: absolute;
		translate: -50% -50%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		width: 96px;
		padding: 4px 4px 6px;
		border: 1px solid transparent;
		border-radius: var(--radius-m);
		background: rgb(10 13 16 / 0.55);
		cursor: grab;
		transition:
			background 0.15s,
			border-color 0.15s;
	}
	.slot:hover {
		background: rgb(10 13 16 / 0.8);
		border-color: var(--line-strong);
	}
	.slot.sel {
		border-color: var(--emerald);
		box-shadow: 0 0 0 3px var(--emerald-soft);
	}
	.role {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.06em;
		padding: 0 6px;
		border-radius: 4px;
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
	.side {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}
	.bench {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 300px;
		overflow-y: auto;
	}
	.bench button {
		display: grid;
		grid-template-columns: auto 1fr auto 32px;
		align-items: center;
		gap: var(--sp-3);
		width: 100%;
		padding: 4px var(--sp-2);
		border: 1px solid transparent;
		border-radius: var(--radius-s);
		background: transparent;
		text-align: left;
		cursor: grab;
	}
	.bench button:hover {
		background: var(--surface-2);
	}
	.bench button.sel {
		border-color: var(--emerald);
		background: var(--emerald-soft);
	}
	.bn {
		font-size: var(--fs-sm);
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
	.report {
		list-style: none;
		margin: 0 0 var(--sp-3);
		padding: 0;
		display: grid;
		gap: var(--sp-2);
	}
	.report li {
		display: flex;
		gap: var(--sp-2);
		align-items: flex-start;
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.report li[data-tone='alerta'] :global(.icon) {
		color: var(--warning);
	}
	.report li[data-tone='positivo'] :global(.icon) {
		color: var(--emerald-strong);
	}
	.report li[data-tone='info'] :global(.icon) {
		color: var(--info);
	}
	@media (max-width: 1100px) {
		.layout {
			grid-template-columns: 1fr;
		}
		.pitch {
			height: auto;
			width: calc(100% - 32px);
		}
		.slot {
			width: 78px;
		}
	}
</style>
