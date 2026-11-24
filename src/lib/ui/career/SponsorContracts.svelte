<script lang="ts">
	import { SPONSOR_SLOTS, type SponsorContract, type SponsorOffer } from '#lib/domain/club.ts';
	import { formatExactMoney } from '#lib/domain/market.ts';
	import { reveal } from '#lib/motion/actions.ts';
	import Button from '#lib/ui/Button.svelte';

	let { contracts, offers, busy, onsign }: {
		contracts: SponsorContract[];
		offers: SponsorOffer[];
		busy: boolean;
		onsign: (offer: SponsorOffer) => void | Promise<unknown>;
	} = $props();

	// Patrocínios: filtro por categoria, ordenação e comparação lado a lado (até 3).
	type SlotFilter = 'todas' | keyof typeof SPONSOR_SLOTS;
	let slotFilter = $state<SlotFilter>('todas');
	let sortBy = $state<'valor' | 'duracao'>('valor');
	let compareIds = $state<string[]>([]);
	let openOffer = $state<string | null>(null);
	const takenSlots = $derived(new Set(contracts.map((s) => s.slot)));
	const offerList = $derived(
		offers
			.filter((o) => slotFilter === 'todas' || o.slot === slotFilter)
			.slice()
			.sort((a, b) => (sortBy === 'valor' ? b.monthly - a.monthly : b.seasons - a.seasons || b.monthly - a.monthly))
	);
	const bestBySlot = $derived(
		Object.fromEntries(Object.keys(SPONSOR_SLOTS).map((sl) => [sl, Math.max(0, ...offers.filter((o) => o.slot === sl).map((o) => o.monthly))]))
	);
	const compared = $derived(offers.filter((o) => compareIds.includes(o.id)));
	function toggleCompare(id: string) {
		compareIds = compareIds.includes(id) ? compareIds.filter((x) => x !== id) : [...compareIds, id].slice(-3);
	}
</script>

