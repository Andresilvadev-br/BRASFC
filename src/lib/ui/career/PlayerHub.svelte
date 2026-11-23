<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { api, isVersionConflict } from '#lib/api.ts';
	import { DEFAULT_APPEARANCE } from '#lib/domain/appearance.ts';
	import type { Career } from '#lib/domain/career.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { addDays, diffDays, formatShort } from '#lib/domain/dates.ts';
	import { formatExactMoney, formatMoney, ROLE_LABELS, transferWindow } from '#lib/domain/market.ts';
	import { CAREER_PLAYER_ID, fixtureSetup, selectionOf, universeCoach, type MatchSummary } from '#lib/domain/matchday.ts';
	import { adjustedOverall, individualSponsor, matchObjective, TRAINING_ATTRIBUTES, playerAttributes, playerState, PLAYER_SELECTION, PRESS_ANSWERS, PRESS_QUESTIONS, trainBlock } from '#lib/domain/player-development.ts';
	import type { Totals } from '#lib/domain/playerstats.ts';
	import { POSITION_INFO, positionFit } from '#lib/domain/positions.ts';
	import { isPlayerFocusForPosition, PLAYER_FOCUS, PLAYER_FOCUS_LABELS, type PlayerFocus } from '#lib/domain/training.ts';
	import type { CareerView } from '#lib/domain/view.ts';
	import { ATTRIBUTE_LABELS, GOALKEEPING, MENTAL, PHYSICAL, TECHNICAL } from '#lib/engine/attributes.ts';
	import { count, enter, indicator } from '#lib/motion/actions.ts';
	import { playerKit } from '#lib/pixel/kits.ts';
	import Button from '#lib/ui/Button.svelte';
	import Crest from '#lib/ui/Crest.svelte';
	import Modal from '#lib/ui/Modal.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';
	import Pixel from '#lib/ui/Pixel.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Sparkline from '#lib/ui/v4/Sparkline.svelte';
	import ActionCard from '#lib/ui/cards/ActionCard.svelte';
	import MatchCard from '#lib/ui/cards/MatchCard.svelte';
	import SelectCard from '#lib/ui/cards/SelectCard.svelte';
	import StatCard from '#lib/ui/cards/StatCard.svelte';
	import type { IconName } from '#lib/ui/icons.ts';

	let { career: c, view: v, recent, history }: {
		career: Career; view: CareerView;
		recent: Array<{ home: string; away: string; summary: MatchSummary }>;
		history: { all: Totals; seasons: Array<{ season: number; totals: Totals }>; records: { rating: number; goals: number; assists: number } } | null;
	} = $props();

	const sections = { perfil: 'Visão geral', treino: 'Desenvolvimento', mercado: 'Contratos e mercado', historico: 'Trajetória' } as const;
	const section = $derived(Object.keys(sections).find((s) => s === page.url.searchParams.get('secao')) ?? 'perfil');
	const base = $derived(`/carreira/${c.id}`);
	const profile = $derived(c.data.player!);
	const position = $derived(c.data.position!);
	const pc = $derived(playerState(c, v.division)!);
	const d = $derived(pc.daily);
	const overall = $derived(adjustedOverall(c, pc));
	const attributes = $derived(playerAttributes(c.seed, position, profile, d).attributes);
	const sets = $derived([
		{ value: 'habilidade', label: position === 'GOL' ? 'Goleiro' : 'Técnica', keys: position === 'GOL' ? GOALKEEPING : TECHNICAL },
		{ value: 'fisico', label: 'Físico', keys: PHYSICAL },
		{ value: 'mental', label: 'Mental', keys: MENTAL }
	]);
	let attributeGroup = $state('habilidade');
	const keys = $derived(sets.find(({ value }) => value === attributeGroup)!.keys);
	const progressChange = $derived(d.progress.length > 1 ? d.progress.at(-1)!.overall - d.progress[0].overall : 0);
	const next = $derived(v.upcoming);
	const nextOpp = $derived(next ? (next.home === c.clubId ? next.away : next.home) : null);
	const gameDates = $derived(v.clubFixtures.map((f) => f.date));
	const coach = $derived(universeCoach(c, c.clubId));
	const latest = $derived(recent.at(-1)?.summary);
	const recentForm = $derived(recent.flatMap(({ home, away, summary }) => {
		if (!summary.me || !summary.mySide) return [];
		const rival = summary.mySide === 'home' ? away : home;
		return [{ short: getClub(rival)?.short ?? rival, name: getClub(rival)?.name ?? rival, rating: summary.me.rating }];
	}));
	const standingsOpponent = $derived(v.standings.find((row) => row.clubId === nextOpp));
	const positionRank = $derived(1 + v.squad.filter((p) => p.id !== CAREER_PLAYER_ID && p.position === position && p.overall > overall).length);
	const positionCount = $derived(1 + v.squad.filter((p) => p.id !== CAREER_PLAYER_ID && p.position === position).length);
	const selection = $derived.by(() => {
		if (!v.next) return null;
		const setup = fixtureSetup(c, v.next, v.tactic, { season: c.season, firstSeason: v.firstSeason, tactical: v.effective, fitness: c.data.fitness, observed: [], playerCalendar: { division: v.division, gameDates } });
		return selectionOf(setup[setup.mySide]);
	});
	const rivals = $derived(v.squad.filter((p) => p.id !== CAREER_PLAYER_ID && positionFit(p.position, position) >= 0.6).sort((a, b) => positionFit(b.position, position) - positionFit(a.position, position) || b.overall - a.overall).slice(0, 3));
	const windowOpen = $derived(!v.seasonOver && !!transferWindow(v.nextRound));
	const offers = $derived(pc.offers.filter((o) => o.season === c.season && o.expiresRound >= v.nextRound));
	const sponsor = $derived(individualSponsor(c, pc));
	const totals = $derived(history?.seasons.find((s) => s.season === c.season)?.totals);
	const dates = $derived(Array.from({ length: Math.min(14, Math.max(0, v.step ? diffDays(c.gameDate, v.step.date) : 0)) }, (_, i) => addDays(c.gameDate, i)));
	const canScout = $derived(windowOpen && !d.loan && (!d.lastSearch || diffDays(d.lastSearch, c.gameDate) >= 14));
	let chosenFocus = $state<PlayerFocus | null>(null);
	const options = $derived(PLAYER_FOCUS.filter((f) => isPlayerFocusForPosition(f, position)));
	const storedFocus = $derived(chosenFocus ?? c.data.playerFocus);
	const focus = $derived(storedFocus && options.includes(storedFocus) ? storedFocus : position === 'GOL' ? 'goleiro' : 'fisico');
	let busy = $state(false);
	let feedback = $state('');
	let failed = $state(false);
	let portrait = $state(true);
	let acceptOfferId = $state<string | null>(null);
	let acceptOpen = $state(false);
	const acceptOffer = $derived(offers.find((offer) => offer.id === acceptOfferId));

	const focusIcons: Record<PlayerFocus, IconName> = { finalizacao: 'star', passe: 'link', drible: 'sparkle', marcacao: 'lock', fisico: 'heart', goleiro: 'crown' };
	const previousOverall = $derived(d.progress.length > 1 ? d.progress.at(-2)!.overall : null);
	const canNegotiate = $derived(!d.loan && pc.contract.until <= c.season + 1 && d.trust >= 35);
	const renewYears = $derived([2, 3].filter((y) => c.season + y - 1 > pc.contract.until));
	const scoutStatus = $derived(d.loan ? 'Indisponível durante o empréstimo' : !windowOpen ? 'Janela de transferências fechada' : canScout ? 'Disponível agora' : 'Sondagem recente · aguarde 14 dias');
	const contractLeft = $derived(Math.max(0, pc.contract.until - c.season));
	const bookedCount = $derived(d.drills.filter((entry) => entry.date >= c.gameDate).length);

	async function act(action: string, values: Record<string, unknown> = {}) {
		if (busy) return;
		busy = true;
		feedback = '';
		failed = false;
		try {
			const res = await api<{ message: string }>(`/api/careers/${c.id}/club`, { body: { action: `jogador-${action}`, version: c.version, ...values } });
			await invalidate('app:career');
			feedback = res.message;
		} catch (e) {
			failed = true;
			feedback = e instanceof Error ? e.message : 'Não foi possível registrar a decisão.';
			if (isVersionConflict(e)) await invalidate('app:career');
		} finally {
			busy = false;
		}
	}
	function reviewOffer(id: string) {
		acceptOfferId = id;
		acceptOpen = true;
	}

	async function confirmOffer() {
		if (busy || !acceptOffer) return;
		acceptOpen = false;
		await act('aceitar', { offerId: acceptOffer.id });
	}
