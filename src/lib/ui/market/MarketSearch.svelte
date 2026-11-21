<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { api } from '#lib/api.ts';
	import { DIVISION_LABELS } from '#lib/domain/league.ts';
	import { formatExactMoney } from '#lib/domain/market.ts';
	import { MARKET_SORTS, MARKET_STATUS, ratingText, type MarketAthlete, type MarketCompetition, type MarketFilters, type MarketProfile, type MarketResults } from '#lib/domain/market-search.ts';
	import { POSITIONS } from '#lib/domain/positions.ts';
	import { ALL_ATTRIBUTES, ATTRIBUTE_LABELS } from '#lib/engine/attributes.ts';
	import { enter } from '#lib/motion/actions.ts';
	import Button from '../Button.svelte';
	import Crest from '../Crest.svelte';
	import Icon from '../Icon.svelte';
	import Sheet from '../v4/Sheet.svelte';
	import Profile from './MarketProfile.svelte';
	import Comparison from './MarketComparison.svelte';

	let { endpoint, storageKey, revision, observedOnly = false, windowOpen, busy, watch, propose, selected = $bindable() }: {
		endpoint: string; storageKey: string; revision: number; observedOnly?: boolean; windowOpen: boolean; busy: boolean;
		watch: (player: MarketProfile) => Promise<unknown>; propose: (player: MarketProfile, kind: 'compra' | 'emprestimo' | 'livre') => unknown; selected?: string;
	} = $props();

	let f: MarketFilters = $state({});
	let page = $state(1);
	let result = $state<MarketResults>();
	let showFilters = $state(false);
	let mobile = $state(false);
	let profileOpen = $state(false);
	let profile = $state<MarketProfile>();
	let compareOpen = $state(false);
	let comparisons = $state<string[]>([]);
	let compared = $state<MarketProfile[]>([]);
	let ready = $state(false);
	let loading = $state(true);
	let failure = $state('');
	let profileError = $state('');
	let compareError = $state('');
	let attempt = $state(0);
	let profileAttempt = $state(0);
	let inputFocus = $state(false);
	let input = $state<HTMLInputElement>();
	let lastCriteria = '';
	let lastAttempt = 0;
	let searchTrigger = $state<HTMLButtonElement>();
	const pages = new Map<string, MarketResults>();
	const profiles = new Map<string, MarketProfile>();

	const names: Partial<Record<keyof MarketFilters, string>> = {
		q: 'Busca', position: 'Posição', secondary: 'Secundária', club: 'Clube', division: 'Campeonato', nationality: 'Nacionalidade', status: 'Situação',
		ageMin: 'Idade mín.', ageMax: 'Idade máx.', overallMin: 'Overall mín.', overallMax: 'Overall máx.', potentialMin: 'Potencial mín.', potentialMax: 'Potencial máx.',
		valueMin: 'Valor mín.', valueMax: 'Valor máx.', wageMin: 'Salário mín.', wageMax: 'Salário máx.', yearsMin: 'Contrato mín.', yearsMax: 'Contrato máx.',
		attribute: 'Atributo', attributeMin: 'Atributo mín.', listed: 'À venda', loanable: 'Aceita empréstimo'
	};

	type RangeKey = 'ageMin' | 'ageMax' | 'overallMin' | 'overallMax' | 'potentialMin' | 'potentialMax' | 'valueMin' | 'valueMax' | 'wageMin' | 'wageMax' | 'yearsMin' | 'yearsMax';
	const chips = $derived(Object.entries(f).filter(([key, value]) => names[key as keyof MarketFilters] && value !== '' && value !== undefined && value !== false && value !== null) as [keyof MarketFilters, string | number | true][]);
	const divisions = $derived(result?.competitions ?? []);
	const competitionName = (id: MarketCompetition) => id === 'copa-do-brasil' ? 'Copa do Brasil' : DIVISION_LABELS[id];
	const filteredClubs = $derived(result?.clubs.filter((club) => !f.division || f.division === 'copa-do-brasil' || f.division === club.division) ?? []);
	const canSuggest = $derived(inputFocus && Boolean(f.q?.trim()) && !loading && !failure);
	const numericLabel = (value: string | number | true) => typeof value === 'number' ? value.toLocaleString('pt-BR') : value;

	onMount(() => {
		try {
			const stored = sessionStorage.getItem(storageKey);
			if (stored) f = JSON.parse(stored);
		} catch { /* a pesquisa funciona sem armazenamento local */ }
		const media = matchMedia('(max-width: 1000px)');
		const resize = () => mobile = media.matches;
		resize();
		media.addEventListener('change', resize);
		ready = true;
		return () => media.removeEventListener('change', resize);
	});

	function path(params: URLSearchParams) {
		return endpoint + (endpoint.includes('?') ? '&' : '?') + params.toString();
	}

	function pageParams(filters: MarketFilters) {
		const params = new URLSearchParams();
		for (const [key, value] of Object.entries(filters)) {
			if (value !== undefined && value !== null && value !== false && value !== '') params.set(key, String(value));
		}
		return params;
	}

	$effect(() => {
		if (!ready) return;
		const filter = $state.snapshot(f);
		const currentPage = page;
		const version = revision;
		const retry = attempt !== lastAttempt;
		lastAttempt = attempt;
		const observed = observedOnly;
		const params = pageParams({ ...filter, observed });
		const criteria = params.toString();
		const resetPage = criteria !== lastCriteria;
		lastCriteria = criteria;
		try { sessionStorage.setItem(storageKey, JSON.stringify(filter)); } catch { /* armazenamento opcional */ }
		if (resetPage && currentPage !== 1) {
			page = 1;
			return;
		}
		params.set('page', String(currentPage));
		const url = path(params);
		const key = `${version}:${url}`;
		const cached = pages.get(key);
		if (cached && !retry) {
			result = cached;
			failure = '';
			loading = false;
			return;
		}
		const controller = new AbortController();
		loading = true;
		failure = '';
		const timer = window.setTimeout(() => {
			void api<MarketResults>(url, { signal: controller.signal }).then((payload) => {
				if (controller.signal.aborted) return;
				pages.set(key, payload);
				if (pages.size > 20) pages.delete(pages.keys().next().value!);
				result = payload;
			}).catch((error: Error) => {
				if (!controller.signal.aborted) failure = error.message;
			}).finally(() => {
				if (!controller.signal.aborted) loading = false;
			});
		}, resetPage ? 125 : 0);
		return () => { window.clearTimeout(timer); controller.abort(); };
	});

	async function getProfile(id: string, version: number, signal: AbortSignal, retry = 0) {
		const key = `${version}:${id}:${retry}`;
		const cached = profiles.get(key);
		if (cached) return cached;
		const detail = await api<MarketProfile>(path(new URLSearchParams({ player: id })), { signal });
		if (!signal.aborted) {
			profiles.set(key, detail);
			if (profiles.size > 24) profiles.delete(profiles.keys().next().value!);
		}
		return detail;
	}

	$effect(() => {
		const id = selected;
		const version = revision;
		const allowed = ready && (!mobile || profileOpen);
		if (!id || !allowed) return;
		const abort = new AbortController();
		if (untrack(() => profile?.id) !== id) profile = undefined;
		profileError = '';
		void getProfile(id, version, abort.signal, profileAttempt).then((detail) => {
			if (!abort.signal.aborted) profile = detail;
		}).catch((error: Error) => {
			if (!abort.signal.aborted) profileError = error.message;
		});
		return () => abort.abort();
	});

	$effect(() => {
		const ids = comparisons.slice();
		const version = revision;
		if (!compareOpen) return;
		const abort = new AbortController();
		compareError = '';
		compared = [];
		void Promise.all(ids.map((id) => getProfile(id, version, abort.signal))).then((players) => {
			if (!abort.signal.aborted) compared = players;
		}).catch((error: Error) => {
			if (!abort.signal.aborted) compareError = error.message;
		});
		return () => abort.abort();
	});

	function choose(player: MarketAthlete, trigger?: HTMLButtonElement) {
		searchTrigger = trigger;
		selected = player.id;
		inputFocus = false;
		if (mobile) profileOpen = true;
	}

	function toggleCompare(player: MarketProfile) {
		comparisons = comparisons.includes(player.id) ? comparisons.filter((id) => id !== player.id) : [...comparisons.slice(-1), player.id];
	}

	function keydown(e: KeyboardEvent) {
		if (e.key === 'Escape') { e.preventDefault(); inputFocus = false; return; }
		if (e.key === 'ArrowDown' && canSuggest) {
			const first = input?.parentElement?.nextElementSibling?.querySelector('button');
			if (first instanceof HTMLButtonElement) { e.preventDefault(); first.focus(); }
		}
		if (e.key === 'Enter' && result?.rows[0] && !loading) { e.preventDefault(); choose(result.rows[0]); }
	}

	function clear() { f = { sort: f.sort, direction: f.direction }; page = 1; }
	function chipLabel(key: keyof MarketFilters, value: string | number | true) {
		if (value === true) return names[key];
		const text = key === 'club' ? result?.clubs.find((club) => club.id === value)?.name ?? value :
			key === 'division' ? competitionName(value as MarketCompetition) ?? value :
			key === 'status' ? MARKET_STATUS[value as keyof typeof MARKET_STATUS] ?? value :
			key === 'attribute' ? ATTRIBUTE_LABELS[value as keyof typeof ATTRIBUTE_LABELS] ?? value :
			typeof value === 'number' && /^(value|wage)/.test(key) ? formatExactMoney(value) : numericLabel(value);
		return `${names[key]} · ${text}`;
	}
