<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { api, withCareerVersion } from '#lib/api.ts';
	import type { Career } from '#lib/domain/career.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import type { SquadPlayer } from '#lib/domain/squad.ts';
	import { applyPreset, defaultPresetName, MAX_PRESETS, presetShape, type PresetApplication, type TacticPreset } from '#lib/domain/tactic-presets.ts';
	import { MENTALITY_LABELS, STYLE_LABELS, type Tactic } from '#lib/domain/tactics.ts';
	import { enter } from '#lib/motion/actions.ts';
	import { notify } from '#lib/stores/island.svelte.ts';
	import Button from '../Button.svelte';
	import Icon from '../Icon.svelte';
	import Modal from '../Modal.svelte';

	let { careerId, version, presets, tactic, squad, clubId, unavailable, fitness, dirty, onapply }: {
		careerId: string; version: number; presets: TacticPreset[]; tactic: Tactic; squad: SquadPlayer[]; clubId: string;
		unavailable: Set<string>; fitness: Record<string, number>; dirty: boolean; onapply: (t: Tactic) => void;
	} = $props();

	let busy = $state(false);
	let menu = $state<string | null>(null);
	let nameOpen = $state(false);
	let nameMode = $state<'save' | 'rename'>('save');
	let nameTarget = $state<TacticPreset | null>(null);
	let name = $state('');
	let applyOpen = $state(false);
	let applying = $state<{ preset: TacticPreset; result: PresetApplication } | null>(null);
	let removeOpen = $state(false);
	let removing = $state<TacticPreset | null>(null);

	async function op(body: Record<string, unknown>, title: string) {
		busy = true;
		try {
			const r = await withCareerVersion(careerId, version, (v) => api<{ career: Career; message?: string }>(`/api/careers/${careerId}`, { method: 'PATCH', body: { version: v, preset: body } }));
			await invalidate('app:career').catch(() => {});
			notify({ icon: 'save', tone: 'success', title, detail: r.message ?? '' });
			return true;
		} catch (e) {
			notify({ icon: 'alert', tone: 'error', title: 'Biblioteca não atualizada', detail: (e as Error).message });
			return false;
		} finally {
			busy = false;
			menu = null;
		}
	}

	function openSave() {
		nameMode = 'save';
		nameTarget = null;
		name = defaultPresetName(tactic);
		nameOpen = true;
	}
	function openRename(p: TacticPreset) {
		nameMode = 'rename';
		nameTarget = p;
		name = p.name;
		nameOpen = true;
		menu = null;
	}
	async function confirmName() {
		const ok = nameMode === 'save'
			? await op({ op: 'save', name, tactic: $state.snapshot(tactic) }, 'Tática salva')
			: await op({ op: 'rename', id: nameTarget!.id, name }, 'Tática renomeada');
		if (ok) nameOpen = false;
	}
	function preview(p: TacticPreset) {
		applying = { preset: p, result: applyPreset(p, $state.snapshot(tactic) as Tactic, squad, { clubId, unavailable, fitness }) };
		applyOpen = true;
		menu = null;
	}
	function confirmApply() {
		if (!applying) return;
		onapply(applying.result.tactic);
		notify({ icon: 'check', tone: 'success', title: `"${applying.preset.name}" aplicada`, detail: 'Revise e salve a tática para usá-la na próxima partida.' });
		applyOpen = false;
	}
</script>

