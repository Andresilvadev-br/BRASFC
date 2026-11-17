<script lang="ts">
	import { boardExpectation } from '#lib/domain/career.ts';
	import { getClub, LEAGUE } from '#lib/domain/clubs.ts';
	import { formatDayMonth, formatLong, weekdayShort, weekday } from '#lib/domain/dates.ts';
	import { POSITION_INFO } from '#lib/domain/positions.ts';
	import { lineupFamiliarity } from '#lib/domain/tactics.ts';
	import { SESSION_LABELS, weekPlan } from '#lib/domain/training.ts';
	import { clubKit, coachKit, playerKit } from '#lib/pixel/kits.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';
	import FixtureCard from '#lib/ui/career/FixtureCard.svelte';
	import StandingsTable from '#lib/ui/career/StandingsTable.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Meter from '#lib/ui/Meter.svelte';
	import Panel from '#lib/ui/Panel.svelte';
	import Pixel from '#lib/ui/Pixel.svelte';
	import Stars from '#lib/ui/Stars.svelte';
	import Unavailable from '#lib/ui/Unavailable.svelte';

	let { data } = $props();

	const c = $derived(data.career);
	const v = $derived(data.view);
	const base = $derived(`/carreira/${c.id}`);
	const isCoach = $derived(c.mode === 'coach');
	const inbox = $derived([...data.messages].sort((a, b) => Number(a.read) - Number(b.read)).slice(0, 4));
	const week = $derived(weekPlan(c.gameDate, c.data.trainingFocus ?? 'equilibrado', v.clubFixtures));
	const familiarity = $derived(lineupFamiliarity(v.tactic.formation, v.tactic.lineup, v.squad));
	const appearance = $derived(c.data.appearance ?? { skin: 2, hairColor: 1, hairStyle: 'curto' as const });
	const opponent = $derived(v.next ? getClub(v.next.home === c.clubId ? v.next.away : v.next.home) : undefined);

	const news = $derived([
		{ tag: LEAGUE.name, title: `Temporada ${c.season} começa em ${v.next ? formatDayMonth(v.clubFixtures[0].date) : 'breve'}`, text: '20 clubes, 38 rodadas em turno e returno.' },
		{
			tag: v.club.name,
			title: isCoach ? `${c.personName} é o novo treinador do ${v.club.short}` : `${c.personName} sobe ao elenco principal`,
			text: isCoach ? `Diretoria espera ${boardExpectation(v.club)}.` : `Jovem de 18 anos chega como ${POSITION_INFO[c.data.position ?? 'ATA'].label.toLowerCase()}.`
		},
		{ tag: 'Mercado', title: 'Janela de transferências ainda fechada', text: 'O mercado abre em uma próxima etapa do BRASFC.' }
	]);
</script>

<svelte:head><title>Painel · {v.club.name} · BRASFC</title></svelte:head>

<div class="greet" data-umx-enter>
	<span class="eyebrow">{formatLong(c.gameDate)} · pré-temporada</span>
	<h1>Olá, {c.personName.split(' ')[0]}</h1>
</div>

