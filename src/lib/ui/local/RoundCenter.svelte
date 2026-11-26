<script lang="ts">
	import { portal } from '#lib/motion/actions.ts';
	import { onDestroy, onMount } from 'svelte';
	import { api, ApiError } from '#lib/api.ts';
	import type { Career } from '#lib/domain/career.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { DIVISION_LABELS, type DivisionId } from '#lib/domain/league.ts';
	import { matchFromShared, type SharedSetup } from '#lib/domain/matchday.ts';
	import { liveCoaches } from '#lib/domain/turns.ts';
	import type { Match } from '#lib/engine/match.ts';
	import type { Side } from '#lib/engine/types.ts';
	import { markClean, markDirty } from '#lib/stores/unsaved.svelte.ts';
	import { notify } from '#lib/stores/island.svelte.ts';
	import Button from '../Button.svelte';
	import Crest from '../Crest.svelte';
	import Icon from '../Icon.svelte';
	import Segmented from '../Segmented.svelte';
	import TacticCommand from './TacticCommand.svelte';

	/**
	 * Central de resultados simultâneos (carreira com vários treinadores), no espírito dos clássicos:
	 * todos os jogos do passo numa lista compacta, um relógio só. As partidas dos treinadores rodam no
	 * motor completo aqui mesmo (com as decisões deles); os demais jogos já foram simulados pelo motor
	 * e os lances aparecem no minuto em que aconteceram. Nada é sorteado na tela.
	 */
	let { career, onfinish }: { career: Career; onfinish: (out: { round: number; coaches?: Array<{ index: number; match: { homeGoals: number; awayGoals: number } | null }> }) => void } = $props();

	type Venue = { stadium: string; attendance: number | null };
	type Ev = { side: Side; minute: number; player: string; assist?: string };
	type Inc = Ev & { kind: 'yellow' | 'red' | 'injury' };
	type Preview = {
		version: number; step: string; kind: 'league' | 'cup'; round: number; date: string;
		matches: Array<{ key: string; competition: string; home: string; away: string; venue: Venue; coaches: Array<{ index: number; side: Side; name: string }>; setup: SharedSetup }>;
		others: Array<{ competition: string; home: string; away: string; homeGoals: number; awayGoals: number; quick: boolean; venue: Venue; goals: Ev[]; incidents: Inc[] }>;
	};
	type Live = { key: string; competition: string; home: string; away: string; venue: Venue; coaches: Array<{ index: number; side: Side; name: string }>; match: Match; seen: number };
	type Intervention = { live: Live; side: Side; coach: string; kind: 'red' | 'injury'; player: string; minute: string; secondYellow: boolean };

	const SPEEDS = [
		{ value: '1', label: '1×', tps: 8 },
		{ value: '2', label: '2×', tps: 20 },
		{ value: '4', label: '4×', tps: 45 },
		{ value: '8', label: '8×', tps: 120 }
	] as const;
	const HALF = 45 * 60;
	const FULL = 90 * 60;

	let data = $state.raw<Preview | null>(null);
	let lives: Live[] = [];
	let loadError = $state('');
	let speed = $state<(typeof SPEEDS)[number]['value']>('2');
	let paused = $state(true);
	let started = $state(false);
	let clockTick = 0; // relógio da central (segundos de jogo regulamentar)
	let phase = $state<'first' | 'interval' | 'second' | 'done' | 'saving' | 'saved' | 'error'>('first');
	let version = $state(0);
	let command = $state<{ live: Live; side: Side; coach: string; title: string; resume: boolean } | null>(null);
	let queue = $state<Intervention[]>([]);
	/** fila do intervalo sequencial: treinadores (na ordem) que ainda vão revisar o time */
	let halftime = $state<Array<{ live: Live; side: Side; coach: string; index: number }>>([]);
	let halftimeDone = $state<number[]>([]);
	let saveError = $state('');
	const coaches = $derived(liveCoaches(career));
	const tps = $derived(SPEEDS.find((s) => s.value === speed)!.tps);

	onMount(async () => {
		try {
			const res = await api<Preview>(`/api/careers/${career.id}/rodada`);
			lives = res.matches.map((m) => ({ ...m, match: matchFromShared(m.setup), seen: 0 }));
			data = res;
			markDirty('rodada', 'Rodada em andamento (os resultados só valem quando forem registrados)');
		} catch (e) {
			loadError = e instanceof ApiError || e instanceof Error ? e.message : 'Não foi possível montar a rodada.';
		}
	});

	// ── laço: avança o relógio e as partidas dos treinadores, tick a tick
	let raf = 0;
	let last = 0;
	let acc = 0;
	let lastUi = 0;
	function frame(now: number) {
		raf = requestAnimationFrame(frame);
		const dt = last ? Math.min(0.25, (now - last) / 1000) : 0;
		last = now;
		if (!data || paused || command || queue.length || phase === 'interval' || phase === 'done' || phase === 'saving' || phase === 'saved' || phase === 'error') return;
		acc += dt * tps;
		let steps = Math.floor(acc);
		acc -= steps;
		while (steps-- > 0) {
			if (!advance()) break;
		}
		if (now - lastUi > 150) {
			lastUi = now;
			version++;
		}
	}
	$effect(() => {
		raf = requestAnimationFrame(frame);
		return () => cancelAnimationFrame(raf);
	});
	onDestroy(() => {
		cancelAnimationFrame(raf);
		markClean('rodada');
	});

	/** Um segundo de jogo. Retorna false quando algo pede atenção (intervenção, intervalo, fim). */
	function advance(): boolean {
		const limit = phase === 'first' ? HALF : FULL;
		if (clockTick < limit) clockTick++;
		let waiting = true;
		for (const l of lives) {
			const m = l.match;
			if (m.finished || (phase === 'first' && m.phase === 'half_time')) continue;
			waiting = false;
			m.step();
			if (inspect(l)) return false;
		}
		if (phase === 'first' && clockTick >= HALF && waiting) {
			startInterval();
			return false;
		}
		if (phase === 'second' && clockTick >= FULL && lives.every((l) => l.match.finished)) {
			finish();
			return false;
		}
		return true;
	}

	/** Expulsão (inclusive 2º amarelo) ou lesão num clube humano: intervenção obrigatória. */
	function inspect(l: Live): boolean {
		const events = l.match.events;
		let found = false;
		for (; l.seen < events.length; l.seen++) {
			const e = events[l.seen];
			if ((e.type !== 'red' && e.type !== 'injury') || !e.side) continue;
			const owner = l.coaches.find((c) => c.side === e.side);
			if (!owner || l.match.finished) continue;
			queue = [...queue, { live: l, side: e.side, coach: owner.name, kind: e.type, player: e.player ?? '', minute: l.match.minuteLabel(e.tick), secondYellow: !!e.data?.secondYellow }];
			found = true;
		}
		return found;
	}

	function startInterval() {
		phase = 'interval';
		halftimeDone = [];
		// Ordem de criação dos treinadores; só quem tem partida em andamento.
		const order = lives.flatMap((l) => l.coaches.filter(() => !l.match.finished).map((c) => ({ live: l, side: c.side, coach: c.name, index: c.index })));
		halftime = order.sort((a, b) => a.index - b.index);
		openNextHalftime();
	}
	function openNextHalftime() {
		const next = halftime.find((h) => !halftimeDone.includes(h.index));
		if (!next) {
			phase = 'second';
			version++;
			return;
		}
		command = { live: next.live, side: next.side, coach: next.coach, title: 'Intervalo · Comando tático', resume: false };
	}

	function finish() {
		phase = 'done';
		version++;
		void save();
	}

	function openCommand(l: Live, side: Side) {
		if (phase === 'interval' || phase === 'done' || phase === 'saving' || phase === 'saved' || l.match.finished) return;
		const owner = l.coaches.find((c) => c.side === side);
		if (!owner) return;
		command = { live: l, side, coach: owner.name, title: 'Comando tático', resume: !paused };
		paused = true;
	}

	function closeCommand(confirmed: boolean) {
		const c = command;
		command = null;
		version++;
		if (!c) return;
		if (phase === 'interval') {
			const h = halftime.find((x) => x.live === c.live && x.side === c.side);
			if (h && confirmed) halftimeDone = [...halftimeDone, h.index];
			if (confirmed) openNextHalftime();
			else command = c; // no intervalo é preciso confirmar
			return;
		}
		if (c.resume) paused = false;
	}

	function resolveIntervention(reorganize: boolean) {
		const [first, ...rest] = queue;
		if (!first) return;
		const resume = !paused;
		queue = rest;
		if (reorganize) command = { live: first.live, side: first.side, coach: first.coach, title: first.kind === 'red' ? 'Reorganizar equipe' : 'Atleta lesionado', resume: resume || !rest.length };
	}

	async function save() {
		if (!data) return;
		phase = 'saving';
		saveError = '';
		const matches: Record<string, unknown> = {};
		for (const l of lives) {
			const sides = l.coaches.map((c) => c.side);
			matches[l.key] = l.match.result().decisions.filter((d) => sides.includes(d.side) && !d.rejected);
		}
		try {
			const res = await api<{ round: number; coaches?: Array<{ index: number; match: { homeGoals: number; awayGoals: number } | null }> }>(`/api/careers/${career.id}/matches`, { body: { version: data.version, step: data.step, matches } });
			for (const l of lives) {
				const official = res.coaches?.find((c) => l.coaches.some((x) => x.index === c.index))?.match;
				const local = l.match.result();
				if (official && (official.homeGoals !== local.homeGoals || official.awayGoals !== local.awayGoals)) {
					notify({ icon: 'alert', tone: 'warning', title: 'Resultado conferido no save', detail: `${getClub(l.home)?.short} × ${getClub(l.away)?.short}: vale o placar oficial ${official.homeGoals}–${official.awayGoals}.` });
				}
			}
			phase = 'saved';
			markClean('rodada');
			notify({ icon: 'check', tone: 'success', title: 'Rodada registrada', detail: 'O controle volta ao primeiro treinador.' });
			onfinish(res);
		} catch (e) {
			phase = 'error';
			saveError = e instanceof ApiError || e instanceof Error ? e.message : 'Não foi possível registrar a rodada.';
		}
	}

	function togglePlay() {
		if (!data || phase === 'done' || phase === 'saving' || phase === 'saved') return;
		started = true;
		paused = !paused;
	}

	function skipToResult() {
		// "Resultado": corre sem desenhar até a próxima parada obrigatória (intervenção, intervalo ou fim).
		started = true;
		paused = false;
		let guard = 0;
		while (guard++ < 12_000 && !command && !queue.length && phase !== 'interval' && phase !== 'done') {
			if (!advance()) break;
		}
		version++;
	}

	function onKey(e: KeyboardEvent) {
		if ((e.target as HTMLElement)?.closest('input,textarea,select,dialog,[role=dialog]')) return;
		if (e.code === 'Space') {
			e.preventDefault();
			togglePlay();
		}
	}

	// ── dados de tela (recalculados com `version`)
	const minute = (tick: number) => Math.floor(tick / 60);
	const clock = $derived.by(() => {
		void version;
		if (phase === 'interval') return 'Intervalo';
		if (phase === 'done' || phase === 'saving' || phase === 'saved') return 'Fim';
		const m = Math.min(90, minute(clockTick));
		const s = clockTick % 60;
		return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	});
	const reveal = (m: number) => (phase === 'done' || phase === 'saving' || phase === 'saved' ? Infinity : phase === 'interval' || (phase === 'first' && clockTick >= HALF) ? 45 : minute(clockTick));
	const humanClubs = $derived(new Set(lives.flatMap((l) => l.coaches.map((c) => (c.side === 'home' ? l.home : l.away)))));
	type Row = { key: string; competition: string; home: string; away: string; venue: Venue; hg: number; ag: number; goals: Ev[]; incidents: Inc[]; live?: Live; quick?: boolean; status: string };
	const rows = $derived.by<Row[]>(() => {
		void version;
		if (!data) return [];
		const out: Row[] = [];
		for (const l of lives) {
			const m = l.match;
			const name = (id?: string) => (id ? (m.player(id)?.shortName ?? '—') : '—');
			const goals = m.events.filter((e) => e.type === 'goal').map((e) => ({ side: e.side!, minute: minute(e.tick), player: name(e.player), ...(e.other ? { assist: name(e.other) } : {}) }));
			const incidents = m.events.filter((e) => e.type === 'yellow' || e.type === 'red' || e.type === 'injury').map((e) => ({ kind: e.type as Inc['kind'], side: e.side!, minute: minute(e.tick), player: name(e.player) }));
			out.push({ key: l.key, competition: l.competition, home: l.home, away: l.away, venue: l.venue, hg: m.score.home, ag: m.score.away, goals, incidents, live: l, status: m.finished ? 'Fim' : m.phase === 'half_time' ? 'Int.' : m.clock() });
		}
		for (const o of data.others) {
			const r = reveal(0);
			const goals = o.goals.filter((g) => Math.min(g.minute, g.minute < 45 ? 44 : 89) < r || r === Infinity);
			const shown = (side: Side) => (o.quick ? (r === Infinity ? (side === 'home' ? o.homeGoals : o.awayGoals) : 0) : goals.filter((g) => g.side === side).length);
			out.push({ key: `${o.competition}:${o.home}:${o.away}`, competition: o.competition, home: o.home, away: o.away, venue: o.venue, hg: shown('home'), ag: shown('away'), goals, incidents: o.incidents.filter((x) => x.minute < r || r === Infinity), quick: o.quick, status: o.quick && r !== Infinity ? 'no apito final' : '' });
		}
		return out;
	});
	const groups = $derived.by(() => {
		const map = new Map<string, Row[]>();
		for (const r of rows) map.set(r.competition, [...(map.get(r.competition) ?? []), r]);
		// Competições com treinadores primeiro.
		return [...map.entries()].sort(([, a], [, b]) => Number(b.some((r) => r.live)) - Number(a.some((r) => r.live)));
	});
	const label = (c: string) => (c === 'copa-do-brasil' ? 'Copa do Brasil' : (DIVISION_LABELS[c as DivisionId] ?? c));
	const current = $derived(queue[0] ?? null);
	const presetsFor = (index: number) => coaches[index]?.data.tacticPresets ?? [];
	const coachIndex = (l: Live, side: Side) => l.coaches.find((c) => c.side === side)?.index ?? 0;
