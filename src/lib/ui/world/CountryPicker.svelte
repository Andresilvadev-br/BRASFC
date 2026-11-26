<script lang="ts" module>
	import type { Confederation, LoadEstimate } from '#lib/world/contract.ts';

	export interface CountryCard {
		code: string;
		name: string;
		flag: string;
		confederation: Confederation | null;
		clubCount: number;
		playable: boolean;
		load: LoadEstimate;
		cups: number;
		divisions: Array<{ id: string; name: string; level: number; clubs: number; playable: boolean }>;
	}

	export function formatSeconds(ms: number): string {
		if (ms < 1000) return '< 1 s';
		if (ms < 60_000) return `≈ ${Math.round(ms / 1000)} s`;
		return `≈ ${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
	}

	/** Mesmos limites do assistente do PR #32 (partidas por temporada). */
	export function impactOf(matches: number): 'Leve' | 'Moderado' | 'Alto' {
		return matches <= 550 ? 'Leve' : matches <= 1100 ? 'Moderado' : 'Alto';
	}
</script>

<script lang="ts">
	import Icon from '../Icon.svelte';
	import Flag from './Flag.svelte';

	/**
	 * Seleção de países da carreira. Ativar um país ativa todas as suas divisões jogáveis. A seleção pertence
	 * ao save e vale para todos os treinadores locais. Países sem inscrições confirmadas aparecem como
	 * "em preparação": os clubes deles seguem disponíveis no mercado.
	 */
	let { countries, selected = $bindable(['bra']) }: { countries: CountryCard[]; selected?: string[] } = $props();

	const CONFEDERATIONS: Array<{ id: Confederation | 'all'; label: string }> = [
		{ id: 'all', label: 'Todos' }, { id: 'CONMEBOL', label: 'América do Sul' }, { id: 'UEFA', label: 'Europa' },
		{ id: 'CONCACAF', label: 'América do Norte' }, { id: 'AFC', label: 'Ásia' }, { id: 'CAF', label: 'África' }, { id: 'OFC', label: 'Oceania' }
	];
	let query = $state('');
	let region = $state<Confederation | 'all'>('all');
	const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
	const visible = $derived(countries.filter((c) => (region === 'all' || c.confederation === region) && (!query.trim() || fold(c.name).includes(fold(query.trim())))));
	const playable = $derived(visible.filter((c) => c.playable));
	const preparing = $derived(visible.filter((c) => !c.playable));
	const regions = $derived(CONFEDERATIONS.filter((r) => r.id === 'all' || countries.some((c) => c.confederation === r.id)));

	function toggle(code: string) {
		selected = selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code];
	}
</script>

<div class="picker">
	<div class="tools">
		<label class="search">
			<Icon name="search" size={16} />
			<input type="search" placeholder="Buscar país" bind:value={query} aria-label="Buscar país" />
		</label>
		<div class="regions" role="radiogroup" aria-label="Continente">
			{#each regions as r (r.id)}
				<button type="button" role="radio" aria-checked={region === r.id} class:on={region === r.id} onclick={() => (region = r.id)}>{r.label}</button>
			{/each}
		</div>
	</div>

	{#if playable.length}
		<ul class="grid" aria-label="Países jogáveis">
			{#each playable as c (c.code)}
				{@const on = selected.includes(c.code)}
				<li>
					<button type="button" class="card" class:on role="checkbox" aria-checked={on} onclick={() => toggle(c.code)}>
						<Flag flag={c.flag} size={36} />
						<span class="info">
							<strong>{c.name}</strong>
							<small>{c.divisions.length} {c.divisions.length === 1 ? 'divisão' : 'divisões'} · {c.clubCount} clubes{c.cups ? ` · ${c.cups} ${c.cups === 1 ? 'copa' : 'copas'}` : ''}</small>
							<small class="load {impactOf(c.load.matches).toLowerCase()}">{c.load.matches.toLocaleString('pt-BR')} jogos · {formatSeconds(c.load.seasonMs)} por temporada</small>
						</span>
						<span class="tick" aria-hidden="true">{#if on}<Icon name="check" size={16} stroke={2.6} />{/if}</span>
					</button>
				</li>
			{/each}
		</ul>
	{:else if !preparing.length}
		<p class="muted empty">Nenhum país encontrado.</p>
	{/if}

	{#if preparing.length}
		<details class="preparing">
			<summary>
				<Icon name="clock" size={14} /> Em preparação · {preparing.length} {preparing.length === 1 ? 'país' : 'países'}
				<small class="muted">divisões cadastradas na base, ainda sem inscrições confirmadas. Os clubes seguem no mercado.</small>
			</summary>
			<ul class="mini">
				{#each preparing as c (c.code)}
					<li title="{c.divisions.map((d) => d.name).join(' · ')}">
						<Flag flag={c.flag} size={20} />
						<span>{c.name}</span>
						<small>{c.divisions.length} div. · {c.clubCount} clubes</small>
					</li>
				{/each}
			</ul>
		</details>
	{/if}
</div>

<style>
	.picker { display: grid; gap: var(--sp-3); min-width: 0; }
	.tools { display: flex; flex-wrap: wrap; gap: var(--sp-2); align-items: center; }
	.search { display: flex; align-items: center; gap: 8px; flex: 1 1 200px; min-width: 0; padding: 0 12px; height: 40px; border-radius: var(--radius-m); background: var(--surface-2); border: 1px solid var(--line); color: var(--text-3); }
	.search input { flex: 1; min-width: 0; border: 0; background: none; color: var(--text-1); font: inherit; outline: none; }
	.search:focus-within { border-color: var(--emerald); }
	.regions { display: flex; flex-wrap: wrap; gap: 6px; }
	.regions button { padding: 6px 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text-2); font: inherit; font-size: var(--fs-sm); cursor: pointer; }
	.regions button.on { border-color: var(--emerald); color: var(--text-1); background: rgb(16 185 129 / 0.14); }
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: var(--sp-2); margin: 0; padding: 0; list-style: none; }
	.card { width: 100%; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 12px; border-radius: var(--radius-m); border: 1px solid var(--line); background: var(--surface-2); color: inherit; font: inherit; text-align: left; cursor: pointer; transition: border-color 0.15s, background 0.15s, transform 0.15s; }
	.card:hover { border-color: var(--line-strong); transform: translateY(-1px); }
	.card:focus-visible, .regions button:focus-visible { outline: 2px solid var(--emerald); outline-offset: 2px; }
	.card.on { border-color: var(--emerald); background: linear-gradient(160deg, rgb(16 185 129 / 0.16), var(--surface-2)); }
	.info { display: grid; gap: 2px; min-width: 0; }
	.info strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.info small { color: var(--text-3); font-size: var(--fs-xs); }
	.load::before { content: ''; display: inline-block; width: 7px; height: 7px; margin-right: 6px; border-radius: 50%; background: #46df93; }
	.load.moderado::before { background: #f5c451; }
	.load.alto::before { background: #f97316; }
	.tick { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 7px; border: 1px solid var(--line-strong); color: var(--emerald-strong); }
	.on .tick { background: var(--emerald); border-color: var(--emerald); color: #04130c; }
	.preparing { border-radius: var(--radius-m); border: 1px dashed var(--line); padding: 10px 12px; }
	.preparing summary { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; cursor: pointer; font-weight: 600; }
	.preparing summary small { font-weight: 400; font-size: var(--fs-xs); }
	.mini { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 6px 14px; margin: 10px 0 0; padding: 0; list-style: none; }
	.mini li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; align-items: center; color: var(--text-2); font-size: var(--fs-sm); }
	.mini span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.mini small { color: var(--text-3); font-size: var(--fs-xs); }
	.empty { margin: 0; }
	@media (prefers-reduced-motion: reduce) { .card { transition: none; } .card:hover { transform: none; } }
</style>