<section class="glass pad sp" use:reveal={{ index: 1 }}>
	<div class="sph">
		<h2 class="display">Patrocínios</h2>
		<span class="muted small">{contracts.length}/{Object.keys(SPONSOR_SLOTS).length} espaços ocupados</span>
	</div>
	{#if contracts.length}
		<div class="active">
			{#each contracts as s (s.id)}
				<div class="sponsor on">
					<span class="slotl">{SPONSOR_SLOTS[s.slot].label}</span>
					<strong>{s.brand}</strong>
					<span class="money">{formatExactMoney(s.monthly)}<small>/mês</small></span>
					<small class="muted">até {s.untilSeason}{s.bonus ? ` · bônus ${s.bonus.label}: +${formatExactMoney(s.bonus.amount)}` : ''}</small>
				</div>
			{/each}
		</div>
	{:else}
		<p class="muted">Nenhum contrato assinado. Compare as propostas abaixo.</p>
	{/if}
	{#if offers.length}
		<div class="sptools">
			<h3>Propostas na mesa</h3>
			<div class="filters" role="radiogroup" aria-label="Categoria">
				<button role="radio" aria-checked={slotFilter === 'todas'} onclick={() => (slotFilter = 'todas')}>Todas <b>{offers.length}</b></button>
				{#each Object.entries(SPONSOR_SLOTS) as [slot, info] (slot)}
					{@const n = offers.filter((o) => o.slot === slot).length}
					{#if n}<button role="radio" aria-checked={slotFilter === slot} onclick={() => (slotFilter = slot as SlotFilter)}>{info.label} <b>{n}</b></button>{/if}
				{/each}
			</div>
			<label class="sort">Ordenar
				<select bind:value={sortBy}><option value="valor">Maior valor mensal</option><option value="duracao">Maior duração</option></select>
			</label>
		</div>

		{#if compared.length}
			<div class="cmp" use:reveal>
				<div class="cmph"><strong>Comparação</strong><button class="link" onclick={() => (compareIds = [])}>Limpar</button></div>
				<div class="cmptable" style="--n:{compared.length}">
					<span class="h"></span>{#each compared as o (o.id)}<strong class="h">{o.brand}</strong>{/each}
					<span class="lb">Categoria</span>{#each compared as o (o.id)}<span>{SPONSOR_SLOTS[o.slot].label}</span>{/each}
					<span class="lb">Mensal</span>{#each compared as o (o.id)}<b class="money">{formatExactMoney(o.monthly)}</b>{/each}
					<span class="lb">Duração</span>{#each compared as o (o.id)}<span>{o.seasons} temporada{o.seasons > 1 ? 's' : ''}</span>{/each}
					<span class="lb">Bônus</span>{#each compared as o (o.id)}<span>{o.bonus ? `${o.bonus.label}: ${formatExactMoney(o.bonus.amount)}` : '—'}</span>{/each}
					<span class="lb">Exigência</span>{#each compared as o (o.id)}<span class:warn={!!o.requirement}>{o.requirement?.label ?? 'Nenhuma'}</span>{/each}
				</div>
			</div>
		{/if}

		<div class="offers">
			{#each offerList as o (o.id)}
				{@const best = o.monthly === bestBySlot[o.slot]}
				<article class="offer" class:sel={compareIds.includes(o.id)}>
					<div class="ot">
						<span class="slotl">{SPONSOR_SLOTS[o.slot].label}</span>
						{#if best}<span class="tag">Maior valor</span>{/if}
					</div>
					<strong class="brand">{o.brand}</strong>
					<span class="money big">{formatExactMoney(o.monthly)}<small>/mês</small></span>
					<div class="facts">
						<span>{o.seasons} temporada{o.seasons > 1 ? 's' : ''}</span>
						{#if o.bonus}<span class="bonus">Bônus {o.bonus.label}: {formatExactMoney(o.bonus.amount)}</span>{/if}
						{#if o.requirement}<span class="warn">Exige: {o.requirement.label}</span>{/if}
					</div>
					<div class="oa">
						<Button size="sm" variant="primary" loading={busy} disabled={takenSlots.has(o.slot)} onclick={() => onsign(o)}>Assinar</Button>
						<button class="mini" aria-pressed={compareIds.includes(o.id)} onclick={() => toggleCompare(o.id)}>{compareIds.includes(o.id) ? 'Comparando' : 'Comparar'}</button>
						<button class="mini" aria-expanded={openOffer === o.id} onclick={() => (openOffer = openOffer === o.id ? null : o.id)}>Detalhes</button>
					</div>
					<div class="det" class:open={openOffer === o.id}>
						<div>
							<p class="small">
								{#if o.requirement}Se a exigência não for cumprida ao fim da temporada, a marca encerra o contrato.{:else}Sem exigência de desempenho: o contrato vale até o fim do prazo.{/if}
								{#if o.bonus} O bônus é pago uma vez se a meta "{o.bonus.label}" for alcançada.{/if}
								{#if takenSlots.has(o.slot)} Atenção: você já tem um contrato nesta categoria.{/if}
							</p>
						</div>
					</div>
				</article>
			{/each}
		</div>
		<p class="muted small">Marcas fictícias do universo BRASFC.</p>
	{/if}
</section>
<style>
	.pad { padding: var(--sp-5); min-width: 0; }
	h2 { margin: 0; font-size: var(--fs-2xl); }
	h3 { font-size: var(--fs-sm); text-transform: uppercase; letter-spacing: .1em; color: var(--text-3); }
	.sph,
	.sptools {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}
	.sptools {
		margin-top: var(--sp-4);
	}
	.sptools h3 {
		margin: 0;
	}
	.active {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr));
		gap: var(--sp-2);
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		padding: 4px;
		border-radius: 12px;
		background: var(--surface-sunken);
	}
	.filters button {
		border: 0;
		border-radius: 9px;
		padding: 6px 10px;
		background: none;
		color: var(--text-3);
		font: inherit;
		font-size: var(--fs-xs);
		font-weight: 700;
		cursor: pointer;
		transition: background 0.2s, color 0.2s;
	}
	.filters button[aria-checked='true'] {
		background: var(--surface-3);
		color: var(--text);
	}
	.filters b {
		margin-left: 2px;
		color: var(--text-3);
	}
	.sort {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.sort select {
		padding: 5px 8px;
		border-radius: 8px;
		background: #1c252b;
		color: var(--text);
		border: 1px solid var(--line-strong);
	}
	.money {
		font-family: var(--font-display);
		font-weight: 800;
		white-space: nowrap;
	}
	.money small {
		font-size: max(11px, 0.6em);
		color: var(--text-3);
	}
	.slotl {
		font-size: 11px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-3);
	}
	.offers {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 230px), 1fr));
		gap: var(--sp-3);
		margin-top: var(--sp-3);
	}
	.ot {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 6px;
	}
	.tag {
		font-size: 11px;
		font-weight: 800;
		padding: 1px 6px;
		border-radius: 6px;
		background: var(--emerald-soft);
		color: var(--emerald-strong);
	}
	.brand {
		font-size: var(--fs-md, 17px);
		line-height: 1.2;
	}
	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.facts span {
		font-size: 11px;
		padding: 2px 7px;
		border-radius: 6px;
		background: var(--surface-3);
		color: var(--text-2);
	}
	.facts .warn {
		background: color-mix(in srgb, var(--warning) 14%, transparent);
	}
	.facts .bonus {
		background: color-mix(in srgb, var(--gold) 14%, transparent);
		color: var(--gold);
	}
	.det {
		display: grid;
		grid-template-rows: 0fr;
		transition: grid-template-rows 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	.det.open {
		grid-template-rows: 1fr;
	}
	.det > div {
		overflow: hidden;
	}
	.det p {
		margin: 6px 0 0;
		color: var(--text-2);
		line-height: 1.45;
	}
	.oa {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin-top: 4px;
	}
	.mini {
		border: 1px solid var(--line-strong);
		border-radius: 999px;
		padding: 5px 10px;
		background: none;
		color: var(--text-2);
		font: inherit;
		font-size: var(--fs-xs);
		font-weight: 700;
		cursor: pointer;
	}
	.mini[aria-pressed='true'] {
		border-color: var(--emerald);
		color: var(--emerald-strong);
	}
	.offer.sel {
		border-color: var(--emerald);
	}
	.cmp {
		margin-top: var(--sp-3);
		padding: var(--sp-3);
		border-radius: var(--radius-m);
		background: rgb(10 13 16 / 0.45);
		border: 1px solid var(--line);
		overflow-x: auto;
	}
	.cmph {
		display: flex;
		justify-content: space-between;
		margin-bottom: 8px;
	}
	.cmptable {
		display: grid;
		grid-template-columns: 90px repeat(var(--n), minmax(130px, 1fr));
		gap: 6px 12px;
		font-size: var(--fs-xs);
		color: var(--text-2);
	}
	.cmptable .h {
		font-size: var(--fs-sm);
		color: var(--text);
	}
	.cmptable .lb {
		color: var(--text-3);
	}
	.link {
		border: 0;
		background: none;
		color: var(--emerald-strong);
		font: inherit;
		font-size: var(--fs-xs);
		text-decoration: underline;
		cursor: pointer;
	}
	.sponsor {
		display: grid;
		gap: 2px;
		padding: var(--sp-3);
		border-radius: var(--radius-m);
		background: rgb(10 13 16 / 0.4);
		margin: var(--sp-2) 0;
	}
	.offer {
		position: relative;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
		transition: border-color 0.2s, transform 0.2s;
		border-radius: var(--radius-m);
		background: rgb(10 13 16 / 0.45);
		border: 1px solid var(--line);
	}
	.big {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: var(--fs-lg);
	}
	.big small {
		font-size: max(11px, 0.55em);
		color: var(--text-3);
	}
	.warn {
		color: var(--warning);
	}
	.small {
		font-size: var(--fs-xs);
	}

	@media (prefers-reduced-motion: reduce) {
		.det, .offer { transition: none; }
	}
</style>