</script>

<section class="player-hero" style:--club={v.club.colors.primary} style:--club-2={v.club.colors.secondary}>
	<span class="hero-stripes" aria-hidden="true"></span>
	<div class="hero-id">
		<p class="eyebrow">Carreira de jogador · {c.season}</p>
		<h1 class="display">{c.personName}</h1>
		<div class="hero-tags">
			<span class="chip"><Crest clubId={c.clubId} size={18} />{v.club.name}</span>
			<span class="chip">{POSITION_INFO[position].label}</span>
			<span class="chip">Camisa {profile.number}</span>
			<span class="chip">{ROLE_LABELS[pc.contract.role]}</span>
		</div>
		<div class="hero-actions">
			<Button href="{base}/partida" variant="primary" iconRight="arrowRight">{v.seasonOver ? 'Encerrar temporada' : v.next ? 'Dia de jogo' : 'Avançar calendário'}</Button>
			<Button size="sm" variant="ghost" icon="shirt" onclick={() => (portrait = !portrait)}>{portrait ? 'Ver retrato' : 'Ver uniforme'}</Button>
		</div>
	</div>
	<div class="hero-ovr" aria-label="Geral {overall}, potencial {profile.potential}">
		<strong use:count={{ value: overall }}>{overall}</strong>
		<span>Geral</span>
		<small>Potencial {profile.potential}</small>
	</div>
	{#key portrait}<div class="avatar" use:enter><Pixel variant={portrait ? 'full' : 'bust'} size={portrait ? 205 : 125} appearance={c.data.appearance ?? DEFAULT_APPEARANCE} kit={playerKit(c.clubId, position)} clubId={c.clubId} styled ball={portrait} label="Seu jogador" /></div>{/key}
</section>

<nav class="tabs" aria-label="Central do jogador">
	<span class="tab-line" use:indicator={{ axis: 'x', key: section }}></span>
	{#each Object.entries(sections) as [key, label] (key)}
		<a href={key === 'perfil' ? base : `${base}?secao=${key}`} aria-current={section === key ? 'page' : undefined} data-umx-press>{label}</a>
	{/each}
</nav>

{#if feedback}<p class="notice" class:failed role={failed ? 'alert' : 'status'} use:enter>{feedback}</p>{/if}

{#key section}
<div class="hub-grid" use:enter>
	{#if section === 'perfil'}
		<section class="card fixture">
			<h2 class="section-title">Próximo compromisso</h2>
			{#if next && nextOpp}
				<MatchCard home={next.home} away={next.away} time={next.time} label={formatShort(next.date)} status={next.home === c.clubId ? 'Em casa' : 'Fora de casa'} highlight />
				{#if standingsOpponent && next.competition === v.division}
					<p class="muted">{getClub(nextOpp)?.name ?? nextOpp} é {standingsOpponent.position}º em {v.divisionLabel} · {standingsOpponent.points} pts</p>
				{/if}
				{#if selection}<div class="fixture-status"><strong>{PLAYER_SELECTION[selection]}</strong><small>{matchObjective(position).label}</small></div>{/if}
			{:else}<p class="muted">Sem partidas restantes nesta temporada.</p>{/if}
			<a href="{base}/calendario">Ver calendário completo</a>
		</section>
		<section class="card">
			<h2 class="section-title">Disputa por posição</h2>
			<div class="stat-row">
				<StatCard label="Confiança do treinador" value={d.trust} max={100} hint={coach?.name ?? 'Comissão técnica'} />
				<StatCard label="Ranking na posição" value={positionRank} suffix={`º de ${positionCount}`} tone="info" hint="Pelo geral" />
			</div>
			<ul class="rivals">
				{#each rivals as rival (rival.id)}
					<li><span><b>{rival.name}</b><small>{rival.position}</small></span><span class="ovr-badge" class:above={rival.overall > overall}>{rival.overall}</span></li>
				{:else}<li class="muted">Nenhum concorrente direto no elenco.</li>{/each}
			</ul>
		</section>
		<section class="card">
			<h2 class="section-title">Resenha do vestiário</h2>
			<div class="stat-row four">
				<StatCard label="Condição" value={Math.round(d.condition)} max={100} suffix="%" />
				<StatCard label="Elenco" value={d.support.squad} max={100} />
				<StatCard label="Torcida" value={d.support.fans} max={100} />
				<StatCard label="Reputação" value={pc.reputation} max={100} tone="gold" />
			</div>
			{#if d.injuryUntil && d.injuryUntil > c.gameDate}<p class="warning">Em recuperação. Retorno previsto para {formatShort(d.injuryUntil)}.</p>{/if}
			{#if latest?.assessment}
				<p>{latest.assessment.feedback}{latest.me ? ` Nota ${latest.me.rating.toFixed(1)} em ${latest.me.minutes} min.` : ''}</p>
			{/if}
			{#if recentForm.length}
				<div class="match-form" aria-label="Notas por adversário">
					{#each recentForm as game, index (index)}
						<div title={game.name} class:good={game.rating >= 7} class:bad={game.rating < 6}><strong>{game.rating.toFixed(1)}</strong><small>{game.short}</small></div>
					{/each}
				</div>
			{/if}
		</section>
		<section class="card">
			<h2 class="section-title">Imprensa e decisões</h2>
			{#if d.press}
				{@const press = d.press}
				<blockquote class="press">{PRESS_QUESTIONS[press.kind]}</blockquote>
				<div class="answers">
					{#each Object.entries(PRESS_ANSWERS) as [choice, answer] (choice)}
						<button type="button" class="answer" disabled={busy} onclick={() => act('entrevista', { choice, date: press.date })} data-umx-press>{answer.label}</button>
					{/each}
				</div>
			{:else}<p class="muted">Nenhuma entrevista pendente.</p>{/if}
			<div class="links"><a href="{base}/mensagens">Caixa de mensagens</a><a href="{base}/mundo">Notícias do universo</a></div>
		</section>
	{:else if section === 'treino'}
		<section class="card wide">
			<div class="section-top">
				<div><h2 class="section-title">Foco do treino individual</h2><p class="muted">Uma sessão por dia, até duas por semana. Treinar melhora atributos e custa condição física.</p></div>
				<span class="chip">{bookedCount} {bookedCount === 1 ? 'sessão marcada' : 'sessões marcadas'}</span>
			</div>
			<div class="focus-grid" role="radiogroup" aria-label="Foco do treino">
				{#each options as f (f)}
					<SelectCard selected={focus === f} icon={focusIcons[f]} title={PLAYER_FOCUS_LABELS[f]} onselect={() => (chosenFocus = f)}>
						<span class="focus-attrs">{#each TRAINING_ATTRIBUTES[f] as key (key)}<span>{ATTRIBUTE_LABELS[key]} <b>{attributes[key]}</b></span>{/each}</span>
					</SelectCard>
				{/each}
			</div>
			<h3 class="section-title small">Agenda</h3>
			<div class="days">
				{#each dates as date (date)}
					{@const booked = d.drills.find((entry) => entry.date === date)}
					{@const block = trainBlock(date, c.gameDate, gameDates, pc, v.step?.date ?? null)}
					<div class="day" class:booked={!!booked} class:blocked={!booked && !!block}>
						<strong>{formatShort(date)}</strong>
						{#if booked}
							<span class="day-focus"><Icon name={focusIcons[booked.focus]} size={14} />{PLAYER_FOCUS_LABELS[booked.focus]}</span><Button size="sm" variant="ghost" disabled={busy} onclick={() => act('cancelar-treino', { date })}>Cancelar</Button>
						{:else if !block}
							<Button size="sm" icon="plus" disabled={busy} onclick={() => act('treinar', { date, focus })} aria-label="Marcar treino para {formatShort(date)}">Treinar</Button>
						{:else}<small>{block}</small>{/if}
					</div>
				{:else}<p class="muted">Avance o calendário para abrir novas datas.</p>{/each}
			</div>
		</section>
		<section class="card wide">
			<h2 class="section-title">Evolução</h2>
			<div class="stat-row five">
				<StatCard label="Geral atual" value={overall} tone="emerald" delta={previousOverall === null ? null : overall - previousOverall} hint={previousOverall === null ? undefined : 'desde o registro anterior'} />
				<StatCard label="Geral anterior" value={previousOverall ?? overall} tone="info" hint={previousOverall === null ? 'Sem registro anterior' : formatShort(d.progress.at(-2)!.date)} />
				<StatCard label="Potencial" value={profile.potential} tone="gold" hint={`${Math.max(0, profile.potential - overall)} pontos a desenvolver`} />
				<StatCard label="Condição" value={Math.round(d.condition)} max={100} suffix="%" />
				<StatCard label="Desde o início" value={progressChange} tone={progressChange >= 0 ? 'emerald' : 'danger'} hint={d.progress.length > 1 ? `desde ${formatShort(d.progress[0].date)}` : 'Histórico ainda insuficiente'} />
			</div>
			{#if d.progress.length > 1}
				<div class="trend"><Sparkline values={d.progress.map((point) => point.overall)} width={320} height={56} label="Evolução do geral ao longo da carreira" /></div>
			{:else}
				<p class="empty">O gráfico de evolução aparece depois do primeiro registro de progresso. Nenhuma evolução é estimada.</p>
			{/if}
			<Segmented label="Grupo de atributos" options={sets} bind:value={attributeGroup} />
			{#key attributeGroup}<div class="skills" use:enter>
				{#each keys as key (key)}
					{@const trained = TRAINING_ATTRIBUTES[focus].includes(key)}
					<div class="skill" class:trained><div class="line"><span>{ATTRIBUTE_LABELS[key]}</span><strong>{attributes[key]}</strong></div><progress value={attributes[key]} max="99" aria-label={ATTRIBUTE_LABELS[key]}></progress></div>
				{/each}
			</div>{/key}
		</section>
	{:else if section === 'mercado'}
		<section class="card contract wide">
			<div class="contract-club"><Crest clubId={c.clubId} size={64} />
				<div><p class="eyebrow">{d.loan ? 'Empréstimo ativo' : 'Contrato profissional'}</p>
					<h2 class="display">{v.club.name}</h2>
					<p class="muted">{d.loan ? `Vínculo com ${getClub(d.loan.parent)?.name ?? d.loan.parent} · retorno após ${d.loan.until}` : `Contrato até ${pc.contract.until} · ${ROLE_LABELS[pc.contract.role]}`}</p></div>
			</div>
			<div class="stat-row four">
				<StatCard label="Salário mensal" value={pc.contract.wage} display={formatMoney(pc.contract.wage)} tone="emerald" />
				<StatCard label="Receita acumulada" value={Math.round(d.earnings)} display={formatMoney(Math.round(d.earnings))} tone="gold" />
				<StatCard label="Temporadas restantes" value={contractLeft} tone={contractLeft <= 1 ? 'danger' : 'info'} hint={`Até ${pc.contract.until}`} />
				<StatCard label="Relação com o empresário" value={d.support.agent} max={100} hint={`${pc.agent.name} · ${pc.agent.style}`} />
			</div>
			{#if d.renewal}
				<div class="renewal" use:enter>
					<p><strong>Proposta de renovação</strong> · {d.renewal.years} temporadas a {formatMoney(d.renewal.wage)}/mês.</p>
					<Button variant="primary" size="sm" disabled={busy} onclick={() => act('renovar')}>Assinar renovação</Button>
				</div>
			{/if}
		</section>
		<div class="actions-grid wide">
			<ActionCard icon="briefcase" title="Buscar transferência" description={d.trust < 50 ? 'Seu empresário sonda clubes interessados. Compare papel no elenco e salário antes de mudar.' : 'Seu empresário sonda clubes interessados em contratar você em definitivo.'}
				status={scoutStatus} disabled={!canScout} {busy} onclick={() => act('sondar', { kind: 'compra' })} />
			<ActionCard icon="refresh" tone="info" title="Buscar empréstimo" description="Uma passagem por empréstimo pode abrir espaço para ganhar minutos e voltar valorizado."
				status={pc.contract.until > c.season ? scoutStatus : 'Exige contrato além desta temporada'} disabled={!canScout || pc.contract.until <= c.season} {busy} onclick={() => act('sondar', { kind: 'emprestimo' })} />
			<ActionCard icon="save" tone="gold" title="Solicitar renovação" description={canNegotiate ? 'Abra a negociação para estender o vínculo com o clube.' : 'Liberada no último ano de contrato, com confiança do treinador de pelo menos 35.'}
				status={d.renewal ? 'Proposta aguardando assinatura' : canNegotiate ? 'Disponível' : 'Indisponível no momento'}>
				{#if canNegotiate && !d.renewal}
					<span class="inline-actions">{#each renewYears as years (years)}<Button size="sm" disabled={busy} onclick={() => act('negociar', { years })}>{years} temporadas</Button>{/each}</span>
				{/if}
			</ActionCard>
			{#if d.sponsor}
				<ActionCard icon="star" tone="gold" title="Patrocínio individual" description={`${d.sponsor.brand} · ${formatMoney(d.sponsor.monthly)}/mês até ${d.sponsor.until}.`}
					status={pc.reputation < 35 ? 'Pagamento suspenso · reputação abaixo de 35' : 'Contrato ativo'} />
			{:else if sponsor}
				<ActionCard icon="star" tone="gold" title="Patrocínio individual" description={`${sponsor.brand} oferece ${formatMoney(sponsor.monthly)}/mês até ${sponsor.until}.`}
					status="Proposta disponível · assinar" {busy} onclick={() => act('patrocinio')} />
			{:else}
				<ActionCard icon="star" tone="neutral" title="Patrocínio individual" description="Marcas procuram atletas com 45 de reputação e 55 de apoio da torcida."
					status={`Reputação ${pc.reputation} · Torcida ${d.support.fans}`} disabled onclick={() => {}} />
			{/if}
		</div>
		<section class="card wide">
			<h2 class="section-title">Propostas de clubes</h2>
			<div class="offers">
				{#each offers as offer (offer.id)}
					{@const club = getClub(offer.clubId)}
					<article class="offer" style:--offer={club?.colors.primary ?? 'var(--surface-3)'} use:enter>
						<div class="offer-head"><Crest clubId={offer.clubId} size={40} /><div><strong>{club?.name ?? offer.clubId}</strong><small>{offer.kind === 'emprestimo' ? 'Empréstimo até o fim da temporada' : `${offer.years} temporadas`} · {ROLE_LABELS[offer.role]}</small></div></div>
						<div class="line"><span>Salário mensal</span><strong>{formatExactMoney(offer.wage)}</strong></div>
						{#if pc.contract.wage > 0 && offer.wage !== pc.contract.wage}
							<small class:pos={offer.wage > pc.contract.wage} class:neg={offer.wage < pc.contract.wage}>{offer.wage > pc.contract.wage ? '+' : ''}{Math.round((offer.wage / pc.contract.wage - 1) * 100)}% em relação ao salário atual</small>
						{/if}
						<small class="muted">Válida até a rodada {offer.expiresRound}</small>
						<div class="offer-actions">
							{#if windowOpen}
								<Button size="sm" variant="primary" disabled={busy} onclick={() => reviewOffer(offer.id)}>Aceitar</Button>
								{#if !offer.countered && offer.kind !== 'emprestimo'}<Button size="sm" disabled={busy} onclick={() => act('contraproposta', { offerId: offer.id })}>Pedir aumento</Button>{/if}
							{/if}
							<Button size="sm" variant="ghost" disabled={busy} onclick={() => act('recusar', { offerId: offer.id })}>Recusar</Button>
						</div>
					</article>
				{:else}<p class="empty">Nenhuma proposta em aberto. As propostas chegam depois de uma sondagem do empresário ou pelo seu desempenho.</p>{/each}
			</div>
		</section>
	{:else}
		<section class="card wide">
			<div class="section-top"><h2 class="section-title">Números da carreira</h2><a href="{base}/estatisticas">Estatísticas jogo a jogo</a></div>
			<div class="stat-row five">
				<StatCard label="Partidas" value={history?.all.games ?? 0} />
				<StatCard label="Minutos" value={history?.all.minutes ?? 0} tone="info" />
				<StatCard label="Gols" value={history?.all.goals ?? 0} tone="gold" />
				<StatCard label="Assistências" value={history?.all.assists ?? 0} tone="info" />
				<StatCard label="Nota média" value={history?.all.games ? history.all.rating : 0} decimals={1} hint={history?.all.games ? undefined : 'Sem partidas'} />
			</div>
			{#if history?.all.games}
				<p class="muted">Recordes em uma partida · Nota {history.records.rating.toFixed(1)} · {history.records.goals} gols · {history.records.assists} assistências</p>
				<div class="season-form" aria-label="Comparação por temporada">
					{#each history.seasons.slice(0, 6) as entry (entry.season)}
						<div><strong>{entry.season}</strong><progress value={entry.totals.rating} max="10" aria-label={`Nota média em ${entry.season}`}></progress><span>{entry.totals.rating.toFixed(1)} · {entry.totals.games} jogos</span></div>
					{/each}
				</div>
			{/if}
		</section>
		<section class="card">
			<h2 class="section-title">Objetivos de {c.season}</h2>
			<div class="goals">
				{#each pc.goals as goal (goal.kind)}
					{@const value = (totals?.[goal.kind === 'jogos' ? 'games' : goal.kind === 'gols' ? 'goals' : goal.kind === 'nota' ? 'rating' : 'starts'] ?? 0)}
					<StatCard label={goal.label} value={Math.min(value, goal.target)} max={goal.target} decimals={goal.kind === 'nota' ? 1 : 0} hint={value >= goal.target ? 'Objetivo cumprido' : undefined} />
				{/each}
			</div>
		</section>
		<section class="card">
			<h2 class="section-title">Clubes e conquistas</h2>
			<ol class="journey">
				{#each [...d.clubs].reverse() as stint, index (index)}
					<li><Crest clubId={stint.clubId} size={28} /><span><b>{getClub(stint.clubId)?.name ?? stint.clubId}</b><small>{stint.kind === 'inicio' ? 'Estreia profissional' : stint.kind === 'compra' ? 'Transferência' : stint.kind === 'retorno' ? 'Retorno' : 'Empréstimo'}</small></span><strong>{stint.date.slice(0, 4)}</strong></li>
				{/each}
				{#each [...pc.awards].reverse() as award (`${award.season}-${award.label}`)}
					<li class="award"><span class="trophy" aria-hidden="true"><Icon name="trophy" size={16} /></span><span><b>{award.label}</b></span><strong>{award.season}</strong></li>
				{/each}
			</ol>
		</section>
	{/if}
</div>
{/key}

{#if acceptOffer}
<Modal bind:open={acceptOpen} title={acceptOffer.kind === 'emprestimo' ? 'Confirmar empréstimo' : 'Confirmar transferência'} size="sm">
	<p>{getClub(acceptOffer.clubId)?.name ?? acceptOffer.clubId} · {formatExactMoney(acceptOffer.wage)} por mês · {ROLE_LABELS[acceptOffer.role]}</p>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (acceptOpen = false)}>Voltar</Button>
		<Button variant="primary" disabled={busy} onclick={confirmOffer}>Confirmar mudança de clube</Button>
	{/snippet}
</Modal>
{/if}

<style>
	.player-hero {
		position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: clamp(12px, 3vw, 32px);
		margin: 6px 0 18px; padding: clamp(18px, 3vw, 32px); border-radius: var(--radius-xl); border: 1px solid var(--line-strong); overflow: hidden; isolation: isolate;
		background: radial-gradient(110% 150% at 100% 100%, color-mix(in srgb, var(--club) 50%, transparent), transparent 60%), linear-gradient(160deg, #182127, var(--bg-deep));
		box-shadow: var(--shadow-2);
	}
	.hero-stripes { position: absolute; inset: 0; z-index: -1; pointer-events: none; background: repeating-linear-gradient(115deg, transparent 0 46px, rgb(255 255 255 / .025) 46px 92px); mask-image: linear-gradient(90deg, transparent 30%, #000); }
	.hero-id { min-width: 0; }
	.hero-id h1 { margin: 4px 0 12px; font-size: var(--fs-hero); overflow-wrap: anywhere; }
	.hero-tags, .hero-actions { display: flex; flex-wrap: wrap; gap: 8px; }
	.hero-actions { margin-top: 18px; align-items: center; }
	.hero-ovr { display: grid; justify-items: center; padding: 14px 18px; border-radius: 16px; background: rgb(0 0 0 / .35); border: 1px solid var(--line-strong); text-align: center; }
	.hero-ovr strong { font-family: var(--font-display); font-weight: 800; font-size: clamp(3rem, 7vw, 4.6rem); line-height: .9; color: var(--emerald-strong); }
	.hero-ovr span { font-size: var(--fs-xs); font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--text-2); }
	.hero-ovr small { margin-top: 6px; color: var(--gold); font-weight: 700; }
	.avatar { display: grid; place-items: center; filter: drop-shadow(0 14px 18px rgb(0 0 0 / .45)); }
	.avatar :global(svg) { width: min(14vw, 165px); min-width: 78px; height: auto; }
	.eyebrow { color: var(--emerald-strong); }
	.tabs { position: relative; display: flex; gap: 6px; overflow-x: auto; padding: 3px 0; margin-bottom: 18px; border-bottom: 1px solid var(--line); scrollbar-width: none; }
	.tabs a { position: relative; flex-shrink: 0; padding: 10px 14px; color: var(--text-2); font-weight: 600; white-space: nowrap; }
	.tabs a[aria-current] { color: var(--emerald-strong); }
	.tab-line { position: absolute; bottom: 0; height: 2px; left: 0; background: var(--emerald-strong); pointer-events: none; }
	.hub-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; gap: 14px; }
	.card { min-width: 0; padding: clamp(14px, 2.2vw, 24px); border-radius: var(--radius-l); background: var(--card-bg); border: 1px solid var(--card-line); box-shadow: var(--shadow-1); }
	.card p { margin: 8px 0 12px; }
	.card a { color: var(--emerald-strong); text-decoration: underline; text-underline-offset: .2em; }
	.section-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
	.section-title.small { margin-top: 18px; font-size: var(--fs-lg); }
	.wide { grid-column: 1 / -1; }
	.stat-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
	.stat-row.four { grid-template-columns: repeat(auto-fit, minmax(min(100%, 140px), 1fr)); }
	.stat-row.five { grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); }
	.rivals, .journey { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 6px; }
	.rivals li { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; border-radius: 10px; background: var(--surface-sunken); border: 1px solid var(--line); }
	.rivals li span:first-child { display: grid; min-width: 0; }
	.rivals small, .journey small { color: var(--text-3); font-size: var(--fs-xs); }
	.ovr-badge { font-family: var(--font-display); font-weight: 800; font-size: 1.2rem; padding: 2px 10px; border-radius: 8px; background: var(--emerald-soft); color: var(--emerald-strong); }
	.ovr-badge.above { background: var(--danger-soft); color: var(--danger); }
	.fixture { background: radial-gradient(90% 120% at 0 0, var(--emerald-soft), transparent 60%), var(--card-bg); }
	.fixture-status { margin: 10px 0 12px; border: 1px solid var(--emerald-line); border-radius: 10px; background: var(--emerald-soft); padding: 8px 12px; }
	.fixture-status strong, .fixture-status small { display: block; }
	.fixture-status strong { color: var(--emerald-strong); }
	.match-form { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
	.match-form > div { flex: 1 1 54px; max-width: 86px; display: grid; justify-items: center; padding: 8px 4px; border-radius: 10px; background: var(--surface-sunken); border: 1px solid var(--line); }
	.match-form > div strong { font-family: var(--font-display); font-size: 1.25rem; }
	.match-form > div.good strong { color: var(--good); }
	.match-form > div.bad strong { color: var(--bad); }
	.match-form small { color: var(--text-3); font-size: var(--fs-xs); }
	.press { margin: 4px 0 12px; padding: 12px 14px; border-left: 3px solid var(--gold); border-radius: 0 10px 10px 0; background: var(--gold-soft); font-style: italic; }
	.answers { display: grid; gap: 6px; }
	.answer { text-align: start; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface-sunken); color: var(--text); font-weight: 600; transition: border-color var(--dur-2) var(--ease-out); }
	.answer:not(:disabled):hover { border-color: var(--emerald-line); }
	.links { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 14px; }
	.focus-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr)); gap: 10px; margin-top: 12px; }
	.focus-attrs { display: flex; flex-wrap: wrap; gap: 4px; }
	.focus-attrs span { font-size: .6875rem; padding: 2px 7px; border-radius: 99px; background: rgb(231 237 240 / .06); color: var(--text-2); }
	.focus-attrs b { color: var(--text); }
	.days { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 132px), 1fr)); gap: 8px; }
	.day { display: flex; flex-direction: column; align-items: start; gap: 8px; min-height: 96px; border-radius: 12px; padding: 12px; border: 1px solid var(--line); background: var(--surface-sunken); }
	.day strong { font-family: var(--font-display); font-size: var(--fs-lg); text-transform: uppercase; }
	.day small { color: var(--text-3); font-size: var(--fs-xs); }
	.day.booked { border-color: var(--emerald-line); background: linear-gradient(160deg, var(--emerald-soft), transparent), var(--surface-sunken); }
	.day.blocked { opacity: .7; }
	.day-focus { display: inline-flex; align-items: center; gap: 6px; color: var(--emerald-strong); font-weight: 700; font-size: var(--fs-sm); }
	.trend { margin: 14px 0; color: var(--emerald-strong); }
	.trend :global(svg) { width: 100%; max-width: 520px; height: auto; }
	.empty { padding: 14px; border: 1px dashed var(--line-strong); border-radius: 12px; color: var(--text-2); }
	.skills { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); gap: 10px; margin-top: 14px; }
	.skill { padding: 10px 12px; border-radius: 10px; background: var(--surface-sunken); border: 1px solid var(--line); }
	.skill.trained { border-color: var(--emerald-line); }
	.line { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0 6px; }
	progress { display: block; width: 100%; }
	.warning, .failed { color: var(--danger, #ff8787); }
	.notice { padding: 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); margin: 0 0 14px; }
	.contract { display: grid; gap: 16px; background: radial-gradient(100% 140% at 100% 0, color-mix(in srgb, var(--club, var(--emerald)) 22%, transparent), transparent 60%), var(--card-bg); }
	.contract-club { display: flex; align-items: center; gap: 16px; }
	.contract-club h2 { font-size: clamp(1.6rem, 3.4vw, 2.4rem); }
	.contract-club p { margin: 4px 0 0; }
	.renewal { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--gold); background: var(--gold-soft); }
	.renewal p { margin: 0; }
	.actions-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 12px; }
	.inline-actions { display: flex; flex-wrap: wrap; gap: 6px; }
	.offers { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: 12px; }
	.offer { display: grid; gap: 6px; padding: 14px; border-radius: 14px; border: 1px solid var(--line); background: linear-gradient(160deg, color-mix(in srgb, var(--offer) 22%, transparent), transparent 55%), var(--surface-sunken); }
	.offer-head { display: flex; align-items: center; gap: 10px; }
	.offer-head div { display: grid; min-width: 0; }
	.offer-head small { color: var(--text-3); }
	.offer-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
	.goals { display: grid; gap: 8px; }
	.journey li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; background: var(--surface-sunken); border: 1px solid var(--line); }
	.journey li span:nth-child(2) { display: grid; }
	.journey .award { border-color: rgb(232 184 106 / .35); }
	.trophy { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--gold-soft); color: var(--gold); }
	.season-form { display: grid; gap: 8px; margin-top: 14px; }
	.season-form > div { display: grid; grid-template-columns: 4em minmax(35px, 1fr) auto; gap: 10px; align-items: center; }
	@media (max-width: 880px) { .hub-grid { grid-template-columns: minmax(0, 1fr); } }
	@media (max-width: 640px) {
		.player-hero { grid-template-columns: minmax(0, 1fr) auto; }
		.hero-id { grid-column: 1 / -1; }
		.hero-ovr { justify-self: start; }
	}
</style>
