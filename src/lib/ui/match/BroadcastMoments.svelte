<script lang="ts">
	import { onDestroy } from 'svelte';
	import { enter, pop } from '#lib/motion/actions.ts';
	import type { MatchEvent } from '#lib/engine/types.ts';
	type Moment = MatchEvent & { index: number; minute: string };
	const catalog: Partial<Record<MatchEvent['type'], { title: string; tag: string; duration: number; priority: number }>> = {
		kickoff: { title: 'Bola rolando', tag: 'Saída de bola', duration: 1300, priority: 2 },
		second_half: { title: 'Segundo tempo', tag: 'Reinício', duration: 1800, priority: 4 },
		shot: { title: 'Finalização', tag: 'Ataque', duration: 1000, priority: 1 },
		cross: { title: 'Bola na área', tag: 'Construção', duration: 950, priority: 1 },
		aerial: { title: 'Disputa pelo alto', tag: 'Construção', duration: 900, priority: 1 },
		shot_saved: { title: 'Defesa!', tag: 'Goleiro', duration: 1800, priority: 4 },
		shot_off: { title: 'Para fora', tag: 'Finalização', duration: 900, priority: 1 },
		shot_blocked: { title: 'Chute bloqueado', tag: 'Defesa', duration: 900, priority: 1 },
		goal: { title: 'Gol!', tag: 'Placar atualizado', duration: 2600, priority: 8 },
		foul: { title: 'Falta marcada', tag: 'Arbitragem', duration: 1200, priority: 2 },
		yellow: { title: 'Cartão amarelo', tag: 'Arbitragem', duration: 1600, priority: 4 },
		red: { title: 'Expulsão', tag: 'Arbitragem', duration: 2200, priority: 7 },
		offside: { title: 'Impedimento', tag: 'Jogada interrompida', duration: 1300, priority: 3 },
		corner: { title: 'Escanteio', tag: 'Bola parada', duration: 1500, priority: 3 },
		free_kick: { title: 'Tiro livre', tag: 'Bola parada', duration: 1500, priority: 3 },
		penalty: { title: 'Pênalti', tag: 'Bola parada', duration: 2100, priority: 6 },
		penalty_miss: { title: 'Pênalti desperdiçado', tag: 'Bola parada', duration: 1800, priority: 5 },
		sub: { title: 'Substituição', tag: 'Banco de reservas', duration: 1550, priority: 4 },
		injury: { title: 'Atendimento em campo', tag: 'Equipe médica', duration: 1450, priority: 3 },
		half_time: { title: 'Intervalo', tag: 'Fim do primeiro tempo', duration: 2200, priority: 6 },
		full_time: { title: 'Apito final', tag: 'Encerramento', duration: 2200, priority: 6 }
	};
	let { events, athleteName }: { events: Moment[]; athleteName: (id: string) => string | undefined } = $props();
	let active = $state.raw<Moment | null>(null);
	let priority = $state(0);
	let speed = $state(1);
	let enabled = $state(true);
	let seen = -1;
	let timer: ReturnType<typeof setTimeout>;
	let queue: Moment[] = [];
	const info = $derived(active && catalog[active.type]);
	const player = $derived(active?.player && athleteName(active.player));
	const other = $derived(active?.other && athleteName(active.other));
	const decisive = $derived(active?.type === 'goal' && /^8[5-9]|^9[0-9]/.test(active.minute) &&
		typeof active.data?.score === 'string' && Math.abs(Number(active.data.score.split('-')[0]) - Number(active.data.score.split('-')[1])) <= 1);

	function showNext() {
		clearTimeout(timer);
		active = enabled ? queue.shift() ?? null : null;
		priority = active ? catalog[active.type]!.priority : 0;
		if (active) timer = setTimeout(showNext, catalog[active.type]!.duration / speed);
	}
	$effect(() => {
		const incoming = events.filter((event) => event.index > seen && catalog[event.type]);
		seen = Math.max(seen, ...events.map((event) => event.index));
		if (!enabled || !incoming.length) return;
		const strongest = [...incoming].sort((a, b) => catalog[b.type]!.priority - catalog[a.type]!.priority).slice(0, 3);
		const chosen = strongest.sort((a, b) => a.index - b.index);
		queue = [...queue, ...chosen].slice(-4);
		if (catalog[strongest.reduce((a, b) => catalog[a.type]!.priority >= catalog[b.type]!.priority ? a : b).type]!.priority >= 7 && priority < 6) {
			queue = queue.filter((event) => catalog[event.type]!.priority >= 4);
			showNext();
		} else if (!active) showNext();
	});
	onDestroy(() => clearTimeout(timer));
