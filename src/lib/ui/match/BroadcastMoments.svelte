<script lang="ts">
	import { onDestroy } from 'svelte';
	import { enter, pop } from '#lib/motion/actions.ts';
	import { PITCH } from '#lib/engine/types.ts';
	import { newBroadcastEvents } from './broadcast-events.ts';
	import Icon from '../Icon.svelte';
	import Crest from '../Crest.svelte';
	import type { IconName } from '../icons.ts';
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
		goal_disallowed: { title: 'Gol anulado', tag: 'Decisão oficial', duration: 3000, priority: 9 },
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
	let { events, athleteName, sessionKey, clubs }: { events: Moment[]; athleteName: (id: string) => string | undefined; sessionKey?: string;
		/** Clubes de cada lado: o escudo identifica de quem é o lance (vem do `side` do evento oficial). */
		clubs?: Partial<Record<'home' | 'away', string>> } = $props();
	let active = $state.raw<Moment | null>(null);
	let priority = $state(0);
	let speed = $state(1);
	let enabled = $state(true);
	let sound = $state(false);
	let audio: AudioContext | undefined;
	let seen = -1;
	const reviewKey = $derived(sessionKey ? `brasfc:disallowed:${sessionKey}` : null);
	function lastReview() {
		try { return reviewKey ? Number(sessionStorage.getItem(reviewKey) ?? -1) : -1; }
		catch { return -1; }
	}
	function rememberReview(index: number) {
		try { if (reviewKey) sessionStorage.setItem(reviewKey, String(index)); }
		catch { /* A partida continua quando o armazenamento do navegador está indisponível. */ }
	}
	let timer: ReturnType<typeof setTimeout>;
	let queue: Moment[] = [];
	const symbols: Partial<Record<MatchEvent['type'], IconName>> = {
		goal: 'star', foul: 'whistle', free_kick: 'whistle', corner: 'field', penalty: 'dot', penalty_miss: 'x',
		offside: 'alert', yellow: 'alert', red: 'x', sub: 'refresh', shot_saved: 'lock', injury: 'heart',
		half_time: 'pause', full_time: 'check', kickoff: 'play', second_half: 'play'
	};
	const symbol = $derived(active ? symbols[active.type] : undefined);
	const info = $derived(active && catalog[active.type]);
	const player = $derived(active?.player && athleteName(active.player));
	const other = $derived(active?.other && athleteName(active.other));
	const decisive = $derived(active?.type === 'goal' && /^8[5-9]|^9[0-9]/.test(active.minute) &&
		typeof active.data?.score === 'string' && Math.abs(Number(active.data.score.split('-')[0]) - Number(active.data.score.split('-')[1])) <= 1);

	function cue(event: Moment) {
		if (!sound || audio?.state !== 'running') return;
		const notes = event.type === 'goal' ? [392, 523.25, 659.25] : ['goal_disallowed', 'kickoff', 'half_time', 'second_half', 'full_time', 'penalty'].includes(event.type) ? [330, 440] : [];
		notes.forEach((tone, index) => {
			if (!audio) return;
			const oscillator = audio.createOscillator();
			const gain = audio.createGain();
			const at = audio.currentTime + index * 0.09;
			oscillator.frequency.value = tone;
			gain.gain.setValueAtTime(0, at);
			gain.gain.linearRampToValueAtTime(0.045, at + 0.015);
			gain.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
			oscillator.connect(gain).connect(audio.destination);
			oscillator.start(at);
			oscillator.stop(at + 0.17);
		});
	}

	async function toggleSound() {
		if (sound) { sound = false; return; }
		try {
			audio ??= new AudioContext();
			await audio.resume();
			sound = true;
		} catch { sound = false; }
	}

	function showNext() {
		clearTimeout(timer);
		active = enabled ? queue.shift() ?? null : null;
		priority = active ? catalog[active.type]!.priority : 0;
		if (active) {
			if (active.type === 'goal_disallowed') rememberReview(active.index);
			cue(active);
			timer = setTimeout(showNext, catalog[active.type]!.duration / speed);
		}
	}
	$effect(() => {
		const priorReview = lastReview();
		const incoming = newBroadcastEvents(events, seen).filter((event) => catalog[event.type] &&
			(event.type !== 'goal_disallowed' || event.index > priorReview));
		seen = Math.max(seen, ...events.map((event) => event.index));
		if (!enabled || !incoming.length) return;
		const reviews = incoming.filter((event) => event.type === 'goal_disallowed');
		const strongest = incoming.filter((event) => event.type !== 'goal_disallowed')
			.sort((a, b) => catalog[b.type]!.priority - catalog[a.type]!.priority).slice(0, 3).concat(reviews);
		const chosen = strongest.sort((a, b) => a.index - b.index);
		queue = [...queue, ...chosen].sort((a, b) => a.index - b.index);
		queue = queue.filter((event, index) => event.type === 'goal_disallowed' || index >= queue.length - 4);
		if (catalog[strongest.reduce((a, b) => catalog[a.type]!.priority >= catalog[b.type]!.priority ? a : b).type]!.priority >= 7 && priority < 6) {
			queue = queue.filter((event) => catalog[event.type]!.priority >= 4);
			showNext();
		} else if (!active) showNext();
	});
	onDestroy(() => { clearTimeout(timer); if (audio) void audio.close().catch(() => {}); });
