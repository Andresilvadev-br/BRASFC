<script lang="ts">
	import { onDestroy } from 'svelte';
	import { FORMATION_IDS, FORMATIONS, MENTALITY_LABELS, STYLE_LABELS, type FormationId, type Mentality, type PlayStyle } from '#lib/domain/tactics.ts';
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
	import PitchCanvas from './PitchCanvas.svelte';

	/**
	 * Central da partida: placar, campo 2D, escalações com notas, eventos, estatísticas,
	 * linha do tempo e controles. Toda a informação vem do motor (eventos e estado);
	 * a velocidade só muda quantos ticks são processados por segundo, nunca o resultado.
	 */
	let {
		home,
		away,
		seed,
		control = null,
		aiOpponent = true,
		onfinish
	}: {
		home: TeamSetup;
		away: TeamSetup;
		seed: number;
		/** lado comandado pelo usuário (null = só assistir) */
		control?: Side | null;
		aiOpponent?: boolean;
		onfinish?: (result: MatchResult, match: Match) => void;
	} = $props();

	// A partida é criada uma vez com as escalações recebidas.
	// svelte-ignore state_referenced_locally
	const match = new Match({
		home,
		away,
		seed,
		ai: { home: control !== 'home' && aiOpponent, away: control !== 'away' && aiOpponent }
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
	let paused = $state(true);
	let view = $state<ViewMode>('classico');
	let tab = $state<'eventos' | 'estatisticas' | 'notas'>('eventos');
	let version = $state(0);
	let finished = $state(false);
	let pitch: PitchCanvas | undefined = $state();
	let subsOpen = $state(false);
	let tacticOpen = $state(false);
	let subOut = $state<string | null>(null);

	const tps = $derived(SPEEDS.find((s) => s.value === speed)!.tps);
	const colors = $derived({
		home: { primary: home.colors.primary, secondary: home.colors.secondary },
		away: { primary: away.colors.primary, secondary: away.colors.secondary }
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
	const teamName = (s?: Side) => (s ? match.teams[s].setup.short : '');
	const lines = $derived.by<NarrationLine[]>(() => {
		void version;
		const out: NarrationLine[] = [];
		for (const e of match.events) {
			const l = narrate(e, { name: nameOf, team: (s) => (s ? match.teams[s].setup.name : ''), minute: (t) => match.minuteLabel(t) });
			if (l) out.push(l);
		}
		return out.reverse();
	});
	const keyEvents = $derived(
		lines.filter((l) => l.tone === 'goal' || l.tone === 'card' || l.tone === 'whistle' || l.text.startsWith('Substituição'))
	);
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

	function roster(side: Side) {
		void version;
		const t = match.teams[side];
		const slots = FORMATIONS[t.tactic.formation];
		const onPitch = t.tactic.lineup.map((id, i) => ({ id, slot: slots[i]?.position ?? '', state: match.states.get(id)! }));
		const offIds = [...match.states.values()].filter((s) => s.side === side && !s.onPitch).map((s) => s.id);
		return { onPitch, off: offIds };
	}

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
		if (diff < 0 && minute >= 60 && match.teams[me].tactic.mentality !== 'ofensiva') out.push('Atrás no placar: uma mentalidade ofensiva aumenta a pressão (e os riscos).');
		if (diff > 0 && minute >= 75 && match.teams[me].tactic.mentality === 'ofensiva') out.push('Vantagem no fim: recuar a mentalidade ajuda a segurar o resultado.');
		const other = me === 'home' ? 'away' : 'home';
		if (result.stats[other].shots >= result.stats[me].shots + 6) out.push('O adversário finaliza muito mais: compactar o time (Defensiva) reduz o espaço.');
		if (match.onPitch(me).length < 11) out.push('Com um a menos, uma formação mais compacta protege a defesa.');
		return out.slice(0, 3);
	});

	// ── decisões do treinador
	let mentality = $state<Mentality>('equilibrada');
	let style = $state<PlayStyle>('posse');
	let formation = $state<FormationId>('4-3-3');
	function openTactic() {
		if (!control) return;
		const t = match.teams[control].tactic;
		mentality = t.mentality;
		style = t.style;
		formation = t.formation;
		paused = true;
		tacticOpen = true;
	}
	function applyTactic() {
		if (!control) return;
		const t = match.teams[control].tactic;
		if (mentality !== t.mentality) match.submit(control, { type: 'mentality', value: mentality });
		if (style !== t.style) match.submit(control, { type: 'style', value: style });
		if (formation !== t.formation && match.onPitch(control).length === 11) {
			match.submit(control, { type: 'formation', value: formation, lineup: reorderFor(formation) });
		}
		tacticOpen = false;
		version++;
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
	function doSub(inId: string) {
		if (!control || !subOut) return;
		match.submit(control, { type: 'sub', outId: subOut, inId });
		subOut = null;
		subsOpen = false;
		version++;
	}
	const pending = $derived.by(() => {
		void version;
		return control ? match.pending(control) : [];
	});
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
			['Passes certos', `${h.passesCompleted}/${h.passes}`, `${a.passesCompleted}/${a.passes}`, h.passesCompleted, a.passesCompleted],
			['Desarmes', h.tackles, a.tackles, h.tackles, a.tackles],
			['Escanteios', h.corners, a.corners, h.corners, a.corners],
			['Faltas', h.fouls, a.fouls, h.fouls, a.fouls],
			['Impedimentos', h.offsides, a.offsides, h.offsides, a.offsides],
			['Cartões', `${h.yellows}🟨 ${h.reds ? h.reds + '🟥' : ''}`, `${a.yellows}🟨 ${a.reds ? a.reds + '🟥' : ''}`, h.yellows + h.reds * 2, a.yellows + a.reds * 2]
		] as Array<[string, string | number, string | number, number, number]>;
	}

	function ratingClass(r: number) {
		return r >= 7.5 ? 'great' : r >= 6.8 ? 'good' : r >= 6 ? 'ok' : 'bad';
	}

	function onKey(e: KeyboardEvent) {
		if ((e.target as HTMLElement)?.closest('input,textarea,dialog')) return;
		if (e.code === 'Space') {
			e.preventDefault();
			if (!finished) paused = !paused;
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
	<header class="board">
		<div class="team home">
			<span class="swatch" style="--c1:{home.colors.primary};--c2:{home.colors.secondary}"></span>
			<span class="tname">{home.name}</span>
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
			<span class="tname">{away.name}</span>
			<span class="swatch" style="--c1:{away.colors.primary};--c2:{away.colors.secondary}"></span>
		</div>
		<div class="possbar" aria-label="Posse de bola {poss.home}% a {poss.away}%">
			<span style="width:{poss.home}%;background:{home.colors.primary}"></span>
			<span style="width:{poss.away}%;background:{away.colors.primary}"></span>
		</div>
	</header>

	<!-- Linha do tempo -->
	<div class="timeline" aria-label="Linha do tempo">
		<div class="fill" style="width:{progress}%"></div>
		<span class="ht" style="left:50%"></span>
		{#each timeline as m, i (i)}
			<span
				class="mark {m.e.type}"
				data-side={m.e.side}
				style="left:{m.pct}%"
				title="{match.minuteLabel(m.e.tick)} {m.e.type === 'goal' ? 'Gol' : m.e.type === 'sub' ? 'Substituição' : 'Cartão'} · {nameOf(m.e.player)}"
			></span>
		{/each}
	</div>

	<div class="grid">
		<!-- Escalação mandante -->
		<aside class="roster" aria-label="Escalação {home.name}">
			{@render rosterList('home')}
		</aside>

		<section class="center">
			{#if view === 'narracao'}
				<div class="narration" aria-live="polite">
					{#each lines.slice(0, 40) as l, i (l.tick + ':' + i)}
						<p class="line {l.tone}" data-side={l.side}><span class="min">{l.minute}</span>{l.text}</p>
					{:else}
						<p class="muted">Aperte ▶ para começar a narração.</p>
					{/each}
				</div>
			{:else}
				<PitchCanvas bind:this={pitch} {match} mode={view} {colors} {version} />
			{/if}

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
						onclick={() => (paused = !paused)}
						aria-label={paused ? 'Continuar' : 'Pausar'}
					>
						{paused ? (started ? 'Continuar' : 'Iniciar') : 'Pausar'}
					</Button>
					<Segmented label="Velocidade" options={SPEEDS.map((s) => ({ value: s.value, label: s.label }))} bind:value={speed} />
					<Button variant="ghost" size="sm" icon="skip" disabled={finished} onclick={skipToEnd}>Resultado</Button>
				</div>
				<Segmented
					label="Visualização"
					options={[
						{ value: 'classico', label: 'Clássico' },
						{ value: 'pixel', label: 'Pixel' },
						{ value: 'narracao', label: 'Narração' }
					]}
					bind:value={view}
				/>
			</div>

			{#if control && !finished}
				<div class="dugout">
					<div class="dg-actions">
						<Button size="sm" icon="tactics" onclick={openTactic}>Tática</Button>
						<Button size="sm" icon="squad" onclick={() => ((paused = true), (subsOpen = true))} disabled={match.subsLeft(control) <= 0}>
							Substituir ({match.subsLeft(control)})
						</Button>
					</div>
					{#if pending.length}
						<p class="pending"><Icon name="whistle" /> {pending.length} alteração(ões) aguardando a bola parar.</p>
					{/if}
					{#if rejected}<p class="rejected"><Icon name="alert" /> {rejected}</p>{/if}
					{#if tips.length}
						<ul class="tips" aria-label="Assistente técnico">
							{#each tips as t (t)}<li><Icon name="info" /> {t}</li>{/each}
						</ul>
					{/if}
				</div>
			{/if}

			<div class="tabs" role="tablist">
				{#each [['eventos', 'Lances'], ['estatisticas', 'Estatísticas'], ['notas', 'Notas']] as [id, label] (id)}
					<button role="tab" aria-selected={tab === id} class:on={tab === id} onclick={() => (tab = id as typeof tab)}>{label}</button>
				{/each}
			</div>
			{#if tab === 'eventos'}
				<ol class="events">
					{#each keyEvents as l, i (l.tick + ':' + i)}
						<li class={l.tone} data-side={l.side}><span class="min">{l.minute}</span> {l.text}</li>
					{:else}
						<li class="muted">Nenhum lance importante ainda.</li>
					{/each}
				</ol>
			{:else if tab === 'estatisticas'}
				<div class="stats">
					{#each statRows() as [label, hv, av, hn, an] (label)}
						<div class="srow">
							<span class="v">{hv}</span>
							<div class="mid">
								<span class="sl">{label}</span>
								<div class="bars">
									<span class="b h" style="width:{(hn / Math.max(0.001, hn + an)) * 100}%;background:{home.colors.primary}"></span>
									<span class="b a" style="width:{(an / Math.max(0.001, hn + an)) * 100}%;background:{away.colors.primary}"></span>
								</div>
							</div>
							<span class="v">{av}</span>
						</div>
					{/each}
				</div>
			{:else}
				<div class="ratings">
					{#each ['home', 'away'] as const as side (side)}
						<div>
							<h4>{match.teams[side].setup.short}</h4>
							{#each [...match.states.values()].filter((s) => s.side === side && (s.onPitch || s.minuteOut !== null)) as s (s.id)}
								{@const r = result.players[s.id]}
								<div class="rrow">
									<span class="num">{match.player(s.id)?.number}</span>
									<span class="nm">{nameOf(s.id)}</span>
									<span class="small">{r?.goals ? `⚽${r.goals > 1 ? r.goals : ''}` : ''}{r?.assists ? ' 🅰' : ''}</span>
									<span class="rating {ratingClass(r?.rating ?? 6)}">{(r?.rating ?? 6).toFixed(1)}</span>
								</div>
							{/each}
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<aside class="roster" aria-label="Escalação {away.name}">
			{@render rosterList('away')}
		</aside>
	</div>
</div>

{#snippet rosterList(side: Side)}
	{@const r = roster(side)}
	{@const t = match.teams[side]}
	<div class="rhead">
		<strong>{t.setup.short}</strong>
		<span>{t.tactic.formation} · {MENTALITY_LABELS[t.tactic.mentality]} · {STYLE_LABELS[t.tactic.style]}</span>
	</div>
	<ul class="plist">
		{#each r.onPitch as p (p.id)}
			{@const st = p.state}
			{@const ps = result.players[p.id]}
			<li class:sent={st?.sentOff} class:inj={st?.injured}>
				<span class="pos">{p.slot}</span>
				<span class="num">{match.player(p.id)?.number}</span>
				<span class="nm">
					{nameOf(p.id)}
					{#if st?.yellow}<i class="card y" title="Amarelo"></i>{/if}
					{#if ps?.goals}<i class="goal" title="Gol">⚽</i>{/if}
				</span>
				<span class="cond" title="Condição física {Math.round(st?.condition ?? 0)}%"><span style="width:{st?.condition ?? 0}%" class:low={(st?.condition ?? 100) < 60}></span></span>
				<span class="rating {ratingClass(ps?.rating ?? 6)}">{(ps?.rating ?? 6).toFixed(1)}</span>
			</li>
		{/each}
		{#each r.off as id (id)}
			{@const st = match.states.get(id)}
			<li class="out"><span class="pos">{st?.sentOff ? '🟥' : '↓'}</span><span class="num">{match.player(id)?.number}</span><span class="nm">{nameOf(id)}</span></li>
		{/each}
	</ul>
{/snippet}

{#if control}
	<Modal bind:open={subsOpen} title="Substituição" description="Escolha quem sai e depois quem entra. A troca acontece na próxima bola parada." size="lg">
		<div class="subgrid">
			<div>
				<h4>Sai</h4>
				{#each match.onPitch(control) as s (s.id)}
					<button class="pick" class:on={subOut === s.id} onclick={() => (subOut = s.id)}>
						<span class="num">{match.player(s.id)?.number}</span>
						<span class="nm">{match.player(s.id)?.shortName}</span>
						<span class="pos">{match.player(s.id)?.position}</span>
						<span class="cond"><span style="width:{s.condition}%" class:low={s.condition < 60}></span></span>
					</button>
				{/each}
			</div>
			<div>
				<h4>Entra</h4>
				{#each match.bench(control) as b (b.id)}
					<button class="pick" disabled={!subOut} onclick={() => doSub(b.id)}>
						<span class="num">{b.number}</span>
						<span class="nm">{b.shortName}</span>
						<span class="pos">{b.position}</span>
						<span class="cond"><span style="width:{b.condition}%"></span></span>
					</button>
				{:else}
					<p class="muted">Sem reservas disponíveis.</p>
				{/each}
			</div>
		</div>
	</Modal>

	<Modal bind:open={tacticOpen} title="Ajuste tático" description="Mentalidade e estilo mudam na hora; a formação reorganiza os mesmos atletas." size="lg">
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
		{#snippet footer()}
			<Button variant="ghost" onclick={() => (tacticOpen = false)}>Cancelar</Button>
			<Button variant="primary" icon="check" onclick={applyTactic}>Aplicar</Button>
		{/snippet}
	</Modal>
{/if}

<style>
	.mc {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3, 12px);
	}
	.board {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 12px;
		padding: 12px 16px 8px;
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
		font-size: 10px;
		color: var(--text-3);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.possbar {
		grid-column: 1 / -1;
		display: flex;
		height: 4px;
		border-radius: 4px;
		overflow: hidden;
		gap: 2px;
	}
	.possbar span {
		transition: width 0.6s ease;
	}
	.timeline {
		position: relative;
		height: 10px;
		border-radius: 6px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.timeline .fill {
		position: absolute;
		inset: 0 auto 0 0;
		background: var(--emerald-soft);
		border-radius: 6px;
	}
	.timeline .ht {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--line-strong);
	}
	.mark {
		position: absolute;
		top: 50%;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		transform: translate(-50%, -50%);
		background: var(--text-2);
	}
	.mark.goal {
		background: var(--emerald-strong);
		width: 10px;
		height: 10px;
	}
	.mark.yellow {
		background: var(--warning);
		border-radius: 1px;
		width: 6px;
	}
	.mark.red {
		background: var(--danger);
		border-radius: 1px;
		width: 6px;
	}
	.mark.sub {
		background: var(--info);
		width: 5px;
		height: 5px;
	}
	.mark[data-side='away'] {
		top: 75%;
	}
	.mark[data-side='home'] {
		top: 25%;
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(200px, 250px) minmax(0, 1fr) minmax(200px, 250px);
		gap: 12px;
		align-items: start;
	}
	.roster {
		background: var(--surface);
		border-radius: 12px;
		padding: 10px;
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.rhead {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-bottom: 8px;
	}
	.rhead span {
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.plist {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.plist li {
		display: grid;
		grid-template-columns: 30px 22px 1fr 34px 32px;
		align-items: center;
		gap: 6px;
		font-size: var(--fs-sm);
		padding: 3px 4px;
		border-radius: 6px;
	}
	.plist li:hover {
		background: var(--surface-2);
	}
	.plist li.out {
		opacity: 0.5;
		grid-template-columns: 30px 22px 1fr;
	}
	.plist li.sent .nm {
		text-decoration: line-through;
	}
	.plist li.inj .nm::after {
		content: ' ✚';
		color: var(--danger);
	}
	.pos {
		font-size: 10px;
		color: var(--text-3);
		font-weight: 700;
	}
	.num {
		color: var(--text-3);
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	.nm {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.card.y {
		display: inline-block;
		width: 7px;
		height: 10px;
		background: var(--warning);
		border-radius: 1px;
		margin-left: 4px;
		vertical-align: -1px;
	}
	.goal {
		font-style: normal;
		font-size: 11px;
	}
	.cond {
		height: 4px;
		border-radius: 3px;
		background: var(--surface-3);
		overflow: hidden;
	}
	.cond span {
		display: block;
		height: 100%;
		background: var(--emerald);
	}
	.cond span.low {
		background: var(--warning);
	}
	.rating {
		font-family: var(--font-display);
		font-weight: 700;
		text-align: center;
		border-radius: 5px;
		padding: 0 3px;
		font-variant-numeric: tabular-nums;
	}
	.rating.great {
		background: var(--emerald);
		color: #06281c;
	}
	.rating.good {
		color: var(--emerald-strong);
	}
	.rating.ok {
		color: var(--text-2);
	}
	.rating.bad {
		color: var(--danger);
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
	.dugout {
		padding: 10px;
		border-radius: 12px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.dg-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.pending,
	.rejected {
		margin: 0;
		font-size: var(--fs-sm);
		display: flex;
		gap: 6px;
		align-items: center;
		color: var(--info);
	}
	.rejected {
		color: var(--danger);
	}
	.tips {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: var(--fs-sm);
		color: var(--gold);
	}
	.tips li {
		display: flex;
		gap: 6px;
	}
	.tabs {
		display: flex;
		gap: 4px;
		border-bottom: 1px solid var(--line);
	}
	.tabs button {
		background: none;
		border: 0;
		color: var(--text-3);
		padding: 8px 12px;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		border-bottom: 2px solid transparent;
	}
	.tabs button.on {
		color: var(--text);
		border-color: var(--emerald);
	}
	.events {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-height: 280px;
		overflow: auto;
		font-size: var(--fs-sm);
	}
	.events li {
		padding: 6px 8px;
		border-radius: 8px;
		background: var(--surface);
	}
	.events li.goal {
		background: var(--emerald-soft);
	}
	.events li.card {
		background: var(--warning-soft);
	}
	.narration {
		height: clamp(260px, 42vw, 440px);
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
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.srow {
		display: grid;
		grid-template-columns: 64px 1fr 64px;
		align-items: center;
		gap: 8px;
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
	.ratings {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.ratings h4,
	.subgrid h4,
	.tac h4 {
		margin: 0 0 6px;
		font-size: var(--fs-sm);
		color: var(--text-3);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.rrow {
		display: grid;
		grid-template-columns: 22px 1fr auto 34px;
		gap: 6px;
		font-size: var(--fs-sm);
		padding: 2px 0;
	}
	.small {
		font-size: 11px;
	}
	.subgrid,
	.tac {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}
	.pick {
		display: grid;
		grid-template-columns: 24px 1fr 34px 40px;
		gap: 8px;
		align-items: center;
		width: 100%;
		padding: 6px 8px;
		margin-bottom: 4px;
		border: 0;
		border-radius: 8px;
		background: var(--surface-2);
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.pick:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.pick.on {
		box-shadow: inset 0 0 0 2px var(--emerald);
	}
	.fchips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 14px;
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
	@media (max-width: 1020px) {
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
		.subgrid,
		.tac,
		.ratings {
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