</script>

{#snippet position(value: 'position' | 'secondary', label: string)}
	<label>{label}<select bind:value={f[value]}><option value={undefined}>Todas</option>{#each POSITIONS as item (item)}<option value={item}>{item}</option>{/each}</select></label>
{/snippet}

{#snippet range(label: string, low: RangeKey, high: RangeKey, max?: number)}
	<fieldset>
		<legend>{label}</legend>
		<div class="range">
			<label><span>Mínimo</span><input type="number" min="0" {max} bind:value={f[low]} placeholder="—" aria-label={`${label} mínimo`} /></label>
			<label><span>Máximo</span><input type="number" min="0" {max} bind:value={f[high]} placeholder="—" aria-label={`${label} máximo`} /></label>
		</div>
		{#if max}
			<label class="range-slider"><span>Limite máximo</span><input type="range" min="0" {max} value={f[high] ?? max} oninput={(event) => (f[high] = event.currentTarget.valueAsNumber)} aria-label={`Ajustar ${label.toLowerCase()} máximo`} /></label>
		{/if}
	</fieldset>
{/snippet}

{#snippet details()}
	{#if profile && !profileError}
		{#key profile.id}
			<div use:enter={{ y: 4 }}><Profile player={profile} {busy} {windowOpen} comparison={comparisons.includes(profile.id)}
				observe={() => profile && watch(profile)} compare={() => profile && toggleCompare(profile)}
				propose={(kind) => { if (profile) { profileOpen = false; propose(profile, kind); } }} /></div>
		{/key}
	{:else if profileError}
		<div class="empty" role="alert"><p>{profileError}</p><Button size="sm" variant="secondary" onclick={() => profileAttempt += 1}>Tentar novamente</Button></div>
	{:else}
		<p class="empty" aria-live="polite">{selected ? 'Carregando a ficha…' : 'Selecione um atleta para abrir a ficha.'}</p>
	{/if}
{/snippet}

<div class="workspace">
	<section class="search-panel" aria-label="Pesquisa de jogadores">
		<div class="query" onfocusout={(event) => {
			if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget as Node)) inputFocus = false;
		}}>
			<label class="searchbox">
				<Icon name="search" size={20} />
				<input type="search" bind:this={input} bind:value={f.q} placeholder="Nome, clube ou nacionalidade"
					aria-label="Pesquisar jogadores" maxlength="100" autocomplete="off" onfocus={() => inputFocus = true} oninput={() => inputFocus = true} onkeydown={keydown} />
				{#if f.q}<button type="button" aria-label="Limpar pesquisa" data-umx-press onclick={(event) => { event.preventDefault(); f.q = undefined; input?.focus(); }}><Icon name="x" size={16} /></button>{/if}
			</label>
			{#if canSuggest && result?.rows.length}
				<div class="suggestions" aria-label="Sugestões">
					{#each result.rows.slice(0, 4) as athlete (athlete.id)}
						<button type="button" onclick={(event) => choose(athlete, event.currentTarget)}><strong>{athlete.name}</strong><small>{athlete.clubName}</small></button>
					{/each}
				</div>
			{/if}
		</div>
		<div class="quick">
			{@render position('position', 'Posição')}
			<label>Campeonato
				<select bind:value={f.division}>
					<option value={undefined}>Todos</option>
					{#each divisions as division (division)}<option value={division}>{competitionName(division)}</option>{/each}
				</select>
			</label>
			<Button variant="secondary" size="sm" onclick={() => showFilters = true}>Filtros{chips.length ? ` (${chips.length})` : ''}</Button>
		</div>
		{#if chips.length}
			<div class="chips" aria-label="Filtros aplicados">
				{#each chips as [key, value] (key)}
					<button type="button" data-umx-press onclick={() => delete f[key]} aria-label={`Remover ${chipLabel(key, value)}`}>{chipLabel(key, value)} <Icon name="x" size={12} /></button>
				{/each}
				<button type="button" class="clear" onclick={clear}>Limpar filtros</button>
			</div>
		{/if}
		<div class="results-head">
			<strong aria-live="polite">{loading ? 'Buscando…' : `${(result?.total ?? 0).toLocaleString('pt-BR')} ${result?.total === 1 ? 'atleta' : 'atletas'}`}</strong>
			<label><span class="sr">Ordenar por</span><select bind:value={f.sort}>
				<option value={undefined}>Ordenar por overall</option>
				{#each Object.entries(MARKET_SORTS) as [value, label] (value)}<option {value}>{label}</option>{/each}
			</select></label>
			<button type="button" class="direction" aria-label={(f.direction ?? (f.sort === 'name' || f.sort === 'age' ? 'asc' : 'desc')) === 'desc' ? 'Ordem decrescente. Inverter' : 'Ordem crescente. Inverter'}
				onclick={() => f.direction = (f.direction ?? (f.sort === 'name' || f.sort === 'age' ? 'asc' : 'desc')) === 'asc' ? 'desc' : 'asc'}>
				{(f.direction ?? (f.sort === 'name' || f.sort === 'age' ? 'asc' : 'desc')) === 'asc' ? '↑' : '↓'}
			</button>
		</div>
		<div class="results" aria-busy={loading}>
			{#if failure}
				<div class="empty" role="alert"><p>{failure}</p><Button size="sm" variant="secondary" onclick={() => attempt += 1}>Tentar novamente</Button></div>
			{:else if result?.rows.length}
				{#each result.rows as athlete (athlete.id)}
					<button type="button" class="result" aria-pressed={selected === athlete.id} disabled={loading} data-umx-press onclick={(event) => choose(athlete, event.currentTarget)}>
						<span class="emblem"><Crest clubId={athlete.club} size={36} /></span>
						<span class="identity">
							<strong>{athlete.name}</strong>
							<span>{athlete.clubName} · {athlete.position}{athlete.secondary.length ? `/${athlete.secondary.join('/')}` : ''}{athlete.age === null ? ' · Idade pendente' : ` · ${athlete.age} anos`}{athlete.nationality ? ` · ${athlete.nationality}` : ''}</span>
							<small>{athlete.listed ? 'À venda' : MARKET_STATUS[athlete.status]}{athlete.observed ? ' · Observado' : ''}{athlete.report ? ' · Relatório' : ''}</small>
						</span>
						<span class="numbers"><b>{ratingText(athlete.overall)}</b><small>{athlete.overall.min === athlete.overall.max ? 'Overall' : 'Overall est.'}</small>
							{#if athlete.potential}<small>Pot. {ratingText(athlete.potential)}</small>{/if}
							<small>{formatExactMoney(athlete.value)}</small>
							{#if athlete.wage !== null}<small class="wage">{formatExactMoney(athlete.wage)}/mês</small>{/if}
						</span>
					</button>
				{/each}
			{:else if loading}
				<p class="empty">Carregando o mercado…</p>
			{:else}
				<div class="empty"><p>{observedOnly && !chips.length ? 'A lista de observação está vazia. Abra a ficha de um atleta e escolha Observar.' : 'Nenhum atleta atende a estes critérios.'}</p>
					{#if chips.length}<Button variant="ghost" size="sm" onclick={clear}>Limpar filtros</Button>{/if}</div>
			{/if}
		</div>
		{#if result && result.pages > 1 && !failure}
			<nav class="pagination" aria-label="Páginas de resultados">
				<Button size="sm" variant="ghost" disabled={loading || result.page <= 1} onclick={() => page = result!.page - 1}>Anterior</Button>
				<small>Página {result.page} de {result.pages}</small>
				<Button size="sm" variant="ghost" disabled={loading || result.page >= result.pages} onclick={() => page = result!.page + 1}>Próxima</Button>
			</nav>
		{/if}
	</section>
	<aside class="detail-panel" aria-label="Ficha do atleta">
		<div class="detail-heading"><h2 class="display">Ficha do atleta</h2></div>
		{@render details()}
	</aside>
</div>
{#if comparisons.length}
	<div class="compare-tray">
		<span>{comparisons.length} de 2 atletas</span>
		<Button size="sm" variant="ghost" onclick={() => comparisons = []}>Limpar comparação</Button>
		<Button size="sm" variant="primary" disabled={comparisons.length !== 2} onclick={() => { profileOpen = false; compareOpen = true; }}>Ver comparação</Button>
	</div>
{/if}

<Sheet bind:open={showFilters} title="Filtros do mercado" width={490}>
	<div class="filter-form">
		{#if result}
			<div class="criteria">
				<label>Clube<select bind:value={f.club}><option value={undefined}>Todos</option>{#each filteredClubs as club (club.id)}<option value={club.id}>{club.name}</option>{/each}</select></label>
				<label>Nacionalidade<select bind:value={f.nationality}><option value={undefined}>Todas</option>{#each result.nationalities as country (country)}<option value={country}>{country}</option>{/each}</select></label>
			</div>
		{/if}
		<label>Situação contratual<select bind:value={f.status}><option value={undefined}>Todas</option>{#each Object.entries(MARKET_STATUS) as [value, label] (value)}<option {value}>{label}</option>{/each}</select></label>
		<div class="criteria">
			{@render range('Idade', 'ageMin', 'ageMax', 55)}
			{@render range('Overall estimado', 'overallMin', 'overallMax', 99)}
			{@render range('Potencial estimado', 'potentialMin', 'potentialMax', 99)}
			{@render range('Valor de mercado (R$)', 'valueMin', 'valueMax')}
			{@render range('Salário mensal (R$)', 'wageMin', 'wageMax')}
		</div>
		<details>
			<summary>Filtros avançados</summary>
			<div class="advanced">
				{@render position('secondary', 'Posição secundária')}
				{@render range('Temporadas de contrato', 'yearsMin', 'yearsMax')}
				<div class="criteria">
					<label>Atributo<select bind:value={f.attribute}><option value={undefined}>Qualquer</option>{#each ALL_ATTRIBUTES as attribute (attribute)}<option value={attribute}>{ATTRIBUTE_LABELS[attribute]}</option>{/each}</select></label>
					<label>Nota mínima<input type="number" min="0" max="99" disabled={!f.attribute} bind:value={f.attributeMin} /></label>
				</div>
				<label class="checkbox"><input type="checkbox" bind:checked={f.listed} /> Listado para transferência</label>
				<label class="checkbox"><input type="checkbox" bind:checked={f.loanable} /> Disponível para empréstimo</label>
			</div>
		</details>
	</div>
	{#snippet footer()}
		<Button variant="ghost" onclick={clear}>Limpar filtros</Button>
		<Button variant="primary" onclick={() => showFilters = false}>Ver resultados</Button>
	{/snippet}
</Sheet>

{#if mobile}
	<Sheet bind:open={profileOpen} title="Ficha do atleta" width={560}>
		{@render details()}
		{#snippet footer()}<Button variant="ghost" onclick={() => { profileOpen = false; searchTrigger?.focus(); }}>Voltar aos resultados</Button>
			{#if comparisons.length === 2}<Button variant="secondary" onclick={() => { profileOpen = false; compareOpen = true; }}>Ver comparação</Button>{/if}
		{/snippet}
	</Sheet>
{/if}
<Sheet bind:open={compareOpen} title="Comparar atletas" width={600}>
	{#if compareError}<p role="alert">{compareError}</p>
	{:else if compared.length === 2}<Comparison players={compared} />
	{:else}<p aria-live="polite">Carregando os atletas…</p>{/if}
</Sheet>

<style>
	.workspace { display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(0, .92fr); align-items: start; gap: .75rem; min-width: 0; }
	.search-panel, .detail-panel { min-width: 0; display: grid; gap: .7rem; padding: clamp(.6rem, 1.25vw, .95rem); border: 1px solid var(--line); border-radius: 14px; background: var(--glass-hi); }
	.detail-panel { position: sticky; top: .75rem; }
	.detail-heading { border-bottom: 1px solid var(--line); padding-bottom: .4rem; }
	.detail-heading h2 { font-size: var(--fs-xl); margin: 0; }
	.query { position: relative; min-width: 0; }
	.searchbox { display: flex; align-items: center; gap: .6rem; min-width: 0; border: 1px solid var(--emerald); border-radius: 11px; padding-inline: .65rem; background: var(--surface-sunken); color: var(--emerald-strong); }
	.searchbox input { flex: 1; min-width: 0; border: 0; background: transparent; font-size: max(16px,var(--fs-md)); padding: .65rem 0; outline-offset: 3px; }
	.searchbox input::-webkit-search-cancel-button { appearance: none; }
	.searchbox button { background: transparent; border: 0; display: grid; place-items: center; min-width: 32px; min-height: 36px; color: var(--text-2); }
	.suggestions { position: absolute; z-index: 6; inset: calc(100% + 4px) 0 auto; display: grid; border: 1px solid var(--line-strong); background: var(--surface-sunken); border-radius: 9px; box-shadow: var(--shadow-2); }
	.suggestions button { background: transparent; border: 0; display: grid; justify-items: start; min-height: 40px; text-align: left; color: var(--text); padding: .35rem .65rem; }
	.suggestions button:hover, .suggestions button:focus-visible { background: var(--emerald-soft); }
	.quick { display: grid; grid-template-columns: minmax(0,.65fr) minmax(0,1fr) auto; align-items: end; gap: .5rem; }
	label { display: grid; gap: .25rem; min-width: 0; color: var(--text-2); font-size: var(--fs-xs); }
	select, input { width: 100%; min-width: 0; min-height: 37px; color: var(--text); background: var(--surface-sunken); border: 1px solid var(--line-strong); border-radius: 8px; padding: .34rem .5rem; }
	.chips { display: flex; flex-wrap: wrap; gap: .35rem; }
	.chips button { border: 1px solid var(--line); display: flex; align-items: center; gap: .3rem; max-width: 100%; overflow-wrap: anywhere; text-align: left; color: var(--text); background: var(--emerald-soft); border-radius: 7px; font-size: var(--fs-xs); padding: .3rem .4rem; }
	.chips .clear { color: var(--emerald-strong); background: transparent; }
	.results-head, .pagination { display: flex; align-items: center; gap: .4rem; justify-content: space-between; flex-wrap: wrap; }
	.results-head strong { margin-right: auto; }
	.results-head label { max-width: min(13rem, 65%); }
	.direction { background: var(--surface-sunken); min-width: 38px; min-height: 37px; border: 1px solid var(--line-strong); border-radius: 8px; color: var(--text); }
	.results { display: grid; gap: .35rem; align-content: start; max-height: 69vh; overflow-y: auto; padding: 3px; }
	.result { display: grid; grid-template-columns: auto minmax(0,1fr) minmax(4rem,auto); min-width: 0; gap: .55rem; align-items: center; width: 100%; border: 1px solid var(--line); background: var(--surface-sunken); color: var(--text); text-align: left; border-radius: 10px; padding: .47rem .55rem; }
	.result[aria-pressed='true'] { border-color: var(--emerald); background: var(--emerald-soft); }
	.result:hover { border-color: var(--emerald); }
	.emblem { display: grid; place-items: center; width: 38px; }
	.identity, .numbers { display: grid; gap: .14rem; min-width: 0; overflow-wrap: anywhere; }
	.identity span, small { font-size: var(--fs-xs); color: var(--text-2); }
	.numbers { text-align: right; }.numbers b { font-size: var(--fs-lg); line-height: 1; color: var(--emerald-strong); }
	.empty { padding: 1.1rem .6rem; text-align: center; color: var(--text-2); }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
	.filter-form, .advanced { display: grid; gap: .75rem; }
	.criteria, .range { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: .55rem; }
	fieldset, details { min-width: 0; margin: 0; border: 1px solid var(--line); border-radius: 8px; padding: .5rem; }
	legend { padding-inline: .2rem; color: var(--text-2); font-size: var(--fs-xs); }
	.range-slider { margin-top: .45rem; }
	.range-slider input { min-height: 25px; accent-color: var(--emerald); }
	.checkbox { display: flex; align-items: center; gap: .55rem; min-height: 37px; }.checkbox input { width: 18px; min-height: 18px; accent-color: var(--emerald); }
	details summary { cursor: pointer; font-weight: 700; }
	.advanced { padding-top: .6rem; }
	.compare-tray { margin-top: .6rem; display: flex; flex-wrap: wrap; gap: .45rem; justify-content: flex-end; align-items: center; padding: .55rem; border: 1px solid var(--line); border-radius: 10px; color: var(--text-2); }
	@media (max-width: 1000px) {
		.workspace { grid-template-columns: 1fr; }.detail-panel { display: none; }
		.results { max-height: none; overflow: visible; }
		.result { min-height: 76px; }
		.quick :global(button) { min-height: 39px; }
	}
	@media (max-width: 390px) {
		.result { column-gap: .4rem; padding-inline: .42rem; grid-template-columns: auto minmax(0,1fr) minmax(3.6rem,auto); }
		.emblem { width: 30px; }.emblem :global(svg), .emblem :global(img) { max-width: 30px; }
		.criteria { grid-template-columns: 1fr; }
	}
</style>