<section class="library" aria-labelledby="lib-title">
	<header>
		<h2 id="lib-title"><Icon name="save" size={16} /> Minhas Táticas <small>{presets.length}/{MAX_PRESETS}</small></h2>
		<Button size="sm" variant="secondary" icon="plus" disabled={busy || presets.length >= MAX_PRESETS} onclick={openSave}>Salvar tática atual</Button>
	</header>
	{#if presets.length}
		<ul class="rail">
			{#each presets as p, i (p.id)}
				<li class="card" use:enter={{ index: i }}>
					<svg viewBox="0 0 100 100" class="shape" aria-hidden="true">
						<rect x="2" y="2" width="96" height="96" rx="6" />
						{#each presetShape(p) as s, k (k)}<circle cx={s.x} cy={s.y} r="5" class:gk={s.position === 'GOL'} />{/each}
					</svg>
					<div class="info">
						<strong title={p.name}>{p.name}</strong>
						<small>{p.formation} · {STYLE_LABELS[p.style]} · {MENTALITY_LABELS[p.mentality]}</small>
						<small class="origin">Criada no {getClub(p.origin.clubId)?.short ?? '—'}{p.origin.season ? ` · ${p.origin.season}` : ''}</small>
					</div>
					<div class="btns">
						<Button size="sm" variant="gold" disabled={busy} onclick={() => preview(p)}>Aplicar</Button>
						<button class="more" aria-label="Opções de {p.name}" aria-expanded={menu === p.id} onclick={() => (menu = menu === p.id ? null : p.id)}><Icon name="chevronDown" size={16} /></button>
					</div>
					{#if menu === p.id}
						<div class="menu" role="menu">
							<button role="menuitem" onclick={() => openRename(p)}><Icon name="keyboard" size={14} /> Renomear</button>
							<button role="menuitem" onclick={() => op({ op: 'duplicate', id: p.id }, 'Tática duplicada')}><Icon name="copy" size={14} /> Duplicar</button>
							<button role="menuitem" onclick={() => op({ op: 'replace', id: p.id, tactic: $state.snapshot(tactic) }, 'Tática substituída')}><Icon name="refresh" size={14} /> Substituir pela atual</button>
							<button role="menuitem" class="danger" onclick={() => { removing = p; removeOpen = true; menu = null; }}><Icon name="trash" size={14} /> Excluir</button>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="muted empty">Salve a forma como você gosta de jogar — formação, estilo, instruções, funções e ordens por posição. A biblioteca é sua e vai junto em qualquer clube.</p>
	{/if}
</section>

<Modal bind:open={nameOpen} title={nameMode === 'save' ? 'Salvar tática atual' : 'Renomear tática'} description={nameMode === 'save' ? 'Formação, mentalidade, estilo, instruções, funções e ordens individuais serão guardados.' : undefined} size="sm">
	<label class="field">Nome
		<input bind:value={name} maxlength="48" placeholder="Ex.: 4-3-3 — Posse e Pressão" onkeydown={(e) => e.key === 'Enter' && confirmName()} />
	</label>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (nameOpen = false)}>Cancelar</Button>
		<Button variant="primary" icon="save" loading={busy} disabled={busy || name.trim().length < 2} onclick={confirmName}>Salvar</Button>
	{/snippet}
</Modal>

<Modal bind:open={applyOpen} title={applying ? `Aplicar "${applying.preset.name}"?` : 'Aplicar tática'} description="Prévia das mudanças. Nada é salvo até você confirmar e salvar a tática." size="md">
	{#if applying}
		<ul class="changes">
			{#each applying.result.changes as ch, i (i)}<li><Icon name="arrowRight" size={14} /> {ch}</li>{/each}
		</ul>
		{#if applying.result.review.length}
			<div class="review">
				<strong><Icon name="info" size={14} /> Para revisar</strong>
				<ul>{#each applying.result.review as r, i (i)}<li>{r}</li>{/each}</ul>
			</div>
		{/if}
		{#if dirty}<p class="warn"><Icon name="alert" size={14} /> Há alterações não salvas nesta tela. Elas serão substituídas pelo preset.</p>{/if}
	{/if}
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (applyOpen = false)}>Cancelar</Button>
		<Button variant="gold" icon="check" onclick={confirmApply}>Aplicar na prancheta</Button>
	{/snippet}
</Modal>

<Modal bind:open={removeOpen} title="Excluir tática?" description={removing ? `"${removing.name}" sai da sua biblioteca. A tática em uso no clube não muda.` : undefined} size="sm">
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (removeOpen = false)}>Cancelar</Button>
		<Button variant="danger" icon="trash" loading={busy} onclick={async () => { if (removing && (await op({ op: 'delete', id: removing.id }, 'Tática excluída'))) removeOpen = false; }}>Excluir</Button>
	{/snippet}
</Modal>

<style>
	.library { display: grid; gap: 10px; padding: 12px 14px; border-radius: 16px; background: rgb(231 237 240 / 0.035); border: 1px solid rgb(231 237 240 / 0.07); }
	header { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
	h2 { display: flex; gap: 8px; align-items: center; margin: 0; font-size: var(--fs-sm); text-transform: uppercase; letter-spacing: 0.08em; }
	h2 small { color: var(--text-3); font-weight: 500; }
	.rail { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(250px, 1fr); gap: 10px; overflow-x: auto; margin: 0; padding: 2px 2px 6px; list-style: none; scroll-snap-type: x proximity; }
	.card { position: relative; display: grid; grid-template-columns: 56px 1fr; gap: 10px; align-items: center; padding: 10px; border-radius: 14px; background: rgb(2 6 23 / 0.35); scroll-snap-align: start; }
	.shape { width: 56px; height: 56px; }
	.shape rect { fill: rgb(16 185 129 / 0.12); stroke: rgb(16 185 129 / 0.35); }
	.shape circle { fill: #e7edf0; }
	.shape circle.gk { fill: #f5c451; }
	.info { display: grid; min-width: 0; }
	.info strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.info small { color: var(--text-3); font-size: var(--fs-xs); }
	.origin { opacity: 0.8; }
	.btns { grid-column: 1 / -1; display: flex; gap: 6px; justify-content: flex-end; }
	.more { display: grid; place-items: center; width: 32px; border-radius: 8px; border: 1px solid rgb(231 237 240 / 0.12); background: transparent; color: inherit; cursor: pointer; }
	.menu { position: absolute; z-index: 5; right: 10px; bottom: 46px; display: grid; min-width: 190px; padding: 6px; border-radius: 12px; background: #0f172a; border: 1px solid rgb(231 237 240 / 0.12); box-shadow: 0 16px 40px -16px #000; }
	.menu button { display: flex; gap: 8px; align-items: center; padding: 8px 10px; border: 0; border-radius: 8px; background: transparent; color: inherit; text-align: left; cursor: pointer; }
	.menu button:hover, .menu button:focus-visible { background: rgb(231 237 240 / 0.08); }
	.menu .danger { color: var(--danger); }
	.empty { margin: 0; font-size: var(--fs-sm); }
	.field { display: grid; gap: 6px; font-size: var(--fs-sm); color: var(--text-3); }
	.field input { padding: 10px 12px; border-radius: 10px; border: 1px solid rgb(231 237 240 / 0.16); background: rgb(2 6 23 / 0.5); color: inherit; font: inherit; }
	.changes { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
	.changes li { display: flex; gap: 8px; align-items: center; }
	.review { margin-top: 12px; padding: 10px 12px; border-radius: 12px; background: rgb(59 130 246 / 0.1); }
	.review ul { margin: 6px 0 0; padding-left: 18px; font-size: var(--fs-sm); }
	.warn { display: flex; gap: 6px; align-items: center; color: #f8c46b; font-size: var(--fs-sm); }
</style>
