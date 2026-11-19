<script lang="ts">
	import { clubAction } from '#lib/client/club.ts';
	import { formatMoney } from '#lib/domain/market.ts';
	import { STAFF_ROLES, type StaffRole } from '#lib/domain/staff.ts';
	import { reveal } from '#lib/motion/actions.ts';
	import { notify } from '#lib/stores/island.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Sheet from '#lib/ui/v4/Sheet.svelte';

	let { data } = $props();
	const c = $derived(data.career);
	const ov = $derived(data.office);
	let picking = $state<StaffRole | null>(null);
	let open = $state(false);
	let busy = $state(false);
	let err = $state('');

	async function act(body: Record<string, unknown>) {
		busy = true;
		err = '';
		try {
			const r = await clubAction(c.id, c.version, body);
			notify({ icon: 'check', tone: 'success', title: 'Comissão técnica', detail: r.message });
			open = false;
		} catch (e) {
			err = (e as Error).message;
		} finally {
			busy = false;
		}
	}
	function pick(role: StaffRole) {
		picking = role;
		err = '';
		open = true;
	}
	// Efeito de cada cargo em números (o mesmo cálculo usado pelo servidor).
	const effectLine = (role: StaffRole): string => {
		const e = ov.effects;
		const pct = (v: number) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`;
		switch (role) {
			case 'auxiliar':
				return `aprendizado tático ${pct(e.tacticalLearning)}`;
			case 'preparador':
				return `recuperação física ${pct(e.fitnessRecovery)}`;
			case 'goleiros':
				return `evolução dos goleiros ${pct(e.gkDevelopment)}`;
			case 'analista':
				return `preparação para o adversário ×${e.opponentPrep.toFixed(1)}`;
			case 'fisio':
				return `recuperação de quem está abaixo de 70% ${pct(e.physio)}`;
			case 'coordBase':
				return `evolução da base ${pct(e.youthDevelopment)}`;
			case 'chefeObs':
				return `margem dos relatórios −${e.scoutJudgement.toFixed(1)} de julgamento`;
		}
	};
	const monthly = $derived(STAFF_ROLES.reduce((s, r) => s + (ov.staff[r]?.wage ?? 0), 0));
	const ICON: Record<StaffRole, 'tactics' | 'training' | 'shirt' | 'chart' | 'heart' | 'sparkle' | 'eye'> = { auxiliar: 'tactics', preparador: 'training', goleiros: 'shirt', analista: 'chart', fisio: 'heart', coordBase: 'sparkle', chefeObs: 'eye' };
</script>

<svelte:head><title>Comissão técnica · {data.view.club.name} · BRASFC</title></svelte:head>

<div class="page">
	<header class="head" use:reveal>
		<div>
			<span class="eyebrow-gold">Comissão técnica</span>
			<h1 class="display">Quem trabalha com você</h1>
			<p class="muted">Cada profissional muda números de verdade: treino, recuperação, base, observação e preparação. Cargo vago fica com um interino (competência 28).</p>
		</div>
		<div class="sum glass">
			<small>Folha da comissão</small>
			<strong>{formatMoney(monthly)}<span>/mês</span></strong>
			<label class="deleg">
				<input type="checkbox" checked={!!ov.office.delegated} disabled={busy} onchange={(e) => act({ action: 'treino-delegar', on: (e.currentTarget as HTMLInputElement).checked })} />
				<span>Auxiliar planeja os treinos</span>
			</label>
		</div>
	</header>

	{#if ov.advice.length}
		<section class="advice" aria-label="Recomendações da comissão">
			{#each ov.advice as a, i (a.id)}
				<a class="tip glass" href={a.href} use:reveal={{ index: i }} data-umx-surface>
					<span class="ic"><Icon name={ICON[a.role]} size={18} /></span>
					<div>
						<small>{ov.info[a.role].short}</small>
						<strong>{a.title}</strong>
						<p>{a.text}</p>
					</div>
					<Icon name="chevronRight" size={16} />
				</a>
			{/each}
		</section>
	{/if}

	<section class="board" aria-label="Cargos">
		{#each STAFF_ROLES as role, i (role)}
			{@const m = ov.staff[role]}
			{@const comp = ov.competence(role)}
			<article class="card glass" class:vacant={!m} use:reveal={{ index: i }} data-umx-surface>
				<div class="top">
					<span class="ic"><Icon name={ICON[role]} size={20} /></span>
					<div>
						<small class="role">{ov.info[role].label}</small>
						<strong>{m ? m.name : 'Cargo vago (interino)'}</strong>
						{#if m}<small class="muted">{m.age} anos · contrato até {m.until} · {formatMoney(m.wage)}/mês</small>{/if}
					</div>
				</div>
				<div class="meter" role="meter" aria-label="Competência" aria-valuenow={comp} aria-valuemin="1" aria-valuemax="100">
					<i style="--w:{comp}%"></i><span>{comp}</span>
				</div>
				<p class="eff">{ov.info[role].effect}</p>
				<p class="num"><Icon name="chart" size={14} /> {effectLine(role)}</p>
				<div class="row">
					<Button variant={m ? 'ghost' : 'primary'} size="sm" icon="user" onclick={() => pick(role)}>{m ? 'Substituir' : 'Contratar'}</Button>
					{#if m}<Button variant="ghost" size="sm" disabled={busy} onclick={() => act({ action: 'comissao-dispensar', role })}>Dispensar</Button>{/if}
				</div>
			</article>
		{/each}
	</section>
</div>

<Sheet bind:open title={picking ? ov.info[picking].label : ''} subtitle="Profissionais disponíveis nesta janela (fictícios)">
	{#if picking}
		{@const cur = ov.staff[picking]}
		<ul class="cands">
			{#each ov.candidates(picking) as cand (cand.id)}
				{@const diff = cand.competence - (cur?.competence ?? 28)}
				<li>
					<div>
						<strong>{cand.name}</strong>
						<small class="muted">{cand.age} anos · até {cand.until} · {formatMoney(cand.wage)}/mês</small>
					</div>
					<div class="cmp">
						<span class="c">{cand.competence}</span>
						<span class="d" class:up={diff > 0} class:down={diff < 0}>{diff > 0 ? '+' : ''}{diff}</span>
					</div>
					<Button variant="primary" size="sm" disabled={busy || cur?.id === cand.id} onclick={() => act({ action: 'comissao-contratar', role: picking, candidateId: cand.id })}>{cur?.id === cand.id ? 'No clube' : 'Contratar'}</Button>
				</li>
			{/each}
		</ul>
		{#if cur}<p class="muted small">Substituir {cur.name} gera rescisão de metade dos salários restantes.</p>{/if}
		{#if err}<p class="err" role="alert">{err}</p>{/if}
	{/if}
</Sheet>

<style>
	.page {
		display: grid;
		gap: var(--sp-5);
	}
	.head {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: var(--sp-4);
		align-items: end;
	}
	.sum {
		display: grid;
		gap: 4px;
		padding: var(--sp-4);
		min-width: 240px;
	}
	.sum strong {
		font: 700 1.6rem/1 'Barlow Condensed', sans-serif;
	}
	.sum strong span {
		font-size: 0.9rem;
		color: var(--text-3);
	}
	.deleg {
		display: flex;
		gap: 8px;
		align-items: center;
		margin-top: 6px;
		font-size: var(--fs-sm);
		cursor: pointer;
	}
	.deleg input {
		accent-color: #10b981;
		width: 18px;
		height: 18px;
	}
	.advice {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: var(--sp-3);
	}
	.tip {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 12px;
		align-items: center;
		padding: 14px;
		color: inherit;
		text-decoration: none;
		border-left: 3px solid var(--gold);
	}
	.tip div {
		display: grid;
		gap: 2px;
	}
	.tip small {
		color: var(--gold);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: var(--fs-xs);
	}
	.tip p {
		margin: 0;
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.ic {
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		border-radius: 12px;
		background: rgb(16 185 129 / 0.12);
		color: var(--emerald-strong);
		flex: none;
	}
	.board {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--sp-4);
	}
	.card {
		display: grid;
		gap: 10px;
		padding: var(--sp-4);
		align-content: start;
	}
	.card.vacant {
		border-style: dashed;
		opacity: 0.88;
	}
	.top {
		display: flex;
		gap: 12px;
	}
	.top div {
		display: grid;
	}
	.role {
		color: var(--text-3);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: var(--fs-xs);
	}
	.meter {
		position: relative;
		margin-top: 16px;
		height: 10px;
		border-radius: 999px;
		background: rgb(231 237 240 / 0.07);
	}
	.meter i {
		position: absolute;
		inset: 0 auto 0 0;
		width: var(--w);
		border-radius: inherit;
		background: linear-gradient(90deg, #0a7a56, #10b981 70%, #e8b86a);
		animation: grow 0.9s var(--ease-out) both;
	}
	.meter span {
		position: absolute;
		right: 0;
		top: -20px;
		font: 700 0.95rem 'Barlow Condensed', sans-serif;
	}
	@keyframes grow {
		from {
			width: 0;
		}
	}
	.eff {
		margin: 0;
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.num {
		margin: 0;
		display: flex;
		gap: 6px;
		align-items: center;
		font-size: var(--fs-sm);
		color: var(--emerald-strong);
	}
	.row {
		display: flex;
		gap: 8px;
	}
	.cands {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 10px;
	}
	.cands li {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 10px;
		align-items: center;
		padding: 10px;
		border-radius: 12px;
		background: rgb(231 237 240 / 0.04);
	}
	.cands li div:first-child {
		display: grid;
	}
	.cmp {
		display: grid;
		justify-items: end;
	}
	.c {
		font: 700 1.3rem/1 'Barlow Condensed', sans-serif;
	}
	.d {
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.d.up {
		color: var(--emerald-strong);
	}
	.d.down {
		color: var(--danger);
	}
	.err {
		color: var(--danger);
	}
	@media (max-width: 760px) {
		.head {
			grid-template-columns: 1fr;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.meter i {
			animation: none;
		}
	}
</style>
