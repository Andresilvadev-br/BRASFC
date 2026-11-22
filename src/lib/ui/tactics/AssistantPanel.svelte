<script lang="ts">
	import type { Tip, TipKind } from '#lib/domain/assistant.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { formatLong } from '#lib/domain/dates.ts';
	import type { CoachOverride } from '#lib/domain/coaches.ts';
	import { COACH_PROFILES } from '#lib/engine/ai-coach.ts';
	import { indicator } from '#lib/motion/actions.ts';
	import { animate } from '#lib/motion/motion.svelte.ts';
	import Crest from '../Crest.svelte';
	import Icon from '../Icon.svelte';
	import type { IconName } from '../icons.ts';

	/**
	 * Auxiliar técnico como painel de análise: o próximo adversário em destaque e as
	 * recomendações (geradas por `analyze`, com os dados que as sustentam) separadas por área.
	 * Nada aqui é inventado: sem dado, sem recomendação.
	 */
	type Opp = { clubId: string; date: string; time?: string; home: boolean; competition: string; coach: CoachOverride | null } | null;
	let { tips, opponent = null, prepHref, onapply, ondismiss }: { tips: Tip[]; opponent?: Opp; prepHref?: string; onapply?: (t: Tip) => void; ondismiss?: (t: Tip) => void } = $props();

	type Area = 'todas' | 'ataque' | 'defesa' | 'treino' | 'elenco';
	const AREA_OF: Record<TipKind, Exclude<Area, 'todas'>> = {
		ataque: 'ataque',
		adversario: 'defesa',
		defesa: 'defesa',
		dominio: 'treino',
		fisico: 'treino',
		formacao: 'elenco',
		posicao: 'elenco',
		funcao: 'elenco'
	};
	const AREAS: Array<{ id: Area; label: string }> = [
		{ id: 'todas', label: 'Todas' },
		{ id: 'ataque', label: 'Ofensivas' },
		{ id: 'defesa', label: 'Defensivas' },
		{ id: 'treino', label: 'Treino e físico' },
		{ id: 'elenco', label: 'Elenco e funções' }
	];
	const ICON: Record<TipKind, IconName> = {
		formacao: 'tactics', posicao: 'squad', funcao: 'user', dominio: 'training', defesa: 'lock', ataque: 'arrowRight', fisico: 'heart', adversario: 'eye'
	};
	const KIND_LABEL: Record<TipKind, string> = {
		formacao: 'Formação', posicao: 'Posição', funcao: 'Função', dominio: 'Domínio', defesa: 'Defesa', ataque: 'Ataque', fisico: 'Físico', adversario: 'Adversário'
	};
	const ACTION: Partial<Record<NonNullable<Tip['action']>['type'], string>> = { formation: 'Usar formação', role: 'Aplicar função', training: 'Ver treinos', tactics: 'Abrir táticas' };

	let area = $state<Area>('todas');
	let open = $state<string | null>(null);
	const countOf = (a: Area) => (a === 'todas' ? tips.length : tips.filter((t) => AREA_OF[t.kind] === a).length);
	const shown = $derived((area === 'todas' ? tips : tips.filter((t) => AREA_OF[t.kind] === area)).slice().sort((a, b) => b.priority - a.priority));
	const top = $derived(tips.length ? Math.max(...tips.map((t) => t.priority)) : 0);

	function toggle(id: string, el: HTMLElement) {
		open = open === id ? null : id;
		if (open === id) requestAnimationFrame(() => void animate(el.querySelector('.ev'), { opacity: 1, y: 0 }, { spring: 'gentle', from: { opacity: 0, y: -6 } }));
	}
	const oppClub = $derived(opponent ? getClub(opponent.clubId) : null);
</script>

