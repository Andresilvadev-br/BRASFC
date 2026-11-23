<script lang="ts">
	import { positionFit, type Position } from '#lib/domain/positions.ts';
	import { FORMATIONS, MENTALITY_LABELS, STYLE_LABELS } from '#lib/domain/tactics.ts';
	import { reposition } from '../tactics/reposition.ts';
	import type { Match } from '#lib/engine/match.ts';
	import type { PlayerStats, Side } from '#lib/engine/types.ts';

	/**
	 * Time em campo desenhado na formação: cada ficha junta nome, posição, nota e
	 * condição física no lugar onde o atleta joga. O banco fica logo abaixo.
	 * Tocar numa ficha destaca o atleta no campo; no seu time, depois de escolher
	 * quem sai, tocar num reserva faz a substituição.
	 */
	let {
		match,
		side,
		version,
		players,
		selected = $bindable(null),
		canSub = false,
		compact = false,
		pendingOut = [],
		color: kit,
		onsub,
		onswap,
		onmove
	}: {
		match: Match;
		side: Side;
		version: number;
		players: Record<string, PlayerStats>;
		selected?: string | null;
		canSub?: boolean;
		compact?: boolean;
		pendingOut?: string[];
		/** cor do uniforme em uso (resolve choque de cores) */
		color?: string;
		/** `slot`: vaga aberta por expulsão onde o reserva deve entrar (ausente = posição de quem sai) */
		onsub?: (outId: string, inId: string, slot?: number) => void;
		onswap?: (first: string, second: string) => void;
		/** leva um atleta em campo para uma vaga aberta (reorganizar com 10) */
		onmove?: (playerId: string, slot: number) => void;
	} = $props();

	const team = $derived.by(() => {
		void version;
		return match.teams[side];
	});
	const slots = $derived.by(() => {
		void version;
		const t = match.teams[side];
		const shape = FORMATIONS[t.tactic.formation];
		return t.tactic.lineup.map((id, i) => ({ id, pos: shape[i]?.position ?? '', x: shape[i]?.x ?? 50, y: shape[i]?.y ?? 50, st: match.states.get(id) }));
	});
	const bench = $derived.by(() => {
		void version;
		return match.bench(side);
	});
	const subsLeft = $derived.by(() => {
		void version;
		return match.subsLeft(side);
	});
	const mineSelected = $derived(!!selected && slots.some((s) => s.id === selected && s.st?.onPitch));
	// Vagas: posições do desenho sem ninguém em campo (expulsão sem substituição).
	const onPitchCount = $derived.by(() => {
		void version;
		return match.onPitch(side).length;
	});
	const sentOff = $derived.by(() => {
		void version;
		return [...match.states.values()].filter((st) => st.side === side && st.sentOff).length;
	});
	const vacant = $derived.by(() => {
		void version;
		const taken = new Set(match.onPitch(side).map((st) => st.slot));
		return slots.map((s, i) => ({ ...s, i })).filter((s) => !taken.has(s.i));
	});
	/** Vaga mais adequada à posição do reserva, se ela encaixar melhor que a posição de quem sai. */
	function slotFor(outId: string, inId: string): number | undefined {
		if (!vacant.length) return undefined;
		const incoming = match.player(inId);
		const out = slots.find((s) => s.id === outId);
		if (!incoming || !out) return undefined;
		const best = [...vacant].sort((a, b) => positionFit(incoming.position, b.pos as Position) - positionFit(incoming.position, a.pos as Position))[0];
		return positionFit(incoming.position, best.pos as Position) > positionFit(incoming.position, out.pos as Position) ? best.i : undefined;
	}
	// Auxiliar técnico: sugestão após expulsão na defesa (nunca executada sem o treinador).
	const advice = $derived.by(() => {
		if (!onsub || !canSub) return null;
		const hole = vacant.find((v) => ['ZAG', 'LD', 'LE', 'VOL'].includes(v.pos));
		if (!hole) return null;
		const attacker = slots.filter((s) => s.st?.onPitch && ['ATA', 'PD', 'PE', 'MEI'].includes(s.pos)).sort((a, b) => (a.st?.condition ?? 0) - (b.st?.condition ?? 0))[0];
		const defender = bench.filter((b) => b.position !== 'GOL').sort((a, b) => positionFit(b.position, hole.pos as Position) - positionFit(a.position, hole.pos as Position))[0];
		if (!attacker || !defender || positionFit(defender.position, hole.pos as Position) < 0.6) return null;
		return { hole, attacker, defender };
	});
	const color = $derived(kit ?? team.setup.colors.primary);

	function rating(id: string) {
		return players[id]?.rating ?? 6;
	}
	function tone(r: number) {
		return r >= 7.5 ? 'great' : r >= 6.8 ? 'good' : r >= 6 ? 'ok' : 'bad';
	}
	function swap(first: string, second: string) {
		onswap?.(first, second);
		selected = null;
	}
	function pickVacant(i: number) {
		if (onmove && mineSelected && selected) {
			onmove(selected, i);
			selected = null;
		}
	}
	function pick(id: string) {
		if (onswap && mineSelected && selected && selected !== id && slots.some((slot) => slot.id === id && slot.st?.onPitch)) {
			swap(selected, id);
		} else selected = selected === id ? null : id;
	}
