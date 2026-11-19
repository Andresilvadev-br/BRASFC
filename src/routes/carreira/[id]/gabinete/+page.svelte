<script lang="ts">
	import { goto } from '$app/navigation';
	import { clubAction } from '#lib/client/club.ts';
	import { BOARD_PROFILES } from '#lib/domain/club.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { formatMoney } from '#lib/domain/market.ts';
	import { divLabel } from '#lib/domain/universe.ts';
	import { count, reveal } from '#lib/motion/actions.ts';
	import { notify } from '#lib/stores/island.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Crest from '#lib/ui/Crest.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Gauge from '#lib/ui/v4/Gauge.svelte';

	let { data } = $props();
	const c = $derived(data.career);
	const o = $derived(data.office.office);
	const club = $derived(data.manage.club);
	let busy = $state(false);
	let feedback = $state<{ text: string; tone: 'ok' | 'erro' } | null>(null);
	let answers = $state<Record<string, string>>({});
	let years = $state<Record<string, number>>({});

	async function act(body: Record<string, unknown>) {
		busy = true;
		feedback = null;
		try {
			const r = await clubAction(c.id, c.version, body);
			feedback = { text: r.message, tone: 'ok' };
			notify({ icon: 'check', tone: 'success', title: 'Decisão registrada', detail: r.message });
			if (body.action === 'emprego') await goto(`/carreira/${c.id}`, { invalidateAll: true });
		} catch (e) {
			feedback = { text: (e as Error).message, tone: 'erro' };
		} finally {
			busy = false;
		}
	}

	const OUTCOME: Record<string, string> = { campeao: 'Campeão', acesso: 'Acesso', queda: 'Rebaixado', permanece: 'Permaneceu', demitido: 'Demitido', saiu: 'Saiu' };
	const winRate = $derived(o.totals.games ? Math.round(((o.totals.wins * 3 + o.totals.draws) / (o.totals.games * 3)) * 100) : 0);
	// Linha do tempo: posição final por temporada (quanto mais alto, melhor), escala comum.
	const seasons = $derived(o.history.filter((h) => h.games > 0));
	const W = 640;
	const H = 150;
	const pts = $derived(
		seasons.map((h, i) => {
			const x = seasons.length === 1 ? W / 2 : 30 + (i / (seasons.length - 1)) * (W - 60);
			const tierBase = h.division === 'serie-a' ? 0 : h.division === 'serie-b' ? 1 : h.division === 'serie-c' ? 2 : 3;
			const score = tierBase + ((h.position ?? 10) - 1) / 20; // 0 = topo da Série A
			return { x, y: 18 + (score / 4) * (H - 36), h };
		})
	);
	let hover = $state<number | null>(null);
	const allPress = $derived(o.press?.questions.every((q) => answers[q.id]) ?? false);
	const offers = $derived(club.jobOffers);
</script>

<svelte:head><title>Gabinete · {data.view.club.name} · BRASFC</title></svelte:head>

