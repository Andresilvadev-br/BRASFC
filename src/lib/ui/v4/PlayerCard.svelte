<script lang="ts">
	import type { Snippet } from 'svelte';
	import { POSITION_INFO, type Position } from '#lib/domain/positions.ts';
	import { formatMoney } from '#lib/domain/market.ts';
	import Crest from '../Crest.svelte';

	/**
	 * Cartão de atleta (identidade própria do BRASFC): faixa por setor, overall em destaque,
	 * idade, valor, situação contratual e compatibilidade com o clube.
	 */
	let {
		name,
		position,
		age,
		overall,
		overallRange = null,
		potential = null,
		value = null,
		contract = '',
		clubId = '',
		fit = null,
		tags = [],
		selected = false,
		onclick,
		actions
	}: {
		name: string;
		position: Position;
		age: number | null;
		overall: number | null;
		overallRange?: [number, number] | null;
		potential?: [number, number] | number | null;
		value?: number | null;
		contract?: string;
		clubId?: string;
		fit?: number | null;
		tags?: string[];
		selected?: boolean;
		onclick?: () => void;
		actions?: Snippet;
	} = $props();
	const sector = $derived(POSITION_INFO[position]?.sector ?? 'meio');
	const shownOverall = $derived(overall ?? (overallRange ? `${overallRange[0]}–${overallRange[1]}` : '?'));
	const pot = $derived(potential === null ? null : Array.isArray(potential) ? `${potential[0]}–${potential[1]}` : String(potential));
</script>

<article class="card glass" class:selected data-sector={sector} data-umx-surface>
	<button class="hit" {onclick} aria-label="Ver {name}" disabled={!onclick}></button>
	<div class="stripe"></div>
	<header>
		<span class="ovr" title="Nível atual{overall === null ? ' (estimado pelos olheiros)' : ''}">{shownOverall}</span>
		<span class="pos">{position}</span>
		{#if clubId}<span class="crest"><Crest {clubId} size={22} /></span>{/if}
	</header>
	<h3 title={name}>{name}</h3>
	<p class="meta">{POSITION_INFO[position]?.label ?? position} · {age === null ? 'Idade pendente' : `${age} anos`}</p>
	<dl>
		{#if value !== null}<div><dt>Valor</dt><dd>{value ? formatMoney(value) : '—'}</dd></div>{/if}
		{#if pot}<div><dt>Potencial</dt><dd>{pot}</dd></div>{/if}
		{#if fit !== null}<div><dt>Encaixe</dt><dd class:pos={fit >= 0} class:neg={fit < 0}>{fit >= 0 ? '+' : ''}{fit}</dd></div>{/if}
	</dl>
	{#if contract}<p class="contract">{contract}</p>{/if}
	{#if tags.length}<div class="tags">{#each tags as t (t)}<span class="chip">{t}</span>{/each}</div>{/if}
	{#if actions}<div class="actions">{@render actions()}</div>{/if}
</article>

<style>
	.card {
		padding: var(--sp-4) var(--sp-4) var(--sp-3);
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-height: 168px;
		overflow: hidden;
		transition: box-shadow 0.25s var(--ease-out);
		--accent: var(--emerald);
	}
	.card[data-sector='goleiro'] {
		--accent: #f5b942;
	}
	.card[data-sector='defesa'] {
		--accent: #60a5fa;
	}
	.card[data-sector='ataque'] {
		--accent: #f87171;
	}
	.card.selected {
		box-shadow: 0 0 0 2px var(--emerald-strong), var(--glow-emerald);
	}
	.hit {
		position: absolute;
		inset: 0;
		background: none;
		border: 0;
		border-radius: inherit;
		cursor: pointer;
		z-index: 1;
	}
	.hit:disabled {
		cursor: default;
	}
	.hit:focus-visible {
		outline: 2px solid var(--emerald-strong);
		outline-offset: 2px;
	}
	.stripe {
		position: absolute;
		inset: 0 auto 0 0;
		width: 4px;
		background: linear-gradient(180deg, var(--accent), transparent);
	}
	header {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.ovr {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 2rem;
		line-height: 1;
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}
	.pos {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.08em;
		padding: 2px 7px;
		border-radius: 6px;
		background: color-mix(in srgb, var(--accent) 20%, transparent);
		color: var(--accent);
	}
	.crest {
		margin-left: auto;
	}
	h3 {
		margin: 2px 0 0;
		font-size: var(--fs-md);
		font-weight: 700;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.meta {
		margin: 0;
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	dl {
		display: flex;
		gap: var(--sp-4);
		margin: 4px 0 0;
	}
	dt {
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-3);
		font-weight: 700;
	}
	dd {
		margin: 0;
		font-weight: 700;
		font-size: var(--fs-sm);
		font-variant-numeric: tabular-nums;
	}
	.contract {
		margin: 0;
		font-size: var(--fs-xs);
		color: var(--text-2);
	}
	.tags {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}
	.actions {
		position: relative;
		z-index: 2;
		display: flex;
		gap: 6px;
		margin-top: auto;
		padding-top: 6px;
	}
</style>