</script>

<svelte:window onkeydown={onKey} />

<section class="center" aria-label="Central da rodada">
	<header>
		<div>
			<span class="eyebrow">BRASFC · Central da rodada</span>
			<h1>{data ? (data.kind === 'cup' ? 'Copa do Brasil' : `Rodada ${data.round}`) : 'Montando a rodada…'}</h1>
		</div>
		<div class="ctrl">
			<Button variant="primary" size="sm" icon={paused ? 'play' : 'pause'} disabled={!data || phase === 'interval' || phase === 'done' || phase === 'saving' || phase === 'saved'} onclick={togglePlay}>{paused ? (started ? 'Continuar' : 'Iniciar') : 'Pausar'}</Button>
			<Segmented label="Velocidade" options={SPEEDS.map((s) => ({ value: s.value, label: s.label }))} bind:value={speed} />
			<Button variant="ghost" size="sm" icon="skip" disabled={!data || phase === 'interval' || phase === 'done' || phase === 'saving' || phase === 'saved'} onclick={skipToResult}>{phase === 'first' ? 'Ir ao intervalo' : 'Resultado'}</Button>
		</div>
		<div class="clock" aria-live="off"><strong>{clock}</strong><small>{phase === 'first' ? '1º tempo' : phase === 'second' ? '2º tempo' : phase === 'interval' ? 'Simulação pausada' : 'Encerrado'}{paused && (phase === 'first' || phase === 'second') && started ? ' · pausado' : ''}</small></div>
	</header>

	{#if loadError}
		<p class="err" role="alert">{loadError}</p>
	{:else if !data}
		<p class="muted">Simulando os demais jogos pelo motor…</p>
	{:else}
		{#if phase === 'interval'}
			<ol class="ht" aria-label="Intervalo sequencial">
				{#each halftime as h (h.index + ':' + h.side)}
					<li class:done={halftimeDone.includes(h.index)} class:on={command?.live === h.live && command.side === h.side}>
						<Crest clubId={h.side === 'home' ? h.live.home : h.live.away} size={22} />
						<strong>{h.coach}</strong>
						<span>{halftimeDone.includes(h.index) ? 'Alterações confirmadas' : command?.live === h.live && command.side === h.side ? 'Realizando alterações' : 'Aguardando a vez'}</span>
						<b>{h.live.match.score.home} — {h.live.match.score.away}</b>
					</li>
				{/each}
			</ol>
		{/if}
		{#each groups as [comp, list] (comp)}
			<div class="comp">
				<h2>{label(comp)}</h2>
				<div class="table">
					{#each list as r (r.key)}
						{@const mineH = r.live?.coaches.find((c) => c.side === 'home')}
						{@const mineA = r.live?.coaches.find((c) => c.side === 'away')}
						<div class="row" class:human={!!r.live}>
							<span class="venue" title={r.venue.stadium}>{r.venue.stadium}{#if r.venue.attendance} · {r.venue.attendance.toLocaleString('pt-BR')}{/if}</span>
							{#if mineH && r.live}
								<button type="button" class="club home me" style:--c={getClub(r.home)?.colors.primary} onclick={() => openCommand(r.live!, 'home')} title="Pausar e abrir o comando tático de {mineH.name}">
									<small>{mineH.name}</small><span>{getClub(r.home)?.name}</span><Crest clubId={r.home} size={20} /><Icon name="tactics" size={14} />
								</button>
							{:else}
								<span class="club home" class:human-club={humanClubs.has(r.home)}><span>{getClub(r.home)?.name}</span><Crest clubId={r.home} size={20} /></span>
							{/if}
							<span class="score"><b>{r.hg}</b><i>—</i><b>{r.ag}</b>{#if r.status}<small>{r.status}</small>{/if}</span>
							{#if mineA && r.live}
								<button type="button" class="club away me" style:--c={getClub(r.away)?.colors.primary} onclick={() => openCommand(r.live!, 'away')} title="Pausar e abrir o comando tático de {mineA.name}">
									<Icon name="tactics" size={14} /><Crest clubId={r.away} size={20} /><span>{getClub(r.away)?.name}</span><small>{mineA.name}</small>
								</button>
							{:else}
								<span class="club away"><Crest clubId={r.away} size={20} /><span>{getClub(r.away)?.name}</span></span>
							{/if}
							<span class="events">
								{#each r.goals as g, i (i)}<span class="g" data-side={g.side}>⚽ {g.minute + 1}' {g.player}{#if g.assist} <small>(assist. {g.assist})</small>{/if}</span>{/each}
								{#each r.incidents as x, i (i)}<span class="x {x.kind}" data-side={x.side} title={x.kind === 'injury' ? 'Lesão' : x.kind === 'red' ? 'Expulsão' : 'Amarelo'}><i></i>{x.minute + 1}' {x.player}</span>{/each}
							</span>
						</div>
					{/each}
				</div>
			</div>
		{/each}
		{#if phase === 'saving'}<p class="muted">Registrando a rodada no save…</p>{/if}
		{#if phase === 'error'}<p class="err" role="alert">{saveError} <Button size="sm" onclick={save}>Tentar de novo</Button></p>{/if}
	{/if}
</section>

{#if current && !command}
	{@const p = current.live.match.player(current.player)}
	{@const onField = current.live.match.onPitch(current.side).length}
	<div class="popup" use:portal role="alertdialog" aria-modal="true" aria-labelledby="iv-title">
		<div class="box">
			<div class="head" class:red={current.kind === 'red'}>
				<span class="ic"><Icon name="alert" size={22} /></span>
				<div>
					<small>{current.kind === 'red' ? 'Cartão vermelho' : 'Lesão'} · {current.minute}</small>
					<h3 id="iv-title">{current.kind === 'red' ? 'Jogador expulso!' : 'Atleta lesionado!'}</h3>
					<span>{current.coach} · {getClub(current.side === 'home' ? current.live.home : current.live.away)?.name}</span>
				</div>
			</div>
			<div class="player">
				<Crest clubId={current.side === 'home' ? current.live.home : current.live.away} size={40} />
				<div><strong>{p?.name ?? '—'}</strong><small>{p?.position ?? ''} · {current.kind === 'red' ? (current.secondYellow ? 'Segundo amarelo' : 'Expulsão direta') : 'Sem condições ideais de jogo'}</small></div>
				<b>{current.live.match.score.home} — {current.live.match.score.away}</b>
			</div>
			<div class="note">
				{#if current.kind === 'red'}<strong>Sua equipe está com {onField} jogadores.</strong>{:else}<strong>{current.live.match.subsLeft(current.side)} substituições restantes.</strong>{/if}
				<span>Reorganize a formação, faça substituições ou mude a estratégia antes de continuar.</span>
			</div>
			<Button variant="primary" size="lg" onclick={() => resolveIntervention(true)}>Reorganizar equipe</Button>
			<Button variant="secondary" onclick={() => resolveIntervention(false)}>Continuar sem alterações</Button>
		</div>
	</div>
{/if}

{#if command}
	<TacticCommand match={command.live.match} side={command.side} {version} coach={command.coach} title={command.title}
		presets={presetsFor(coachIndex(command.live, command.side))}
		onclose={phase === 'interval' ? undefined : () => closeCommand(false)} onconfirm={() => closeCommand(true)} />
{/if}

<style>
	.center { display: grid; gap: 12px; }
	header { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 16px; padding: 12px 16px; border-radius: 14px; background: #1C252B; box-shadow: inset 0 0 0 1px var(--line); position: sticky; top: 0; z-index: 5; }
	.eyebrow { font-size: 12px; color: var(--emerald-strong, #34d399); letter-spacing: .06em; text-transform: uppercase; }
	h1 { margin: 2px 0 0; font-size: var(--fs-xl); }
	.ctrl { display: flex; align-items: center; gap: 8px; }
	.clock { display: grid; justify-items: end; }
	.clock strong { font-size: 30px; color: #10B981; font-variant-numeric: tabular-nums; line-height: 1; }
	.clock small { color: var(--text-3); font-size: 12px; }
	.comp h2 { margin: 6px 0 4px; font-size: 13px; letter-spacing: .06em; text-transform: uppercase; color: var(--text-2); }
	.table { display: grid; border-radius: 12px; overflow: hidden; background: #151c21; box-shadow: inset 0 0 0 1px var(--line); }
	.row { display: grid; grid-template-columns: minmax(120px, 190px) minmax(0, 1fr) 92px minmax(0, 1fr) minmax(160px, 1.3fr); align-items: center; gap: 10px; padding: 5px 10px; min-height: 36px; font-size: 13px; border-top: 1px solid rgb(255 255 255 / .04); }
	.row:first-child { border-top: 0; }
	.row.human { background: rgb(16 185 129 / .06); }
	.venue { color: var(--text-3); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.club { display: flex; align-items: center; gap: 6px; min-width: 0; }
	.club span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
	.club.home { justify-content: flex-end; text-align: right; }
	.club small { color: #E7EDF0; opacity: .8; font-size: 11px; white-space: nowrap; }
	button.club { border: 0; border-radius: 8px; padding: 4px 8px; color: #fff; background: color-mix(in srgb, var(--c) 70%, #101418); cursor: pointer; font: inherit; box-shadow: inset 0 0 0 1px rgb(255 255 255 / .15); }
	button.club:hover, button.club:focus-visible { box-shadow: inset 0 0 0 2px #E8B86A; }
	.human-club span { color: var(--emerald-strong); }
	.score { display: flex; align-items: center; justify-content: center; gap: 6px; font-variant-numeric: tabular-nums; position: relative; }
	.score b { font-size: 16px; min-width: 1.2ch; text-align: center; }
	.score i { color: var(--text-3); font-style: normal; }
	.score small { position: absolute; bottom: -12px; font-size: 10px; color: var(--text-3); white-space: nowrap; }
	.events { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 11.5px; color: var(--text-2); min-width: 0; }
	.events small { color: var(--text-3); }
	.x { display: inline-flex; align-items: center; gap: 3px; }
	.x i { width: 7px; height: 10px; border-radius: 1px; background: #facc15; }
	.x.red i { background: #ef4444; }
	.x.injury i { width: 9px; height: 9px; border-radius: 2px; background: #fff; box-shadow: inset 0 0 0 3px #ef4444; }
	.ht { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
	.ht li { display: grid; grid-template-columns: auto auto 1fr auto; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 10px; background: #1C252B; box-shadow: inset 0 0 0 1px var(--line); }
	.ht li span { color: var(--text-3); font-size: 13px; }
	.ht li.on { box-shadow: inset 0 0 0 1px #10B981; background: rgb(16 185 129 / .1); }
	.ht li.on span { color: #34d399; }
	.ht li.done span { color: var(--text-2); }
	.muted { color: var(--text-3); }
	.err { color: var(--danger); }
	.popup { position: fixed; inset: 0; z-index: 790; display: grid; place-items: center; background: rgb(6 9 11 / .7); }
	.box { width: min(560px, calc(100vw - 32px)); display: grid; gap: 12px; padding: 20px; border-radius: 16px; background: #1C252B; box-shadow: 0 24px 60px #000a; }
	.head { display: flex; gap: 12px; align-items: center; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
	.head .ic { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 10px; background: #E8B86A; color: #101418; }
	.head.red .ic { background: #b91c1c; color: #fff; }
	.head small { color: #f87171; text-transform: uppercase; font-size: 12px; letter-spacing: .06em; }
	.head h3 { margin: 2px 0; font-size: var(--fs-xl); }
	.head span { color: var(--text-3); font-size: 13px; }
	.player { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; }
	.player div { display: grid; }
	.player small { color: var(--text-3); }
	.note { display: grid; gap: 4px; padding: 12px; border-radius: 10px; background: #101418; font-size: 13px; color: var(--text-3); }
	.note strong { color: #E7EDF0; }
	@media (max-width: 1100px) { .row { grid-template-columns: minmax(0, 1fr) 80px minmax(0, 1fr); } .venue, .events { grid-column: 1 / -1; } }
</style>
