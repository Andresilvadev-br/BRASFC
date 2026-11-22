<script lang="ts">
	import { onMount } from 'svelte';
	import { getClub } from '#lib/domain/clubs.ts';
	import type { Side, TeamSetup } from '#lib/engine/types.ts';
	import { enter, pop } from '#lib/motion/actions.ts';
	import Crest from '../Crest.svelte';
	import LineupPresentation from '../match/LineupPresentation.svelte';

	let { home, away, label, neutral = false, coaches = {}, ondone }: {
		home: TeamSetup; away: TeamSetup; label: string; neutral?: boolean;
		coaches?: Partial<Record<Side, string>>; ondone: () => void;
	} = $props();
	const scenes = ['duel', 'home', 'away', 'kickoff'] as const;
	let scene = $state<(typeof scenes)[number]>('duel');
	let done = false;

	function finish() {
		if (done) return;
		done = true;
		ondone();
	}

	onMount(() => {
		const timers = [
			setTimeout(() => { scene = 'home'; }, 1800),
			setTimeout(() => { scene = 'away'; }, 4700),
			setTimeout(() => { scene = 'kickoff'; }, 7600),
			setTimeout(finish, 8400)
		];
		return () => timers.forEach(clearTimeout);
	});
</script>

<svelte:window onkeydown={(event) => { if (event.key === 'Escape') finish(); }} />
<section class="walk" aria-label="Apresentação pré-jogo">
	<div class="lights"></div>
	<div class="show">
		<p class="competition">{label}</p>
		{#key scene}
			{#if scene === 'duel'}
				<div class="duel">
					<div class="club" use:pop><Crest clubId={home.id} size={104} /><strong>{home.name}</strong></div>
					<span aria-hidden="true">×</span>
					<div class="club" use:pop={{ delay:100 }}><Crest clubId={away.id} size={104} /><strong>{away.name}</strong></div>
				</div>
				<p class="venue" use:enter>{neutral ? 'Campo neutro' : getClub(home.id)?.stadium ?? 'Campo de jogo'}</p>
			{:else if scene === 'kickoff'}
				<div class="kickoff" use:pop><strong>Apito inicial</strong><span>{home.short} × {away.short}</span></div>
			{:else}
				<LineupPresentation team={scene === 'home' ? home : away} coach={coaches[scene]} />
			{/if}
		{/key}
	</div>
	<button type="button" onclick={finish}>Pular apresentação</button>
</section>

<style>
	.walk { position:fixed; inset:0; z-index:80; display:flex; flex-direction:column; align-items:center; justify-content:center;
		gap:20px; height:100dvh; padding:calc(clamp(12px,4vw,40px) + env(safe-area-inset-top,0px)) clamp(12px,4vw,40px) calc(clamp(16px,4vw,40px) + env(safe-area-inset-bottom,0px)); overflow:hidden; color:var(--text); background:radial-gradient(ellipse at 50% 10%, #145740, #07130f 54%, #05080a); }
	.lights { position:absolute; inset:0; background:conic-gradient(from 135deg at 15% 0%,transparent 0 15deg,#fff1 30deg,transparent 42deg),
		conic-gradient(from 184deg at 85% 0%,transparent 0 15deg,#fff1 30deg,transparent 42deg); pointer-events:none; }
	.show { position:relative; width:min(100%,650px); min-height:0; flex:0 1 auto; max-height:100%; overflow:auto; text-align:center; }
	.competition { margin:0 0 12px; color:var(--gold); font-weight:700; font-size:var(--fs-sm); text-transform:uppercase; }
	.duel { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:clamp(8px,4vw,48px); }
	.duel > span { font-size:2rem; color:var(--text-2); }
	.club,.kickoff { display:grid; justify-items:center; gap:10px; }
	.club strong,.kickoff strong { font-family:var(--font-display); font-size:clamp(1.5rem,4vw,3rem); line-height:1; }
	.venue,.kickoff span { color:var(--text-2); }
	button { z-index:1; flex:none; min-height:44px; padding:8px 18px; border:1px solid var(--line-strong); border-radius:20px; color:var(--text); background:var(--surface); cursor:pointer; }
</style>
