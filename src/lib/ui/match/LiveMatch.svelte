<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { enter, pop } from '#lib/motion/actions.ts';
	import { api } from '#lib/api.ts';
	import type { updateLiveRound } from '#lib/server/connected-world.ts';
	import { FORMATIONS, FORMATION_IDS, MENTALITIES, MENTALITY_LABELS, STYLES, STYLE_LABELS, autoLineup, type FormationId } from '#lib/domain/tactics.ts';
	import { presetInstructions, type Level5 } from '#lib/engine/instructions.ts';
	import { computeOverall } from '#lib/engine/attributes.ts';
	import type { Decision, MatchEvent } from '#lib/engine/types.ts';
	import Crest from '../Crest.svelte';
	import Button from '../Button.svelte';
	import PitchCanvas from './PitchCanvas.svelte';

	type Session = NonNullable<Awaited<ReturnType<typeof updateLiveRound>>['session']>;
	let { path, profile, names, online, onchange, oncomplete }: { path: string; profile: string; names: Record<string, string>; online: boolean;
		onchange: (loading: boolean) => void; oncomplete: () => void } = $props();
	let session = $state.raw<Session | null>(null);
	let pending = $state(false);
	let error = $state('');
	let skipped = $state(false);
	let now = $state(0);
	let mode = $state<'classico' | 'pixel' | 'narracao'>('classico');
	let outId = $state('');
	let inId = $state('');
	let latched = false;
	let frameSet = $state.raw<NonNullable<Session['relevant']>['match'][]>([]);
	let replayIndex = $state<number | null>(null);
	let replayTimer: ReturnType<typeof setInterval> | undefined;
	const present = $derived(session?.phase === 'PRESENTATION' && !skipped);
	const scene = $derived(now - (session?.since ?? 0) < 3200 ? 'stadium' : now - (session?.since ?? 0) < 7500 ? 'home' : 'away');
	const relevant = $derived(session?.relevant);
	const match = $derived(relevant?.match);
	const visual = $derived(replayIndex === null ? match : frameSet[replayIndex] ?? match);
	const sides = ['home', 'away'] as const;
	const labels: Record<string, string> = {
		goal: 'Gol', foul: 'Falta', free_kick: 'Cobrança de falta', corner: 'Escanteio', penalty: 'Pênalti', penalty_miss: 'Pênalti perdido',
		yellow: 'Cartão amarelo', red: 'Cartão vermelho', sub: 'Substituição', offside: 'Impedimento', injury: 'Lesão', shot_saved: 'Defesa',
		shot: 'Finalização', aerial: 'Disputa aérea', cross: 'Cruzamento', half_time: 'Intervalo', second_half: 'Segundo tempo', full_time: 'Fim de jogo', tactic: 'Ajuste tático'
	};
	const stages: Record<Session['phase'], string> = { LOADING: 'Carregamento', PRESENTATION: 'Apresentação', FIRST_HALF: 'Primeiro tempo',
		HALF_TIME: 'Intervalo', SECOND_HALF: 'Segundo tempo', FULL_TIME: 'Fim de jogo · aguardando confirmação oficial' };
	const athletes = $derived(new Map([...(relevant?.replay.home.players ?? []), ...(relevant?.replay.away.players ?? [])].map((p) => [p.id, p])));
	const canvas = $derived(visual ? {
		ball: visual.ball, tick: visual.tick, events: visual.events, teams: visual.teams, player: (id: string) => athletes.get(id),
		states: new Map(visual.players.map((player) => [player.id, player]))
	} : null);
	const feature = $derived(match?.events.findLast((event) => ['goal', 'foul', 'corner', 'free_kick', 'penalty', 'sub', 'red', 'yellow'].includes(event.type) && match.tick - event.tick <= 180));
	const own = $derived(relevant?.match.teams[relevant.side]);
	const playerStats = $derived(session?.athleteId ? match?.stats.players[session.athleteId] : undefined);
	const suggestionRights = $derived(session?.role === 'assistant');
	const competition = (id?: string) => id === 'copa-do-brasil' ? 'Copa do Brasil' : id?.startsWith('serie-') ? `Brasileirão Série ${id.at(-1)?.toUpperCase()}` : 'BRASFC';

	async function request(action: string, extra: Record<string, unknown> = {}) {
		if (pending) return;
		pending = true;
		try {
			const data = await api<{ session: Session | null }>(`${path}?live${action === 'pulse' ? '=pulse' : ''}`, { body: action === 'pulse' ? { action } : {
				action, session: session?.id, sequence: session?.sequence, op: crypto.randomUUID(), ...extra
			} });
			if (!data.session) {
				oncomplete();
				return;
			}
			error = '';
			const frame = data.session.relevant?.match;
			if (frame && frame.tick !== frameSet.at(-1)?.tick && replayIndex === null) frameSet = [...frameSet.slice(-8), frame];
			session = data.session;
			onchange(session.phase === 'LOADING');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Falha temporária na sessão.';
		} finally {
			pending = false;
		}
	}

	onMount(() => {
		void request('pulse');
		const poll = setInterval(() => { if (navigator.onLine) void request('pulse'); }, 950);
		const clock = setInterval(() => { now = Date.now(); }, 200);
		now = Date.now();
		return () => { clearInterval(poll); clearInterval(clock); clearInterval(replayTimer); };
	});

	$effect(() => {
		const current = session;
		if (current?.phase !== 'LOADING' || current.loaded.includes(profile) || !online || latched || pending) return;
		latched = true;
		void untrack(() => request('loaded')).finally(() => { latched = false; });
	});

	function decision(value: Decision) { void request(relevant?.canManage ? 'decision' : 'suggest', { decision: value }); }
	function changeFormation(value: FormationId) {
		if (!relevant || !own) return;
		const squad = relevant.replay[relevant.side].players.filter((p) => match?.players.some((row) => row.id === p.id));
		const available = new Set(squad.map((p) => p.id));
		const lineup = autoLineup(value, squad.map((p) => ({ ...p, overall: computeOverall(p.attributes, p.position) } as Parameters<typeof autoLineup>[1][number])));
		if (lineup.every((id) => available.has(id))) decision({ type: 'formation', value, lineup });
	}
	function replay() {
		if (frameSet.length < 2 || replayIndex !== null) return;
		replayIndex = 0;
		replayTimer = setInterval(() => {
			if (replayIndex !== null && replayIndex + 1 < frameSet.length) replayIndex++;
			else { clearInterval(replayTimer); replayIndex = null; }
		}, 240);
	}
	function namesOf(event: MatchEvent) {
		const player = event.player ? athletes.get(event.player)?.name : null;
		const other = event.other ? athletes.get(event.other)?.name : null;
		return [player, other].filter(Boolean).join(event.type === 'goal' ? ' · assistência: ' : ' · ');
	}
