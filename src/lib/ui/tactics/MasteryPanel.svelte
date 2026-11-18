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
</style>