</script>

<div class="moments">
	<div class="toolbar">
		<button type="button" onclick={() => { enabled = !enabled; if (!enabled) { queue = []; showNext(); } }}>{enabled ? 'Ocultar cenas' : 'Exibir cenas'}</button>
		{#if enabled}
			<button type="button" aria-pressed={speed === 2} onclick={() => speed = speed === 1 ? 2 : 1}>Cenas {speed}×</button>
			{#if active}<button type="button" onclick={showNext}>Pular lance</button>{/if}
		{/if}
	</div>
	{#if active && info}
		{#key active.index}
			<div class="ribbon" class:decisive data-event={active.type} use:enter aria-live="polite">
				<div class="signal" aria-hidden="true"><i></i><i></i><i></i></div>
				<div class="copy">
					<small>{info.tag} · {active.minute}</small>
					<strong use:pop>{decisive ? 'Gol nos minutos finais!' : info.title}</strong>
					{#if active.type === 'sub'}<span>Entra {player ?? '—'} · Sai {other ?? '—'}</span>
					{:else if active.type === 'goal'}<span>{player}{other ? ' · Assistência de ' + other : ''}{active.data?.score ? ' · ' + active.data.score : ''}</span>
					{:else if active.type === 'shot' && Number(active.data?.xg) >= 0.28}<span>Grande oportunidade · {player}</span>
					{:else if player}<span>{player}{other ? ' · ' + other : ''}</span>{/if}
				</div>
			</div>
		{/key}
	{/if}
</div>
<style>
	.moments { position:relative; min-height:100px; }
	.toolbar {display:flex;gap:6px;flex-wrap:wrap;padding:4px 0;}
	button {border:1px solid var(--line);background:var(--surface);font:inherit;font-size:.72rem;color:var(--text);border-radius:6px;padding:5px 8px;cursor:pointer}
	.ribbon {--mark:#66edd0;display:grid;grid-template-columns:64px 1fr;gap:13px;align-items:center;min-height:72px;overflow:hidden;border-left:4px solid var(--mark);border-radius:8px;background:linear-gradient(110deg,#162c31,#0d171b);color:#fff}
	.copy {padding:7px 9px 7px 0;min-width:0;display:grid}.copy small{color:var(--mark);text-transform:uppercase;letter-spacing:.07em}.copy strong{font-size:clamp(1rem,3vw,1.5rem);line-height:1.02}.copy span{font-size:.75rem;color:#dee9e4}
	.signal {display:flex;gap:3px;align-items:center;justify-content:center;height:100%;transform:skewX(-15deg);background:repeating-linear-gradient(90deg,#0000 0 7px,#ffffff0d 7px 9px)}
	.signal i {width:4px;height:34%;border-radius:7px;background:var(--mark);animation:pulse .85s ease-out both}.signal i:nth-child(2){height:62%;animation-delay:.1s}.signal i:nth-child(3){height:44%;animation-delay:.2s}
	[data-event='goal'] {--mark:#72ff9e;background:linear-gradient(100deg,#105a38,#112a20)}.ribbon.decisive{--mark:#ffe081;background:linear-gradient(100deg,#453208,#123220)}[data-event='red']{--mark:#ff7c83;background:#441f25}[data-event='yellow']{--mark:#ffda76;background:#372e1b}
	[data-event='sub']{--mark:#9bc5ff;background:#162c48}[data-event='penalty'],[data-event='penalty_miss']{--mark:#ffd580;background:#342418}[data-event='offside'],[data-event='foul']{--mark:#d5d8d5}[data-event='corner'],[data-event='free_kick']{--mark:#a2e3ff}
	@keyframes pulse{from{opacity:.25;transform:scaleY(.15)}to{opacity:1;transform:scaleY(1)}}
	@media(prefers-reduced-motion:reduce){.signal i{animation:none}}
</style>
