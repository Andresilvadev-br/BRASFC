<script lang="ts">
	import { MASTERY_LABEL, type TacticalState } from '#lib/domain/tactical.ts';
	import { FORMATION_IDS, STYLE_LABELS, type FormationId, type PlayStyle } from '#lib/domain/tactics.ts';

	/**
	 * Domínio tático em linguagem simples: o quanto o time sabe executar o plano atual
	 * e a comparação entre formações (o que já foi aprendido não some ao trocar).
	 */
	let {
		state: st,
		mastery,
		formation,
		style,
		onformation
	}: {
		state: TacticalState;
		mastery: { formation: number; style: number; instructions: number; cohesion: number; execution: number };
		formation: FormationId;
		style: PlayStyle;
		onformation?: (f: FormationId) => void;
	} = $props();

	const rows = $derived([
		{ label: `Formação ${formation}`, v: mastery.formation, tip: 'Cresce jogando e treinando o mesmo esquema.' },
		{ label: `Estilo: ${STYLE_LABELS[style]}`, v: mastery.style, tip: 'Cresce com jogos e treinos do mesmo estilo.' },
		{ label: 'Instruções', v: mastery.instructions, tip: 'Cai um pouco a cada instrução alterada e volta com o tempo.' },
		{ label: 'Entrosamento dos titulares', v: mastery.cohesion, tip: 'Quem joga junto se entende melhor; novatos começam baixo.' }
	]);
	const tone = (v: number) => (v >= 70 ? 'hi' : v >= 45 ? 'mid' : 'lo');
	// Evolução real (execução registrada em cada jogo) e domínio individual das funções.
	const exec = $derived(st.history.slice(-20).map((h) => h.execution));
	const best = $derived(FORMATION_IDS.reduce((a, b) => ((st.formations[b] ?? 0) > (st.formations[a] ?? 0) ? b : a), formation));
	/** Jogos estimados para a formação atual alcançar a mais dominada (mesma curva do aprendizado por jogo). */
	const adaptGames = $derived.by(() => {
		let v = st.formations[formation] ?? 20;
		const target = (st.formations[best] ?? 20) - 2;
		let n = 0;
		while (v < target && n < 99) {
			v += 3.2 * Math.pow(1 - v / 100, 1.3);
			n++;
		}
		return n;
	});
	const rolesKnown = $derived(Object.values(st.roles).filter((r) => Object.values(r).some((x) => (x ?? 0) >= 65)).length);
</script>

<div class="mp">
	<div class="exec">
		<span class="big">{Math.round(mastery.execution)}</span>
		<div>
			<strong>{MASTERY_LABEL(mastery.execution)}</strong>
			<p>Execução do plano em campo: posicionamento, sincronia e leitura das instruções. Não garante resultado — melhora a qualidade das decisões.</p>
		</div>
	</div>
	{#each rows as r (r.label)}
		<div class="bar" title={r.tip}>
			<span class="l">{r.label}</span>
			<span class="track"><span class="fill {tone(r.v)}" style="width:{r.v}%"></span></span>
			<span class="n">{Math.round(r.v)}</span>
		</div>
	{/each}
	{#if exec.length >= 2}
		<div class="evo">
			<span class="l">Execução nos últimos {exec.length} jogos</span>
			<svg viewBox="0 0 200 40" role="img" aria-label="Evolução da execução">
				<polyline points={exec.map((e, i) => `${(i / (exec.length - 1)) * 200},${38 - ((e - 30) / 60) * 36}`).join(' ')} />
			</svg>
			<span class="n">{exec[0]} → {exec[exec.length - 1]}</span>
		</div>
	{/if}
	<p class="ind">Domínio individual: <strong>{rolesKnown}</strong> atleta(s) com alguma função dominada (65+).</p>
	{#if best !== formation && adaptGames > 0}
		<p class="adapt">O time domina mais o <strong>{best}</strong> ({Math.round(st.formations[best])}). No {formation}, a adaptação leva cerca de <strong>{adaptGames} jogo(s)</strong> — o que foi aprendido no {best} não se perde de uma vez.</p>
	{/if}
	<h4>Comparar formações</h4>
	<div class="forms">
		{#each FORMATION_IDS as f (f)}
			{@const v = st.formations[f] ?? 0}
			<button class="f" class:on={f === formation} onclick={() => onformation?.(f)} disabled={!onformation} aria-pressed={f === formation} title="{f}: domínio {Math.round(v)}">
				<span class="col"><span class="fill {tone(v)}" style="height:{v}%"></span></span>
				<span class="fl">{f}</span>
				<span class="fn">{Math.round(v)}</span>
			</button>
		{/each}
	</div>
</div>

<style>
	.mp {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.exec {
		display: flex;
		gap: 12px;
		align-items: center;
		padding-bottom: 4px;
	}
	.big {
		font-family: var(--font-display);
		font-size: 44px;
		line-height: 1;
		color: var(--emerald-strong);
	}
	.exec p {
		margin: 2px 0 0;
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.bar {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) 2fr 28px;
		gap: 8px;
		align-items: center;
		font-size: var(--fs-xs);
	}
	.l {
		color: var(--text-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.track {
		height: 7px;
		border-radius: 4px;
		background: var(--surface-3);
		overflow: hidden;
	}
	.fill {
		display: block;
		height: 100%;
		border-radius: 4px;
		transition: width 0.5s ease, height 0.5s ease;
	}
	.fill.hi {
		background: var(--emerald);
	}
	.fill.mid {
		background: var(--gold);
	}
	.fill.lo {
		background: var(--danger);
	}
	.n {
		text-align: right;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
	}
	h4 {
		margin: 8px 0 0;
		font-size: var(--fs-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-3);
	}
	.forms {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 4px;
	}
	.f {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		padding: 6px 2px;
		border: 0;
		border-radius: 8px;
		background: var(--surface-2);
		color: var(--text-2);
		font: inherit;
		cursor: pointer;
	}
	.f:disabled {
		cursor: default;
	}
	.f.on {
		box-shadow: inset 0 0 0 2px var(--emerald);
		color: var(--text);
	}
	.col {
		display: flex;
		align-items: flex-end;
		width: 10px;
		height: 48px;
		border-radius: 4px;
		background: var(--surface-3);
		overflow: hidden;
	}
	.col .fill {
		width: 100%;
	}
	.fl {
		font-size: 10.5px;
		font-weight: 700;
	}
	.fn {
		font-size: 10px;
		color: var(--text-3);
	}
	.evo {
		display: grid;
		grid-template-columns: 1fr 120px auto;
		gap: 8px;
		align-items: center;
		font-size: var(--fs-sm);
		margin-top: 10px;
	}
	.evo svg {
		width: 120px;
		height: 30px;
	}
	.evo polyline {
		fill: none;
		stroke: #10b981;
		stroke-width: 2;
	}
	.ind,
	.adapt {
		font-size: var(--fs-sm);
		margin: 8px 0 0;
		color: var(--text-2);
	}
	.adapt {
		padding: 8px 10px;
		border-radius: 10px;
		background: rgb(232 184 106 / 0.1);
	}
</style>
