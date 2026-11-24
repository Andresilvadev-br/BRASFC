<script lang="ts">
	import { FORMATIONS } from '#lib/domain/tactics.ts';
	import type { TeamSetup } from '#lib/engine/types.ts';
	import { enter } from '#lib/motion/actions.ts';
	import Crest from '../Crest.svelte';

	let { team, coach }: { team: TeamSetup; coach?: string } = $props();
	const players = $derived(new Map(team.players.map((player) => [player.id, player])));
	const captain = $derived(team.tactic.captains?.find((id) => team.tactic.lineup.includes(id)) ?? team.tactic.lineup[0]);
	const bench = $derived(team.tactic.bench.flatMap((id) => { const p = players.get(id); return p ? [`${p.shortName}${p.age ? ` (${p.age})` : ''}`] : []; }));
</script>

<div class="lineup" use:enter>
	<header><Crest clubId={team.id} size={38} /><div><h2>{team.name}</h2><p>Escalação inicial · {team.tactic.formation}{coach ? ` · Técnico: ${coach}` : ''}</p></div></header>
	<div class="pitch" aria-label="Onze titulares de {team.name}">
		{#each FORMATIONS[team.tactic.formation] as slot, index (index)}
			{@const athlete = players.get(team.tactic.lineup[index])}
			{#if athlete}
				<div class="player" style:left={6 + slot.x * 0.88 + '%'} style:top={7 + slot.y * 0.86 + '%'} use:enter={{ index, y: 5 }} title={athlete.name}>
					<b>{athlete.number} · {slot.position}{captain === athlete.id ? ' · C' : ''}</b>
					<span>{athlete.shortName}{athlete.age ? ` · ${athlete.age}a` : ''}</span>
				</div>
			{/if}
		{/each}
	</div>
	{#if bench.length}<p class="bench"><strong>Banco</strong> · {bench.join(' · ')}</p>{/if}
</div>

<style>
	.lineup { width:min(100%, 600px); margin-inline:auto; }
	header { display:flex; align-items:center; justify-content:center; gap:10px; text-align:start; }
	h2,p { margin:0; }
	header p,.bench { color:var(--text-2); font-size:var(--fs-xs); }
	.pitch { position:relative; height:clamp(260px, 52dvh, 420px); margin-block:8px; border:1px solid #b6e7cf70; border-radius:10px;
		background: repeating-linear-gradient(0deg,#164935 0 12.5%,#1b543e 12.5% 25%); }
	.pitch::before { content:''; position:absolute; inset:49% 0 auto; border-top:1px solid #b6e7cf70; }
	.player { position:absolute; translate:-50% -50%; display:grid; justify-items:center; max-width:26%; padding:2px 4px;
		border-radius:5px; background:#07160fe8; color:#fff; font-size:var(--fs-xs); line-height:1.15; white-space:nowrap; }
	.player span { overflow:hidden; text-overflow:ellipsis; max-width:100%; }
	.player b { color:#8ef0bf; }
</style>
