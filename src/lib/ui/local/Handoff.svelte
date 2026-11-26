<script lang="ts">
	import { onMount } from 'svelte';
	import type { Career } from '#lib/domain/career.ts';
	import { DEFAULT_APPEARANCE } from '#lib/domain/appearance.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { activeCoachId, localGroup } from '#lib/domain/turns.ts';
	import { pop, portal } from '#lib/motion/actions.ts';
	import { coachKit } from '#lib/pixel/kits.ts';
	import Button from '../Button.svelte';
	import Crest from '../Crest.svelte';
	import Pixel from '../Pixel.svelte';

	/**
	 * Troca de treinador no mesmo computador (como nos clássicos): quando o controle muda de mãos — fim
	 * do turno ou negociação entre treinadores — a tela fica coberta até o próximo treinador assumir.
	 */
	/** `covering`: a tela de troca está aberta (outras janelas esperam o treinador assumir) */
	let { career, covering = $bindable(false) }: { career: Career; covering?: boolean } = $props();
	const group = $derived(localGroup(career));
	const id = $derived(activeCoachId(career));
	const key = $derived(`brasfc:controle:${career.id}`);
	let seen = $state<string | null>(null);
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
		seen = sessionStorage.getItem(key);
		// Primeira abertura da carreira nesta sessão: quem abriu já está no controle.
		if (seen === null && id) {
			sessionStorage.setItem(key, id);
			seen = id;
		}
	});
	const deal = $derived(group?.deal?.status === 'aberta' && group.deal.turn === group.active ? group.deal : null);
	const open = $derived(mounted && !!group && !!id && seen !== id);
	$effect(() => {
		covering = open || !mounted;
	});
	function take() {
		if (!id) return;
		sessionStorage.setItem(key, id);
		seen = id;
	}
	function onKey(e: KeyboardEvent) {
		if (open && e.key === 'Enter') take();
	}
</script>

<svelte:window onkeydown={onKey} />

{#if open && group}
	<div class="handoff" use:portal role="dialog" aria-modal="true" aria-labelledby="handoff-title" style:--c={getClub(career.clubId)?.colors.primary ?? '#10B981'}>
		<div class="card" use:pop>
			<span class="eyebrow">Treinador {group.active + 1} de {group.coaches.length}</span>
			<div class="figure"><Pixel variant="full" appearance={career.data.appearance ?? DEFAULT_APPEARANCE} kit={coachKit(career.clubId)} clubId={career.clubId} styled size={190} ball={false} /></div>
			<h2 id="handoff-title" class="display">Vez de {career.personName}</h2>
			<p class="club"><Crest clubId={career.clubId} size={26} /> {getClub(career.clubId)?.name}</p>
			{#if deal}
				<p class="why">Proposta por <strong>{deal.playerName}</strong> aguardando a sua resposta.</p>
			{:else}
				<p class="why">Prepare o seu clube e use “Ir para próxima partida” para passar a vez.</p>
			{/if}
			<Button variant="primary" size="lg" icon="play" onclick={take}>Assumir o controle</Button>
		</div>
	</div>
{/if}

<style>
	.handoff { position: fixed; inset: 0; z-index: 900; display: grid; place-items: center; background: radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--c) 30%, #101418) 0, #0b0f12 70%); }
	.card { display: grid; justify-items: center; gap: 8px; padding: 28px 40px; text-align: center; }
	.eyebrow { color: var(--emerald-strong, #34d399); font-size: var(--fs-sm); letter-spacing: .08em; text-transform: uppercase; }
	.figure { filter: drop-shadow(0 18px 24px #0008); }
	h2 { margin: 0; font-size: clamp(28px, 4vw, 44px); }
	.club { display: inline-flex; align-items: center; gap: 8px; margin: 0; color: var(--text-2); font-weight: 600; }
	.why { margin: 4px 0 12px; color: var(--text-3); max-width: 420px; }
</style>