<div class="ap">
	{#if opponent && oppClub}
		<div class="opp">
			<Crest clubId={opponent.clubId} size={46} />
			<div class="oi">
				<span class="eyebrow">Próximo adversário · {opponent.home ? 'em casa' : 'fora'}</span>
				<strong>{oppClub.name}</strong>
				<small>{formatLong(opponent.date)}{opponent.time ? ` · ${opponent.time}` : ''} · {opponent.competition}</small>
			</div>
			{#if opponent.coach}
				<div class="coach" title="Técnico do adversário no universo BRASFC">
					<span>{opponent.coach.name}</span>
					<small>{COACH_PROFILES[opponent.coach.style]?.label ?? 'Perfil próprio'} · {opponent.coach.formation}</small>
				</div>
			{/if}
			{#if prepHref}<a class="prep" href={prepHref}>Preparar <Icon name="arrowRight" size={14} /></a>{/if}
		</div>
	{/if}

	{#if tips.length}
		<div class="areas" role="tablist" aria-label="Áreas das recomendações">
			<span class="ind" use:indicator={{ axis: 'x', key: area }}></span>
			{#each AREAS as a (a.id)}
				{#if a.id === 'todas' || countOf(a.id)}
					<button role="tab" aria-selected={area === a.id} onclick={() => (area = a.id)}>{a.label} <b>{countOf(a.id)}</b></button>
				{/if}
			{/each}
		</div>
		<ul class="tips">
			{#each shown as t (t.id)}
				<li class="tip" data-kind={t.kind} class:hot={t.priority === top}>
					<span class="ic"><Icon name={ICON[t.kind]} size={16} /></span>
					<div class="tb">
						<div class="th">
							<span class="kind">{KIND_LABEL[t.kind]}</span>
							{#if t.priority === top}<span class="pri">Prioridade</span>{/if}
						</div>
						<strong>{t.title}</strong>
						<p>{t.text}</p>
						<div class="ev-wrap" class:open={open === t.id}>
							<div class="ev-inner">
								{#if t.evidence.length}
									<ul class="ev">{#each t.evidence as e (e)}<li>{e}</li>{/each}</ul>
								{/if}
							</div>
						</div>
						<div class="act">
							{#if t.action && onapply && ACTION[t.action.type]}<button class="primary" onclick={() => onapply?.(t)}>{ACTION[t.action.type]}</button>{/if}
							{#if t.evidence.length}<button class="ghost" aria-expanded={open === t.id} onclick={(e) => toggle(t.id, (e.currentTarget as HTMLElement).closest('li')!)}>{open === t.id ? 'Ocultar análise' : 'Ver análise'}</button>{/if}
							{#if ondismiss}<button class="ghost dim" onclick={() => ondismiss?.(t)}>Ignorar</button>{/if}
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="none"><Icon name="check" size={16} /> Nada importante a ajustar agora. O auxiliar volta a falar quando os dados mostrarem algo.</p>
	{/if}
</div>

<style>
	.ap {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.opp {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		padding: 12px;
		border-radius: 14px;
		background: radial-gradient(120% 140% at 0% 0%, rgb(16 185 129 / 0.16), transparent 60%), var(--surface-2);
		border: 1px solid var(--line);
	}
	.oi {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}
	.eyebrow {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--emerald-strong);
	}
	.oi strong {
		font-family: var(--font-display);
		font-size: var(--fs-lg);
		text-transform: uppercase;
		line-height: 1.1;
	}
	.oi small,
	.coach small {
		color: var(--text-3);
		font-size: var(--fs-xs);
	}
	.coach {
		display: flex;
		flex-direction: column;
		padding: 6px 10px;
		border-radius: 10px;
		background: var(--surface-3);
		font-size: var(--fs-sm);
		font-weight: 650;
	}
	.prep {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 8px 12px;
		border-radius: 999px;
		background: var(--emerald);
		color: #06281c;
		font-weight: 800;
		font-size: var(--fs-sm);
		text-decoration: none;
		transition: transform 0.15s;
	}
	.prep:hover {
		transform: translateX(2px);
	}
	.areas {
		position: relative;
		display: flex;
		gap: 4px;
		padding: 4px;
		border-radius: 12px;
		background: var(--surface-sunken);
		overflow-x: auto;
		scrollbar-width: none;
	}
	.areas .ind {
		position: absolute;
		top: 4px;
		bottom: 4px;
		left: 0;
		border-radius: 9px;
		background: var(--surface-3);
		pointer-events: none;
	}
	.areas button {
		position: relative;
		z-index: 1;
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 10px;
		border: 0;
		border-radius: 9px;
		background: none;
		color: var(--text-3);
		font: inherit;
		font-size: var(--fs-xs);
		font-weight: 700;
		white-space: nowrap;
		cursor: pointer;
	}
	.areas button[aria-selected='true'] {
		color: var(--text);
	}
	.areas b {
		font-size: 11px;
		padding: 0 5px;
		border-radius: 8px;
		background: var(--surface-2);
	}
	.tips {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
		gap: 10px;
	}
	.tip {
		display: flex;
		gap: 10px;
		padding: 12px;
		border-radius: 12px;
		background: var(--surface-2);
		border: 1px solid var(--line);
		transition: border-color 0.2s, transform 0.2s;
	}
	.tip:hover {
		border-color: var(--line-strong);
	}
	.tip.hot {
		border-color: color-mix(in srgb, var(--gold) 50%, transparent);
	}
	.ic {
		display: grid;
		place-items: center;
		flex: none;
		width: 32px;
		height: 32px;
		border-radius: 10px;
		background: var(--surface-3);
		color: var(--emerald-strong);
	}
	[data-kind='defesa'] .ic,
	[data-kind='adversario'] .ic {
		color: #60a5fa;
	}
	[data-kind='fisico'] .ic,
	[data-kind='dominio'] .ic {
		color: var(--gold);
	}
	.tb {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		flex: 1;
	}
	.th {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.kind {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.pri {
		font-size: 11px;
		font-weight: 800;
		padding: 0 6px;
		border-radius: 6px;
		background: var(--gold);
		color: #2a1d06;
	}
	.tb strong {
		font-size: var(--fs-sm);
		line-height: 1.3;
	}
	.tb p {
		margin: 0;
		font-size: var(--fs-xs);
		color: var(--text-2);
		line-height: 1.45;
	}
	.ev-wrap {
		display: grid;
		grid-template-rows: 0fr;
		transition: grid-template-rows 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	.ev-wrap.open {
		grid-template-rows: 1fr;
	}
	.ev-inner {
		overflow: hidden;
	}
	.ev {
		margin: 6px 0 0;
		padding: 8px 10px 8px 24px;
		border-radius: 8px;
		background: var(--surface-3);
		font-size: var(--fs-xs);
		color: var(--text-2);
		line-height: 1.5;
	}
	.act {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 6px;
	}
	.act button {
		padding: 6px 11px;
		border-radius: 999px;
		border: 1px solid var(--line-strong);
		background: none;
		color: var(--text-2);
		font: inherit;
		font-size: var(--fs-xs);
		font-weight: 700;
		cursor: pointer;
		transition: background 0.15s, transform 0.1s;
	}
	.act button:active {
		transform: scale(0.96);
	}
	.act .primary {
		border-color: transparent;
		background: var(--emerald);
		color: #06281c;
	}
	.act .ghost:hover {
		background: var(--surface-3);
	}
	.act .dim {
		border-color: transparent;
		color: var(--text-3);
	}
	.none {
		display: flex;
		gap: 8px;
		align-items: center;
		margin: 0;
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	@media (prefers-reduced-motion: reduce) {
		.ev-wrap {
			transition: none;
		}
	}
</style>
