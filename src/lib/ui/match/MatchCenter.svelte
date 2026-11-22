<script lang="ts">
	import BroadcastMoments from './BroadcastMoments.svelte';
	import { onDestroy, untrack } from 'svelte';
	import { overridesOf, presetInstructions, type TacticalInstructions } from '#lib/engine/instructions.ts';
	import InstructionsEditor from '../tactics/InstructionsEditor.svelte';
	import { FORMATION_IDS, FORMATIONS, type FormationId, type Mentality, type PlayStyle } from '#lib/domain/tactics.ts';
	import { Match } from '#lib/engine/match.ts';
	import { narrate, type NarrationLine } from '#lib/engine/narration.ts';
	import { possessionPct } from '#lib/engine/stats.ts';
	import type { MatchResult, Side, TeamSetup } from '#lib/engine/types.ts';
	import Button from '../Button.svelte';
	import Icon from '../Icon.svelte';
	import MentalityScale from '../MentalityScale.svelte';
	import Modal from '../Modal.svelte';
	import Segmented from '../Segmented.svelte';
	import StylePicker from '../StylePicker.svelte';
	import FormationBoard from './FormationBoard.svelte';
	import PitchCanvas from './PitchCanvas.svelte';

	/**
	 * Central da partida: placar, linha do tempo, campo 2D ao centro, os dois times
	 * desenhados na formação (nome + posição + nota + condição em cada ficha) e o
	 * comparativo de estatísticas. Toda a informação vem do motor (eventos e estado);
	 * a velocidade só muda quantos ticks são processados por segundo, nunca o resultado.
	 */
	let {
		home,
		away,
		seed,
		control = null,
		aiOpponent = true,
		neutral = false,
		autoplay = false,
		official,
		onfinish
	}: {
		home: TeamSetup;
		away: TeamSetup;
		seed: number;
		/** lado comandado pelo usuário (null = só assistir) */
		control?: Side | null;
		aiOpponent?: boolean;
		neutral?: boolean;
		autoplay?: boolean;
		official?: { version?: string; ai?: Partial<Record<Side, boolean>>; decisions?: import('#lib/engine/types.ts').AppliedDecision[] };
		onfinish?: (result: MatchResult, match: Match) => void;
	} = $props();

	// A partida é criada uma vez com as escalações recebidas.
	// svelte-ignore state_referenced_locally
	const match = new Match({
		home,
		away,
		seed,
		...(neutral ? { rules: { homeAdvantage: false } } : {}),
		ai: official?.ai ?? { home: control !== 'home' && aiOpponent, away: control !== 'away' && aiOpponent },
		version: official?.version,
		replay: official?.decisions
	});

	const SPEEDS = [
		{ value: '1', label: '1×', tps: 8 },
		{ value: '2', label: '2×', tps: 20 },
		{ value: '4', label: '4×', tps: 45 },
		{ value: '8', label: '8×', tps: 120 }
	] as const;
	type SpeedValue = (typeof SPEEDS)[number]['value'];
	type ViewMode = 'classico' | 'pixel' | 'narracao';

	let speed = $state<SpeedValue>('2');
	let paused = $state(untrack(() => !autoplay));
	let view = $state<ViewMode>('classico');
	let version = $state(0);
	let finished = $state(false);
	let pitch: PitchCanvas | undefined = $state();
	let tacticOpen = $state(false);
	let intervalTab = $state<'elenco' | 'tatica'>('elenco');
	let intervalSelected = $state<string | null>(null);
	let intervalError = $state('');
	const atInterval = $derived.by(() => {
		void version;
		return !!control && match.phase === 'half_time';
	});
	/** atleta destacado no campo (escolhido numa ficha de cada time) */
	let selHome = $state<string | null>(null);
	let selAway = $state<string | null>(null);
	const highlight = $derived(selHome ?? selAway);

	const tps = $derived(SPEEDS.find((s) => s.value === speed)!.tps);
	/** Choque de uniformes: se as cores principais se parecem, o visitante usa o segundo uniforme. */
	function rgb(hex: string) {
		const n = parseInt(hex.slice(1), 16);
		return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
	}
	function near(a: string, b: string) {
		const [r1, g1, b1] = rgb(a);
		const [r2, g2, b2] = rgb(b);
		return Math.hypot(r1 - r2, g1 - g2, b1 - b2) < 110;
	}
	const colors = $derived.by(() => {
		const h = { primary: home.colors.primary, secondary: home.colors.secondary };
		let a = { primary: away.colors.primary, secondary: away.colors.secondary };
		if (near(h.primary, a.primary)) a = near(h.primary, a.secondary) ? { primary: '#F5F7FA', secondary: '#1A2026' } : { primary: a.secondary, secondary: a.primary };
		return { home: h, away: a };
	});

	// ── laço de animação: acumula tempo e avança ticks inteiros
	let raf = 0;
	let last = 0;
	let acc = 0;
	let lastUi = 0;
	function frame(now: number) {
		raf = requestAnimationFrame(frame);
		if (!last) last = now;
		const dt = Math.min(0.25, (now - last) / 1000);
		last = now;
		if (paused || finished) return;
		acc += dt * tps;
		let steps = Math.floor(acc);
		acc -= steps;
		const hadEvents = match.events.length;
		while (steps-- > 0) {
			if (!match.step()) {
				end();
				break;
			}
			if (control && match.phase === 'half_time') {
				openInterval();
				break;
			}
		}
		pitch?.draw(tps > 60 ? 1 : acc);
		if (now - lastUi > 200 || match.events.length !== hadEvents) {
			lastUi = now;
			version++;
		}
	}
	$effect(() => {
		raf = requestAnimationFrame(frame);
		return () => cancelAnimationFrame(raf);
	});
	onDestroy(() => cancelAnimationFrame(raf));

	function end() {
		if (finished) return;
		finished = true;
		paused = true;
		version++;
		onfinish?.(match.result(), match);
	}

	function skipToEnd() {
		if (control && match.half === 1) {
			while (match.phase !== 'half_time' && match.step()) { /* aguarda o apito */ }
			if (match.phase === 'half_time') {
				openInterval();
				version++;
				return;
			}
		}
		match.runToEnd();
		end();
	}

	// ── dados derivados (recalculados quando `version` muda)
	const result = $derived.by(() => {
		void version;
		return match.result();
	});
	const poss = $derived(possessionPct(result.stats));
	const nameOf = (id?: string) => (id ? (match.player(id)?.shortName ?? '—') : '—');
	/** Na narração, vagas genéricas ("ATA 1") ganham a sigla do time para não confundir. */
	const narrName = (id?: string) => {
		const p = id ? match.player(id) : undefined;
		if (!p) return '—';
		const side = match.teams.home.byId.has(p.id) ? 'home' : 'away';
		return p.pending ? `${p.shortName} (${match.teams[side].setup.short})` : p.shortName;
	};
	const moments = $derived.by(() => {
		void version;
		const start = Math.max(0, match.events.length - 36);
		return match.events.slice(start).map((event, index) => ({ ...event, index: start + index, minute: match.minuteLabel(event.tick) }));
	});
	const captains = $derived.by(() => {
		void version;
		return { home: nameOf(match.captain('home') ?? undefined), away: nameOf(match.captain('away') ?? undefined) };
	});
	const lines = $derived.by<NarrationLine[]>(() => {
		void version;
		const out: NarrationLine[] = [];
		for (const e of match.events) {
			const l = narrate(e, { name: narrName, team: (s) => (s ? match.teams[s].setup.name : ''), minute: (t) => match.minuteLabel(t) });
			if (l) out.push(l);
		}
		return out.reverse();
	});
	const timeline = $derived.by(() => {
		void version;
		const total = Math.max(90 * 60, match.tick);
		return match.events
			.filter((e) => e.type === 'goal' || e.type === 'yellow' || e.type === 'red' || e.type === 'sub')
			.map((e) => ({ e, pct: Math.min(100, (e.tick / (match.half === 2 || finished ? total + match.added[0] * 60 : total)) * 100) }));
	});
	const progress = $derived.by(() => {
		void version;
		const t = match.half === 1 ? Math.min(match.tick, 45 * 60) : 45 * 60 + Math.min(90 * 60 - 45 * 60, match.tick - (match.events.find((e) => e.type === 'second_half')?.tick ?? match.tick));
		return Math.min(100, (t / (90 * 60)) * 100);
	});

	// ── assistente do banco: sugestões a partir do estado real
	const tips = $derived.by(() => {
		void version;
		if (!control || finished) return [] as string[];
		const out: string[] = [];
		const me = control;
		const diff = match.score[me] - match.score[me === 'home' ? 'away' : 'home'];
		const minute = match.half === 1 ? match.minute : 45 + Math.floor((match.tick - (match.events.find((e) => e.type === 'second_half')?.tick ?? 0)) / 60);
		const tired = match.onPitch(me).filter((s) => s.condition < 58 && s.id !== match.teams[me].gkId);
		if (tired.length && match.subsLeft(me) > 0) out.push(`${tired.map((s) => nameOf(s.id)).slice(0, 2).join(' e ')} ${tired.length > 1 ? 'estão' : 'está'} cansado${tired.length > 1 ? 's' : ''} — considere substituir.`);
		const injured = match.onPitch(me).filter((s) => s.injured);
		if (injured.length) out.push(`${nameOf(injured[0].id)} está lesionado e rende menos.`);
		if (diff < 0 && minute >= 60 && !match.teams[me].tactic.mentality.includes('ofensiva')) out.push('Atrás no placar: uma mentalidade ofensiva aumenta a pressão (e os riscos).');
		if (diff > 0 && minute >= 75 && match.teams[me].tactic.mentality.includes('ofensiva')) out.push('Vantagem no fim: recuar a mentalidade ajuda a segurar o resultado.');
		const other = me === 'home' ? 'away' : 'home';
		if (result.stats[other].shots >= result.stats[me].shots + 6) out.push('O adversário finaliza muito mais: compactar o time (Defensiva) reduz o espaço.');
		if (match.onPitch(me).length < 11) out.push('Com um a menos, uma formação mais compacta protege a defesa.');
		return out.slice(0, 3);
	});

	// ── decisões do treinador
	let mentality = $state<Mentality>('equilibrada');
	let style = $state<PlayStyle>('posse');
	let formation = $state<FormationId>('4-3-3');
	let instructions = $state<TacticalInstructions>(presetInstructions('equilibrada', 'posse'));
	let showAdvanced = $state(false);
	let modalPreset = $state.raw(presetInstructions('equilibrada', 'posse'));
	// Trocar mentalidade/estilo no modal troca o preset e preserva os ajustes avançados.
	$effect(() => {
		const next = presetInstructions(mentality, style);
		const prev = untrack(() => modalPreset);
		if (JSON.stringify(next) === JSON.stringify(prev)) return;
		const custom = overridesOf(untrack(() => instructions), prev);
		instructions = { ...next, ...custom };
		modalPreset = next;
	});
	function openTactic() {
		intervalTab = 'elenco';
		if (!control) return;
		const t = match.teams[control].tactic;
		mentality = t.mentality;
		style = t.style;
		formation = t.formation;
		const rt = match.teams[control];
		instructions = { ...rt.instructions };
		modalPreset = presetInstructions(t.mentality, t.style);
		paused = true;
		tacticOpen = true;
	}
	function openInterval() {
		intervalTab = 'elenco';
		intervalSelected = null;
		intervalError = '';
		openTactic();
	}
	function togglePlayback() {
		if (finished) return;
		if (atInterval) tacticOpen = true;
		else paused = !paused;
	}
	function applyTactic(resume = false) {
		if (!control) return;
		const t = match.teams[control].tactic;
		const before = JSON.stringify(match.teams[control].instructions);
		if (mentality !== t.mentality) match.submit(control, { type: 'mentality', value: mentality });
		if (style !== t.style) match.submit(control, { type: 'style', value: style });
		if (formation !== t.formation && match.onPitch(control).length === 11) {
			match.submit(control, { type: 'formation', value: formation, lineup: reorderFor(formation) });
		}
		// Instruções finais (preset novo + ajustes): registradas como decisão reproduzível.
		if (JSON.stringify(instructions) !== before || mentality !== t.mentality || style !== t.style) {
			match.submit(control, { type: 'instructions', value: $state.snapshot(instructions) as TacticalInstructions });
		}
		tacticOpen = false;
		version++;
		if (resume) {
			acc = 0;
			paused = false;
			match.step();
			version++;
		}
	}
	/** Encaixa os mesmos 11 nos slots da nova formação (goleiro sempre no slot 0). */
	function reorderFor(f: FormationId): string[] {
		const side = control!;
		const slots = FORMATIONS[f];
		const gk = match.teams[side].gkId;
		const rest = match.onPitch(side).filter((s) => s.id !== gk).map((s) => s.id);
		const used = new Set<string>();
		const lineup: string[] = [gk];
		for (let i = 1; i < slots.length; i++) {
			const want = slots[i].position;
			const pick = rest.find((id) => !used.has(id) && match.player(id)?.position === want) ?? rest.find((id) => !used.has(id))!;
			used.add(pick);
			lineup.push(pick);
		}
		return lineup;
	}
	function swapPlayers(first: string, second: string) {
		if (!control || finished) return;
		intervalError = match.swapPositions(control, first, second) ?? '';
		version++;
	}
	function doSub(outId: string, inId: string) {
		if (!control) return;
		const decision = { type: 'sub', outId, inId } as const;
		if (atInterval) intervalError = match.prepareInterval(control, decision) ?? '';
		else match.submit(control, decision);
		version++;
	}
	const pending = $derived.by(() => {
		void version;
		return control ? match.pending(control) : [];
	});
	const pendingOut = $derived(pending.flatMap((d) => (d.type === 'sub' ? [d.outId] : [])));
	const rejected = $derived.by(() => {
		void version;
		return match.applied.filter((d) => d.side === control && d.rejected).slice(-1)[0]?.rejected ?? null;
	});

	function statRows() {
		const h = result.stats.home;
		const a = result.stats.away;
		return [
			['Posse de bola', `${poss.home}%`, `${poss.away}%`, poss.home, poss.away],
			['Finalizações', h.shots, a.shots, h.shots, a.shots],
			['No alvo', h.shotsOnTarget, a.shotsOnTarget, h.shotsOnTarget, a.shotsOnTarget],
			['Gols esperados (xG)', h.xg.toFixed(2), a.xg.toFixed(2), h.xg, a.xg],
			['Passes certos', h.passesCompleted, a.passesCompleted, h.passesCompleted, a.passesCompleted],
			['Desarmes', h.tackles, a.tackles, h.tackles, a.tackles],
			['Escanteios', h.corners, a.corners, h.corners, a.corners],
			['Faltas', h.fouls, a.fouls, h.fouls, a.fouls],
			['Impedimentos', h.offsides, a.offsides, h.offsides, a.offsides]
		] as Array<[string, string | number, string | number, number, number]>;
	}

	function onKey(e: KeyboardEvent) {
		if ((e.target as HTMLElement)?.closest('input,textarea,dialog')) return;
		if (e.code === 'Space') {
			e.preventDefault();
			togglePlayback();
		}
	}

	const started = $derived.by(() => {
		void version;
		return match.tick > 0;
	});
	const clock = $derived.by(() => {
		void version;
		return finished ? 'Fim' : match.phase === 'half_time' ? 'Intervalo' : match.clock();
	});