<div class="page">
	<header class="hero glass" use:reveal>
		<div class="who">
			<span class="eyebrow-gold">Gabinete do treinador</span>
			<h1 class="display">{c.personName}</h1>
			<p class="muted">
				{data.view.club.name} · contrato até <strong>{o.contract.until}</strong> · {formatMoney(o.contract.wage)} por mês
				{#if o.delegated}<span class="tag">Treinos delegados ao auxiliar</span>{/if}
			</p>
			<dl class="totals">
				<div><dt>Jogos</dt><dd use:count={{ value: o.totals.games }}>{o.totals.games}</dd></div>
				<div><dt>Vitórias</dt><dd use:count={{ value: o.totals.wins }}>{o.totals.wins}</dd></div>
				<div><dt>Aproveitamento</dt><dd>{winRate}%</dd></div>
				<div><dt>Maior invencibilidade</dt><dd>{o.totals.bestUnbeaten}</dd></div>
			</dl>
		</div>
		<Gauge value={club.coachReputation} label="Reputação" suffix="" caption={club.coachReputation >= 70 ? 'Nome cobiçado no mercado' : club.coachReputation >= 45 ? 'Respeitado no meio' : 'Ainda construindo o nome'} size={160} />
	</header>

	{#if feedback}
		<p class="feedback" class:erro={feedback.tone === 'erro'} role="status" aria-live="polite"><Icon name={feedback.tone === 'erro' ? 'alert' : 'check'} size={16} /> {feedback.text}</p>
	{/if}

	{#if o.meeting}
		<section class="meeting glass gold" use:reveal aria-labelledby="mt">
			<div class="mhead">
				<span class="pulse" aria-hidden="true"></span>
				<div>
					<span class="eyebrow-gold">Reunião com a diretoria · {BOARD_PROFILES[club.board.profile].label}</span>
					<h2 id="mt" class="display">{o.meeting.title}</h2>
					<p>{o.meeting.context}</p>
				</div>
			</div>
			<div class="choices">
				{#each o.meeting.options as opt, i (opt.id)}
					<button class="choice" disabled={busy} onclick={() => act({ action: 'reuniao', meetingId: o.meeting!.id, choice: opt.id })} data-umx-surface style="--i:{i}">
						<strong>{opt.label}</strong>
						<small>{opt.hint}</small>
						<span class="go"><Icon name="arrowRight" size={16} /></span>
					</button>
				{/each}
			</div>
		</section>
	{/if}

	{#if o.press}
		<section class="press glass" use:reveal aria-labelledby="pt">
			<div class="mhead">
				<span class="mic" aria-hidden="true"><Icon name="news" size={22} /></span>
				<div>
					<span class="eyebrow-gold">Coletiva de imprensa</span>
					<h2 id="pt" class="display">{o.press.title}</h2>
					<p class="muted">As falas repercutem na torcida, na diretoria e na sua reputação — com efeito proporcional.</p>
				</div>
			</div>
			{#each o.press.questions as q, qi (q.id)}
				<fieldset class="q" style="--i:{qi}">
					<legend>{q.text}</legend>
					<div class="opts">
						{#each q.options as opt (opt.id)}
							<label class="opt" class:on={answers[q.id] === opt.id}>
								<input type="radio" name={q.id} value={opt.id} bind:group={answers[q.id]} />
								<span>{opt.label}</span>
								<em>{opt.tone}</em>
							</label>
						{/each}
					</div>
				</fieldset>
			{/each}
			<Button variant="primary" icon="check" disabled={!allPress || busy} loading={busy} onclick={() => act({ action: 'coletiva', pressId: o.press!.id, answers })}>Encerrar coletiva</Button>
		</section>
	{/if}

	{#if club.board.dismissed && offers.length}
		<section class="offers" use:reveal aria-labelledby="ot">
			<h2 id="ot" class="display">Propostas de emprego</h2>
			<div class="ogrid">
				{#each offers as of (of.id)}
					<article class="offer glass" data-umx-surface>
						<Crest clubId={of.clubId} size={54} />
						<div>
							<strong>{getClub(of.clubId)?.name ?? of.clubId}</strong>
							<small class="muted">{divLabel(of.division)}{of.project ? ` · ${of.project}` : ''}</small>
							<p>{of.reason}</p>
						</div>
						<div class="sign">
							<label>Duração
								<select bind:value={years[of.id]}>
									{#each [1, 2, 3] as y (y)}<option value={y} selected={y === (of.years ?? 2)}>{y} temporada{y > 1 ? 's' : ''}</option>{/each}
								</select>
							</label>
							<Button variant="gold" icon="briefcase" loading={busy} onclick={() => act({ action: 'emprego', offerId: of.id, years: years[of.id] ?? of.years ?? 2 })}>Assinar</Button>
						</div>
					</article>
				{/each}
			</div>
		</section>
	{/if}

	<section class="timeline glass pad" use:reveal aria-labelledby="tl">
		<h2 id="tl" class="display">Linha do tempo</h2>
		{#if seasons.length}
			<svg viewBox="0 0 {W} {H}" role="img" aria-label="Posição final em cada temporada">
				{#each ['Série A', 'Série B', 'Série C', 'Série D'] as label, i (label)}
					<line x1="0" x2={W} y1={18 + (i / 4) * (H - 36)} y2={18 + (i / 4) * (H - 36)} class="grid" />
					<text x="4" y={14 + (i / 4) * (H - 36)} class="lbl">{label}</text>
				{/each}
				{#if pts.length > 1}<polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} class="line" />{/if}
				{#each pts as p, i (p.h.season + p.h.clubId)}
					<circle cx={p.x} cy={p.y} r={hover === i ? 8 : 6} class="dot {p.h.outcome}" role="button" tabindex="0" aria-label="{p.h.season}: {p.h.position ?? '–'}º" onpointerenter={() => (hover = i)} onpointerleave={() => (hover = null)} onfocus={() => (hover = i)} onblur={() => (hover = null)} />
				{/each}
			</svg>
			{#if hover !== null && pts[hover]}
				{@const h = pts[hover].h}
				<p class="tip"><strong>{h.season}</strong> · {getClub(h.clubId)?.name} · {divLabel(h.division ?? '')} · {h.position ?? '–'}º · {OUTCOME[h.outcome]} · {h.wins}V {h.draws}E {h.losses}D</p>
			{/if}
		{:else}
			<p class="muted">A linha do tempo começa a ser desenhada ao fim da primeira temporada.</p>
		{/if}
		{#if o.history.length}
			<ol class="seasons">
				{#each [...o.history].reverse() as h (h.season + h.clubId + h.outcome)}
					<li>
						<Crest clubId={h.clubId} size={26} />
						<span>{h.season}</span>
						<span>{divLabel(h.division ?? '')}</span>
						<span>{h.position ? `${h.position}º` : '—'}</span>
						<span class="out {h.outcome}">{OUTCOME[h.outcome]}</span>
					</li>
				{/each}
			</ol>
		{/if}
	</section>

	<section class="two">
		<div class="glass pad" use:reveal>
			<h2 class="display">Marcos</h2>
			{#if o.milestones.length}
				<ul class="ms">
					{#each [...o.milestones].reverse().slice(0, 12) as m, i (m.key)}
						<li style="--i:{i}"><span class="star"><Icon name="star" size={14} /></span><div><strong>{m.label}</strong><small class="muted">{m.detail} · {m.season}</small></div></li>
					{/each}
				</ul>
			{:else}
				<p class="muted">Primeira vitória, 50 jogos, invencibilidades, acessos e títulos aparecem aqui.</p>
			{/if}
		</div>
		<div class="glass pad" use:reveal={{ index: 1 }}>
			<h2 class="display">Decisões</h2>
			{#if o.decisions.length}
				<ul class="dec">
					{#each [...o.decisions].reverse().slice(0, 10) as d, i (i)}
						<li><span class="k">{d.kind}</span><div><strong>{d.effect}</strong><small class="muted">{d.season}, rodada {d.round}</small></div></li>
					{/each}
				</ul>
			{:else}
				<p class="muted">Reuniões e coletivas respondidas ficam registradas com a consequência.</p>
			{/if}
		</div>
	</section>
</div>

<style>
	.page {
		display: grid;
		gap: var(--sp-5);
	}
	.hero {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: var(--sp-5);
		align-items: center;
		padding: var(--sp-6);
	}
	.tag {
		margin-left: 8px;
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--emerald-soft, rgb(16 185 129 / 0.15));
		color: var(--emerald-strong);
		font-size: var(--fs-xs);
	}
	.totals {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--sp-3);
		margin: var(--sp-4) 0 0;
	}
	.totals div {
		padding: 10px 12px;
		border-radius: 12px;
		background: rgb(231 237 240 / 0.04);
	}
	.totals dt {
		font-size: var(--fs-xs);
		color: var(--text-3);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.totals dd {
		margin: 2px 0 0;
		font: 700 1.6rem/1 'Barlow Condensed', sans-serif;
	}
	.feedback {
		display: flex;
		gap: 8px;
		align-items: center;
		margin: 0;
		padding: 10px 14px;
		border-radius: 12px;
		background: rgb(16 185 129 / 0.12);
		color: var(--emerald-strong);
	}
	.feedback.erro {
		background: rgb(239 68 68 / 0.12);
		color: var(--danger);
	}
	.meeting,
	.press {
		padding: var(--sp-6);
	}
	.mhead {
		display: flex;
		gap: var(--sp-4);
		align-items: flex-start;
		margin-bottom: var(--sp-4);
	}
	.mhead p {
		margin: 6px 0 0;
	}
	.pulse {
		flex: none;
		width: 14px;
		height: 14px;
		margin-top: 10px;
		border-radius: 50%;
		background: var(--gold);
		box-shadow: 0 0 0 0 rgb(232 184 106 / 0.6);
		animation: pulse 1.8s infinite;
	}
	@keyframes pulse {
		70% {
			box-shadow: 0 0 0 14px rgb(232 184 106 / 0);
		}
		100% {
			box-shadow: 0 0 0 0 rgb(232 184 106 / 0);
		}
	}
	.mic {
		flex: none;
		display: grid;
		place-items: center;
		width: 46px;
		height: 46px;
		border-radius: 14px;
		background: rgb(232 184 106 / 0.14);
		color: var(--gold);
	}
	.choices {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: var(--sp-3);
	}
	.choice {
		position: relative;
		display: grid;
		gap: 6px;
		text-align: left;
		padding: 16px 40px 16px 16px;
		border-radius: 14px;
		border: 1px solid var(--line-strong);
		background: rgb(16 20 24 / 0.55);
		color: inherit;
		font: inherit;
		cursor: pointer;
		animation: rise 0.45s var(--ease-out) both;
		animation-delay: calc(var(--i) * 70ms);
		transition:
			border-color 0.2s,
			transform 0.2s;
	}
	.choice:hover,
	.choice:focus-visible {
		border-color: var(--gold);
		transform: translateY(-2px);
		outline: none;
	}
	.choice small {
		color: var(--text-2);
	}
	.go {
		position: absolute;
		right: 14px;
		top: 50%;
		translate: 0 -50%;
		color: var(--gold);
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
	}
	.q {
		border: 0;
		padding: 0;
		margin: 0 0 var(--sp-4);
		animation: rise 0.45s var(--ease-out) both;
		animation-delay: calc(var(--i) * 90ms);
	}
	legend {
		font-weight: 700;
		margin-bottom: 8px;
	}
	.opts {
		display: grid;
		gap: 8px;
	}
	.opt {
		display: flex;
		gap: 10px;
		align-items: center;
		padding: 10px 12px;
		border-radius: 12px;
		border: 1px solid var(--line);
		cursor: pointer;
		transition:
			border-color 0.2s,
			background 0.2s;
	}
	.opt input {
		accent-color: #10b981;
	}
	.opt span {
		flex: 1;
	}
	.opt em {
		font-style: normal;
		font-size: var(--fs-xs);
		color: var(--text-3);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.opt.on {
		border-color: var(--emerald-strong);
		background: rgb(16 185 129 / 0.08);
	}
	.ogrid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: var(--sp-3);
	}
	.offer {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 12px;
		padding: var(--sp-4);
	}
	.offer div {
		display: grid;
		gap: 2px;
	}
	.offer p {
		margin: 6px 0 0;
		font-size: var(--fs-sm);
	}
	.sign {
		grid-column: 1 / -1;
		display: flex !important;
		justify-content: space-between;
		align-items: end;
		gap: 10px;
	}
	.sign label {
		display: grid;
		gap: 4px;
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	select {
		padding: 8px;
		border-radius: 10px;
		background: var(--bg-2, #1c252b);
		color: var(--text);
		border: 1px solid var(--line-strong);
	}
	.timeline svg {
		width: 100%;
		height: auto;
		margin-top: var(--sp-3);
	}
	.grid {
		stroke: rgb(231 237 240 / 0.07);
	}
	.lbl {
		fill: var(--text-3);
		font-size: 10px;
	}
	.line {
		fill: none;
		stroke: var(--emerald-strong);
		stroke-width: 2.5;
		stroke-dasharray: 1200;
		stroke-dashoffset: 1200;
		animation: draw 1.4s var(--ease-out) forwards;
	}
	@keyframes draw {
		to {
			stroke-dashoffset: 0;
		}
	}
	.dot {
		fill: var(--bg);
		stroke: var(--emerald-strong);
		stroke-width: 3;
		cursor: pointer;
		transition: r 0.2s;
	}
	.dot.campeao {
		stroke: var(--gold);
		fill: var(--gold);
	}
	.dot.queda,
	.dot.demitido {
		stroke: var(--danger);
	}
	.tip {
		margin: 6px 0 0;
		font-size: var(--fs-sm);
	}
	.seasons {
		list-style: none;
		margin: var(--sp-4) 0 0;
		padding: 0;
		display: grid;
		gap: 6px;
	}
	.seasons li {
		display: grid;
		grid-template-columns: auto 60px 1fr 50px 110px;
		gap: 10px;
		align-items: center;
		font-size: var(--fs-sm);
	}
	.out {
		font-weight: 700;
	}
	.out.campeao,
	.out.acesso {
		color: var(--gold);
	}
	.out.queda,
	.out.demitido {
		color: var(--danger);
	}
	.two {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--sp-4);
	}
	.ms,
	.dec {
		list-style: none;
		margin: var(--sp-3) 0 0;
		padding: 0;
		display: grid;
		gap: 10px;
	}
	.ms li,
	.dec li {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		animation: rise 0.4s var(--ease-out) both;
		animation-delay: calc(var(--i, 0) * 50ms);
	}
	.ms div,
	.dec div {
		display: grid;
	}
	.star {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: rgb(232 184 106 / 0.16);
		color: var(--gold);
		flex: none;
	}
	.k {
		flex: none;
		padding: 2px 8px;
		border-radius: 6px;
		background: rgb(231 237 240 / 0.06);
		font-size: var(--fs-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	@media (max-width: 760px) {
		.hero,
		.two {
			grid-template-columns: 1fr;
		}
		.totals {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.seasons li {
			grid-template-columns: auto 44px 1fr 40px;
		}
		.seasons .out {
			grid-column: 2 / -1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.choice,
		.q,
		.ms li,
		.dec li,
		.pulse,
		.line {
			animation: none;
		}
		.line {
			stroke-dashoffset: 0;
		}
	}
</style>
