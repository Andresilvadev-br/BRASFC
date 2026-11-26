<script lang="ts">
	import type { Career } from '#lib/domain/career.ts';
	import { DEFAULT_APPEARANCE } from '#lib/domain/appearance.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { liveCoaches, localGroup } from '#lib/domain/turns.ts';
	import { coachKit } from '#lib/pixel/kits.ts';
	import Crest from '../Crest.svelte';
	import Pixel from '../Pixel.svelte';

	/** Treinador no controle (carreira local com vários treinadores): avatar, nome, clube e posição no turno. */
	let { career }: { career: Career } = $props();
	const group = $derived(localGroup(career));
	const coaches = $derived(liveCoaches(career));
</script>

{#if group}
	<div class="turn" role="status" aria-label="Treinador no controle: {career.personName}, {getClub(career.clubId)?.name ?? ''}">
		<span class="avatar"><Pixel appearance={career.data.appearance ?? DEFAULT_APPEARANCE} kit={coachKit(career.clubId)} size={30} /></span>
		<span class="who"><small>Treinador {group.active + 1} de {coaches.length} · no controle</small><strong>{career.personName}</strong></span>
		<Crest clubId={career.clubId} size={24} />
		<span class="dots" aria-hidden="true">
			{#each coaches as c, i (c.id)}<i class:on={i === group.active} class:ok={group.ready.includes(c.id)} title={c.personName}></i>{/each}
		</span>
	</div>
{/if}

<style>
	.turn { display: inline-flex; align-items: center; gap: 8px; padding: 3px 10px 3px 3px; border-radius: var(--radius-pill); background: var(--surface-2); border: 1px solid var(--emerald-line, #10b98166); }
	.avatar { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: var(--bg-deep, #0b0f12); overflow: hidden; }
	.who { display: grid; line-height: 1.1; }
	.who small { color: var(--emerald-strong, #34d399); font-size: 11px; }
	.who strong { font-size: var(--fs-sm); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.dots { display: inline-flex; gap: 3px; }
	.dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--surface-3, #33404a); }
	.dots i.ok { background: var(--emerald, #10b981); }
	.dots i.on { background: var(--gold, #e8b86a); }
</style>