</script>

<section class="board" class:compact style="--team:{color}" aria-label="Time {team.setup.name} em campo">
	<header>
		<strong>{team.setup.short}</strong>
		<span>{team.tactic.formation} · {MENTALITY_LABELS[team.tactic.mentality]} · {STYLE_LABELS[team.tactic.style]}</span>
		{#if sentOff}<span class="tenmen" role="status">{onPitchCount} jogadores em campo — {sentOff} {sentOff === 1 ? 'expulso' : 'expulsos'}</span>{/if}
	</header>
	{#if advice}
		<div class="advice" role="note">
			<span><b>Auxiliar:</b> a vaga de {advice.hole.pos} ficou aberta. Recomendo tirar {match.player(advice.attacker.id)?.shortName} e colocar {advice.defender.shortName} na defesa.</span>
			<button onclick={() => onsub?.(advice.attacker.id, advice.defender.id, advice.hole.i)}>Fazer a troca</button>
		</div>
	{/if}

	<div class="field" use:reposition={{ move: onswap ? swap : undefined }}>
		<span class="mid"></span>
		<span class="box"></span>
		{#each vacant as h (h.i)}
			<button class="chip vaga" class:target={!!onmove && mineSelected} style="left:{h.x}%;top:{h.y}%" disabled={!(onmove && mineSelected)} onclick={() => pickVacant(h.i)}
				aria-label="Vaga aberta: {h.pos}{onmove && mineSelected ? ' — toque para levar o atleta selecionado' : ''}" title="Vaga aberta ({h.pos})">
				<span class="top"><span class="pos">{h.pos}</span></span>
				<span class="nm">Vaga</span>
			</button>
		{/each}
		{#each slots as s, si (si)}
			{#if s.st?.onPitch}
			{@const p = match.player(s.id)}
			{@const r = rating(s.id)}
			{@const st = s.st}
			<button
				class="chip"
				class:sel={selected === s.id}
				class:out={pendingOut.includes(s.id)}
				class:off={st && !st.onPitch}
				style="left:{s.x}%;top:{s.y}%"
				onclick={() => pick(s.id)}
				aria-pressed={selected === s.id}
				data-reposition={onswap && s.st?.onPitch ? s.id : undefined}
				title="{p?.name} · {s.pos} · nota {r.toFixed(1)} · condição {Math.round(st?.condition ?? 0)}%"
			>
				<span class="top">
					<span class="pos">{s.pos}</span>
					<span class="rt {tone(r)}">{r.toFixed(1)}</span>
				</span>
				<span class="nm">
					{p?.shortName}
					{#if players[s.id]?.goals}<i class="ic" aria-label="gols">{'⚽'.repeat(Math.min(3, players[s.id].goals))}</i>{/if}
					{#if st?.sentOff}<i class="card r" aria-label="expulso"></i>{:else if st?.yellow}<i class="card y" aria-label="amarelo"></i>{/if}
					{#if st?.injured}<i class="inj" aria-label="lesionado">✚</i>{/if}
				</span>
				<span class="cond"><span style="width:{st?.condition ?? 0}%" class:low={(st?.condition ?? 100) < 60}></span></span>
			</button>
			{/if}
		{/each}
	</div>

	<div class="bench">
		{#if onswap}<small class="lbl">Arraste um atleta ou toque em dois titulares para trocar posições.</small>{/if}
		<span class="lbl">
			{#if vacant.length && onmove && mineSelected}
				Toque numa <b>vaga</b> para levar <b>{match.player(selected!)?.shortName}</b> até ela, ou num reserva para substituí-lo{vacant.length ? ' (o reserva entra na vaga que combina com a posição dele)' : ''}
			{:else if canSub && mineSelected}
				Toque num reserva para entrar no lugar de <b>{match.player(selected!)?.shortName}</b>
			{:else if canSub}
				Banco · toque em quem sai e depois em quem entra ({subsLeft} {subsLeft === 1 ? 'troca' : 'trocas'})
			{:else}
				Banco
			{/if}
		</span>
		<div class="tokens">
			{#each bench as b (b.id)}
				<button
					class="tok"
					class:ready={canSub && mineSelected}
					disabled={!(canSub && mineSelected)}
					onclick={() => {
						if (selected) onsub?.(selected, b.id, slotFor(selected, b.id));
						selected = null;
					}}
					title="{b.name} · {b.position}"
				>
					<span class="pos">{b.position}</span>
					<span class="nm">{b.shortName}</span>
				</button>
			{:else}
				<span class="empty">Sem reservas</span>
			{/each}
		</div>
	</div>
</section>

<style>
	.tenmen { color: #fca5a5; font-weight: 700; font-size: var(--fs-xs); }
	.advice { display: flex; gap: 8px; align-items: center; justify-content: space-between; padding: 8px 10px; border-radius: 10px; background: rgb(59 130 246 / 0.12); font-size: var(--fs-xs); }
	.advice button { flex: none; padding: 6px 10px; border-radius: 8px; border: 1px solid rgb(59 130 246 / 0.5); background: rgb(59 130 246 / 0.2); color: inherit; cursor: pointer; }
	.chip.vaga { border: 1px dashed rgb(239 68 68 / 0.7); background: rgb(239 68 68 / 0.12); opacity: 0.9; }
	.chip.vaga.target { border-color: #fbbf24; background: rgb(251 191 36 / 0.18); animation: blink 1s ease-in-out infinite alternate; }
	@keyframes blink { to { opacity: 0.6; } }
	@media (prefers-reduced-motion: reduce) { .chip.vaga.target { animation: none; } }
	.board {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px;
		border-radius: 14px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line), inset 0 3px 0 var(--team);
		min-width: 0;
	}
	header {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	header strong {
		font-family: var(--font-display);
		font-size: var(--fs-lg);
	}
	header span {
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.field {
		position: relative;
		aspect-ratio: 3 / 4;
		border-radius: 10px;
		background: repeating-linear-gradient(180deg, #113d2c 0 12.5%, #0f3828 12.5% 25%);
		box-shadow: inset 0 0 0 1px rgb(231 237 240 / 0.18);
	}
	.mid {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		border-top: 1px solid rgb(231 237 240 / 0.2);
	}
	.box {
		position: absolute;
		left: 26%;
		right: 26%;
		bottom: 0;
		height: 15%;
		border: 1px solid rgb(231 237 240 / 0.2);
		border-bottom: 0;
	}
	.chip {
		position: absolute;
		transform: translate(-50%, -50%);
		width: clamp(56px, 22%, 72px);
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 3px 4px 4px;
		border: 0;
		border-radius: 7px;
		background: rgb(16 20 24 / 0.88);
		box-shadow: inset 0 2px 0 var(--team), 0 2px 6px rgb(0 0 0 / 0.35);
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition: transform 0.15s ease, box-shadow 0.15s ease;
	}
	.chip[data-reposition] { cursor: grab; touch-action: none; }
	.field:global([data-dragging-position]) .chip[data-reposition] { cursor: grabbing; }
	.chip:hover {
		transform: translate(-50%, -50%) scale(1.06);
		z-index: 2;
	}
	.chip.sel {
		box-shadow: inset 0 2px 0 var(--team), 0 0 0 2px var(--emerald-strong);
		z-index: 3;
	}
	.chip.out {
		box-shadow: inset 0 2px 0 var(--team), 0 0 0 2px var(--info);
	}
	.chip.off {
		opacity: 0.45;
	}
	.top {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.pos {
		font-size: 11px;
		font-weight: 800;
		color: var(--text-3);
		letter-spacing: 0.03em;
	}
	.rt {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 12px;
		line-height: 1;
		padding: 1px 3px;
		border-radius: 4px;
		font-variant-numeric: tabular-nums;
	}
	.rt.great {
		background: var(--emerald);
		color: #06281c;
	}
	.rt.good {
		color: var(--emerald-strong);
	}
	.rt.ok {
		color: var(--text-2);
	}
	.rt.bad {
		color: var(--danger);
	}
	.nm {
		font-size: 11px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		line-height: 1.15;
	}
	.ic {
		font-style: normal;
		font-size: 11px;
	}
	.inj {
		font-style: normal;
		color: var(--danger);
		font-size: 11px;
	}
	.card {
		display: inline-block;
		width: 6px;
		height: 8px;
		border-radius: 1px;
		margin-left: 2px;
		vertical-align: 0;
	}
	.card.y {
		background: var(--warning);
	}
	.card.r {
		background: var(--danger);
	}
	.cond {
		height: 3px;
		border-radius: 2px;
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
	.bench {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.lbl {
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.lbl b {
		color: var(--emerald-strong);
	}
	.tokens {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.tok {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		width: 60px;
		padding: 3px 5px;
		border: 0;
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--text-2);
		font: inherit;
		cursor: default;
	}
	.tok .nm {
		max-width: 100%;
		font-size: 11px;
	}
	.board.compact {
		display: grid;
		grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
		gap: 10px;
		align-items: start;
		margin-top: 8px;
	}
	.compact header {
		grid-column: 1 / -1;
		flex-flow: row wrap;
		align-items: baseline;
		gap: 2px 8px;
	}
	.compact .field {
		aspect-ratio: auto;
		height: clamp(235px, 41dvh, 330px);
	}
	.compact .chip {
		width: clamp(48px, 21%, 72px);
	}
	.compact .tokens {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(76px, 1fr));
	}
	.compact .tok {
		width: 100%;
		min-width: 0;
		min-height: 34px;
	}
	@media (max-width: 630px) {
		.board.compact { grid-template-columns: minmax(0, 1fr); }
		.compact .field { height: clamp(220px, 34dvh, 275px); }
	}
	.tok.ready {
		cursor: pointer;
		background: var(--emerald-soft);
		color: var(--text);
		box-shadow: inset 0 0 0 1px var(--emerald-line);
	}
	.tok.ready:hover {
		background: var(--emerald);
		color: #06281c;
	}
	.tok:disabled {
		opacity: 0.75;
	}
	.empty {
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
</style>