</script>

<div class="moments">
	<div class="toolbar" role="toolbar" aria-label="Cenas da transmissão">
		<button type="button" aria-pressed={enabled} onclick={() => { enabled = !enabled; if (!enabled) { queue = []; showNext(); } }} title={enabled ? 'Ocultar cenas' : 'Exibir cenas'} data-umx-press>
			<Icon name="eye" size={16} /><span>{enabled ? 'Cenas' : 'Cenas ocultas'}</span></button>
		<button type="button" aria-pressed={sound} onclick={toggleSound} title={sound ? 'Silenciar cenas' : 'Ativar som das cenas'} data-umx-press>
			<Icon name="bell" size={16} /><span>{sound ? 'Som' : 'Sem som'}</span></button>
		{#if enabled}
			<button type="button" aria-pressed={speed === 2} onclick={() => speed = speed === 1 ? 2 : 1} title="Velocidade das cenas" data-umx-press>
				<Icon name="play" size={14} /><span class="num">{speed}×</span></button>
			{#if active}<button type="button" onclick={showNext} title="Pular lance" data-umx-press><Icon name="skip" size={16} /><span>Pular</span></button>{/if}
		{/if}
	</div>
	{#if active && info}
		{#key active.index}
			<div class="ribbon" class:decisive data-event={active.type} use:enter aria-live="polite">
				<div class="signal" aria-hidden="true">
					{#if active.type === 'goal_disallowed' && active.x !== undefined && active.y !== undefined}
							{@const x = 4 + active.x * 104 / PITCH.length}
							{@const y = 4 + active.y * 68 / PITCH.width}
						<svg class="review-field" viewBox="0 0 112 76">
							<rect x="4" y="4" width="104" height="68" rx="2" fill="none" stroke="currentColor" opacity=".6" />
							<path d="M56 4V72 M4 18H20V58H4 M108 18H92V58H108" fill="none" stroke="currentColor" opacity=".6" />
							<circle cx="56" cy="38" r="9" fill="none" stroke="currentColor" opacity=".6" />
							<path class="review-flag" d={`M${x} 4V72`} stroke="currentColor" stroke-dasharray="3 3" />
							<circle class="review-flag" cx={x} cy={y} r="4" fill="currentColor" />
						</svg>
					{:else if symbol}<span class="event-symbol" use:pop><Icon name={symbol} size={28} /></span>{:else}<i></i><i></i><i></i>{/if}
				</div>
				<div class="copy">
					<small>{#if active.side && clubs?.[active.side]}<span class="club"><Crest clubId={clubs[active.side]} size={16} /></span>{/if}{info.tag} · {active.minute}</small>
					<strong use:pop>{decisive ? 'Gol nos minutos finais!' : info.title}</strong>
					{#if active.type === 'sub'}<span>Entra {player ?? '—'} · Sai {other ?? '—'}</span>
					{:else if active.type === 'goal_disallowed'}<span>{player} · {active.data?.reason === 'impedimento' ? 'Impedimento' : 'Revisão da arbitragem'} · Placar {active.data?.score ?? 'mantido'}</span>
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
	.toolbar {display:inline-flex;gap:2px;flex-wrap:wrap;padding:3px;margin:6px 0;border-radius:999px;background:var(--surface-sunken);border:1px solid var(--line)}
	.toolbar button {display:inline-flex;align-items:center;gap:6px;min-height:32px;border:0;background:transparent;font:inherit;font-size:.75rem;font-weight:600;color:var(--text-2);border-radius:999px;padding:4px 12px;cursor:pointer;transition:background var(--dur-2) var(--ease-out),color var(--dur-2) var(--ease-out)}
	.toolbar button:hover {color:var(--text);background:rgb(231 237 240 / .06)}
	.toolbar button[aria-pressed='true'] {color:var(--emerald-strong);background:var(--emerald-soft)}
	@media (max-width:420px){.toolbar button span:not(.num){display:none}}
	.ribbon {--mark:#66edd0;display:grid;grid-template-columns:64px 1fr;gap:13px;align-items:center;min-height:72px;overflow:hidden;border-left:4px solid var(--mark);border-radius:8px;background:linear-gradient(110deg,#162c31,#0d171b);color:#fff}
	.review-field {width:100%;padding:5px;color:var(--mark);transform:skewX(15deg)} .review-flag {animation:pulse .55s ease-out both;transform-origin:center}
	.copy {padding:7px 9px 7px 0;min-width:0;display:grid}.copy small{display:flex;align-items:center;gap:6px}.club{display:inline-grid;filter:drop-shadow(0 1px 2px #0008)}.copy small{color:var(--mark);text-transform:uppercase;letter-spacing:.07em}.copy strong{font-size:clamp(1rem,3vw,1.5rem);line-height:1.02}.copy span{font-size:.75rem;color:#dee9e4}
	.signal {display:flex;gap:3px;align-items:center;justify-content:center;height:100%;transform:skewX(-15deg);background:repeating-linear-gradient(90deg,#0000 0 7px,#ffffff0d 7px 9px)}
	.event-symbol { color:var(--mark); }
	.event-symbol :global(svg) { display:block; }
	.signal i {width:4px;height:34%;border-radius:7px;background:var(--mark);animation:pulse .85s ease-out both}.signal i:nth-child(2){height:62%;animation-delay:.1s}.signal i:nth-child(3){height:44%;animation-delay:.2s}
	[data-event='goal'] {--mark:#72ff9e;background:linear-gradient(100deg,#105a38,#112a20)}.ribbon.decisive{--mark:#ffe081;background:linear-gradient(100deg,#453208,#123220)}[data-event='red']{--mark:#ff7c83;background:#441f25}[data-event='yellow']{--mark:#ffda76;background:#372e1b}
	[data-event='goal_disallowed']{--mark:#ffc26c;background:linear-gradient(100deg,#573621,#1e2225)}[data-event='sub']{--mark:#9bc5ff;background:#162c48}[data-event='penalty'],[data-event='penalty_miss']{--mark:#ffd580;background:#342418}[data-event='offside'],[data-event='foul']{--mark:#d5d8d5}[data-event='corner'],[data-event='free_kick']{--mark:#a2e3ff}
	@keyframes pulse{from{opacity:.25;transform:scaleY(.15)}to{opacity:1;transform:scaleY(1)}}
	@media(prefers-reduced-motion:reduce){.signal i,.review-flag{animation:none}}
</style>
