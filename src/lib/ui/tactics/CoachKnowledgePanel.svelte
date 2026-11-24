<script lang="ts">
	import { CONCEPTS, COACH_EXECUTION_SHARE, type CoachKnowledge } from '#lib/domain/coach-knowledge.ts';
	import { MASTERY_LABEL, type TacticalState } from '#lib/domain/tactical.ts';
	import { FORMATION_IDS, STYLE_LABELS, type FormationId, type PlayStyle } from '#lib/domain/tactics.ts';
	import { getClub } from '#lib/domain/clubs.ts';

	/** Conhecimento pessoal do treinador × entrosamento do elenco atual, lado a lado. */
	let { coach, team, formation, style }: { coach: CoachKnowledge; team: TacticalState; formation: FormationId; style: PlayStyle } = $props();
	const rows = $derived([
		{ label: `Formação ${formation}`, mine: coach.formations[formation], squad: team.formations[formation] },
		{ label: `Estilo ${STYLE_LABELS[style]}`, mine: coach.styles[style], squad: team.styles[style] },
		{ label: 'Instruções avançadas', mine: coach.instructions, squad: team.instructions }
	]);
	const best = $derived([...FORMATION_IDS].sort((a, b) => coach.formations[b] - coach.formations[a]).slice(0, 3));
	const concepts = $derived(Object.entries(coach.concepts).filter(([, v]) => (v ?? 0) >= 30).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 4));
	const lift = (mine: number, squad: number) => Math.round(Math.max(0, mine - squad) * COACH_EXECUTION_SHARE);
	const last = $derived(coach.timeline.at(-1));
</script>

<section class="ck" aria-label="Conhecimento do treinador e entrosamento do elenco">
	<p class="muted small">Seu conhecimento acompanha você em qualquer clube. O elenco aprende com o tempo — mais rápido quando você domina o sistema — e em campo você corrige parte da diferença.</p>
	<table>
		<thead><tr><th></th><th>Você</th><th>Elenco</th><th>Em campo</th></tr></thead>
		<tbody>
			{#each rows as r (r.label)}
				<tr>
					<th>{r.label}</th>
					<td><b>{Math.round(r.mine)}</b><small>{MASTERY_LABEL(r.mine)}</small></td>
					<td><b>{Math.round(r.squad)}</b><small>{MASTERY_LABEL(r.squad)}</small></td>
					<td><b>{Math.round(r.squad + Math.max(0, r.mine - r.squad) * COACH_EXECUTION_SHARE)}</b>{#if lift(r.mine, r.squad)}<small class="up">+{lift(r.mine, r.squad)} pelo treinador</small>{/if}</td>
				</tr>
			{/each}
		</tbody>
	</table>
	<div class="chips">
		<span>Seus sistemas:</span>
		{#each best as f (f)}<em>{f} · {Math.round(coach.formations[f])}</em>{/each}
		{#each concepts as [c, v] (c)}<em class="c">{CONCEPTS[c as keyof typeof CONCEPTS]} · {Math.round(v ?? 0)}</em>{/each}
	</div>
	<p class="muted small">{coach.matches} jogos de experiência{last ? ` · último ciclo: ${getClub(last.clubId)?.short ?? last.clubId} ${last.season} no ${last.formation}` : ''}</p>
</section>

<style>
	.ck { display: grid; gap: 10px; margin-bottom: 14px; padding: 12px; border-radius: 14px; background: rgb(234 179 8 / 0.06); border: 1px solid rgb(234 179 8 / 0.16); }
	table { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
	th, td { padding: 6px 8px; text-align: left; border-bottom: 1px solid rgb(231 237 240 / 0.06); }
	td { white-space: nowrap; }
	td b { margin-right: 6px; font-variant-numeric: tabular-nums; }
	td small { color: var(--text-3); font-size: var(--fs-xs); }
	td small.up { color: var(--emerald-strong); }
	thead th { color: var(--text-3); font-weight: 500; font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.06em; }
	.chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: var(--fs-xs); }
	.chips span { color: var(--text-3); }
	.chips em { font-style: normal; padding: 2px 8px; border-radius: 999px; background: rgb(231 237 240 / 0.07); }
	.chips em.c { background: rgb(16 185 129 / 0.12); }
	.small { font-size: var(--fs-xs); margin: 0; }
</style>
