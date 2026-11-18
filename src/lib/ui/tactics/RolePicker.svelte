<script lang="ts">
	import type { Position } from '#lib/domain/positions.ts';
	import type { SquadPlayer } from '#lib/domain/squad.ts';
	import { ATTRIBUTE_LABELS, type AttributeKey } from '#lib/engine/attributes.ts';
	import { recommendRoles, type RoleId } from '#lib/engine/roles.ts';

	/**
	 * Funções possíveis para o atleta no slot, da mais compatível para a menos,
	 * com o motivo (atributos que a função exige) e o domínio já adquirido.
	 */
	let {
		player,
		position,
		value,
		familiarity,
		onpick
	}: { player: SquadPlayer; position: Position; value: RoleId; familiarity: Partial<Record<RoleId, number>>; onpick: (r: RoleId) => void } = $props();

	const options = $derived(recommendRoles(player.attributes, position));
	const best = $derived(options[0]?.role.id);
	const tone = (s: number) => (s >= 65 ? 'good' : s >= 45 ? 'ok' : 'bad');
</script>

<div class="rp" role="radiogroup" aria-label="Função de {player.name}">
	{#each options as o (o.role.id)}
		<button role="radio" aria-checked={o.role.id === value} class:on={o.role.id === value} onclick={() => onpick(o.role.id)}>
			<span class="top">
				<strong>{o.role.label}</strong>
				{#if o.role.id === best}<span class="rec">Recomendada</span>{/if}
				<span class="score {tone(o.score)}" title="Compatibilidade com os atributos">{o.score}</span>
			</span>
			<span class="sum">{o.role.summary}</span>
			<span class="meta">
				<span>Pede: {(Object.keys(o.role.key) as AttributeKey[]).slice(0, 3).map((k) => `${ATTRIBUTE_LABELS[k]} ${player.attributes[k]}`).join(' · ')}</span>
				<span>Domínio: {Math.round(familiarity[o.role.id] ?? 20)}</span>
			</span>
			<span class="risk">Risco: {o.role.risk}</span>
		</button>
	{/each}
</div>

<style>
	.rp {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	button {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 8px 10px;
		border: 0;
		border-radius: 10px;
		background: var(--surface-2);
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	button.on {
		box-shadow: inset 0 0 0 2px var(--emerald);
		background: var(--emerald-soft);
	}
	.top {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.top strong {
		font-size: var(--fs-sm);
	}
	.rec {
		font-size: 10px;
		font-weight: 800;
		text-transform: uppercase;
		padding: 1px 6px;
		border-radius: 4px;
		background: var(--gold-soft);
		color: var(--gold);
	}
	.score {
		margin-left: auto;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: var(--fs-lg);
	}
	.score.good {
		color: var(--emerald-strong);
	}
	.score.ok {
		color: var(--warning);
	}
	.score.bad {
		color: var(--danger);
	}
	.sum {
		font-size: var(--fs-xs);
		color: var(--text-2);
	}
	.meta {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		font-size: 11px;
		color: var(--text-3);
	}
	.risk {
		font-size: 11px;
		color: var(--warning);
	}
</style>
