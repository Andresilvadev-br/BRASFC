<script lang="ts">
	import type { Tip } from '#lib/domain/assistant.ts';
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons.ts';

	/**
	 * Recomendações do auxiliar técnico. Cada uma mostra os dados que a sustentam;
	 * o usuário pode aplicar (quando há ação) ou ignorar (fica registrado na carreira).
	 */
	let { tips, limit = 4, onapply, ondismiss }: { tips: Tip[]; limit?: number; onapply?: (t: Tip) => void; ondismiss?: (t: Tip) => void } = $props();
	let expanded = $state<string | null>(null);
	const ICON: Record<Tip['kind'], IconName> = {
		formacao: 'tactics', posicao: 'squad', funcao: 'user', dominio: 'training', defesa: 'lock', ataque: 'arrowRight', fisico: 'heart', adversario: 'eye'
	};
	const LABEL: Partial<Record<NonNullable<Tip['action']>['type'], string>> = { formation: 'Usar formação', role: 'Aplicar função', training: 'Ver treinos', tactics: 'Abrir táticas' };
</script>

{#if tips.length}
	<ul class="tips">
		{#each tips.slice(0, limit) as t (t.id)}
			<li data-kind={t.kind}>
				<span class="ic"><Icon name={ICON[t.kind]} size={16} /></span>
				<div class="body">
					<button class="title" onclick={() => (expanded = expanded === t.id ? null : t.id)} aria-expanded={expanded === t.id}>{t.title}</button>
					<p>{t.text}</p>
					{#if expanded === t.id}
						<ul class="ev">{#each t.evidence as e (e)}<li>{e}</li>{/each}</ul>
					{/if}
					<div class="act">
						{#if t.action && onapply && LABEL[t.action.type]}<Button size="sm" variant="secondary" onclick={() => onapply?.(t)}>{LABEL[t.action.type]}</Button>{/if}
						{#if ondismiss}<Button size="sm" variant="ghost" onclick={() => ondismiss?.(t)}>Ignorar</Button>{/if}
						<button class="why" onclick={() => (expanded = expanded === t.id ? null : t.id)}>{expanded === t.id ? 'Ocultar dados' : 'Por quê?'}</button>
					</div>
				</div>
			</li>
		{/each}
	</ul>
{:else}
	<p class="none"><Icon name="check" size={16} /> Nada importante a ajustar agora.</p>
{/if}

<style>
	.tips {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.tips > li {
		display: flex;
		gap: 10px;
		padding: 10px;
		border-radius: 10px;
		background: var(--surface-2);
	}
	.ic {
		display: grid;
		place-items: center;
		flex: none;
		width: 30px;
		height: 30px;
		border-radius: 8px;
		background: var(--gold-soft);
		color: var(--gold);
	}
	li[data-kind='defesa'] .ic,
	li[data-kind='fisico'] .ic,
	li[data-kind='posicao'] .ic {
		background: var(--danger-soft);
		color: var(--danger);
	}
	li[data-kind='funcao'] .ic,
	li[data-kind='formacao'] .ic {
		background: var(--emerald-soft);
		color: var(--emerald-strong);
	}
	.body {
		min-width: 0;
		flex: 1;
	}
	.title {
		border: 0;
		background: none;
		padding: 0;
		color: var(--text);
		font: inherit;
		font-weight: 700;
		font-size: var(--fs-sm);
		text-align: left;
		cursor: pointer;
	}
	.body p {
		margin: 2px 0 6px;
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.ev {
		margin: 0 0 6px;
		padding-left: 16px;
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.act {
		display: flex;
		gap: 6px;
		align-items: center;
		flex-wrap: wrap;
	}
	.why {
		border: 0;
		background: none;
		color: var(--text-3);
		font: inherit;
		font-size: var(--fs-xs);
		cursor: pointer;
		text-decoration: underline;
	}
	.none {
		display: flex;
		gap: 6px;
		align-items: center;
		color: var(--text-3);
		font-size: var(--fs-sm);
		margin: 0;
	}
</style>
