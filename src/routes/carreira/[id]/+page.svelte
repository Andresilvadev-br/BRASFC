<script lang="ts">
	import { universeCoach } from '#lib/domain/matchday.ts';
	import { goto, invalidate } from '$app/navigation';
	import { api, withCareerVersion } from '#lib/api.ts';
	import { analyze, type Tip } from '#lib/domain/assistant.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { CUP_ID } from '#lib/domain/cup.ts';
	import { formatDayMonth, formatLong, weekday, weekdayShort } from '#lib/domain/dates.ts';
	import { formatMoney } from '#lib/domain/market.ts';
	import { POSITION_INFO } from '#lib/domain/positions.ts';
	import { MASTERY_LABEL } from '#lib/domain/tactical.ts';
	import { count, reveal } from '#lib/motion/actions.ts';
	import { playerKit } from '#lib/pixel/kits.ts';
	import AssistantTips from '#lib/ui/AssistantTips.svelte';
	import Button from '#lib/ui/Button.svelte';
	import StandingsTable from '#lib/ui/career/StandingsTable.svelte';
	import Crest from '#lib/ui/Crest.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Pixel from '#lib/ui/Pixel.svelte';
	import Gauge from '#lib/ui/v4/Gauge.svelte';

	let { data } = $props();
	const c = $derived(data.career);
	const v = $derived(data.view);
	const m = $derived(data.manage);
	const base = $derived(`/carreira/${c.id}`);
	const isCoach = $derived(c.mode === 'coach');
	const inbox = $derived([...data.messages].sort((a, b) => Number(a.read) - Number(b.read) || b.gameDate.localeCompare(a.gameDate)).slice(0, 4));
	const next = $derived(v.upcoming);
	const oppId = $derived(next ? (next.home === c.clubId ? next.away : next.home) : null);
	const isCup = $derived(next?.competition === CUP_ID);
	const myRow = $derived(v.standings.find((r) => r.clubId === c.clubId));

	/** Forma (últimos 5 jogos de liga e Copa) a partir dos resultados gravados. */
	function form(clubId: string) {
		const games = v.results.filter((r) => r.home === clubId || r.away === clubId);
		const dated = games.map((r) => ({ r, date: v.clubFixtures.find((f) => f.round === r.round && f.home === r.home && f.competition === (r.competition ?? 'liga-brasfc'))?.date ?? `${r.competition === CUP_ID ? 'z' : ''}${String(r.round).padStart(2, '0')}` }));
		return dated
			.sort((a, b) => a.date.localeCompare(b.date))
			.slice(-5)
			.map(({ r }) => {
				const gf = r.home === clubId ? r.homeGoals : r.awayGoals;
				const ga = r.home === clubId ? r.awayGoals : r.homeGoals;
				return gf > ga ? 'V' : gf === ga ? 'E' : 'D';
			});
	}
	const myForm = $derived(form(c.clubId));
	const oppForm = $derived(oppId ? form(oppId) : []);
	const avgFitness = $derived(Math.round(v.squad.reduce((s, p) => s + p.condition, 0) / Math.max(1, v.squad.length)));
	const expiring = $derived(m.roster.filter((p) => p.contract.until <= c.season && !p.loan && p.id !== 'eu'));
	const alerts = $derived(
		[
			...(isCoach && data.office.office.meeting ? [{ tone: 'gold', icon: 'briefcase' as const, text: `A diretoria convocou: ${data.office.office.meeting.title.toLowerCase()}.`, href: `${base}/gabinete` }] : []),
			...(isCoach && data.office.office.press ? [{ tone: 'gold', icon: 'news' as const, text: `${data.office.office.press.title}: os jornalistas aguardam.`, href: `${base}/gabinete` }] : []),
			...(isCoach && m.club.board.dismissed ? [{ tone: 'bad', icon: 'alert' as const, text: 'Você foi demitido: veja as propostas de outros clubes.', href: `${base}/gabinete` }] : []),
			...(isCoach && !m.club.board.dismissed && m.club.board.confidence < 35 ? [{ tone: 'bad', icon: 'alert' as const, text: `Confiança da diretoria em ${Math.round(m.club.board.confidence)}%.`, href: `${base}/clube` }] : []),
			...(isCoach && m.club.incoming.length ? [{ tone: 'gold', icon: 'briefcase' as const, text: `${m.club.incoming.length} proposta(s) por atletas do elenco.`, href: `${base}/mercado` }] : []),
			...(isCoach && expiring.length ? [{ tone: 'gold', icon: 'clock' as const, text: `${expiring.length} contrato(s) terminam nesta temporada.`, href: `${base}/elenco` }] : []),
			...(isCoach && m.window ? [{ tone: 'ok', icon: 'briefcase' as const, text: `Janela de transferências aberta (${m.window === 'pre-temporada' ? 'pré-temporada' : 'meio do ano'}).`, href: `${base}/mercado` }] : []),
			...(isCoach && !m.club.sponsors.length && m.club.sponsorOffers.length ? [{ tone: 'gold', icon: 'star' as const, text: 'Nenhum patrocínio assinado: há propostas na mesa.', href: `${base}/financas` }] : []),
			...(isCoach && m.club.balance < 0 ? [{ tone: 'bad', icon: 'chart' as const, text: `Caixa negativo: ${formatMoney(m.club.balance)}.`, href: `${base}/financas` }] : []),
			...(!isCoach && c.data.playerCareer?.offers?.length ? [{ tone: 'gold', icon: 'briefcase' as const, text: 'Seu empresário trouxe propostas.', href: `${base}/clube` }] : []),
			...(avgFitness < 75 ? [{ tone: 'gold', icon: 'training' as const, text: `Condição média do elenco em ${avgFitness}%: considere poupar titulares.`, href: `${base}/treinos` }] : []),
			...(isCoach && data.office.advice.length ? [{ tone: 'ok', icon: 'whistle' as const, text: `Comissão técnica — ${data.office.advice[0].title}`, href: `${base}/comissao` }] : [])
		] as Array<{ tone: string; icon: 'alert' | 'briefcase' | 'clock' | 'star' | 'chart' | 'training' | 'news' | 'whistle'; text: string; href: string }>
	);
	const upcoming = $derived(v.clubFixtures.filter((f) => !v.results.some((r) => r.round === f.round && r.home === f.home && (r.competition ?? 'liga-brasfc') === f.competition)).slice(0, 6));
	const tips = $derived(
		isCoach
			? analyze({
					squad: v.squad,
					tactic: v.tactic,
					tactical: v.tactical,
					fitness: v.fitness,
					recent: data.recent ?? [],
					clubId: c.clubId,
					nextOpponent: oppId,
					careerSeed: c.seed,
					opponentCoach: (() => { const o = oppId; return o ? universeCoach(c, o) : null; })(),
					season: c.season,
					firstSeason: v.firstSeason,
					dismissed: c.data.dismissedTips
				})
			: []
	);
	async function dismissTip(t: Tip) {
		try {
			await withCareerVersion(c.id, c.version, (version) => api(`/api/careers/${c.id}`, { method: 'PATCH', body: { version, dismissTip: t.id } }));
			await invalidate('app:career');
		} catch {
			/* a lista apenas não muda */
		}
	}
	function applyTip(t: Tip) {
		void goto(t.action?.type === 'training' ? `${base}/treinos` : `${base}/taticas`);
	}
	const appearance = $derived(c.data.appearance ?? { skin: 2, hairColor: 1, hairStyle: 'curto' as const });
	const compLabel = (comp: string) => (comp === CUP_ID ? 'Copa do Brasil' : v.divisionLabel);