<div class="grid">
	<Panel title="Próximo compromisso" icon="whistle" tone="highlight" class="span-7" index={0}>
		{#if v.next}
			<FixtureCard fixture={v.next} clubId={c.clubId} today={c.gameDate} />
			<div class="row-actions">
				{#if isCoach}
					<Button variant="primary" icon="tactics" href="{base}/taticas">Preparar a equipe</Button>
				{:else}
					<Button variant="primary" icon="training" href="{base}/treinos">Treinar para o jogo</Button>
				{/if}
				<Button variant="ghost" href="{base}/calendario" iconRight="chevronRight">Calendário</Button>
			</div>
		{:else}
			<p class="muted">Nenhum jogo agendado.</p>
		{/if}
	</Panel>

	{#if isCoach}
		<Panel title="Situação do clube" icon="chart" class="span-5" index={1}>
			<dl class="stats">
				<div><dt>Meta da diretoria</dt><dd class="goal">{boardExpectation(v.club)}</dd></div>
				<div><dt>Reputação</dt><dd><Stars value={v.club.reputation} size={16} /></dd></div>
				<div><dt>Força do elenco</dt><dd class="big num">{v.strength}</dd></div>
				<div><dt>Familiaridade tática</dt><dd><Meter value={familiarity} label="Familiaridade tática" /></dd></div>
				<div><dt>Posição na liga</dt><dd class="muted">Temporada não iniciada</dd></div>
			</dl>
			<Unavailable title="Finanças e orçamento" detail="Receitas, salários e patrocínios" icon="briefcase" stage="Etapa futura" />
		</Panel>
	{:else}
		<Panel title="Seu jogador" icon="user" class="span-5" index={1}>
			<div class="me">
				<div class="me-art"><Pixel variant="full" {appearance} kit={playerKit(c.clubId, c.data.position ?? 'ATA')} size={190} /></div>
				<div class="me-info">
					<span class="eyebrow">#{c.data.player?.number} · {POSITION_INFO[c.data.position ?? 'ATA'].label}</span>
					<strong class="me-name">{c.personName}</strong>
					<dl class="mini">
						<div><dt>Geral</dt><dd class="num">{c.data.player?.overall}</dd></div>
						<div><dt>Potencial</dt><dd class="num">{c.data.player?.potential}</dd></div>
						<div><dt>Idade</dt><dd class="num">{c.data.player?.age}</dd></div>
					</dl>
					<Badge tone="warning" icon="info">Status: aguardando avaliação do treinador</Badge>
				</div>
			</div>
		</Panel>
	{/if}

	<Panel title="Mensagens" icon="mail" href="{base}/mensagens" class="span-5" index={2}>
		<ul class="inbox">
			{#each inbox as m (m.id)}
				<li class:unread={!m.read} class:important={m.kind === 'important'}>
					<a href="{base}/mensagens?m={m.id}">
						<span class="flag" aria-hidden="true"></span>
						<span class="from">{m.sender}</span>
						<span class="subject">{m.subject}</span>
						{#if !m.read}<span class="sr-only">não lida</span>{/if}
					</a>
				</li>
			{/each}
		</ul>
	</Panel>

	<Panel title="Classificação" icon="trophy" href="{base}/competicoes" class="span-4" index={3} demo>
		<StandingsTable rows={v.standings} highlight={c.clubId} compact limit={6} />
	</Panel>

	<Panel title="Esta semana" icon="calendar" href="{base}/treinos" class="span-3" index={4}>
		<ul class="week">
			{#each week as d (d.date)}
				<li class:today={d.date === c.gameDate} class:match={!!d.fixture}>
					<span class="wd">{weekdayShort(weekday(d.date))}<small class="num">{formatDayMonth(d.date)}</small></span>
					<span class="sess">
						{#if d.fixture}
							vs {getClub(d.fixture.home === c.clubId ? d.fixture.away : d.fixture.home)?.short}
						{:else}
							{d.sessions.map((s) => SESSION_LABELS[s]).join(' · ')}
						{/if}
					</span>
				</li>
			{/each}
		</ul>
	</Panel>

	<Panel title="Notícias" icon="news" class="span-8" index={5} demo>
		<div class="news">
			{#each news as n, i (n.title)}
				<article class:lead={i === 0}>
					{#if i === 1}
						<div class="art"><Pixel variant="bust" {appearance} kit={isCoach ? coachKit(c.clubId) : clubKit(c.clubId)} size={64} /></div>
					{/if}
					<span class="tag">{n.tag}</span>
					<h3>{n.title}</h3>
					<p class="muted">{n.text}</p>
				</article>
			{/each}
		</div>
	</Panel>

	<Panel title="Atalhos" icon="sparkle" class="span-4" index={6}>
		<div class="shortcuts">
			{#if isCoach}
				<a href="{base}/elenco" data-umx-hover><Icon name="squad" /> Ver elenco <small>{v.squad.length} atletas</small></a>
				<a href="{base}/taticas" data-umx-hover><Icon name="tactics" /> Central tática <small>{v.tactic.formation}</small></a>
			{:else}
				<a href="{base}/treinos" data-umx-hover><Icon name="training" /> Treino individual <small>foco da semana</small></a>
				<a href="{base}/elenco" data-umx-hover><Icon name="squad" /> Companheiros <small>{v.squad.length} atletas</small></a>
			{/if}
			<a href="{base}/competicoes" data-umx-hover><Icon name="trophy" /> {LEAGUE.name} <small>tabela e rodadas</small></a>
			{#if opponent}<a href="{base}/calendario" data-umx-hover><Icon name="calendar" /> Calendário <small>estreia vs {opponent.short}</small></a>{/if}
		</div>
	</Panel>
</div>

<style>
	.greet {
		margin-bottom: var(--sp-5);
	}
	.greet h1 {
		font-size: var(--fs-3xl);
		text-transform: uppercase;
		font-weight: 800;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		gap: var(--sp-4);
	}
	.grid > :global(.span-7) {
		grid-column: span 7;
	}
	.grid > :global(.span-5) {
		grid-column: span 5;
	}
	.grid > :global(.span-4) {
		grid-column: span 4;
	}
	.grid > :global(.span-3) {
		grid-column: span 3;
	}
	.grid > :global(.span-8) {
		grid-column: span 8;
	}
	.row-actions {
		display: flex;
		gap: var(--sp-2);
		justify-content: center;
		margin-top: var(--sp-5);
	}
	.stats {
		display: grid;
		gap: var(--sp-3);
		margin: 0 0 var(--sp-4);
	}
	.stats div {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--sp-4);
		padding-bottom: var(--sp-3);
		border-bottom: 1px solid var(--line);
	}
	dt {
		color: var(--text-2);
		font-size: var(--fs-sm);
	}
	dd {
		margin: 0;
		text-align: right;
		font-weight: 600;
	}
	.goal {
		max-width: 60%;
		font-size: var(--fs-sm);
	}
	.big {
		font-family: var(--font-display);
		font-size: var(--fs-2xl);
		line-height: 1;
	}
	.me {
		display: flex;
		gap: var(--sp-4);
		align-items: flex-end;
	}
	.me-art :global(svg) {
		height: 190px;
		width: auto;
	}
	.me-info {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		padding-bottom: var(--sp-2);
	}
	.me-name {
		font-family: var(--font-display);
		font-size: var(--fs-2xl);
		text-transform: uppercase;
		line-height: 1;
	}
	.mini {
		display: flex;
		gap: var(--sp-5);
		margin: var(--sp-2) 0;
	}
	.mini div {
		display: flex;
		flex-direction: column;
	}
	.mini dd {
		text-align: left;
		font-family: var(--font-display);
		font-size: var(--fs-2xl);
	}
	.inbox {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.inbox a {
		display: grid;
		grid-template-columns: 10px 1fr;
		column-gap: var(--sp-3);
		padding: var(--sp-3) var(--sp-2);
		border-radius: var(--radius-s);
		border-top: 1px solid var(--line);
	}
	.inbox li:first-child a {
		border-top: 0;
	}
	.inbox a:hover {
		background: var(--surface-2);
	}
	.flag {
		grid-row: 1 / 3;
		align-self: center;
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.unread .flag {
		background: var(--emerald);
	}
	.important.unread .flag {
		background: var(--gold);
		box-shadow: 0 0 0 3px var(--gold-soft);
	}
	.from {
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.subject {
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.unread .subject {
		color: var(--text);
		font-weight: 600;
	}
	.week {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.week li {
		display: grid;
		grid-template-columns: 54px 1fr;
		align-items: center;
		gap: var(--sp-2);
		padding: 6px var(--sp-2);
		border-radius: var(--radius-s);
		font-size: var(--fs-xs);
	}
	.wd {
		display: flex;
		flex-direction: column;
		font-weight: 700;
		line-height: 1.15;
	}
	.wd small {
		font-weight: 500;
		color: var(--text-3);
	}
	.sess {
		color: var(--text-2);
	}
	.week .today {
		background: var(--emerald-soft);
	}
	.week .match {
		background: var(--gold-soft);
	}
	.week .match .sess {
		color: var(--gold);
		font-weight: 700;
	}
	.news {
		display: grid;
		grid-template-columns: 1.3fr 1fr 1fr;
		gap: var(--sp-4);
	}
	.news article {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		padding: var(--sp-4);
		border-radius: var(--radius-m);
		background: var(--surface-sunken);
		border: 1px solid var(--line);
	}
	.news .lead {
		background:
			radial-gradient(100% 120% at 100% 0%, rgb(232 184 106 / 0.14), transparent 60%),
			var(--surface-sunken);
	}
	.art {
		align-self: flex-start;
		padding: 4px;
		border-radius: var(--radius-s);
		background: linear-gradient(180deg, var(--surface-3), var(--surface-2));
	}
	.tag {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--emerald-strong);
	}
	.news h3 {
		font-size: var(--fs-xl);
		line-height: 1.1;
	}
	.news p {
		font-size: var(--fs-sm);
	}
	.shortcuts {
		display: grid;
		gap: var(--sp-2);
	}
	.shortcuts a {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-3);
		border-radius: var(--radius-m);
		background: var(--surface-2);
		font-weight: 600;
		font-size: var(--fs-sm);
	}
	.shortcuts a:hover {
		background: var(--surface-3);
	}
	.shortcuts :global(.icon) {
		color: var(--emerald-strong);
	}
	.shortcuts small {
		margin-left: auto;
		color: var(--text-3);
		font-weight: 500;
	}
	@media (max-width: 1200px) {
		.grid > :global(.span-7),
		.grid > :global(.span-5),
		.grid > :global(.span-8),
		.grid > :global(.span-4) {
			grid-column: span 6;
		}
		.grid > :global(.span-3) {
			grid-column: span 6;
		}
		.news {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 760px) {
		.grid > :global(*) {
			grid-column: 1 / -1 !important;
		}
	}
</style>