</script>

<svelte:window onkeydown={onKey} />

<div class="mc">
	<!-- Placar -->
	<header class="score-bar">
		<div class="team home">
			<span class="swatch" style="--c1:{colors.home.primary};--c2:{home.colors.secondary}"></span>
			<span class="tname">{home.name}<small> · C {captains.home}</small></span>
		</div>
		<div class="score" aria-live="polite">
			<strong>{result.homeGoals}</strong>
			<div class="clock">
				<span>{clock}</span>
				<small>{match.half === 1 && !finished ? '1º tempo' : finished ? 'Encerrado' : '2º tempo'}</small>
			</div>
			<strong>{result.awayGoals}</strong>
		</div>
		<div class="team away">
			<span class="tname">{away.name}<small> · C {captains.away}</small></span>
			<span class="swatch" style="--c1:{colors.away.primary};--c2:{away.colors.secondary}"></span>
		</div>
		<div class="possbar" aria-label="Posse de bola {poss.home}% a {poss.away}%">
			<span style="width:{poss.home}%;background:{colors.home.primary}">{poss.home}%</span>
			<span style="width:{poss.away}%;background:{colors.away.primary}">{poss.away}%</span>
		</div>
	</header>

	<!-- Linha do tempo: os lances importantes viram ícones no minuto em que aconteceram -->
	<div class="timeline" aria-label="Linha do tempo">
		<div class="track">
			<div class="fill" style="width:{progress}%"></div>
			<span class="ht" style="left:50%"></span>
		</div>
		{#each timeline as m, i (i)}
			<span
				class="mark {m.e.type}"
				data-side={m.e.side}
				style="left:{m.pct}%"
				title="{match.minuteLabel(m.e.tick)} · {m.e.type === 'goal' ? 'Gol' : m.e.type === 'sub' ? 'Substituição' : m.e.type === 'red' ? 'Expulsão' : 'Amarelo'} · {nameOf(m.e.player)} ({match.teams[m.e.side ?? 'home'].setup.short})"
			>{m.e.type === 'goal' ? '⚽' : m.e.type === 'sub' ? '⇄' : ''}</span>
		{/each}
		<span class="t0">0'</span><span class="t45">45'</span><span class="t90">90'</span>
	</div>

	<div class="grid">
		<FormationBoard
			{match}
			side="home"
			color={colors.home.primary}
			{version}
			players={result.players}
			bind:selected={selHome}
			canSub={control === 'home' && !finished && match.subsLeft('home') > 0}
			pendingOut={control === 'home' ? pendingOut : []}
			onswap={control === 'home' && !finished ? swapPlayers : undefined}
			onsub={doSub}
		/>

		<section class="center">
			{#if view === 'narracao'}
				<div class="narration" aria-live="polite">
					{#each lines.slice(0, 40) as l, i (l.tick + ':' + i)}
						<p class="line {l.tone}"><span class="min">{l.minute}</span>{l.text}</p>
					{:else}
						<p class="muted">Aperte ▶ para começar a narração.</p>
					{/each}
				</div>
			{:else}
				<PitchCanvas
					bind:this={pitch}
					{match}
					mode={view}
					{colors}
					{version}
					{highlight}
					onpick={(id, side) => {
						selHome = side === 'home' ? id : null;
						selAway = side === 'away' ? id : null;
					}}
				/>
			{/if}

			<BroadcastMoments events={moments} athleteName={nameOf} clubs={{ home: home.id, away: away.id }} />
			<div class="ticker" aria-live="polite">
				{#if lines[0]}<span class="min">{lines[0].minute}</span> {lines[0].text}{:else}Pronto para o apito inicial.{/if}
			</div>

			<div class="controls">
				<div class="playback">
					<Button
						variant="primary"
						size="sm"
						icon={paused ? 'play' : 'pause'}
						disabled={finished}
						onclick={togglePlayback}
						aria-label={atInterval ? 'Abrir escalação do intervalo' : paused ? 'Continuar' : 'Pausar'}
					>
						{atInterval ? 'Revisar intervalo' : paused ? (started ? 'Continuar' : 'Iniciar') : 'Pausar'}
					</Button>
					<Segmented label="Velocidade" options={SPEEDS.map((s) => ({ value: s.value, label: s.label }))} bind:value={speed} />
					<Button variant="ghost" size="sm" icon="skip" disabled={finished || atInterval} onclick={skipToEnd}>{control && match.half === 1 && clock !== 'Intervalo' ? 'Ir ao intervalo' : 'Resultado'}</Button>
				</div>
				<div class="playback">
					<Segmented
						label="Visualização"
						options={[
							{ value: 'classico', label: 'Clássico' },
							{ value: 'pixel', label: 'Pixel' },
							{ value: 'narracao', label: 'Narração' }
						]}
						bind:value={view}
					/>
					{#if control && !finished}
						<Button size="sm" icon="tactics" onclick={() => { if (atInterval) tacticOpen = true; else openTactic(); }}>Tática</Button>
					{/if}
				</div>
			</div>

			{#if control && !finished && (pending.length || rejected || tips.length)}
				<div class="coach">
					{#if pending.length}<p class="pending"><Icon name="whistle" /> Alteração aguardando a bola parar.</p>{/if}
					{#if rejected}<p class="rejected"><Icon name="alert" /> {rejected}</p>{/if}
					{#each tips.slice(0, 1) as t (t)}<p class="tip"><Icon name="info" /> {t}</p>{/each}
				</div>
			{/if}

			<!-- Comparativo: barras na cor de cada time -->
			<div class="stats">
				{#each statRows() as [label, hv, av, hn, an] (label)}
					<div class="srow">
						<span class="v">{hv}</span>
						<div class="mid">
							<span class="sl">{label}</span>
							<div class="bars">
								<span class="b" style="width:{(hn / Math.max(0.001, hn + an)) * 100}%;background:{colors.home.primary}"></span>
								<span class="b" style="width:{(an / Math.max(0.001, hn + an)) * 100}%;background:{colors.away.primary}"></span>
							</div>
						</div>
						<span class="v">{av}</span>
					</div>
				{/each}
			</div>
		</section>

		<FormationBoard
			{match}
			side="away"
			color={colors.away.primary}
			{version}
			players={result.players}
			bind:selected={selAway}
			canSub={control === 'away' && !finished && match.subsLeft('away') > 0}
			pendingOut={control === 'away' ? pendingOut : []}
			onswap={control === 'away' && !finished ? swapPlayers : undefined}
			onsub={doSub}
		/>
	</div>
</div>

{#if control}
	<Modal bind:open={tacticOpen} title={atInterval ? 'Intervalo · Escalação' : 'Ajuste tático'}
		description={atInterval ? 'Revise a equipe e confirme quando estiver pronto para o segundo tempo.' : 'Mentalidade e estilo mudam na hora; a formação reorganiza os mesmos atletas.'} size="lg">
		<Segmented label="Ajustes da equipe" bind:value={intervalTab} options={[{ value: 'elenco', label: 'Escalação' }, { value: 'tatica', label: 'Tática' }]} />
		{#if intervalTab === 'elenco'}
			<FormationBoard compact {match} side={control} color={colors[control].primary} {version} players={result.players}
				bind:selected={intervalSelected} canSub={match.subsLeft(control) > 0} pendingOut={pendingOut} onsub={doSub} onswap={!finished ? swapPlayers : undefined} />
			{#if intervalError}<p role="status">{intervalError}</p>{/if}
		{:else}
		<div class="tac">
			<div>
				<h4>Formação</h4>
				<div class="fchips">
					{#each FORMATION_IDS as f (f)}
						<button class="fchip" class:on={formation === f} onclick={() => (formation = f)} aria-pressed={formation === f}>
							<svg viewBox="0 0 100 100" aria-hidden="true">
								{#each FORMATIONS[f] as s, i (i)}<circle cx={s.x} cy={s.y} r="7" />{/each}
							</svg>
							<span>{f}</span>
						</button>
					{/each}
				</div>
				<h4>Mentalidade</h4>
				<MentalityScale bind:value={mentality} />
			</div>
			<div>
				<h4>Estilo</h4>
				<StylePicker bind:value={style} compact />
				</div>
				</div>
				<button class="adv" onclick={() => (showAdvanced = !showAdvanced)} aria-expanded={showAdvanced}>
					<Icon name={showAdvanced ? 'chevronDown' : 'chevronRight'} size={14} /> Instruções avançadas
				</button>
				{#if showAdvanced}
					<InstructionsEditor bind:value={instructions} preset={modalPreset} />
				{/if}
		{/if}
		{#snippet footer()}
			<Button variant="ghost" onclick={() => (tacticOpen = false)}>{atInterval ? 'Voltar à transmissão' : 'Cancelar'}</Button>
			<Button variant="primary" icon="check" onclick={() => applyTactic(atInterval)}>{atInterval ? 'Iniciar segundo tempo' : 'Aplicar'}</Button>
		{/snippet}
	</Modal>
{/if}

<style>
	.mc {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.score-bar {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 12px;
		padding: 12px 16px 10px;
		background: linear-gradient(180deg, var(--surface-2), var(--surface));
		border-radius: 14px;
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.team {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	.team.away {
		justify-content: flex-end;
	}
	.tname {
		font-family: var(--font-display);
		font-size: var(--fs-xl);
		font-weight: 700;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.swatch {
		width: 18px;
		height: 24px;
		border-radius: 4px 4px 9px 9px;
		background: linear-gradient(90deg, var(--c1) 60%, var(--c2) 60%);
		flex: none;
	}
	.score {
		display: flex;
		align-items: center;
		gap: 14px;
		font-family: var(--font-display);
	}
	.score strong {
		font-size: var(--fs-3xl);
		line-height: 1;
		min-width: 1ch;
		text-align: center;
	}
	.clock {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 4px 12px;
		border-radius: 8px;
		background: var(--bg-deep);
		color: var(--emerald-strong);
		font-variant-numeric: tabular-nums;
		font-size: var(--fs-lg);
	}
	.clock small {
		font-family: var(--font-ui);
		font-size: 11px;
		color: var(--text-3);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.possbar {
		grid-column: 1 / -1;
		display: flex;
		height: 14px;
		border-radius: 7px;
		overflow: hidden;
		gap: 2px;
	}
	.possbar span {
		transition: width 0.6s ease;
		font-size: 11px;
		font-weight: 700;
		line-height: 14px;
		padding: 0 6px;
		color: #fff;
		text-shadow: 0 1px 2px rgb(0 0 0 / 0.6);
		min-width: 34px;
	}
	.possbar span:last-child {
		text-align: right;
	}
	.timeline {
		position: relative;
		height: 34px;
		margin: 0 14px;
	}
	.track {
		position: absolute;
		left: 0;
		right: 0;
		top: 12px;
		height: 8px;
		border-radius: 6px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.track .fill {
		position: absolute;
		inset: 0 auto 0 0;
		background: var(--emerald-soft);
		border-radius: 6px;
	}
	.track .ht {
		position: absolute;
		top: -3px;
		bottom: -3px;
		width: 1px;
		background: var(--line-strong);
	}
	.mark {
		position: absolute;
		transform: translateX(-50%);
		font-size: 12px;
		line-height: 1;
		cursor: default;
	}
	.mark[data-side='home'] {
		top: -2px;
	}
	.mark[data-side='away'] {
		top: 22px;
	}
	.mark.yellow,
	.mark.red {
		width: 7px;
		height: 10px;
		border-radius: 1px;
		background: var(--warning);
	}
	.mark.red {
		background: var(--danger);
	}
	.mark.sub {
		color: var(--info);
		font-weight: 700;
	}
	.t0,
	.t45,
	.t90 {
		position: absolute;
		top: 13px;
		font-size: 11px;
		color: var(--text-3);
	}
	.t0 {
		left: -14px;
	}
	.t45 {
		left: 50%;
		transform: translateX(-50%);
		top: 24px;
	}
	.t90 {
		right: -16px;
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(230px, 290px) minmax(0, 1fr) minmax(230px, 290px);
		gap: 12px;
		align-items: start;
	}
	.center {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}
	.ticker {
		padding: 8px 12px;
		border-radius: 10px;
		background: var(--bg-deep);
		font-size: var(--fs-sm);
		min-height: 2.4em;
	}
	.min {
		display: inline-block;
		min-width: 3.2em;
		color: var(--gold);
		font-family: var(--font-display);
		font-weight: 700;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
	}
	.playback {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.coach {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 8px 12px;
		border-radius: 10px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.coach p {
		margin: 0;
		font-size: var(--fs-sm);
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.pending {
		color: var(--info);
	}
	.rejected {
		color: var(--danger);
	}
	.tip {
		color: var(--gold);
	}
	.narration {
		height: clamp(260px, 36vw, 420px);
		overflow: auto;
		padding: 12px;
		border-radius: 12px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.line {
		margin: 0;
		font-size: var(--fs-md);
	}
	.line.goal {
		color: var(--emerald-strong);
		font-weight: 700;
		font-size: var(--fs-lg);
	}
	.line.card {
		color: var(--warning);
	}
	.line.whistle {
		color: var(--text-2);
		font-style: italic;
	}
	.muted {
		color: var(--text-3);
	}
	.stats {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px 18px;
		padding: 12px;
		border-radius: 12px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.srow {
		display: grid;
		grid-template-columns: 38px 1fr 38px;
		align-items: center;
		gap: 6px;
		font-size: var(--fs-sm);
	}
	.srow .v {
		text-align: center;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}
	.mid {
		display: flex;
		flex-direction: column;
		gap: 3px;
		align-items: center;
	}
	.sl {
		color: var(--text-3);
		font-size: var(--fs-xs);
	}
	.bars {
		display: flex;
		width: 100%;
		height: 5px;
		gap: 2px;
	}
	.b {
		border-radius: 3px;
		min-width: 2px;
	}
	.tac h4 {
		margin: 0 0 6px;
		font-size: var(--fs-sm);
		color: var(--text-3);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.tac {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}
	.fchips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 14px;
	}
	.adv {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 12px 0 8px;
		border: 0;
		background: none;
		color: var(--emerald-strong);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.fchip {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		width: 74px;
		padding: 6px;
		border-radius: 8px;
		border: 0;
		background: var(--surface-2);
		color: var(--text);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.fchip svg {
		width: 52px;
		height: 52px;
		background: #124432;
		border-radius: 6px;
	}
	.fchip circle {
		fill: var(--text);
	}
	.fchip.on {
		box-shadow: inset 0 0 0 2px var(--emerald);
	}
	.fchip.on circle {
		fill: var(--emerald-strong);
	}
	@media (max-width: 1080px) {
		.grid {
			grid-template-columns: 1fr 1fr;
		}
		.center {
			grid-column: 1 / -1;
			order: -1;
		}
	}
	@media (max-width: 640px) {
		.grid,
		.tac,
		.stats {
			grid-template-columns: 1fr;
		}
		.tname {
			font-size: var(--fs-md);
		}
		.score strong {
			font-size: var(--fs-2xl);
		}
	}
</style>