</script>

<section class="live" aria-label="Transmissão da rodada" use:enter>
	{#if error}<p role="alert">{error}</p>{/if}
	{#if !session || session.phase === 'LOADING'}
		<div class="surface waiting">
			<h2>Preparando a rodada</h2>
			{#if session}<p>{session.loaded.length}/{session.required.length} carregaram a transmissão</p>
				{#if session.countdownUntil && !session.waiting.length}<strong>{Math.max(0, Math.ceil((session.countdownUntil - now) / 1000))}</strong>{/if}
				{#if session.waiting.length}<p>Aguardando {session.waiting.map((id) => names[id] ?? 'participante').join(', ')}</p>{/if}
			{/if}
		</div>
	{:else}
		<header class="score surface">
			<div><small>{competition(relevant?.competition)} · Rodada {session.round}</small><strong>{stages[session.phase]}</strong></div>
			{#if relevant && match}
				<div class="clubs"><Crest clubId={relevant.replay.home.id} size={42} /><span>{relevant.replay.home.short}</span>
					<strong>{match.score.home} × {match.score.away}</strong><span>{relevant.replay.away.short}</span><Crest clubId={relevant.replay.away.id} size={42} /></div>
				<time>{match.minute}</time>
			{/if}
		</header>
		{#if session.waiting.length || !online}
			<p class="surface waiting" role="status">Rodada em espera · {session.waiting.map((id) => names[id] ?? 'participante').join(', ') || 'Reconectando'}</p>
		{/if}
		{#if relevant && match}
			{#if present}
				<div class="broadcast surface">
					{#key scene}
						{#if scene === 'stadium'}
							<div class="opening" use:enter><small>TRANSMISSÃO BRASFC</small>
								<div class="clubs"><Crest clubId={relevant.replay.home.id} size={72} /><strong>{relevant.replay.home.name} × {relevant.replay.away.name}</strong><Crest clubId={relevant.replay.away.id} size={72} /></div>
								<p>{relevant.stadium ?? 'Campo de jogo'} · {relevant.replay.neutral ? 'Campo neutro' : 'Mando da equipe mandante'}</p>
							</div>
						{:else}
							{@const team = relevant.replay[scene]}
							<div class="lineup" use:enter>
								<h2>{team.name} · {team.tactic.formation}</h2>
								<p>{relevant.crew.filter((member) => member.club === team.id).map((member) => `${member.role === 'coach' ? 'Treinador' : 'Auxiliar'} · ${member.name}`).join(' / ') || 'Comissão da IA'}</p>
								<div class="board">
									{#each FORMATIONS[team.tactic.formation] as slot, index}
										{@const athlete = athletes.get(team.tactic.lineup[index])}
										<div style:left={`${slot.x}%`} style:top={`${slot.y}%`}><b>{athlete?.number}</b><span>{athlete?.shortName} · {slot.position}</span></div>
									{/each}
								</div>
								<small>Banco · {team.tactic.bench.map((id) => athletes.get(id)?.shortName ?? id).join(' · ')}</small>
							</div>
						{/if}
					{/key}
					<Button onclick={() => (skipped = true)}>Pular apresentação</Button>
				</div>
			{:else}
				<div class="grid">
					<div class="surface field">
						<div class="controls"><label>Visualização <select bind:value={mode}><option value="classico">Clássico</option><option value="pixel">Pixel</option><option value="narracao">Narração</option></select></label>
							{#if frameSet.length > 1}<Button size="sm" onclick={replay} disabled={replayIndex !== null}>Rever trecho</Button>{/if}
						</div>
						{#if mode !== 'narracao' && canvas}
							<PitchCanvas match={canvas} {mode} colors={{ home: relevant.replay.home.colors, away: relevant.replay.away.colors }} version={visual?.tick} />
						{/if}
						{#if replayIndex !== null}<span class="film">Replay local</span>{/if}
						{#if playerStats && !['HALF_TIME', 'FULL_TIME'].includes(session.phase)}
							<p>Sua atuação · {playerStats.minutes} min · Nota {playerStats.rating.toFixed(1)} · Condição {Math.round(playerStats.condition)}%</p>
						{/if}
						{#if feature}
							{#key `${feature.tick}-${feature.type}`}
								<div class="feature" class:goal={feature.type === 'goal'} use:pop><strong>{labels[feature.type]}</strong><span>{namesOf(feature)} · {feature.minute}</span></div>
							{/key}
						{/if}
					</div>
					<aside class="surface">
						<h3>Lances oficiais</h3>
						{#each [...match.events].reverse().slice(0, mode === 'narracao' ? 16 : 6) as event}
							<p class="event"><time>{event.minute}</time><span>{labels[event.type] ?? event.type}<small>{namesOf(event)}</small></span></p>
						{/each}
						{#if !match.events.length}<p>Aguardando o primeiro lance.</p>{/if}
					</aside>
				</div>
			{/if}
			{#if session.phase === 'HALF_TIME' || session.phase === 'FULL_TIME'}
				<div class="surface stats" use:enter>
					<h2>{session.phase === 'HALF_TIME' ? 'Intervalo' : 'Súmula da partida'}</h2>
					{#each sides as side}
						{@const team = match.stats.teams[side]}
						<p><strong>{relevant.replay[side].name}</strong> · {team.shots} chutes · {team.shotsOnTarget} no alvo · {team.corners} escanteios · {team.yellows} amarelos</p>
					{/each}
					{#if playerStats}<p>Sua atuação · {playerStats.minutes} min · Nota {playerStats.rating.toFixed(1)} · Condição {Math.round(playerStats.condition)}%</p>{/if}
					{#if session.phase === 'FULL_TIME'}
						{@const best = Object.entries(match.stats.players).filter(([, stats]) => stats.minutes > 0).sort((a, b) => b[1].rating - a[1].rating)[0]}
						{#if best}<p>Destaque · {athletes.get(best[0])?.name} · Nota {best[1].rating.toFixed(1)}</p>{/if}
					{/if}
				</div>
			{/if}
			{#if own && (relevant.canManage || suggestionRights) && ['FIRST_HALF','HALF_TIME','SECOND_HALF'].includes(session.phase)}
				<div class="surface" use:enter>
					<h3>{relevant.canManage ? 'Comando do time' : 'Sugestões ao treinador'}</h3>
					<p>{own.subs} substituições · Familiaridade {Math.round(relevant.replay[relevant.side].familiarity?.execution ?? 60)}%</p>
					<div class="controls">
						<label>Formação <select value={own.tactic.formation} disabled={pending} onchange={(event) => changeFormation(event.currentTarget.value as FormationId)}>{#each FORMATION_IDS as value}<option {value}>{value}</option>{/each}</select></label>
						<label>Mentalidade <select value={own.tactic.mentality} disabled={pending} onchange={(event) => decision({ type: 'mentality', value: event.currentTarget.value as typeof own.tactic.mentality })}>{#each MENTALITIES as value}<option {value}>{MENTALITY_LABELS[value]}</option>{/each}</select></label>
						<label>Estilo <select value={own.tactic.style} disabled={pending} onchange={(event) => decision({ type: 'style', value: event.currentTarget.value as typeof own.tactic.style })}>{#each STYLES as value}<option {value}>{STYLE_LABELS[value]}</option>{/each}</select></label>
						<label>Pressão <select disabled={pending} value={own.tactic.instructions?.pressao} onchange={(event) => decision({ type: 'instructions', value: { ...presetInstructions(own.tactic.mentality, own.tactic.style), ...own.tactic.instructions, pressao: Number(event.currentTarget.value) as Level5 } })}>{#each [1,2,3,4,5] as value}<option {value}>{value}</option>{/each}</select></label>
					</div>
					<div class="controls">
						<label>Sai <select bind:value={outId}><option value="">Titular</option>{#each match.players.filter((p) => p.side === relevant.side) as p}<option value={p.id}>{athletes.get(p.id)?.shortName} · {Math.round(p.condition)}%</option>{/each}</select></label>
						<label>Entra <select bind:value={inId}><option value="">Reserva</option>{#each own.bench as p}<option value={p.id}>{p.shortName} · {p.position}</option>{/each}</select></label>
						<Button disabled={pending || !inId || !outId || !own.subs} onclick={() => { decision({ type: 'sub', outId, inId }); outId = ''; inId = ''; }}>{relevant.canManage ? 'Solicitar substituição' : 'Sugerir substituição'}</Button>
					</div>
					{#each session.suggestions as suggestion (suggestion.id)}
						<p>{names[suggestion.profile]} sugeriu {suggestion.decision.type}
							{#if relevant.canManage}<Button size="sm" disabled={pending} onclick={() => decision(suggestion.decision)}>Aplicar</Button>{/if}
						</p>
					{/each}
					{#each match.decisions.filter((item) => item.side === relevant.side).slice(-4) as item}
						<p>{Math.floor(item.tick / 60)}′ · {item.decision.type} · {item.rejected ?? 'Aplicada'}</p>
					{/each}
				</div>
			{/if}
		{/if}
		{#if session.phase === 'HALF_TIME'}
			<div class="surface waiting">
				<h2>{session.confirmed.length}/{session.required.length} prontos para o segundo tempo</h2>
				<p>{session.required.map((id) => `${names[id] ?? 'Participante'} · ${session?.confirmed.includes(id) ? 'Pronto' : 'Aguardando'}`).join(' / ')}</p>
				<Button disabled={pending || !online} onclick={() => request('confirm', { value: !session?.confirmed.includes(profile) })}>{session.confirmed.includes(profile) ? 'Cancelar confirmação' : 'Confirmar segundo tempo'}</Button>
			</div>
		{/if}
		<div class="surface">
			<h3>Placar da rodada</h3>
			<div class="fixtures">
				{#each session.fixtures as game}
					<div class="fixture"><Crest clubId={game.home} size={23} /><strong>{game.score.home} × {game.score.away}</strong><Crest clubId={game.away} size={23} /><small>{game.minute}</small></div>
				{/each}
			</div>
		</div>
	{/if}
</section>

<style>
	.live{display:grid;gap:12px;min-width:0;margin-bottom:20px}.surface{border:1px solid var(--line);background:var(--surface);border-radius:16px;padding:clamp(9px,2vw,18px);min-width:0}
	.score,.controls,.clubs,.fixture{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.score{justify-content:space-between;border-top:3px solid #3cde90}.score small,.score strong,.event small{display:block}.clubs strong{font-size:clamp(1.1rem,4vw,2.2rem)}
	.score time,.event time{color:var(--emerald-strong);font-variant-numeric:tabular-nums}.grid{display:grid;grid-template-columns:minmax(0,3fr) minmax(190px,1fr);gap:10px}.field{overflow:hidden;position:relative}.controls{margin-bottom:10px}
	.controls select{background:var(--surface-sunken);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:7px;max-width:100%}
	.event{display:flex;gap:8px;margin:.5rem 0;padding:.3rem 0;border-bottom:1px solid var(--line)}.event small{color:var(--text-3)}
	.feature{padding:10px;display:flex;gap:12px;align-items:center;background:#152d25;border-left:4px solid #55d998;border-radius:7px}.feature.goal{background:#0b5735;color:#fff}.feature strong{text-transform:uppercase}
	.broadcast{background:radial-gradient(ellipse at 52% 15%,#23765e 0%,#10261f 35%,#101711 72%);color:#fff}.opening,.waiting{text-align:center}.opening{padding:clamp(24px,8vw,90px) 0}.opening .clubs{justify-content:center;margin:20px 0}
	.board{position:relative;aspect-ratio:1.9;background:repeating-linear-gradient(90deg,#164935 0 10%,#1b543e 10% 20%);border:1px solid #b6e7cf;border-radius:8px;margin:10px 0;overflow:hidden}.board div{position:absolute;transform:translate(-50%,-50%);display:grid;justify-items:center;white-space:nowrap}.board b{border-radius:50%;background:#07160f;color:#fff;padding:3px 6px}.board span{background:#07160fc9;border-radius:4px;padding:1px 3px;font-size:clamp(.48rem,1.8vw,.77rem)}
	.fixture{border:1px solid var(--line);border-radius:9px;padding:6px;justify-content:center}.fixtures{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:5px}.film{color:#ebd78c}
	@media(max-width:740px){.grid{grid-template-columns:1fr}.clubs{gap:5px}}
</style>