</script>

<svelte:head><title>Painel · {v.club.name} · BRASFC</title></svelte:head>

<div class="greet" use:reveal>
	<span class="eyebrow">{formatLong(c.gameDate)}</span>
	<h1 class="display">Olá, {c.personName.split(' ')[0]}</h1>
</div>

<div class="dash">
	<!-- Próximo jogo: o destaque da tela -->
	<section class="match glass" class:cup={isCup} data-umx-surface use:reveal>
		{#if v.seasonOver}
			<div class="end">
				<Icon name="trophy" size={36} />
				<h2 class="display">Temporada {c.season} encerrada</h2>
				<p class="muted">Feche a temporada para ver acessos, rebaixamentos, premiações e começar {c.season + 1}.</p>
				<Button variant="primary" size="lg" icon="trophy" href="{base}/partida">Encerrar temporada</Button>
			</div>
		{:else if next && oppId}
			<div class="label"><span class="chip" class:gold={isCup}>{next.phase ?? compLabel(next.competition)}</span><span class="muted">{formatLong(next.date)} · {next.time}</span></div>
			<div class="vs">
				<div class="team home">
					<Crest clubId={next.home} size={92} />
					<strong>{getClub(next.home)?.name}</strong>
					<div class="form">{#each form(next.home) as f, i (i)}<i data-f={f}>{f}</i>{/each}</div>
				</div>
				<div class="mid">
					<span class="x display">×</span>
					<span class="where">{next.home === c.clubId ? 'Em casa' : 'Fora'}{(next as { neutral?: boolean }).neutral ? ' · campo neutro' : ''}</span>
				</div>
				<div class="team away">
					<Crest clubId={next.away} size={92} />
					<strong>{getClub(next.away)?.name}</strong>
					<div class="form">{#each form(next.away) as f, i (i)}<i data-f={f}>{f}</i>{/each}</div>
				</div>
			</div>
			{#if !v.next}<p class="muted center">Próximo passo do calendário sem jogo do seu time: avance a semana.</p>{/if}
			<div class="actions">
				<Button variant="primary" size="lg" icon="whistle" href="{base}/partida">{!v.next ? 'Avançar a semana' : isCoach ? 'Comandar a partida' : 'Ir para o jogo'}</Button>
				{#if isCoach}<Button icon="tactics" href="{base}/taticas">Preparar a equipe</Button>{/if}
			</div>
		{:else}
			<p class="muted">Nenhum jogo agendado.</p>
		{/if}
	</section>

	<!-- Situação -->
	<section class="sit glass" use:reveal={{ index: 1 }}>
		<div class="pos">
			<span class="k">{v.divisionLabel}</span>
			<strong class="num-xl">{myRow?.played ? `${myRow.position}º` : '—'}</strong>
			<span class="muted">{myRow?.played ? `${myRow.points} pts em ${myRow.played} jogos` : 'Temporada não iniciada'}</span>
		</div>
		<div class="formrow"><span class="k">Forma</span><div class="form big">{#each myForm as f, i (i)}<i data-f={f}>{f}</i>{:else}<span class="muted">sem jogos</span>{/each}</div></div>
		<div class="bars">
			<div><span>Domínio tático</span><b>{Math.round(v.mastery.execution)}</b><i style="--w:{v.mastery.execution}%"></i><small class="muted">{MASTERY_LABEL(v.mastery.execution)}</small></div>
			<div><span>Condição do elenco</span><b>{avgFitness}%</b><i style="--w:{avgFitness}%" class:warn={avgFitness < 75}></i></div>
			<div><span>Força do elenco</span><b>{v.strength}</b><i style="--w:{Math.max(0, (v.strength - 50) * 2.5)}%"></i></div>
		</div>
	</section>

	{#if isCoach}
		<section class="board glass" use:reveal={{ index: 2 }}>
			<Gauge value={m.club.board.confidence} label="Diretoria" size={124} />
			<div class="money">
				<span class="k">Caixa</span>
				<strong class:neg={m.club.balance < 0} use:count={{ value: m.club.balance, format: formatMoney }}>{formatMoney(m.club.balance)}</strong>
				<span class="muted small">Orçamento {formatMoney(m.club.transferBudget)} · folha {formatMoney(m.payroll)}/mês</span>
				<a class="link" href="{base}/financas">Finanças →</a>
			</div>
		</section>
	{:else}
		<section class="board glass me" use:reveal={{ index: 2 }}>
			<Pixel variant="full" {appearance} kit={playerKit(c.clubId, c.data.position ?? 'ATA')} size={130} />
			<div class="money">
				<span class="k">#{c.data.player?.number} · {POSITION_INFO[c.data.position ?? 'ATA'].label}</span>
				<strong>{c.data.player?.overall} <small class="muted">/ {c.data.player?.potential}</small></strong>
				<span class="muted small">{c.data.player?.age} anos · reputação {c.data.playerCareer?.reputation ?? c.data.player?.reputation}</span>
				<a class="link" href="{base}/clube">Minha carreira →</a>
			</div>
		</section>
	{/if}

	{#if data.office.universe?.news.length}
		<section class="ticker glass" use:reveal={{ index: 3 }} aria-label="Últimas notícias">
			<span class="tk"><Icon name="globe" size={16} /> Mundo</span>
			<ul>
				{#each [...data.office.universe.news].reverse().slice(0, 3) as n (n.id)}<li><a href="{base}/mundo">{n.title}</a></li>{/each}
			</ul>
		</section>
	{/if}

	{#if alerts.length}
		<section class="alerts" use:reveal={{ index: 3 }}>
			{#each alerts as a (a.text)}
				<a class="alert glass" data-tone={a.tone} href={a.href} data-umx-press><Icon name={a.icon} size={18} /><span>{a.text}</span><Icon name="chevronRight" size={16} /></a>
			{/each}
		</section>
	{/if}

	<section class="cal glass" use:reveal={{ index: 4 }}>
		<div class="spread"><h2 class="display">Próximos jogos</h2><a class="link" href="{base}/calendario">Calendário →</a></div>
		<div class="strip">
			{#each upcoming as f (f.competition + f.round + f.home)}
				{@const opp = f.home === c.clubId ? f.away : f.home}
				<div class="day" class:cup={f.competition === CUP_ID}>
					<span class="wd">{weekdayShort(weekday(f.date))} {formatDayMonth(f.date)}</span>
					<Crest clubId={opp} size={34} />
					<strong>{getClub(opp)?.short}</strong>
					<small>{f.home === c.clubId ? 'casa' : 'fora'} · {f.competition === CUP_ID ? 'Copa' : `R${f.round}`}</small>
				</div>
			{:else}
				<p class="muted">Sem jogos marcados.</p>
			{/each}
		</div>
	</section>

	<section class="table glass" use:reveal={{ index: 5 }}>
		<div class="spread"><h2 class="display">{v.divisionLabel}</h2><a class="link" href="{base}/competicoes">Tabela →</a></div>
		<StandingsTable rows={v.standings} highlight={c.clubId} compact limit={6} />
	</section>

	{#if isCoach}
		<section class="tips glass" use:reveal={{ index: 6 }}>
			<div class="spread"><h2 class="display">Auxiliar técnico</h2><a class="link" href="{base}/taticas">Táticas →</a></div>
			<AssistantTips {tips} limit={3} onapply={applyTip} ondismiss={dismissTip} />
		</section>
	{/if}

	<section class="inbox glass" use:reveal={{ index: 7 }}>
		<div class="spread"><h2 class="display">Mensagens</h2><a class="link" href="{base}/mensagens">Todas →</a></div>
		<ul>
			{#each inbox as msg (msg.id)}
				<li class:unread={!msg.read} class:important={msg.kind === 'important'}>
					<a href="{base}/mensagens?m={msg.id}"><span class="flag"></span><span class="from">{msg.sender}</span><span class="subject">{msg.subject}</span></a>
				</li>
			{/each}
		</ul>
	</section>
</div>

<style>
	.greet {
		margin-bottom: var(--sp-4);
	}
	.greet h1 {
		font-size: var(--fs-3xl);
		margin: 4px 0 0;
	}
	.dash {
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		gap: var(--sp-4);
	}
	.k {
		font-size: 11px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-3);
		font-weight: 800;
	}
	.small {
		font-size: var(--fs-xs);
	}
	.link {
		color: var(--emerald-strong);
		font-weight: 600;
		font-size: var(--fs-sm);
	}
	h2 {
		margin: 0;
		font-size: var(--fs-xl);
	}
	.match {
		grid-column: span 8;
		padding: var(--sp-5) var(--sp-6);
		display: grid;
		gap: var(--sp-4);
		background:
			radial-gradient(50% 90% at 50% 0%, color-mix(in srgb, var(--club) 26%, transparent), transparent 70%),
			radial-gradient(80% 60% at 50% 120%, rgb(16 185 129 / 0.14), transparent 70%),
			var(--glass);
		overflow: hidden;
	}
	.match.cup {
		background:
			radial-gradient(50% 90% at 50% 0%, rgb(232 184 106 / 0.24), transparent 70%),
			var(--glass);
	}
	.label {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-3);
		flex-wrap: wrap;
		font-size: var(--fs-sm);
	}
	.chip.gold {
		color: var(--gold);
		border-color: rgb(232 184 106 / 0.4);
		background: var(--gold-soft);
	}
	.vs {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: var(--sp-4);
	}
	.team {
		display: grid;
		justify-items: center;
		gap: 8px;
		text-align: center;
	}
	.team strong {
		font-family: var(--font-display);
		font-size: var(--fs-xl);
		text-transform: uppercase;
		line-height: 1;
	}
	.mid {
		display: grid;
		justify-items: center;
		gap: 4px;
	}
	.x {
		font-size: 3.5rem;
		color: var(--text-3);
		line-height: 1;
	}
	.where {
		font-size: var(--fs-xs);
		color: var(--text-2);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-weight: 700;
	}
	.form {
		display: flex;
		gap: 4px;
	}
	.form i {
		width: 20px;
		height: 20px;
		border-radius: 6px;
		display: grid;
		place-items: center;
		font-size: 10px;
		font-weight: 800;
		font-style: normal;
		background: rgb(231 237 240 / 0.08);
		color: var(--text-2);
	}
	.form.big i {
		width: 28px;
		height: 28px;
		font-size: 12px;
	}
	.form i[data-f='V'] {
		background: var(--emerald);
		color: #04140e;
	}
	.form i[data-f='D'] {
		background: var(--danger);
		color: #1a0606;
	}
	.actions {
		display: flex;
		gap: var(--sp-2);
		justify-content: center;
		flex-wrap: wrap;
	}
	.center {
		text-align: center;
		margin: 0;
	}
	.end {
		display: grid;
		justify-items: center;
		gap: var(--sp-3);
		text-align: center;
		color: var(--gold);
		padding: var(--sp-4);
	}
	.end p {
		color: var(--text-2);
		margin: 0;
	}
	.sit {
		grid-column: span 4;
		padding: var(--sp-5);
		display: grid;
		gap: var(--sp-4);
		align-content: start;
	}
	.pos {
		display: grid;
	}
	.formrow {
		display: grid;
		gap: 6px;
	}
	.bars {
		display: grid;
		gap: 10px;
	}
	.bars div {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 4px 8px;
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.bars i {
		grid-column: 1 / -1;
		height: 6px;
		border-radius: 6px;
		background: linear-gradient(90deg, var(--emerald) var(--w), rgb(231 237 240 / 0.08) var(--w));
	}
	.bars i.warn {
		background: linear-gradient(90deg, var(--gold) var(--w), rgb(231 237 240 / 0.08) var(--w));
	}
	.bars small {
		grid-column: 1 / -1;
	}
	.board {
		grid-column: span 4;
		padding: var(--sp-5);
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--sp-4);
		align-items: center;
	}
	.money {
		display: grid;
		gap: 4px;
	}
	.money strong {
		font-family: var(--font-display);
		font-size: var(--fs-2xl);
	}
	.money strong.neg {
		color: var(--danger);
	}
	.ticker {
		grid-column: 1 / -1;
		display: flex;
		gap: 14px;
		align-items: center;
		padding: 10px 16px;
		overflow: hidden;
	}
	.tk {
		display: inline-flex;
		gap: 6px;
		align-items: center;
		flex: none;
		color: var(--gold);
		font-size: var(--fs-xs);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.ticker ul {
		display: flex;
		gap: 24px;
		list-style: none;
		margin: 0;
		padding: 0;
		min-width: 0;
		overflow: hidden;
	}
	.ticker li {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: var(--fs-sm);
	}
	.ticker a {
		color: inherit;
		text-decoration: none;
	}
	.ticker a:hover {
		color: var(--emerald-strong);
	}
	@media (max-width: 760px) {
		.ticker li:not(:first-child) {
			display: none;
		}
	}
	.alerts {
		grid-column: span 8;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: var(--sp-2);
		align-content: start;
	}
	.alert {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 10px;
		align-items: center;
		padding: 12px 14px;
		font-size: var(--fs-sm);
		color: var(--text);
	}
	.alert[data-tone='bad'] :global(.icon:first-child) {
		color: var(--danger);
	}
	.alert[data-tone='gold'] :global(.icon:first-child) {
		color: var(--gold);
	}
	.alert[data-tone='ok'] :global(.icon:first-child) {
		color: var(--emerald-strong);
	}
	.cal {
		grid-column: span 7;
		padding: var(--sp-5);
		display: grid;
		gap: var(--sp-3);
	}
	.strip {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 8px;
	}
	.day {
		display: grid;
		justify-items: center;
		gap: 4px;
		padding: 10px 6px;
		border-radius: var(--radius-m);
		background: rgb(10 13 16 / 0.4);
		text-align: center;
	}
	.day.cup {
		box-shadow: inset 0 0 0 1px rgb(232 184 106 / 0.45);
	}
	.wd {
		font-size: 11px;
		color: var(--text-3);
		font-weight: 700;
		text-transform: uppercase;
	}
	.day small {
		font-size: 10px;
		color: var(--text-3);
	}
	.table {
		grid-column: span 5;
		padding: var(--sp-5);
		display: grid;
		gap: var(--sp-3);
		align-content: start;
	}
	.tips {
		grid-column: span 7;
		padding: var(--sp-5);
		display: grid;
		gap: var(--sp-3);
	}
	.inbox {
		grid-column: span 5;
		padding: var(--sp-5);
		display: grid;
		gap: var(--sp-3);
		align-content: start;
	}
	.inbox ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}
	.inbox a {
		display: grid;
		grid-template-columns: 8px auto 1fr;
		gap: 10px;
		align-items: center;
		padding: 8px 10px;
		border-radius: var(--radius-s);
		font-size: var(--fs-sm);
	}
	.inbox a:hover {
		background: rgb(231 237 240 / 0.04);
	}
	.flag {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: transparent;
	}
	.unread .flag {
		background: var(--emerald);
	}
	.important.unread .flag {
		background: var(--gold);
	}
	.from {
		color: var(--text-3);
		white-space: nowrap;
		font-size: var(--fs-xs);
	}
	.subject {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.unread .subject {
		font-weight: 700;
	}
	@media (max-width: 1200px) {
		.match,
		.alerts,
		.cal,
		.tips {
			grid-column: span 12;
		}
		.sit,
		.board {
			grid-column: span 6;
		}
		.table,
		.inbox {
			grid-column: span 6;
		}
	}
	@media (max-width: 760px) {
		.sit,
		.board,
		.table,
		.inbox {
			grid-column: span 12;
		}
		.strip {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.vs :global(svg) {
			width: 60px;
			height: 60px;
		}
	}
</style>
