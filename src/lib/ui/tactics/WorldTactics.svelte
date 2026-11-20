<script lang="ts">
	import { onDestroy } from 'svelte';
	import { FORMATIONS, FORMATION_IDS, MATCH_BENCH_SIZE, autoLineup, sanitizeTactic, sameTactic, type FormationId, type Tactic } from '#lib/domain/tactics.ts';
	import { pickBench } from '#lib/engine/teams.ts';
	import { resolveRoles } from '#lib/domain/tactical.ts';
	import type { SquadPlayer } from '#lib/domain/squad.ts';
	import { presetInstructions, type TacticalInstructions } from '#lib/engine/instructions.ts';
	import { markClean, markDirty } from '#lib/stores/unsaved.svelte.ts';
	import { playerKit } from '#lib/pixel/kits.ts';
	import Button from '../Button.svelte';
	import MentalityScale from '../MentalityScale.svelte';
	import Meter from '../Meter.svelte';
	import Pixel from '../Pixel.svelte';
	import Segmented from '../Segmented.svelte';
	import StylePicker from '../StylePicker.svelte';
	import InstructionsEditor from './InstructionsEditor.svelte';
	import LineupPitch from './LineupPitch.svelte';
	import PlayerOrders from './PlayerOrders.svelte';
	import TacticalOverlay from './TacticalOverlay.svelte';

	let { key, tactic, squad, club, mastery, canEdit, busy, onsave }: {
		key: string; tactic: Tactic; squad: SquadPlayer[]; club: string; mastery?: number;
		canEdit: boolean; busy: boolean; onsave: (value: Tactic, base: Tactic) => Promise<boolean>;
	} = $props();

	let draft = $state<Tactic | null>(null);
	let original: Tactic | null = null;
	let slot = $state<number | null>(null);
	let substitute = $state<string | null>(null);
	let panel = $state('elenco');
	let showShape = $state(false);
	const official = $derived(draft ?? tactic);
	const slots = $derived(FORMATIONS[official.formation]);
	const players = $derived(new Map(squad.map((player) => [player.id, player])));
	const bench = $derived(official.bench ?? pickBench(squad, official.lineup));
	const reserves = $derived(squad.filter((player) => !official.lineup.includes(player.id) && !bench.includes(player.id)));
	const captain = $derived(official.captains?.find((id) => official.lineup.includes(id)) ?? official.lineup[0]);
	const preset = $derived(presetInstructions(official.mentality, official.style));
	const instructions = $derived({ ...preset, ...official.instructions });
	const changed = $derived(draft !== null && !sameTactic({ ...tactic, bench: tactic.bench ?? pickBench(squad, tactic.lineup) }, draft));
	const unsavedKey = $derived(`world-tactics:${key}`);
	$effect(() => {
		if (changed) markDirty(unsavedKey, 'Tática do universo');
		else markClean(unsavedKey);
	});
	onDestroy(() => markClean(unsavedKey));

	function edit() {
		original = structuredClone($state.snapshot(tactic));
		draft = { ...structuredClone(original), bench: [...bench] };
	}
	function discard() {
		draft = null;
		original = null;
		slot = null;
		substitute = null;
	}
	async function save() {
		if (!draft || !original) return;
		const valid = sanitizeTactic($state.snapshot(draft), squad);
		if (valid && await onsave(valid, original)) discard();
	}
	function changeFormation(formation: FormationId) {
		if (!draft) return;
		const lineup = autoLineup(formation, squad);
		draft = { ...draft, formation, lineup, bench: bench.filter((id) => !lineup.includes(id)), roles: undefined };
		slot = null;
		substitute = null;
	}
	function choose(index: number) {
		substitute = null;
		if (!draft || slot === index || slot === null) { slot = index; return; }
		const lineup = [...draft.lineup];
		[lineup[slot], lineup[index]] = [lineup[index], lineup[slot]];
		if (sanitizeTactic({ ...draft, lineup }, squad)) draft.lineup = lineup;
		slot = index;
	}
	function replace(id: string) {
		if (!draft || slot === null) return;
		const lineup = [...draft.lineup];
		const outgoing = lineup[slot];
		const nextBench = bench.map((player) => player === id ? outgoing : player);
		lineup[slot] = id;
		const valid = sanitizeTactic({ ...draft, lineup, bench: nextBench }, squad);
		if (valid) draft = valid;
		slot = null;
		substitute = null;
	}
	function pickSubstitute(id: string) {
		if (slot !== null) replace(id);
		else substitute = substitute === id ? null : id;
	}
	function pickReserve(id: string) {
		if (!draft) return;
		if (slot !== null) replace(id);
		else if (substitute) {
			draft.bench = bench.map((player) => player === substitute ? id : player);
			substitute = null;
		} else if (bench.length < MATCH_BENCH_SIZE) {
			draft.bench = [...bench, id];
		}
	}
	function setInstructions(value: TacticalInstructions) {
		if (draft) draft.instructions = value;
	}
