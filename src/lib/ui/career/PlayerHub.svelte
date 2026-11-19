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
	import Sparkline from '#lib/ui/v4/Sparkline.svelte';

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
		const setup = fixtureSetup(c, v.next, v.tactic, { season: c.season, firstSeason: v.firstSeason, tactical: v.tactical, fitness: c.data.fitness, observed: [], playerCalendar: { division: v.division, gameDates } });
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

<header class="player-header">
	<div><p class="eyebrow">Carreira de jogador</p><h1>{c.personName}</h1><p>{v.club.name} · {POSITION_INFO[position].label} · {c.season}</p></div>
	<Button href="{base}/partida" variant="primary" iconRight="arrowRight">{v.seasonOver ? 'Encerrar temporada' : v.next ? 'Dia de jogo' : 'Avançar calendário'}</Button>
</header>

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
		<section class="card athlete" data-umx-surface>
			<div>
				<p class="eyebrow">Perfil profissional</p>
				<div class="overall"><strong use:count={{ value: overall }}>{overall}</strong><span>Geral<br />Potencial {profile.potential}</span></div>
				<p>{profile.age} anos · {profile.nationality ?? 'Brasil'} · pé {profile.foot ?? 'direito'}</p>
				<p class="muted">Camisa {profile.number} · {ROLE_LABELS[pc.contract.role]}</p>
				<Button size="sm" variant="ghost" onclick={() => (portrait = !portrait)}>{portrait ? 'Ver retrato' : 'Ver uniforme'}</Button>
			</div>
			{#key portrait}<div class="avatar" use:enter><Pixel variant={portrait ? 'full' : 'bust'} size={portrait ? 205 : 125} appearance={c.data.appearance ?? DEFAULT_APPEARANCE} kit={playerKit(c.clubId, position)} clubId={c.clubId} styled ball={portrait} label="Seu jogador" /></div>{/key}
		</section>
		<section class="card fixture">
			<h2>Próximo compromisso</h2>
			{#if next && nextOpp}
				<div class="versus"><Crest clubId={c.clubId} size={45} /><span>×</span><Crest clubId={nextOpp} size={45} /></div>
				<strong>{getClub(nextOpp)?.name ?? nextOpp}</strong>
				<p>{formatShort(next.date)} · {next.time} · {next.home === c.clubId ? 'Em casa' : 'Fora de casa'}</p>
				{#if standingsOpponent && next.competition === v.division}
					<p class="muted">{standingsOpponent.position}º em {v.divisionLabel} · {standingsOpponent.points} pts</p>
				{/if}
				{#if selection}<div class="fixture-status"><strong>{PLAYER_SELECTION[selection]}</strong><small>{matchObjective(position).label}</small></div>{/if}
			{:else}<p>Sem partidas restantes nesta temporada.</p>{/if}
			<a href="{base}/calendario">Ver calendário completo</a>
		</section>
		<section class="card">
			<h2>Disputa por posição</h2>
			<p class="muted">{coach?.name ?? 'Comissão técnica'} · Confiança {d.trust}/100</p>
			<progress value={d.trust} max="100" aria-label="Confiança do treinador"></progress>
			<p class="muted">Seu geral é <strong>{overall}</strong> · {positionRank}º de {positionCount} na posição pelo geral</p>
			{#each rivals as rival (rival.id)}
				<div class="line"><span>{rival.name} · {rival.position}</span><strong>{rival.overall}</strong></div>
				<progress value={rival.overall} max="99" aria-label={`Geral de ${rival.name}`}></progress>
			{:else}<p>Nenhum concorrente direto no elenco.</p>{/each}
		</section>
		<section class="card">
			<h2>Resenha do vestiário</h2>
			<div class="metrics">
				<div><strong>{Math.round(d.condition)}%</strong><small>Condição</small></div>
				<div><strong>{d.support.squad}</strong><small>Elenco</small></div>
				<div><strong>{d.support.fans}</strong><small>Torcida</small></div>
				<div><strong>{pc.reputation}</strong><small>Reputação</small></div>
			</div>
			{#if d.injuryUntil && d.injuryUntil > c.gameDate}<p class="warning">Em recuperação. Retorno previsto para {formatShort(d.injuryUntil)}.</p>{/if}
			{#if latest?.assessment}
				<p>{latest.assessment.feedback}{latest.me ? ` Nota ${latest.me.rating.toFixed(1)} em ${latest.me.minutes} min.` : ''}</p>
			{/if}
			{#if recentForm.length}
				<div class="match-form" aria-label="Notas por adversário">
					{#each recentForm as game, index (index)}
						<div title={game.name}><strong>{game.rating.toFixed(1)}</strong><progress value={game.rating} max="10" aria-label={`Nota contra ${game.name}`}></progress><small>{game.short}</small></div>
					{/each}
				</div>
			{/if}
		</section>
		<section class="card wide">
			<h2>Imprensa e decisões</h2>
			{#if d.press}
				{@const press = d.press}
				<p>{PRESS_QUESTIONS[press.kind]}</p>
				<div class="actions">
					{#each Object.entries(PRESS_ANSWERS) as [choice, answer] (choice)}
						<Button size="sm" disabled={busy} onclick={() => act('entrevista', { choice, date: press.date })}>{answer.label}</Button>
					{/each}
				</div>
			{:else}<p class="muted">Nenhuma entrevista pendente.</p>{/if}
			<div class="actions"><a href="{base}/mensagens">Caixa de mensagens</a><a href="{base}/mundo">Notícias do universo</a></div>
		</section>
	{:else if section === 'treino'}
		<section class="card wide">
			<div class="section-top">
				<div><h2>Calendário de treinos individuais</h2><p class="muted">Uma sessão por dia, até duas por semana. Treinar melhora atributos e custa condição física.</p></div>
				<label>Foco <select value={focus} onchange={(e) => (chosenFocus = e.currentTarget.value as PlayerFocus)}>{#each options as f (f)}<option value={f}>{PLAYER_FOCUS_LABELS[f]}</option>{/each}</select></label>
			</div>
			<div class="focus-chips" aria-label="Atributos treinados">
				{#each TRAINING_ATTRIBUTES[focus] as key (key)}
					<span>{ATTRIBUTE_LABELS[key]} <b>{attributes[key]}</b></span>
				{/each}
			</div>
			<div class="days">
				{#each dates as date (date)}
					{@const booked = d.drills.find((entry) => entry.date === date)}
					{@const block = trainBlock(date, c.gameDate, gameDates, pc, v.step?.date ?? null)}
					<div class="day" class:booked={!!booked}>
						<strong>{formatShort(date)}</strong>
						{#if booked}
							<span>{PLAYER_FOCUS_LABELS[booked.focus]}</span><Button size="sm" disabled={busy} onclick={() => act('cancelar-treino', { date })}>Cancelar</Button>
						{:else if !block}
							<Button size="sm" disabled={busy} onclick={() => act('treinar', { date, focus })} aria-label="Marcar treino para {formatShort(date)}">Marcar treino</Button>
						{:else}<small>{block}</small>{/if}
					</div>
				{:else}<p>Avance o calendário para abrir novas datas.</p>{/each}
			</div>
		</section>
		<section class="card wide">
			<div class="section-top">
				<div><h2>Atributos</h2><p class="muted">Geral {overall} · Potencial {profile.potential}</p></div>
				{#if d.progress.length > 1}
					<div class="trend">
						<Sparkline values={d.progress.map((point) => point.overall)} width={160} height={42} label="Evolução do geral ao longo da carreira" />
						<small>{progressChange > 0 ? '+' : ''}{progressChange} desde {formatShort(d.progress[0].date)}</small>
					</div>
				{/if}
			</div>
			<Segmented label="Grupo de atributos" options={sets} bind:value={attributeGroup} />
			{#key attributeGroup}<div class="skills" use:enter>
				{#each keys as key (key)}
					<div><div class="line"><span>{ATTRIBUTE_LABELS[key]}</span><strong>{attributes[key]}</strong></div><progress value={attributes[key]} max="99" aria-label={ATTRIBUTE_LABELS[key]}></progress></div>
				{/each}
			</div>{/key}
		</section>
	{:else if section === 'mercado'}
		<section class="card">
			<h2>{d.loan ? 'Empréstimo ativo' : 'Contrato profissional'}</h2>
			<p>{d.loan ? `Vínculo com ${getClub(d.loan.parent)?.name ?? d.loan.parent} · retorno após ${d.loan.until}` : `${v.club.name} · contrato até ${pc.contract.until}`}</p>
			<div class="metrics"><div><strong>{formatMoney(pc.contract.wage)}</strong><small>Salário mensal</small></div><div><strong>{formatMoney(Math.round(d.earnings))}</strong><small>Receita acumulada</small></div></div>
			{#if d.renewal}
				<p>Renovação por {d.renewal.years} temporadas a {formatMoney(d.renewal.wage)}/mês.</p>
				<Button variant="primary" size="sm" disabled={busy} onclick={() => act('renovar')}>Assinar renovação</Button>
			{/if}
			{#if !d.loan && pc.contract.until <= c.season + 1 && d.trust >= 35}
				<div class="actions">
					{#each [2, 3].filter((y) => c.season + y - 1 > pc.contract.until) as years (years)}
						<Button size="sm" disabled={busy} onclick={() => act('negociar', { years })}>Negociar por {years} anos</Button>
					{/each}
				</div>
			{/if}
		</section>
		<section class="card">
			<h2>{pc.agent.name}</h2>
			<p class="muted">Empresário · Perfil {pc.agent.style} · Relação {d.support.agent}/100</p>
			<progress value={d.support.agent} max="100" aria-label="Relação com o empresário"></progress>
			<p>{d.loan ? 'Aproveite os minutos no clube atual antes de voltar.' : d.trust < 50 ? 'Um empréstimo pode abrir espaço para ganhar minutos.' : 'Compare o papel no elenco e o salário antes de mudar de clube.'}</p>
			{#if canScout}
				<div class="actions">
					<Button size="sm" disabled={busy} onclick={() => act('sondar', { kind: 'compra' })}>Buscar transferência</Button>
					{#if pc.contract.until > c.season}<Button size="sm" disabled={busy} onclick={() => act('sondar', { kind: 'emprestimo' })}>Buscar empréstimo</Button>{/if}
				</div>
			{:else if !d.loan}<small class="muted">{windowOpen ? 'Sondagem recente. Aguarde duas semanas.' : 'Janela de transferências fechada.'}</small>{/if}
		</section>
		<section class="card">
			<h2>Propostas de clubes</h2>
			{#each offers as offer (offer.id)}
				<div class="offer">
					<div class="offer-head"><Crest clubId={offer.clubId} size={34} /><strong>{getClub(offer.clubId)?.name ?? offer.clubId}</strong></div>
					<p class="muted">{offer.kind === 'emprestimo' ? 'Empréstimo até o fim da temporada' : `${offer.years} temporadas`} · {ROLE_LABELS[offer.role]} · válida até a rodada {offer.expiresRound}</p>
					<div class="line"><span>Salário mensal</span><strong>{formatExactMoney(offer.wage)}</strong></div>
					{#if pc.contract.wage > 0 && offer.wage !== pc.contract.wage}
						<small class="muted">{offer.wage > pc.contract.wage ? '+' : ''}{Math.round((offer.wage / pc.contract.wage - 1) * 100)}% em relação ao salário atual</small>
					{/if}
					<div class="actions">
						{#if windowOpen}
							<Button size="sm" variant="primary" disabled={busy} onclick={() => reviewOffer(offer.id)}>Aceitar</Button>
							{#if !offer.countered && offer.kind !== 'emprestimo'}<Button size="sm" disabled={busy} onclick={() => act('contraproposta', { offerId: offer.id })}>Pedir aumento</Button>{/if}
						{/if}
						<Button size="sm" variant="ghost" disabled={busy} onclick={() => act('recusar', { offerId: offer.id })}>Recusar</Button>
					</div>
				</div>
			{:else}<p class="muted">Nenhuma proposta em aberto.</p>{/each}
		</section>
		<section class="card">
			<h2>Patrocínio individual</h2>
			{#if d.sponsor}
				<p>{d.sponsor.brand} · {formatMoney(d.sponsor.monthly)}/mês até {d.sponsor.until}</p>
				{#if pc.reputation < 35}<p class="warning">Pagamento suspenso enquanto a reputação estiver abaixo de 35.</p>{/if}
			{:else if sponsor}
				<p>{sponsor.brand} oferece {formatMoney(sponsor.monthly)}/mês até {sponsor.until}.</p>
				<Button size="sm" disabled={busy} onclick={() => act('patrocinio')}>Assinar patrocínio</Button>
			{:else}<p class="muted">Propostas a partir de 45 de reputação e 55 de apoio da torcida.</p>{/if}
		</section>
	{:else}
		<section class="card wide">
			<div class="section-top"><h2>Números da carreira</h2><a href="{base}/estatisticas">Estatísticas jogo a jogo</a></div>
			<div class="metrics">
				<div><strong>{history?.all.games ?? 0}</strong><small>Partidas</small></div><div><strong>{history?.all.minutes ?? 0}</strong><small>Minutos</small></div>
				<div><strong>{history?.all.goals ?? 0}</strong><small>Gols</small></div><div><strong>{history?.all.assists ?? 0}</strong><small>Assistências</small></div>
				<div><strong>{history?.all.games ? history.all.rating.toFixed(1) : '—'}</strong><small>Nota média</small></div>
			</div>
			{#if history?.all.games}
				<p>Recordes em uma partida · Nota {history.records.rating.toFixed(1)} · {history.records.goals} gols · {history.records.assists} assistências</p>
				<div class="season-form" aria-label="Comparação por temporada">
					{#each history.seasons.slice(0, 6) as entry (entry.season)}
						<div><strong>{entry.season}</strong><progress value={entry.totals.rating} max="10" aria-label={`Nota média em ${entry.season}`}></progress><span>{entry.totals.rating.toFixed(1)} · {entry.totals.games} jogos</span></div>
					{/each}
				</div>
			{/if}
		</section>
		<section class="card">
			<h2>Objetivos de {c.season}</h2>
			{#each pc.goals as goal (goal.kind)}
				{@const value = (totals?.[goal.kind === 'jogos' ? 'games' : goal.kind === 'gols' ? 'goals' : goal.kind === 'nota' ? 'rating' : 'starts'] ?? 0)}
				<div class="line"><span>{goal.label}</span><strong>{value} / {goal.target}</strong></div>
				<progress value={Math.min(value, goal.target)} max={goal.target} aria-label={goal.label}></progress>
			{/each}
		</section>
		<section class="card">
			<h2>Clubes e conquistas</h2>
			{#each [...d.clubs].reverse() as stint, index (index)}
				<div class="line"><span>{getClub(stint.clubId)?.name ?? stint.clubId} · {stint.kind === 'inicio' ? 'Estreia profissional' : stint.kind === 'compra' ? 'Transferência' : stint.kind === 'retorno' ? 'Retorno' : 'Empréstimo'}</span><strong>{stint.date.slice(0, 4)}</strong></div>
			{/each}
			{#each [...pc.awards].reverse() as award (`${award.season}-${award.label}`)}
				<div class="line positive"><span>{award.label}</span><strong>{award.season}</strong></div>
			{/each}
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
	.player-header, .section-top { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
	.player-header { margin: 6px 0 20px; }
	.player-header h1 { margin: 0; font-size: var(--fs-hero); line-height: .98; overflow-wrap: anywhere; }
	.player-header p:not(.eyebrow) { margin: 12px 0 0; color: var(--text-2); }
	.eyebrow, .positive { color: var(--emerald-strong); }
	.tabs { position: relative; display: flex; gap: 6px; overflow-x: auto; padding: 3px 0; margin-bottom: 18px; border-bottom: 1px solid var(--line); }
	.tabs a { position: relative; flex-shrink: 0; padding: 10px 14px; color: var(--text-2); font-weight: 600; white-space: nowrap; }
	.tabs a[aria-current] { color: var(--emerald-strong); }
	.tab-line { position: absolute; bottom: 0; height: 2px; left: 0; background: var(--emerald-strong); pointer-events: none; }
	.hub-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; gap: 14px; }
	.card { min-width: 0; padding: clamp(14px, 2.2vw, 26px); }
	.card h2 { margin: 0 0 10px; font-size: var(--fs-xl); }
	.card p { margin: 7px 0 13px; }
	.card a { color: var(--emerald-strong); text-decoration: underline; text-underline-offset: .2em; }
	.wide { grid-column: 1 / -1; }
	.athlete { position: relative; display: grid; align-items: center; grid-template-columns: minmax(0, 1fr) auto; overflow: hidden; min-height: 230px; background: radial-gradient(ellipse at 92% 82%, #12634d 0, transparent 62%), var(--surface-sunken); }
	.avatar { justify-self: end; display: grid; place-items: center; }
	.avatar :global(svg) { width: min(14vw, 165px); min-width: 78px; height: auto; }
	.overall, .versus, .actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
	.overall strong { font-size: clamp(3rem, 6vw, 5rem); color: var(--emerald-strong); line-height: 1; }
	.overall span { font-size: var(--fs-sm); color: var(--text-2); }
	.versus { margin: 14px 0; }
	.fixture { background: linear-gradient(145deg, var(--emerald-soft), transparent 60%), var(--surface); }
	.metrics { display: flex; flex-wrap: wrap; gap: 14px 22px; margin: 11px 0; }
	.metrics strong, .metrics small { display: block; }
	.metrics strong { font-size: var(--fs-xl); }
	.metrics small, .day small { color: var(--text-2); }
	.line { display: flex; justify-content: space-between; gap: 8px; padding: 7px 0; }
	progress { display: block; width: 100%; height: 7px; accent-color: var(--emerald); }
	.warning, .failed { color: var(--danger, #ff8787); }
	.notice { padding: 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
	.offer + .offer { border-top: 1px solid var(--line); padding-top: 12px; margin-top: 12px; }
	.days, .skills { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 145px), 1fr)); gap: 12px; margin-top: 14px; }
	.day { display: flex; flex-direction: column; align-items: start; gap: 8px; border-radius: 10px; padding: 12px; border: 1px solid var(--line); background: var(--surface-sunken); }
	select { padding: 7px; border-radius: 7px; color: var(--text); background: var(--surface-sunken); border: 1px solid var(--line-strong); }
	.fixture-status, .focus-chips span {
		border: 1px solid var(--emerald-line);
		border-radius: 9px;
		background: var(--emerald-soft);
		padding: 8px 12px;
	}
	.fixture-status { margin-bottom: 12px; }
	.fixture-status strong, .fixture-status small { display: block; }
	.fixture-status strong { color: var(--emerald-strong); }
	.focus-chips, .offer-head, .match-form { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
	.match-form > div { flex: 1 1 54px; max-width: 100px; text-align: center; }
	.match-form small { color: var(--text-2); }
	.trend { display: grid; justify-items: start; color: var(--text-2); }
	.day.booked { border-color: var(--emerald-line); background: var(--emerald-soft); }
	.offer > .actions { margin-top: 10px; }
	.season-form { display: grid; gap: 8px; margin-top: 14px; }
	.season-form > div { display: grid; grid-template-columns: 4em minmax(35px, 1fr) auto; gap: 10px; align-items: center; }
	@media (max-width: 880px) { .hub-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
