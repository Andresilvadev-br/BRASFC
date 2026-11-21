<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { enter, pop } from '#lib/motion/actions.ts';
	import { ApiError, api, connectionIssue, retryDelay } from '#lib/api.ts';
	import type { updateLiveRound } from '#lib/server/connected-world.ts';
	import { FORMATIONS, FORMATION_IDS, MENTALITIES, MENTALITY_LABELS, STYLES, STYLE_LABELS, autoLineup, type FormationId } from '#lib/domain/tactics.ts';
	import { presetInstructions, type Level5 } from '#lib/engine/instructions.ts';
	import { DEFAULT_APPEARANCE } from '#lib/domain/appearance.ts';
	import { coachKit } from '#lib/pixel/kits.ts';
	import Pixel from '../Pixel.svelte';
	import { computeOverall } from '#lib/engine/attributes.ts';
	import type { Decision, MatchEvent } from '#lib/engine/types.ts';
	import Crest from '../Crest.svelte';
	import Button from '../Button.svelte';
	import PitchCanvas from './PitchCanvas.svelte';
	import PlayerOrders from '../tactics/PlayerOrders.svelte';
	import BroadcastMoments from './BroadcastMoments.svelte';
	import { reposition } from '../tactics/reposition.ts';
	import LineupPresentation from './LineupPresentation.svelte';
	import MatchCard from '../cards/MatchCard.svelte';
	import Icon from '../Icon.svelte';
	import { competitionLabel, eventLabel, eventTone } from './event-labels.ts';

	type Session = NonNullable<Awaited<ReturnType<typeof updateLiveRound>>['session']>;
	type MatchDetail = NonNullable<NonNullable<Session['relevant']>['detail']>;
	let { path, profile, names, online, onchange, oncomplete }: { path: string; profile: string; names: Record<string, string>; online: boolean;
		onchange: (loading: boolean) => void; oncomplete: () => Promise<void> } = $props();
	let session = $state.raw<Session | null>(null);
	let details = $state.raw<MatchDetail | null>(null);
	let pending = $state(false);
	let pulseFailures = $state(0);
	let retryPause = 0;
	let timer: ReturnType<typeof setTimeout>;
	let disposed = false;
	let lastPulse: AbortController | undefined;
	let completed = false;
	let error = $state('');
	let skipped = $state(false);
	let now = $state(0);
	let mode = $state<'classico' | 'pixel' | 'narracao'>('classico');
	let outId = $state('');
	let pickedPlayer = $state('');
	let inId = $state('');
	let intervalHeading = $state<HTMLHeadingElement>();
	let intervalFocused = false;
	let latched = false;
	let frameSet = $state.raw<NonNullable<Session['relevant']>['match'][]>([]);
	let replayIndex = $state<number | null>(null);
	let replayTimer: ReturnType<typeof setInterval> | undefined;
	const present = $derived(session?.phase === 'PRESENTATION' && !skipped);
	const scene = $derived(now - (session?.since ?? 0) < 3200 ? 'stadium' : now - (session?.since ?? 0) < 7500 ? 'home' : 'away');
	const relevant = $derived(session?.relevant && details ? { ...session.relevant, ...details } : null);
	const match = $derived(relevant?.match);
	const visual = $derived(replayIndex === null ? match : frameSet[replayIndex] ?? match);
	const sides = ['home', 'away'] as const;
	const stages: Record<Session['phase'], string> = { LOADING: 'Carregamento', PRESENTATION: 'Apresentação', FIRST_HALF: 'Primeiro tempo',
		HALF_TIME: 'Intervalo', SECOND_HALF: 'Segundo tempo', FULL_TIME: 'Fim de jogo · aguardando confirmação oficial' };
	const athletes = $derived(new Map([...(relevant?.replay.home.players ?? []), ...(relevant?.replay.away.players ?? [])].map((p) => [p.id, p])));
	const canvas = $derived(visual ? {
		ball: visual.ball, tick: visual.tick, events: visual.events, teams: visual.teams, player: (id: string) => athletes.get(id),
		states: new Map(visual.players.map((player) => [player.id, player]))
	} : null);

	const own = $derived(relevant?.match.teams[relevant.side]);
	const playerStats = $derived(session?.athleteId ? match?.stats.players[session.athleteId] : undefined);
	const suggestionRights = $derived(session?.role === 'assistant');
	$effect(() => {
		if (session?.phase !== 'HALF_TIME') {
			intervalFocused = false;
		} else if (intervalHeading && !intervalFocused) {
			intervalFocused = true;
			intervalHeading.focus();
		}
	});
	const visibleKicks = $derived(relevant?.shootout?.kicks?.slice(0, Math.max(1, Math.floor((now - (session?.since ?? 0)) / 700) + 1)) ?? []);
	const competition = (id?: string) => (id?.startsWith('serie-') ? `Brasileirão ${competitionLabel(id)}` : competitionLabel(id));
	/** Linha do tempo oficial sem repetições (o mesmo lance pode chegar em dois pulsos). */
	const timeline = $derived.by(() => {
		const seen = new Set<string>();
		return [...(match?.events ?? [])].reverse().filter((event) => {
			const key = `${event.tick}:${event.type}:${event.player ?? ''}:${event.other ?? ''}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	});
	/** Placar da rodada agrupado por competição: a sua primeiro, as demais recolhidas. */
	const roundGroups = $derived.by(() => {
		const groups = new Map<string, NonNullable<typeof session>['fixtures']>();
		const seenGame = new Set<string>();
		for (const game of session?.fixtures ?? []) {
			const key = `${game.competition}:${game.home}:${game.away}`;
			if (seenGame.has(key)) continue;
			seenGame.add(key);
			const list = groups.get(game.competition) ?? [];
			list.push(game);
			groups.set(game.competition, list);
		}
		const mine = relevant?.competition;
		return [...groups.entries()].sort(([a], [b]) => (a === mine ? -1 : b === mine ? 1 : a.localeCompare(b))).map(([id, games]) => ({ id, games, mine: id === mine }));
	});
	const decisionLabels: Record<Decision['type'], string> = { individual: 'Instrução individual', captains: 'Ordem de capitães', sub: 'Substituição', swap: 'Troca de posições',
		mentality: 'Mentalidade', style: 'Estilo de jogo', formation: 'Formação', instructions: 'Instruções coletivas' };
	const phaseShort: Record<string, string> = { first_half: '1º tempo', half_time: 'Intervalo', second_half: '2º tempo', finished: 'Encerrado' };
	const viewModes = [{ value: 'classico', label: 'Clássico', icon: 'field' }, { value: 'pixel', label: 'Pixel', icon: 'shirt' }, { value: 'narracao', label: 'Narração', icon: 'news' }] as const;

	async function request(action: string, extra: Record<string, unknown> = {}) {
		if (pending) return;
		pending = true;
		try {
			if (action === 'pulse') lastPulse = new AbortController();
			const data = await api<{ session: Session | null }>(`${path}?live${action === 'pulse' ? '=pulse' : ''}`, { signal: action === 'pulse' ? lastPulse?.signal : undefined, body: action === 'pulse' ? { action, known: details ? session?.id : undefined } : {
				action, known: details ? session?.id : undefined, session: session?.id, sequence: session?.sequence, op: crypto.randomUUID(), ...extra
			} });
			if (!data.session) {
				await oncomplete();
				completed = true;
				return;
			}
			pulseFailures = 0;
			retryPause = 0;
			error = '';
			const frame = data.session.relevant?.match;
			if (data.session.id !== session?.id) details = null;
			if (data.session.relevant?.detail) details = data.session.relevant.detail;
			if (frame && frame.tick !== frameSet.at(-1)?.tick && replayIndex === null) frameSet = [...frameSet.slice(-8), frame];
			session = data.session;
			onchange(session.phase === 'LOADING');
		} catch (e) {
			if (disposed) return;
			error = e instanceof Error ? e.message : 'Falha temporária na sessão.';
			if (action === 'pulse') {
				retryPause = retryDelay(pulseFailures, e instanceof ApiError ? e.retryAfterMs : undefined);
				pulseFailures = connectionIssue(e) ? pulseFailures + 1 : 5;
			}
		} finally {
			if (action === 'pulse') lastPulse = undefined;
			pending = false;
		}
	}

	async function poll() {
		if (disposed || completed || !navigator.onLine || pulseFailures >= 5) return;
		await request('pulse');
		if (!disposed && !completed && pulseFailures < 5) timer = setTimeout(poll, retryPause || 950);
	}
	function recoverConnection() {
		clearTimeout(timer);
		pulseFailures = 0;
		retryPause = 0;
		void poll();
	}
	onMount(() => {
		void poll();
		window.addEventListener('online', recoverConnection);
		const clock = setInterval(() => { now = Date.now(); }, 200);
		now = Date.now();
		return () => {
			disposed = true;
			lastPulse?.abort();
			window.removeEventListener('online', recoverConnection);
			clearTimeout(timer);
			clearInterval(clock);
			clearInterval(replayTimer);
		};
	});

	$effect(() => {
		const current = session;
		if (current?.phase !== 'LOADING' || current.loaded.includes(profile) || !online || latched || pending) return;
		latched = true;
		void untrack(() => request('loaded')).finally(() => { latched = false; });
	});

	function decision(value: Decision) { void request(relevant?.canManage ? 'decision' : 'suggest', { decision: value }); }
	function swapPlayers(first: string, second: string) {
		if (pending || first === second) return;
		decision({ type: 'swap', first, second });
		outId = '';
	}
	function pickStarter(id: string) {
		pickedPlayer = id;
		if (outId && outId !== id && match?.players.some((player) => player.id === outId)) swapPlayers(outId, id);
		else outId = outId === id ? '' : id;
	}
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
	{#if pulseFailures >= 5}<Button size="sm" onclick={recoverConnection}>Reconectar à partida</Button>{/if}
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
		<header class="score" style:--home={relevant?.replay.home.colors.primary ?? '#1f6f50'} style:--away={relevant?.replay.away.colors.primary ?? '#26323a'}>
			<div class="score-meta"><span>{competition(relevant?.competition)} · Rodada {session.round}</span><strong class:live-dot={session.phase === 'FIRST_HALF' || session.phase === 'SECOND_HALF'}>{stages[session.phase]}</strong></div>
			{#if relevant && match}
				<div class="scoreline">
					<div class="side"><Crest clubId={relevant.replay.home.id} size={48} /><span class="club-name">{relevant.replay.home.short}</span></div>
					<div class="board-score">
						{#key match.score.home}<b use:pop>{match.score.home}</b>{/key}<i aria-hidden="true">×</i>{#key match.score.away}<b use:pop>{match.score.away}</b>{/key}
						<time>{match.minute}{#if match.phase === 'first_half' && match.added[0]} <small>+{match.added[0]}</small>{:else if match.phase === 'second_half' && match.added[1]} <small>+{match.added[1]}</small>{/if}</time>
					</div>
					<div class="side away"><span class="club-name">{relevant.replay.away.short}</span><Crest clubId={relevant.replay.away.id} size={48} /></div>
				</div>
				<span class="sr-only" aria-live="polite">{relevant.replay.home.name} {match.score.home} a {match.score.away} {relevant.replay.away.name}</span>
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
								<div class="entry" aria-label="Entrada das equipes">
									{#each sides as side}
										<div class="tunnel" style:--team={relevant.replay[side].colors.primary}>
											{#each relevant.replay[side].tactic.lineup as id, index (id)}
												<div use:enter={{ index }} title={athletes.get(id)?.name}><span>{athletes.get(id)?.number}</span></div>
											{/each}
										</div>
									{/each}
								</div>
							</div>
						{:else}
							{@const team = relevant.replay[scene]}
							<div class="lineup" use:enter>
								<div class="crew">
									{#each relevant.crew.filter((member) => member.club === team.id) as member}
										<div><Pixel appearance={member.appearance ?? DEFAULT_APPEARANCE} kit={coachKit(team.id)} clubId={team.id} styled variant="full" size={52} ball={false} />
											<span><small>{member.role === 'coach' ? 'Treinador' : 'Auxiliar'}</small><strong>{member.name}</strong></span></div>
									{:else}<p>Comissão da equipe</p>{/each}
								</div>
								<LineupPresentation {team} />
							</div>
						{/if}
					{/key}
					<Button onclick={() => (skipped = true)}>Pular apresentação</Button>
				</div>
			{:else}
				<div class="grid">
					<div class="surface field">
						<div class="view-bar">
							<div class="modes" role="radiogroup" aria-label="Visualização">
								{#each viewModes as option (option.value)}
									<button type="button" role="radio" aria-checked={mode === option.value} onclick={() => (mode = option.value)} data-umx-press><Icon name={option.icon} size={15} /><span>{option.label}</span></button>
								{/each}
							</div>
							{#if frameSet.length > 1}<button type="button" class="replay" onclick={replay} disabled={replayIndex !== null} data-umx-press><Icon name="refresh" size={15} /><span>Rever trecho</span></button>{/if}
						</div>
						{#if mode !== 'narracao' && canvas}
							<PitchCanvas match={canvas} {mode} colors={{ home: relevant.replay.home.colors, away: relevant.replay.away.colors }} version={visual?.tick} highlight={pickedPlayer || null} onpick={(id, side) => { if (side === relevant.side) pickedPlayer = id ?? ''; }} />
						{/if}
						{#if replayIndex !== null}<span class="film">Replay local</span>{/if}
						{#if playerStats && !['HALF_TIME', 'FULL_TIME'].includes(session.phase)}
							<p>Sua atuação · {playerStats.minutes} min · Nota {playerStats.rating.toFixed(1)} · Condição {Math.round(playerStats.condition)}%</p>
						{/if}
						<BroadcastMoments events={match.events} sessionKey={session.id + ":" + relevant.replay.home.id} athleteName={(id) => athletes.get(id)?.name} />
					</div>
					<aside class="surface">
						<h3 class="section-title">Lances oficiais</h3>
						<ol class="timeline">
							{#each timeline.slice(0, mode === 'narracao' ? 16 : 7) as event (`${event.tick}:${event.type}:${event.player ?? ''}`)}
								<li class="event {eventTone(event.type)}" use:enter><time class="num">{event.minute}</time><span><b>{eventLabel(event.type)}</b>{#if namesOf(event)}<small>{namesOf(event)}</small>{/if}</span></li>
							{/each}
						</ol>
						{#if !timeline.length}<p class="muted">Aguardando o primeiro lance.</p>{/if}
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
						{#if match.goals.length}
							<div class="goals" aria-label="Autores dos gols">
								{#each match.goals as goal, index (index)}
									<p><strong>{goal.minute}</strong> · {goal.player ? athletes.get(goal.player)?.name : ''}{goal.other ? ' · Assistência de ' + (athletes.get(goal.other)?.name ?? '') : ''}</p>
								{/each}
							</div>
						{/if}
						{#if relevant.shootout}
							<div class="shootout" use:enter>
								<h3>Disputa de pênaltis</h3>
								<p>{relevant.replay.home.short} {visibleKicks.filter((kick) => kick.side === 'home' && kick.scored).length} × {visibleKicks.filter((kick) => kick.side === 'away' && kick.scored).length} {relevant.replay.away.short}</p>
								{#each visibleKicks as kick, index (index)}
									<span class:scored={kick.scored} title={kick.scored ? 'Convertido' : 'Perdido'} use:pop>{kick.side === 'home' ? relevant.replay.home.short : relevant.replay.away.short} {kick.scored ? '✓' : '×'}</span>
								{/each}
							</div>
						{/if}
						{@const best = Object.entries(match.stats.players).filter(([, stats]) => stats.minutes > 0).sort((a, b) => b[1].rating - a[1].rating)[0]}
						{#if best}<p>Destaque · {athletes.get(best[0])?.name} · Nota {best[1].rating.toFixed(1)}</p>{/if}
					{/if}
				</div>
			{/if}
			{#if own && (relevant.canManage || suggestionRights) && ['FIRST_HALF','HALF_TIME','SECOND_HALF'].includes(session.phase)}
				<div class="surface" use:enter>
					{#if session.phase === 'HALF_TIME'}<h3 tabindex="-1" bind:this={intervalHeading}>Intervalo · Escalação</h3>
					{:else}<h3>{relevant.canManage ? 'Comando do time' : 'Sugestões ao treinador'}</h3>{/if}
					<p>Arraste um atleta ou toque em dois titulares para {relevant.canManage ? 'trocar posições' : 'sugerir a troca de posições'}.</p>
					<div class="board interval-board" use:reposition={{ move: !pending ? swapPlayers : undefined }} role="group" aria-label="Atletas em campo">
						{#each FORMATIONS[own.tactic.formation] as slot, index (index)}
							{@const id = own.tactic.lineup[index]}
							{@const athlete = athletes.get(id)}
							{@const state = match.players.find((player) => player.id === id)}
							{#if athlete && state && !state.sentOff}
								<button type="button" style:left={slot.x + '%'} style:top={slot.y + '%'} aria-pressed={outId === id}
									data-reposition={!pending ? id : undefined} disabled={pending} onclick={() => pickStarter(id)}>
									<strong>{athlete.shortName}</strong><small>{slot.position} · {Math.round(state.condition)}%</small>
								</button>
							{/if}
						{/each}
					</div>
					<p>Capitão · {own.captain ? athletes.get(own.captain)?.name : 'Sem jogador elegível'}</p>
					<PlayerOrders squad={relevant.replay[relevant.side].players} lineup={own.tactic.lineup.filter((id) => match.players.some((state) => state.id === id))} selected={pickedPlayer} slotPositions={own.tactic.lineup.filter((id) => match.players.some((state) => state.id === id)).map((id) => FORMATIONS[own.tactic.formation][own.tactic.lineup.indexOf(id)].position)}
						order={own.tactic.captains} instructions={own.tactic.playerOrders} disabled={pending} oncaptains={(order) => decision({ type: 'captains', order })}
						oninstruction={(playerId, order) => decision({ type: 'individual', playerId, order })} />
					<p>{own.subs} substituições · Familiaridade {Math.round(relevant.replay[relevant.side].familiarity?.execution ?? 60)}%</p>
					<div class="controls">
						<label>Formação <select value={own.tactic.formation} disabled={pending} onchange={(event) => changeFormation(event.currentTarget.value as FormationId)}>{#each FORMATION_IDS as value}<option {value}>{value}</option>{/each}</select></label>
						<label>Mentalidade <select value={own.tactic.mentality} disabled={pending} onchange={(event) => decision({ type: 'mentality', value: event.currentTarget.value as typeof own.tactic.mentality })}>{#each MENTALITIES as value}<option {value}>{MENTALITY_LABELS[value]}</option>{/each}</select></label>
						<label>Estilo <select value={own.tactic.style} disabled={pending} onchange={(event) => decision({ type: 'style', value: event.currentTarget.value as typeof own.tactic.style })}>{#each STYLES as value}<option {value}>{STYLE_LABELS[value]}</option>{/each}</select></label>
						<label>Pressão <select disabled={pending} value={own.tactic.instructions?.pressao} onchange={(event) => decision({ type: 'instructions', value: { ...presetInstructions(own.tactic.mentality, own.tactic.style), ...own.tactic.instructions, pressao: Number(event.currentTarget.value) as Level5 } })}>{#each [1,2,3,4,5] as value}<option {value}>{value}</option>{/each}</select></label>
					</div>
					<div class="controls">
						<label>Sai <select bind:value={outId}><option value="">Titular</option>{#each match.players.filter((p) => p.side === relevant.side) as p}<option value={p.id}>{athletes.get(p.id)?.shortName} · {Math.round(p.condition)}%</option>{/each}</select></label>
						<label>Entra <select bind:value={inId}><option value="">Reserva</option>{#each own.bench as p}<option value={p.id}>{athletes.get(p.id)?.shortName ?? p.id} · {p.position}</option>{/each}</select></label>
						<Button disabled={pending || !inId || !outId || !own.subs} onclick={() => { decision({ type: 'sub', outId, inId }); outId = ''; inId = ''; }}>{relevant.canManage ? 'Solicitar substituição' : 'Sugerir substituição'}</Button>
					</div>
					{#each session.suggestions as suggestion (suggestion.id)}
						<p>{names[suggestion.profile]} sugeriu: {decisionLabels[suggestion.decision.type].toLowerCase()}
							{#if relevant.canManage}<Button size="sm" disabled={pending} onclick={() => decision(suggestion.decision)}>Aplicar</Button>{/if}
						</p>
					{/each}
					{#each match.decisions.filter((item) => item.side === relevant.side).slice(-4) as item}
						<p>{Math.floor(item.tick / 60)}′ · {decisionLabels[item.decision.type]} · {item.rejected ?? 'Aplicada'}</p>
					{/each}
				</div>
			{/if}
		{/if}
		{#if session.phase === 'HALF_TIME'}
			{@const ready = session.confirmed.length}
			{@const total = session.required.length}
			<div class="surface readiness" use:enter>
				<div class="ring" style:--p={total ? ready / total : 0} aria-hidden="true"><span class="num">{ready}/{total}</span></div>
				<div class="ready-copy">
					{#if !own || !(relevant?.canManage || suggestionRights)}
						<h2 tabindex="-1" bind:this={intervalHeading}>{ready} de {total} prontos para o segundo tempo</h2>
					{:else}
						<h2>{ready} de {total} prontos para o segundo tempo</h2>
					{/if}
					<ul class="ready-list">
						{#each session.required as id (id)}
							{@const ok = session.confirmed.includes(id)}
							<li class:ok><span class="dot" aria-hidden="true">{#if ok}<Icon name="check" size={12} stroke={3} />{/if}</span>{names[id] ?? 'Participante'}<small>{ok ? 'Pronto' : 'Aguardando'}</small></li>
						{/each}
					</ul>
				</div>
				<Button variant={session.confirmed.includes(profile) ? 'ghost' : 'primary'} disabled={pending || !online} onclick={() => request('confirm', { value: !session?.confirmed.includes(profile) })}>{session.confirmed.includes(profile) ? 'Cancelar confirmação' : 'Estou pronto'}</Button>
			</div>
		{/if}
		<div class="surface round">
			<h3 class="section-title">Placar da rodada</h3>
			{#each roundGroups as group (group.id)}
				<details class="round-group" open={group.mine || roundGroups.length === 1}>
					<summary><span>{competitionLabel(group.id)}</span><small>{group.games.length} {group.games.length === 1 ? 'jogo' : 'jogos'}</small><Icon name="chevronDown" size={16} /></summary>
					<div class="fixtures">
						{#each group.games as game (game.home + game.away)}
							<MatchCard home={game.home} away={game.away} score={game.score} status={phaseShort[game.phase] === 'Encerrado' ? 'Encerrado' : game.minute}
								live={game.phase === 'first_half' || game.phase === 'second_half'} highlight={!!relevant && [relevant.replay.home.id, relevant.replay.away.id].includes(game.home)} />
						{/each}
					</div>
				</details>
			{/each}
		</div>
	{/if}
</section>

<style>
	.crew {display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
	.crew > div {display:flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--line);border-radius:10px;background:var(--surface-sunken)}
	.crew span {display:grid;text-align:start}
	.crew small {color:var(--emerald-strong)}

	.live{display:grid;gap:12px;min-width:0;margin-bottom:20px}.surface{border:1px solid var(--line);background:var(--surface);border-radius:16px;padding:clamp(9px,2vw,18px);min-width:0}
	.controls,.clubs{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.clubs strong{font-size:clamp(1.1rem,4vw,2.2rem)}
	.score{position:relative;display:grid;gap:8px;padding:12px clamp(12px,3vw,22px) 14px;border-radius:18px;border:1px solid var(--line-strong);overflow:hidden;isolation:isolate;
		background:linear-gradient(90deg,color-mix(in srgb,var(--home) 34%,transparent),transparent 38%,transparent 62%,color-mix(in srgb,var(--away) 34%,transparent)),linear-gradient(180deg,#141c21,var(--bg-deep))}
	.score::before{content:'';position:absolute;inset:0 0 auto;height:3px;background:linear-gradient(90deg,var(--home),var(--emerald-strong),var(--away));z-index:-1}
	.score-meta{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:var(--fs-xs);font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-3)}
	.score-meta strong{color:var(--text-2)}.live-dot{color:var(--emerald-strong)!important}.live-dot::before{content:'';display:inline-block;width:7px;height:7px;margin-inline-end:6px;border-radius:50%;background:var(--emerald-strong);animation:blink 1.4s ease-in-out infinite}
	@keyframes blink{50%{opacity:.25}}
	.scoreline{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:clamp(8px,2vw,20px)}
	.side{display:flex;align-items:center;gap:10px;min-width:0}.side.away{justify-content:flex-end}
	.club-name{font-family:var(--font-display);font-weight:800;font-size:clamp(1.1rem,3.4vw,1.9rem);text-transform:uppercase;letter-spacing:.03em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
	.board-score{display:grid;grid-template-columns:auto auto auto;align-items:center;justify-items:center;column-gap:8px;padding:6px 16px 4px;border-radius:12px;background:rgb(0 0 0 / .45);border:1px solid var(--line-strong)}
	.board-score b{font-family:var(--font-display);font-weight:800;font-size:clamp(2rem,7vw,3.2rem);line-height:1;font-variant-numeric:tabular-nums}
	.board-score i{font-style:normal;color:var(--text-3);font-size:1.4rem}
	.board-score time{grid-column:1/-1;font-size:var(--fs-xs);font-weight:700;color:var(--emerald-strong);font-variant-numeric:tabular-nums;letter-spacing:.06em}
	.event time{color:var(--emerald-strong);font-variant-numeric:tabular-nums}
	.view-bar{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:10px}
	.modes{display:inline-flex;gap:2px;padding:3px;border-radius:999px;background:var(--surface-sunken);border:1px solid var(--line)}
	.modes button,.replay{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:4px 12px;border:0;border-radius:999px;background:transparent;color:var(--text-2);font-size:var(--fs-xs);font-weight:700;cursor:pointer;transition:background var(--dur-2) var(--ease-out),color var(--dur-2) var(--ease-out)}
	.modes button[aria-checked='true']{background:var(--emerald-soft);color:var(--emerald-strong)}
	.replay{border:1px solid var(--line);background:var(--surface-sunken)}.replay:disabled{opacity:.5;cursor:default}
	.timeline{list-style:none;margin:0;padding:0 0 0 10px;border-left:2px solid var(--line)}
	.timeline .event{position:relative;margin:0;padding:7px 0 7px 12px;border:0}
	.timeline .event::before{content:'';position:absolute;left:-16px;top:13px;width:10px;height:10px;border-radius:50%;background:var(--surface-3);border:2px solid var(--surface)}
	.timeline .event b{display:block;font-size:var(--fs-sm)}
	.event.goal::before{background:var(--emerald-strong)}.event.goal b{color:var(--emerald-strong)}
	.event.card::before{background:var(--warning);border-radius:2px}.event.red::before{background:var(--danger);border-radius:2px}
	.event.chance::before{background:var(--info)}.event.phase b{color:var(--text-2);text-transform:uppercase;letter-spacing:.06em;font-size:var(--fs-xs)}
	.readiness{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:16px}
	.ring{--p:0;display:grid;place-items:center;width:72px;height:72px;border-radius:50%;background:conic-gradient(var(--emerald-strong) calc(var(--p)*360deg),rgb(231 237 240 / .08) 0);transition:background .4s var(--ease-out)}
	.ring span{display:grid;place-items:center;width:58px;height:58px;border-radius:50%;background:var(--surface);font-family:var(--font-display);font-weight:800;font-size:1.25rem}
	.ready-copy h2{font-size:var(--fs-xl)}
	.ready-list{display:flex;flex-wrap:wrap;gap:6px;list-style:none;margin:8px 0 0;padding:0}
	.ready-list li{display:inline-flex;align-items:center;gap:6px;padding:4px 10px 4px 5px;border-radius:999px;background:var(--surface-sunken);border:1px solid var(--line);font-size:var(--fs-sm)}
	.ready-list small{color:var(--text-3)}
	.ready-list .dot{display:grid;place-items:center;width:18px;height:18px;border-radius:50%;border:2px dashed var(--line-strong)}
	.ready-list li.ok{border-color:var(--emerald-line)}.ready-list li.ok small{color:var(--emerald-strong)}
	.ready-list li.ok .dot{border:0;background:var(--emerald);color:#04130d}
	.round-group{border-top:1px solid var(--line)}.round-group:first-of-type{border-top:0}
	.round-group summary{display:flex;align-items:center;gap:10px;padding:10px 2px;cursor:pointer;list-style:none;font-weight:700}
	.round-group summary::-webkit-details-marker{display:none}
	.round-group summary small{color:var(--text-3);font-weight:600;margin-inline-start:auto}
	.round-group summary :global(svg){transition:rotate var(--dur-2) var(--ease-out)}.round-group[open] summary :global(svg){rotate:180deg}.grid{display:grid;grid-template-columns:minmax(0,3fr) minmax(190px,1fr);gap:10px}.field{overflow:hidden;position:relative}.controls{margin-bottom:10px}
	.event{display:flex;gap:8px;margin:.5rem 0;padding:.3rem 0;border-bottom:1px solid var(--line)}.event small{color:var(--text-3)}
	.shootout{background:#132b21;border:1px solid #386c53;border-radius:10px;padding:12px}.shootout span{display:inline-block;margin:3px;padding:4px 8px;border-radius:6px;background:#512828}.shootout span.scored{background:#245339}
	.broadcast{background:radial-gradient(ellipse at 52% 15%,#23765e 0%,#10261f 35%,#101711 72%);color:#fff}.opening,.waiting{text-align:center}.opening{padding:clamp(24px,8vw,90px) 0}.opening .clubs{justify-content:center;margin:20px 0}
	.entry{display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:600px;margin:12px auto 0}.tunnel{display:grid;grid-template-columns:repeat(6,1fr);gap:3px;align-items:center}.tunnel div{background:linear-gradient(145deg,var(--team),#162a22 70%);min-width:0;aspect-ratio:1.05;border:1px solid #c9e7d46b;border-radius:28% 28% 12% 12%;display:grid;place-items:center;font-size:clamp(.6rem,2.2vw,.88rem);font-weight:700}.goals p{margin:.3rem 0}.goals strong{color:var(--emerald-strong)}
	.board{position:relative;aspect-ratio:1.9;background:repeating-linear-gradient(90deg,#164935 0 10%,#1b543e 10% 20%);border:1px solid #b6e7cf;border-radius:8px;margin:10px 0;overflow:hidden}
	.interval-board{width:min(100%,540px);min-height:300px}
	.interval-board button{position:absolute;translate:-50% -50%;display:grid;justify-items:center;width:min(20%,92px);padding:3px;border:1px solid transparent;border-radius:6px;background:#07160f;color:#fff;font-size:var(--fs-xs)}
	.interval-board button[data-reposition]{touch-action:none;cursor:grab}
	.interval-board:global([data-dragging-position]) button[data-reposition]{cursor:grabbing}
	.interval-board button[aria-pressed="true"]{border-color:var(--emerald)}
	.interval-board strong{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
	.fixtures{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:6px;padding-bottom:10px}.film{color:#ebd78c}
	@media(max-width:740px){.grid{grid-template-columns:1fr}.clubs{gap:5px}.readiness{grid-template-columns:auto minmax(0,1fr)}.readiness > :global(:last-child){grid-column:1/-1}}
	@media(max-width:420px){.side :global(img),.side :global(svg){width:34px;height:34px}.modes button span{display:none}}
</style>