</script>

<div class="head" data-umx-enter>
	<div><h2>Táticas e escalação</h2><p>{draft ? 'Selecione um titular e depois outro jogador para trocar.' : 'Formação oficial do clube.'}</p></div>
	<div class="actions">
		{#if draft}
			<Button variant="ghost" disabled={busy} onclick={discard}>Descartar</Button>
			<Button variant="primary" icon="save" loading={busy} disabled={!changed} onclick={save}>Salvar tática</Button>
		{:else if canEdit}<Button variant="primary" icon="tactics" onclick={edit}>Editar tática</Button>{/if}
	</div>
</div>

<div class="tactics">
	<section class="lineup">
		<div class="tools">
			{#if draft}<Segmented label="Formação" value={draft.formation} onchange={changeFormation} options={FORMATION_IDS.map((formation) => ({ value: formation, label: formation }))} />{:else}<strong>{official.formation}</strong>{/if}
			{#if mastery !== undefined}<Meter value={mastery} label="Domínio da formação" />{/if}
			<button type="button" class="shape" aria-pressed={showShape} onclick={() => showShape = !showShape}>Mapa de comportamento</button>
		</div>
		<LineupPitch>
			{#if showShape}<TacticalOverlay formation={official.formation} mentality={official.mentality} style={official.style} {instructions} roles={resolveRoles(official.formation, official.roles)} legend={false} />{/if}
			{#each slots as field, i (i)}
				{@const player = players.get(official.lineup[i])}
				<button type="button" class="slot" class:active={slot === i} style:left={field.x + '%'} style:top={field.y + '%'}
					aria-label={`${field.position}: ${player ? `Overall ${player.overall} · ${player.name}` : 'vaga'}`}
					aria-pressed={slot === i} onclick={() => choose(i)}>
					{#if player}
						<Pixel appearance={player.appearance} kit={playerKit(club, player.position)} size={36} />
						<span>{player.shortName}</span>
					{/if}
					<small class="rating-line">{field.position}{player && captain === player.id ? ' · C' : ''}
						{#if player}<b class="num" title="Overall">{player.overall}</b>{/if}
					</small>
				</button>
			{/each}
		</LineupPitch>
	</section>

	<section class="options">
		<Segmented label="Ferramentas de tática" bind:value={panel} options={[{ value: 'elenco', label: 'Convocação' }, { value: 'coletivo', label: 'Coletivo' }, { value: 'atleta', label: 'Por atleta' }]} />
		{#if panel === 'elenco'}
			{#if draft}<p>{slot !== null ? `Escolha quem entra no lugar de ${players.get(official.lineup[slot])?.name}.` : substitute ? 'Escolha um reserva para trocar com o suplente selecionado.' : 'Selecione um titular no campo ou um suplente no banco para fazer a troca.'}</p>{/if}
			<h3>Banco de suplentes · {bench.length}/{MATCH_BENCH_SIZE}</h3>
			<div class="bench" aria-label="Banco de suplentes">
				{#each bench as id (id)}
					{@const player = players.get(id)}
					{#if player}<button type="button" disabled={!draft || busy} aria-pressed={substitute === id} onclick={() => pickSubstitute(id)}><small>{player.position}</small><strong>{player.name}</strong><span>{player.overall}</span></button>{/if}
				{:else}<p>Banco vazio.</p>{/each}
			</div>
			{#if draft && substitute}<Button disabled={busy} size="sm" onclick={() => { if (draft) draft.bench = bench.filter((id) => id !== substitute); substitute = null; }}>Retirar do banco</Button>{/if}
			<h3>Reservas fora da convocação · {reserves.length}</h3>
			<div class="bench" aria-label="Reservas fora da convocação">
				{#each reserves as player (player.id)}
					<button type="button" disabled={!draft || busy || (slot === null && !substitute && bench.length >= MATCH_BENCH_SIZE)} onclick={() => pickReserve(player.id)}><small>{player.position}</small><strong>{player.name}</strong><span>{player.overall}</span></button>
				{:else}<p>Todos os atletas estão convocados.</p>
				{/each}
			</div>
		{:else if panel === 'coletivo'}
			{#if draft}
				<MentalityScale bind:value={draft.mentality} />
				<StylePicker bind:value={draft.style} compact />
				<InstructionsEditor bind:value={() => instructions, setInstructions} {preset} />
			{:else}<p>{official.formation} · {official.mentality} · {official.style}</p><p>Pressão {instructions.pressao}/5</p>{/if}
		{:else}
			<PlayerOrders {squad} lineup={official.lineup} slotPositions={slots.map((field) => field.position)} order={official.captains} instructions={official.playerOrders}
				selected={slot === null ? '' : official.lineup[slot]} disabled={!draft || busy}
				oninstruction={(id, value) => { if (draft) { const orders = { ...draft.playerOrders }; if (value) orders[id] = value; else delete orders[id]; draft.playerOrders = orders; } }}
				oncaptains={(ids) => { if (draft) draft.captains = ids; }} />
		{/if}
	</section>
</div>

<style>
	.head, .tools, .actions { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
	.head { justify-content:space-between; margin-bottom:16px; }
	h2, .head p, h3 { margin:0; }
	.head p { color:var(--text-2); }
	.tactics { display:grid; grid-template-columns:minmax(0,1.25fr) minmax(280px,1fr); gap:14px; }
	.options,.lineup { min-width:0; padding:12px; border:1px solid var(--line); border-radius:var(--radius-l); background:var(--surface); }
	.lineup { display:grid; justify-items:center; gap:10px; }
	.options { display:flex; flex-direction:column; gap:12px; align-items:stretch; }
	.tools { justify-content:center; }
	.shape { border:1px solid var(--line); padding:5px 9px; border-radius:var(--radius); color:var(--text-2); }
	.shape[aria-pressed='true'] { color:var(--emerald-strong); }
	.slot { position:absolute; z-index:2; translate:-50% -50%; display:grid; gap:1px; justify-items:center; min-width:0;
		width:min(18cqw,84px); padding:3px; border-radius:8px; border:1px solid transparent; background:#0b151cce; color:var(--text); cursor:pointer; }
	.slot span { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:var(--fs-xs); }
	.slot small { color:var(--emerald-strong); font-weight:700; font-size:.7rem; }
	.rating-line { display:inline-flex; align-items:center; gap:4px; white-space:nowrap; }
	.rating-line b { color:var(--text); font-weight:800; }
	.slot:is(:hover,:focus-visible,.active) { border-color:var(--emerald); background:#122f26; }
	.bench { display:grid; gap:5px; max-height:510px; overflow:auto; }
	.bench button { display:grid; grid-template-columns:38px minmax(0,1fr) 30px; text-align:left; align-items:center; gap:7px; padding:8px; border:1px solid var(--line); border-radius:8px; color:var(--text); }
	.bench button:is(:enabled:hover,[aria-pressed='true']) { border-color:var(--emerald); }
	.bench small,.bench button:disabled { color:var(--text-2); }
	@media(max-width:760px) { .tactics { grid-template-columns:1fr; } .bench { max-height:300px; } }
	@container(max-width:440px) { .slot :global(svg) { height:22px; width:auto; } .slot span { font-size:.62rem; } }
</style>
