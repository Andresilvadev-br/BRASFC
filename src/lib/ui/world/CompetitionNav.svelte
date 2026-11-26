<script lang="ts">
	import type { WorldCompetition } from '#lib/world/contract.ts';
	import { countryFlag, countryName } from '#lib/world/countries.ts';
	import { groupCompetitions } from '#lib/world/competitions.ts';
	import Flag from './Flag.svelte';

	/**
	 * Navegação de competições para a expansão mundial: agrupa por país e por continente, com abas compactas
	 * que quebram linha. Copas levam à própria tela (`href`); ligas trocam a tabela no lugar (`onselect`).
	 */
	let { competitions, active, onselect, href }: {
		competitions: WorldCompetition[]; active: string; onselect: (id: string) => void; href?: (comp: WorldCompetition) => string | null;
	} = $props();
	const groups = $derived(groupCompetitions(competitions, countryName));
</script>

<nav class="cnav" aria-label="Competições">
	{#each groups as g (g.key)}
		<div class="group">
			<span class="label">{#if g.country && countryFlag(g.country)}<Flag flag={countryFlag(g.country)!} size={18} />{/if}{g.label}</span>
			<div class="items">
				{#each g.items as comp (comp.id)}
					{@const link = href?.(comp) ?? null}
					{#if link}
						<a class="item cup" href={link} title={comp.name}>{comp.name}</a>
					{:else}
						<button type="button" class="item" class:on={comp.id === active} aria-pressed={comp.id === active} disabled={!comp.playable} title={comp.playable ? comp.name : `${comp.name}: sem inscrições confirmadas`} onclick={() => onselect(comp.id)}>{comp.name}</button>
					{/if}
				{/each}
			</div>
		</div>
	{/each}
</nav>

<style>
	.cnav { display: grid; gap: 8px; min-width: 0; }
	.group { display: grid; grid-template-columns: minmax(110px, auto) minmax(0, 1fr); gap: 10px; align-items: center; }
	.label { display: inline-flex; align-items: center; gap: 8px; font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-3); white-space: nowrap; }
	.items { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
	.item { padding: 6px 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text-2); font: inherit; font-size: var(--fs-sm); text-decoration: none; cursor: pointer; white-space: nowrap; }
	.item:hover:not(:disabled) { border-color: var(--line-strong); color: var(--text-1); }
	.item.on { border-color: var(--emerald); background: rgb(16 185 129 / 0.14); color: var(--text-1); font-weight: 600; }
	.item.cup { border-style: dashed; }
	.item:disabled { opacity: 0.5; cursor: not-allowed; }
	.item:focus-visible { outline: 2px solid var(--emerald); outline-offset: 2px; }
	@media (max-width: 560px) { .group { grid-template-columns: minmax(0, 1fr); gap: 4px; } }
</style>
