<script lang="ts">
	import { getClub } from '#lib/domain/clubs.ts';
	import { formatDayMonth } from '#lib/domain/dates.ts';
	import type { CompetitionParticipation } from '#lib/world/contract.ts';
	import { STATUS_LABEL } from '#lib/world/participation.ts';

	/** Selo de situação do clube numa competição. Só traduz o estado informado (engine ou adaptador provisório). */
	let { participation, detail = true }: { participation: CompetitionParticipation; detail?: boolean } = $props();
	const p = $derived(participation);
	const extra = $derived(
		p.status === 'aguardando-estreia' ? `${p.stage ?? '—'}${p.nextDate ? ` · ${formatDayMonth(p.nextDate)}` : ''}`
		: p.status === 'eliminado' ? `${p.eliminatedStage ?? ''}${p.eliminatedBy ? ` · por ${getClub(p.eliminatedBy)?.short ?? p.eliminatedBy}` : ''}`
		: p.status === 'classificado' || p.status === 'em-disputa' ? `${p.stage ?? ''}${p.nextDate ? ` · ${formatDayMonth(p.nextDate)}` : ''}`
		: ''
	);
</script>

<span class="badge {p.status}" data-status={p.status}>
	<i aria-hidden="true"></i>
	<b>{STATUS_LABEL[p.status]}</b>{#if detail && extra}<small>{extra}</small>{/if}
</span>

<style>
	.badge { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; padding: 4px 10px; border-radius: 999px; font-size: var(--fs-sm); background: var(--surface-2); border: 1px solid var(--line); white-space: nowrap; }
	.badge b { font-weight: 700; }
	.badge small { color: var(--text-3); overflow: hidden; text-overflow: ellipsis; }
	i { width: 8px; height: 8px; border-radius: 50%; flex: none; background: #94a3b8; }
	.aguardando-estreia i { background: #60a5fa; }
	.em-disputa i { background: #f5c451; }
	.classificado i { background: #46df93; }
	.campeao { border-color: rgb(234 179 8 / 0.5); background: rgb(234 179 8 / 0.12); }
	.campeao i { background: #eab308; }
	.eliminado i { background: #ef4444; }
	.nao-classificado { opacity: 0.8; }
</style>
