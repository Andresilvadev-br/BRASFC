<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { api, withCareerVersion } from '#lib/api.ts';
	import { clubAction } from '#lib/client/club.ts';
	import type { JobOfferDetail } from '#lib/domain/careerlife.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { isOfferOpen, OFFER_SOURCE_LABEL, type EmploymentStatus } from '#lib/domain/employment.ts';
	import { divisionStandings, type DivisionId, type LeagueState, type StoredRoundResult } from '#lib/domain/league.ts';
	import { formatMoney } from '#lib/domain/market.ts';
	import { divLabel } from '#lib/domain/universe.ts';
	import { CUP_ID } from '#lib/domain/cup.ts';
	import { enter, pop, reveal } from '#lib/motion/actions.ts';
	import { notify } from '#lib/stores/island.svelte.ts';
	import type { ClubPreview } from '#lib/server/coach-market.ts';
	import Button from '../Button.svelte';
	import Crest from '../Crest.svelte';
	import Icon from '../Icon.svelte';
	import Modal from '../Modal.svelte';
	import Segmented from '../Segmented.svelte';
	import Sheet from '../v4/Sheet.svelte';

	let { careerId, version, season, round, offers, status, unemployed, alert, league, results, currentClub, contract, seasonOver }: {
		careerId: string; version: number; season: number; round: number; offers: JobOfferDetail[]; status: EmploymentStatus; unemployed: boolean;
		alert: { season: number; round: number; ids: string[] } | null; league: LeagueState; results: StoredRoundResult[]; currentClub: string;
		contract: { until: number; wage: number }; seasonOver: boolean;
	} = $props();

	const open = $derived(offers.filter((o) => isOfferOpen(o, season, round)));
	const closed = $derived(offers.filter((o) => !isOfferOpen(o, season, round)).slice(-4).reverse());
	let busy = $state(false);
	let advancing = $state(false);

	// Prévia carregada só quando o treinador abre a proposta (cache por clube nesta tela).
	const cache = new Map<string, Promise<ClubPreview>>();
	let previews = $state<Record<string, ClubPreview>>({});
	let loadError = $state<string | null>(null);
	function preview(clubId: string): Promise<ClubPreview> {
		let p = cache.get(clubId);
		if (!p) {
			p = api<{ preview: ClubPreview }>(`/api/careers/${careerId}/clubes/${clubId}`).then((r) => {
				previews = { ...previews, [clubId]: r.preview };
				return r.preview;
			});
			cache.set(clubId, p);
			p.catch(() => cache.delete(clubId));
		}
		return p;
	}

	// Momento esportivo direto dos resultados já carregados (sem nova requisição).
	function moment(clubId: string, division: string) {
		const table = divisionStandings(league, division as DivisionId, results.filter((r) => r.competition !== CUP_ID));
		const row = table.find((r) => r.clubId === clubId);
		const form = results.filter((r) => r.home === clubId || r.away === clubId).slice(-5).map((r) => {
			const home = r.home === clubId;
			const gf = home ? r.homeGoals : r.awayGoals;
			const ga = home ? r.awayGoals : r.homeGoals;
			return gf > ga ? 'v' : gf === ga ? 'e' : 'd';
		});
		return { position: row?.position ?? null, size: table.length, points: row?.points ?? 0, form };
	}

	function deadline(o: JobOfferDetail): string {
		if (o.expiresSeason > season) return `Até a temporada ${o.expiresSeason}`;
		if (typeof o.expiresRound !== 'number') return `Até o fim de ${o.expiresSeason}`;
		const left = o.expiresRound - round;
		return left <= 0 ? 'Último dia para responder' : `Responder em ${left} ${left === 1 ? 'rodada' : 'rodadas'} (até a ${o.expiresRound}ª)`;
	}

	// ── janela de destaque "Clubes interessados em você"
	const alertOffers = $derived(alert ? open.filter((o) => alert.ids.includes(o.id)) : []);
	let alertOpen = $state(false);
	let alertSeen = $state<string | null>(null);
	$effect(() => {
		const key = alert ? `${alert.season}:${alert.round}` : null;
		if (key && alertOffers.length && alertSeen !== key) {
			alertSeen = key;
			alertOpen = true;
		}
	});
	async function closeAlert(view: boolean) {
		alertOpen = false;
		try {
			await clubAction(careerId, version, { action: 'proposta-vistas' });
		} catch {
			// marcar como vista é só conforto visual; a proposta segue válida
		}
		if (view) document.getElementById('propostas')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	// ── avaliação detalhada
	let detail = $state<JobOfferDetail | null>(null);
	let tab = $state<'geral' | 'projeto' | 'elenco' | 'financas' | 'contrato'>('geral');
	let sheetOpen = $state(false);
	function inspect(o: JobOfferDetail) {
		detail = o;
		tab = 'geral';
		loadError = null;
		sheetOpen = true;
		preview(o.clubId).catch((e) => (loadError = (e as Error).message));
	}
	const current = $derived(detail ? previews[detail.clubId] : undefined);

	// ── comparação
	let compare = $state<string[]>([]);
	function toggleCompare(id: string) {
		compare = compare.includes(id) ? compare.filter((x) => x !== id) : [...compare, id].slice(-3);
		const o = offers.find((x) => x.id === id);
		if (o && compare.includes(id)) preview(o.clubId).catch(() => {});
	}
	const compared = $derived(compare.map((id) => offers.find((o) => o.id === id)).filter((o): o is JobOfferDetail => !!o && isOfferOpen(o, season, round)));

	// ── assinatura
	let signing = $state<JobOfferDetail | null>(null);
	let signOpen = $state(false);
	let years = $state<'1' | '2' | '3'>('2');
	function startSign(o: JobOfferDetail) {
		signing = o;
		years = String(Math.min(3, Math.max(1, o.years ?? 2))) as '1' | '2' | '3';
		signOpen = true;
		preview(o.clubId).catch(() => {});
	}

	async function act(body: Record<string, unknown>, done?: string) {
		busy = true;
		try {
			const r = await clubAction(careerId, version, body);
			notify({ icon: 'check', tone: 'success', title: done ?? 'Decisão registrada', detail: r.message });
			if (body.action === 'emprego') {
				signOpen = false;
				sheetOpen = false;
				await goto(`/carreira/${careerId}`, { invalidateAll: true });
			}
		} catch (e) {
			notify({ icon: 'alert', tone: 'error', title: 'Não foi possível concluir', detail: (e as Error).message });
		} finally {
			busy = false;
		}
	}

	/** Sem clube: avança o calendário sem comandar ninguém (o mundo segue e novas propostas surgem). */
	async function advance() {
		advancing = true;
		try {
			const next = await api<{ step: string | null; seasonOver: boolean; version: number }>(`/api/careers/${careerId}/proximo`);
			if (next.seasonOver || !next.step) await withCareerVersion(careerId, next.version, (v) => api(`/api/careers/${careerId}/season`, { body: { version: v } }));
			else await withCareerVersion(careerId, next.version, (v) => api(`/api/careers/${careerId}/matches`, { body: { version: v, step: next.step } }));
			await invalidateAll();
			notify({ icon: 'calendar', tone: 'info', title: next.seasonOver ? 'Nova temporada' : 'Uma semana depois', detail: 'O mercado se movimentou. Veja se há novas propostas.' });
		} catch (e) {
			notify({ icon: 'alert', tone: 'error', title: 'Não foi possível avançar', detail: (e as Error).message });
		} finally {
			advancing = false;
		}
	}

	const stars = (n: number) => '★★★★★'.slice(0, Math.max(1, Math.min(5, Math.round(n)))) + '☆☆☆☆☆'.slice(0, 5 - Math.max(1, Math.min(5, Math.round(n))));
	const formLabel = { v: 'V', e: 'E', d: 'D' } as const;
	const levelLabel = { carencia: 'Carência', atencao: 'Atenção', ok: 'Adequado' } as const;
</script>

<section class="center" id="propostas" aria-labelledby="pc-title" use:reveal>
	<header class="head">
		<div>
			<span class="eyebrow-gold">{unemployed ? 'Central de Propostas' : 'Mercado de treinadores'}</span>
			<h2 id="pc-title" class="display">{unemployed ? 'Seu próximo desafio' : 'Clubes interessados em você'}</h2>
			<p class="muted">{status.detail}{!unemployed ? ' O mercado se movimenta três vezes por temporada; responder não é obrigatório.' : ''}</p>
		</div>
		<div class="state">
			<span class="badge {status.key}">{status.label}</span>
			{#if unemployed}
				<Button variant="secondary" icon="calendar" loading={advancing} disabled={busy} onclick={advance}>{seasonOver ? 'Iniciar a próxima temporada' : 'Avançar uma semana'}</Button>
			{/if}
		</div>
	</header>

	{#if open.length}
		<div class="grid">
			{#each open as of, i (of.id)}
				{@const club = getClub(of.clubId)}
				{@const m = moment(of.clubId, of.division)}
				<article class="offer" style="--club:{club?.colors.primary ?? '#334155'}" use:enter={{ index: i }} data-umx-surface>
					<div class="top">
						<Crest clubId={of.clubId} size={56} />
						<div class="id">
							<strong>{club?.name ?? of.clubId}</strong>
							<small>{divLabel(of.division)} · <span class="stars" aria-label="Reputação {club?.reputation ?? 1} de 5">{stars(club?.reputation ?? 1)}</span></small>
						</div>
						<label class="cmp" title="Comparar">
							<input type="checkbox" checked={compare.includes(of.id)} onchange={() => toggleCompare(of.id)} />
							<span>Comparar</span>
						</label>
					</div>
					<dl class="facts">
						<div><dt>Momento</dt><dd>{m.position ? `${m.position}º de ${m.size}` : 'Sem jogos'}{#if m.form.length}<span class="form">{#each m.form as f, k (k)}<i class={f}>{formLabel[f as 'v']}</i>{/each}</span>{/if}</dd></div>
						<div><dt>Objetivo</dt><dd>{of.objective ?? of.project ?? 'A definir com a diretoria'}</dd></div>
						<div><dt>Salário</dt><dd>{formatMoney(of.wage ?? 0)}/mês</dd></div>
						<div><dt>Contrato</dt><dd>{of.years ?? 2} {(of.years ?? 2) === 1 ? 'temporada' : 'temporadas'}</dd></div>
					</dl>
					<p class="why">{of.reason.split(' Projeto:')[0]}</p>
					<p class="deadline" class:urgent={typeof of.expiresRound === 'number' && of.expiresSeason === season && of.expiresRound - round <= 1}><Icon name="clock" size={14} /> {deadline(of)}{of.source ? ` · ${OFFER_SOURCE_LABEL[of.source]}` : ''}</p>
					<div class="actions">
						<Button size="sm" variant="secondary" icon="eye" onclick={() => inspect(of)}>Avaliar clube</Button>
						<Button size="sm" variant="gold" icon="briefcase" disabled={busy || seasonOver} onclick={() => startSign(of)}>Aceitar</Button>
						{#if typeof of.expiresRound === 'number' && !of.postponed}
							<Button size="sm" variant="ghost" icon="clock" disabled={busy} onclick={() => act({ action: 'proposta-adiar', offerId: of.id }, 'Decisão adiada')}>Adiar</Button>
						{/if}
						<Button size="sm" variant="ghost" icon="x" disabled={busy} onclick={() => act({ action: 'proposta-recusar', offerId: of.id }, 'Proposta recusada')}>Recusar</Button>
					</div>
				</article>
			{/each}
		</div>
	{:else}
		<div class="empty" use:reveal>
			<Icon name="briefcase" size={28} />
			<div>
				<strong>{unemployed ? 'Nenhuma proposta neste momento' : 'Nenhuma sondagem aberta'}</strong>
				<p class="muted">{unemployed ? 'Avance o calendário: o mundo continua, técnicos caem e clubes procuram nomes. Seu save não perde nada enquanto você procura emprego.' : 'Clubes compatíveis com sua reputação e campanha podem sondar seu nome nas janelas do mercado (por volta de 25%, 60% e 85% da temporada).'}</p>
			</div>
		</div>
	{/if}

	{#if compared.length >= 2}
		<div class="compare" use:reveal aria-label="Comparação de propostas">
			<h3 class="display">Comparar propostas</h3>
			<table>
				<thead><tr><th></th>{#each compared as of (of.id)}<th><Crest clubId={of.clubId} size={28} /> {getClub(of.clubId)?.short ?? of.clubId}</th>{/each}</tr></thead>
				<tbody>
					<tr><th>Divisão</th>{#each compared as of (of.id)}<td>{divLabel(of.division)}</td>{/each}</tr>
					<tr><th>Salário</th>{#each compared as of (of.id)}<td>{formatMoney(of.wage ?? 0)}</td>{/each}</tr>
					<tr><th>Contrato</th>{#each compared as of (of.id)}<td>{of.years ?? 2} temp.</td>{/each}</tr>
					<tr><th>Objetivo</th>{#each compared as of (of.id)}<td>{of.objective ?? '—'}</td>{/each}</tr>
					<tr><th>Força do elenco</th>{#each compared as of (of.id)}<td>{previews[of.clubId]?.squad.strength ?? '…'}</td>{/each}</tr>
					<tr><th>Caixa</th>{#each compared as of (of.id)}<td>{previews[of.clubId] ? formatMoney(previews[of.clubId].finance.balance) : '…'}</td>{/each}</tr>
					<tr><th>Verba de contratações</th>{#each compared as of (of.id)}<td>{previews[of.clubId] ? formatMoney(previews[of.clubId].finance.transferBudget) : '…'}</td>{/each}</tr>
					<tr><th>Saúde financeira</th>{#each compared as of (of.id)}<td>{previews[of.clubId]?.finance.healthLabel ?? '…'}</td>{/each}</tr>
					<tr><th>Carências</th>{#each compared as of (of.id)}<td>{previews[of.clubId] ? previews[of.clubId].squad.needs.filter((n) => n.level !== 'ok').map((n) => n.sector).join(', ') || 'Nenhuma' : '…'}</td>{/each}</tr>
				</tbody>
			</table>
		</div>
	{/if}

	{#if closed.length}
		<details class="past">
			<summary>Propostas encerradas</summary>
			<ul>
				{#each closed as of (of.id)}
					<li><Crest clubId={of.clubId} size={20} /> {getClub(of.clubId)?.name ?? of.clubId} · {of.status === 'recusada' ? 'Recusada' : of.status === 'aceita' ? 'Aceita' : 'Expirou'}</li>
				{/each}
			</ul>
		</details>
	{/if}
</section>

<!-- Janela de destaque das novas propostas -->
<Modal bind:open={alertOpen} title="Clubes interessados em você" description="O mercado de treinadores se movimentou. As propostas ficam salvas até o prazo." size="lg">
	<div class="alert-grid">
		{#each alertOffers as of, i (of.id)}
			{@const club = getClub(of.clubId)}
			<div class="alert-card" style="--club:{club?.colors.primary ?? '#334155'}" use:pop={{ delay: 90 * i }}>
				<Crest clubId={of.clubId} size={64} />
				<strong>{club?.name ?? of.clubId}</strong>
				<small>{divLabel(of.division)}</small>
				<span>{of.objective ?? of.project}</span>
				<b>{formatMoney(of.wage ?? 0)}/mês · {of.years ?? 2} temp.</b>
			</div>
		{/each}
	</div>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => closeAlert(false)}>Depois</Button>
		<Button variant="gold" icon="eye" onclick={() => closeAlert(true)}>Ver propostas</Button>
	{/snippet}
</Modal>

<!-- Avaliação detalhada do clube -->
<Sheet bind:open={sheetOpen} title={detail ? (getClub(detail.clubId)?.name ?? detail.clubId) : 'Clube'} subtitle={detail ? `${divLabel(detail.division)} · proposta até ${deadline(detail).toLowerCase()}` : ''} width={860}>
	{#if detail}
		<div class="tabs">
			<Segmented label="Seções" bind:value={tab} options={[{ value: 'geral', label: 'Visão geral' }, { value: 'projeto', label: 'Projeto' }, { value: 'elenco', label: 'Elenco' }, { value: 'financas', label: 'Finanças' }, { value: 'contrato', label: 'Contrato' }]} />
		</div>
		{#if loadError}
			<p class="err" role="alert"><Icon name="alert" size={16} /> {loadError}</p>
		{:else if !current}
			<div class="skeleton" aria-busy="true" aria-label="Carregando informações do clube">
				{#each [1, 2, 3, 4] as k (k)}<span style="--k:{k}"></span>{/each}
			</div>
		{:else if tab === 'geral'}
			<div class="pane" use:reveal>
				<div class="hero-club" style="--club:{getClub(current.clubId)?.colors.primary ?? '#334155'}">
					<Crest clubId={current.clubId} size={84} />
					<div>
						<h3 class="display">{current.name}</h3>
						<p class="muted">{current.city}{current.stadium ? ` · ${current.stadium}` : ''}</p>
						<p><span class="stars">{stars(current.reputation)}</span> · {current.divisionLabel}{current.position ? ` · ${current.position}º de ${current.divisionSize} (${current.points} pts em ${current.played} jogos)` : ''}</p>
					</div>
				</div>
				<div class="kpis">
					<div><span>Técnico atual</span><strong>{current.coach.vacancy ? 'Cargo vago' : (current.coach.current ?? '—')}</strong></div>
					<div><span>Diretoria</span><strong>{current.board.profileLabel}</strong><small>{current.board.summary}</small></div>
					<div><span>Expectativa</span><strong>{current.board.expectation}</strong></div>
				</div>
				<h4>Últimos resultados</h4>
				{#if current.recent.length}
					<ul class="recent">
						{#each current.recent as r, k (k)}
							<li class={r.result}><i>{formLabel[r.result]}</i> {r.home ? 'x' : '@'} <Crest clubId={r.opponent} size={18} /> {getClub(r.opponent)?.name ?? r.opponent} <b>{r.goalsFor}–{r.goalsAgainst}</b></li>
						{/each}
					</ul>
				{:else}
					<p class="muted">O clube ainda não jogou nesta temporada.</p>
				{/if}
			</div>
		{:else if tab === 'projeto'}
			<div class="pane" use:reveal>
				<p class="muted">{current.project.projectLabel ? `Projeto do clube: ${current.project.projectLabel}.` : ''} Objetivos que fazem sentido para a força deste elenco na divisão:</p>
				<ol class="ladder">
					{#each ['evitar-rebaixamento', 'permanecer', 'acesso', 'classificacao', 'disputar-titulo', 'conquistar-titulo'] as g (g)}
						<li class:on={current.project.goal === g} class:rel={current.project.relevant.includes(g as never)}>
							{({ 'evitar-rebaixamento': 'Evitar o rebaixamento', permanecer: 'Permanecer na divisão', acesso: 'Disputar uma vaga de acesso', classificacao: 'Classificar-se para competição importante', 'disputar-titulo': 'Disputar o título', 'conquistar-titulo': 'Conquistar o campeonato' } as Record<string, string>)[g]}
							{#if current.project.goal === g}<em>Meta principal</em>{:else if current.project.relevant.includes(g as never)}<em>Relevante</em>{/if}
						</li>
					{/each}
				</ol>
				<h4>Cobranças da diretoria</h4>
				<ul class="objectives">
					{#each current.objectives as ob, k (k)}<li><Icon name="trophy" size={14} /> {ob.label}{ob.weight >= 3 ? ' (principal)' : ''}</li>{/each}
					{#if !current.objectives.length}<li class="muted">A diretoria define as metas na primeira semana de trabalho.</li>{/if}
				</ul>
			</div>
		{:else if tab === 'elenco'}
			<div class="pane" use:reveal>
				<div class="kpis">
					<div><span>Formação</span><strong>{current.squad.formation}</strong></div>
					<div><span>Força (média dos 11 melhores)</span><strong>{current.squad.strength}</strong></div>
					<div><span>Idade média</span><strong>{current.squad.averageAge ?? '—'}</strong></div>
				</div>
				<div class="needs">
					{#each current.squad.needs as n (n.sector)}<span class="need {n.level}" title={n.detail}><b>{n.sector}</b> {levelLabel[n.level]}</span>{/each}
				</div>
				<h4>Destaques</h4>
				<ul class="highlights">
					{#each current.squad.highlights as h (h.id)}<li><b>{h.overall}</b> {h.name} · {h.position} · {h.age === null ? 'idade pendente' : `${h.age} anos`} <small>{h.note}</small></li>{/each}
				</ul>
				<table class="squad">
					<thead><tr><th>Atleta</th><th>Pos.</th><th>Idade</th><th>OVR</th><th>POT</th><th>Situação</th></tr></thead>
					<tbody>
						{#each current.squad.players as p (p.id)}
							<tr class={p.role}><td>{p.name}</td><td>{p.slot ?? p.position}{p.secondary.length ? ` (${p.secondary.join('/')})` : ''}</td><td>{p.age ?? '—'}</td><td class="num">{p.overall}</td><td class="num">{p.potential ?? '—'}</td><td>{p.role === 'titular' ? 'Titular' : p.role === 'reserva' ? 'Banco' : 'Reserva'}</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else if tab === 'financas'}
			<div class="pane" use:reveal>
				<div class="kpis money">
					<div><span>Saldo disponível</span><strong>{formatMoney(current.finance.balance)}</strong></div>
					<div><span>Orçamento de transferências</span><strong>{formatMoney(current.finance.transferBudget)}</strong></div>
					<div><span>Limite mensal da folha</span><strong>{formatMoney(current.finance.wageBudget)}</strong></div>
					<div><span>Folha comprometida</span><strong>{formatMoney(current.finance.wageBill)}</strong><small>{current.finance.wageBudget ? Math.round((current.finance.wageBill / current.finance.wageBudget) * 100) : 0}% do teto</small></div>
					<div><span>Saúde financeira</span><strong class="health {current.finance.health}">{current.finance.healthLabel}</strong></div>
				</div>
				<p class="note"><Icon name="info" size={14} /> {current.finance.note}</p>
			</div>
		{:else}
			<div class="pane" use:reveal>
				<div class="kpis">
					<div><span>Salário oferecido</span><strong>{formatMoney(detail.wage ?? 0)}/mês</strong><small>{detail.wage && contract.wage && !unemployed ? `${detail.wage >= contract.wage ? '+' : ''}${Math.round(((detail.wage - contract.wage) / contract.wage) * 100)}% em relação ao atual` : ''}</small></div>
					<div><span>Duração proposta</span><strong>{detail.years ?? 2} {(detail.years ?? 2) === 1 ? 'temporada' : 'temporadas'}</strong></div>
					<div><span>Prazo da oferta</span><strong>{deadline(detail)}</strong></div>
				</div>
				<h4>Condições</h4>
				<ul class="objectives">
					<li><Icon name="trophy" size={14} /> Objetivo principal: {current.board.expectation}</li>
					<li><Icon name="briefcase" size={14} /> {detail.reason}</li>
					<li><Icon name="info" size={14} /> Seu conhecimento tático vai com você; o elenco novo precisa se adaptar às suas ideias.</li>
					{#if !unemployed}<li><Icon name="alert" size={14} /> Aceitar encerra seu vínculo com o {getClub(currentClub)?.name ?? currentClub} imediatamente.</li>{/if}
				</ul>
			</div>
		{/if}
	{/if}
	{#snippet footer()}
		{#if detail}
			<Button variant="ghost" icon="x" disabled={busy} onclick={() => detail && act({ action: 'proposta-recusar', offerId: detail.id }, 'Proposta recusada').then(() => (sheetOpen = false))}>Recusar</Button>
			<Button variant="gold" icon="briefcase" disabled={busy || seasonOver} onclick={() => detail && startSign(detail)}>Aceitar proposta</Button>
		{/if}
	{/snippet}
</Sheet>

<!-- Confirmação de assinatura -->
<Modal bind:open={signOpen} title={signing ? `Assinar com o ${getClub(signing.clubId)?.name ?? signing.clubId}?` : 'Assinar contrato'} description="A troca é imediata e fica registrada no seu histórico." size="md">
	{#if signing}
		<div class="sign">
			<Crest clubId={signing.clubId} size={64} />
			<ul>
				<li>Salário: <b>{formatMoney(signing.wage ?? 0)} por mês</b></li>
				<li>Objetivo: <b>{signing.objective ?? previews[signing.clubId]?.board.expectation ?? 'definido pela diretoria'}</b></li>
				{#if previews[signing.clubId]}<li>Verba para contratar: <b>{formatMoney(previews[signing.clubId].finance.transferBudget)}</b></li>{/if}
				{#if !unemployed}<li class="warn">Você deixa o {getClub(currentClub)?.name ?? currentClub} agora (contrato até {contract.until}).</li>{/if}
				<li>Conhecimento tático e "Minhas Táticas" vão com você; o entrosamento do elenco recomeça.</li>
			</ul>
			<label class="years">Duração
				<Segmented label="Duração do contrato" bind:value={years} options={[{ value: '1', label: '1 temporada' }, { value: '2', label: '2 temporadas' }, { value: '3', label: '3 temporadas' }]} />
			</label>
		</div>
	{/if}
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (signOpen = false)}>Cancelar</Button>
		<Button variant="gold" icon="check" loading={busy} disabled={busy} onclick={() => signing && act({ action: 'emprego', offerId: signing.id, years: Number(years), confirm: true }, 'Contrato assinado')}>Assinar contrato</Button>
	{/snippet}
</Modal>

<style>
	.center { display: grid; gap: var(--sp-4); }
	.head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--sp-4); align-items: flex-end; }
	.head p { margin: 6px 0 0; max-width: 70ch; }
	.state { display: flex; gap: var(--sp-3); align-items: center; flex-wrap: wrap; }
	.badge { padding: 6px 12px; border-radius: 999px; font-size: var(--fs-sm); font-weight: 700; background: rgb(231 237 240 / 0.08); }
	.badge.contratado { background: rgb(16 185 129 / 0.15); color: var(--emerald-strong); }
	.badge.saida-confirmada { background: rgb(245 158 11 / 0.16); color: #f8c46b; }
	.badge.sem-clube { background: rgb(239 68 68 / 0.14); color: var(--danger); }
	.badge.em-negociacao { background: rgb(59 130 246 / 0.16); color: #93c5fd; }
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 330px), 1fr)); gap: var(--sp-4); }
	.offer {
		position: relative; display: grid; gap: 12px; padding: var(--sp-5); border-radius: 18px; overflow: hidden;
		background: linear-gradient(160deg, color-mix(in srgb, var(--club) 22%, transparent), rgb(15 23 42 / 0.6) 60%);
		border: 1px solid color-mix(in srgb, var(--club) 40%, rgb(231 237 240 / 0.1));
		transition: transform var(--dur-2, 0.2s) var(--ease-out, ease), box-shadow var(--dur-2, 0.2s);
	}
	.offer:hover { transform: translateY(-2px); box-shadow: 0 18px 40px -24px var(--club); }
	.top { display: flex; gap: 12px; align-items: center; }
	.id { display: grid; min-width: 0; flex: 1; }
	.id strong { font-size: 1.1rem; overflow-wrap: anywhere; }
	.id small { color: var(--text-3); }
	.stars { color: #f5c451; letter-spacing: 1px; }
	.cmp { display: flex; gap: 6px; align-items: center; font-size: var(--fs-xs); color: var(--text-3); cursor: pointer; }
	.facts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 0; }
	.facts div { padding: 8px 10px; border-radius: 10px; background: rgb(2 6 23 / 0.35); min-width: 0; }
	.facts dt { font-size: var(--fs-xs); color: var(--text-3); text-transform: uppercase; letter-spacing: 0.06em; }
	.facts dd { margin: 2px 0 0; font-weight: 600; overflow-wrap: anywhere; }
	.form { display: inline-flex; gap: 2px; margin-left: 6px; vertical-align: middle; }
	.form i, .recent i { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 4px; font: 700 0.7rem/1 inherit; font-style: normal; }
	.form .v, .recent .v i { background: #15803d; } .form .e, .recent .e i { background: #64748b; } .form .d, .recent .d i { background: #b91c1c; }
	.why { margin: 0; color: var(--text-2); font-size: var(--fs-sm); }
	.deadline { margin: 0; display: flex; gap: 6px; align-items: center; font-size: var(--fs-xs); color: var(--text-3); }
	.deadline.urgent { color: #f8c46b; }
	.actions { display: flex; flex-wrap: wrap; gap: 8px; }
	.empty { display: flex; gap: var(--sp-4); align-items: flex-start; padding: var(--sp-5); border-radius: 16px; background: rgb(231 237 240 / 0.04); border: 1px dashed rgb(231 237 240 / 0.14); }
	.empty p { margin: 4px 0 0; }
	.compare { padding: var(--sp-5); border-radius: 16px; background: rgb(231 237 240 / 0.04); overflow-x: auto; }
	.compare table, .squad { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
	.compare th, .compare td, .squad th, .squad td { padding: 8px 10px; text-align: left; border-bottom: 1px solid rgb(231 237 240 / 0.06); }
	.compare thead th { white-space: nowrap; }
	.compare tbody th { color: var(--text-3); font-weight: 500; }
	.past summary { cursor: pointer; color: var(--text-3); }
	.past ul { list-style: none; padding: 0; display: grid; gap: 4px; }
	.alert-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
	.alert-card { display: grid; justify-items: center; gap: 6px; padding: 18px 12px; text-align: center; border-radius: 16px; background: linear-gradient(180deg, color-mix(in srgb, var(--club) 30%, transparent), transparent); border: 1px solid color-mix(in srgb, var(--club) 45%, transparent); }
	.alert-card small, .alert-card span { color: var(--text-3); font-size: var(--fs-xs); }
	.tabs { margin-bottom: var(--sp-4); overflow-x: auto; }
	.pane { display: grid; gap: var(--sp-4); }
	.pane h4 { margin: 0; font-size: var(--fs-sm); text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-3); }
	.hero-club { display: flex; gap: var(--sp-4); align-items: center; padding: var(--sp-4); border-radius: 16px; background: linear-gradient(120deg, color-mix(in srgb, var(--club) 28%, transparent), transparent); }
	.hero-club h3 { margin: 0; }
	.hero-club p { margin: 4px 0 0; }
	.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
	.kpis div { display: grid; gap: 2px; padding: 12px; border-radius: 12px; background: rgb(231 237 240 / 0.05); }
	.kpis span { font-size: var(--fs-xs); color: var(--text-3); text-transform: uppercase; letter-spacing: 0.06em; }
	.kpis strong { font-size: 1.05rem; }
	.kpis small { color: var(--text-3); font-size: var(--fs-xs); }
	.health.saudavel { color: var(--emerald-strong); } .health.apertada { color: #f8c46b; } .health.critica { color: var(--danger); }
	.recent, .objectives, .highlights { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
	.recent li, .objectives li, .highlights li { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
	.recent b { margin-left: auto; }
	.highlights small { color: var(--text-3); }
	.ladder { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
	.ladder li { display: flex; justify-content: space-between; padding: 10px 12px; border-radius: 10px; background: rgb(231 237 240 / 0.03); color: var(--text-3); }
	.ladder li.rel { color: var(--text-1); background: rgb(231 237 240 / 0.06); }
	.ladder li.on { color: var(--text-1); background: rgb(234 179 8 / 0.16); border: 1px solid rgb(234 179 8 / 0.35); }
	.ladder em { font-style: normal; font-size: var(--fs-xs); color: #f5c451; }
	.needs { display: flex; flex-wrap: wrap; gap: 8px; }
	.need { padding: 6px 10px; border-radius: 999px; font-size: var(--fs-xs); background: rgb(231 237 240 / 0.06); }
	.need.carencia { background: rgb(239 68 68 / 0.16); color: #fca5a5; } .need.atencao { background: rgb(245 158 11 / 0.16); color: #fcd34d; } .need.ok { color: var(--emerald-strong); }
	.squad tr.fora td { color: var(--text-3); }
	.squad tr.titular td:first-child { font-weight: 600; }
	.num { font-variant-numeric: tabular-nums; }
	.note { display: flex; gap: 8px; color: var(--text-3); font-size: var(--fs-sm); margin: 0; }
	.err { color: var(--danger); display: flex; gap: 6px; align-items: center; }
	.skeleton { display: grid; gap: 10px; }
	.skeleton span { height: 54px; border-radius: 12px; background: linear-gradient(90deg, rgb(231 237 240 / 0.04), rgb(231 237 240 / 0.1), rgb(231 237 240 / 0.04)); background-size: 200% 100%; animation: shimmer 1.2s infinite linear; animation-delay: calc(var(--k) * 80ms); }
	@keyframes shimmer { to { background-position: -200% 0; } }
	@media (prefers-reduced-motion: reduce) { .skeleton span { animation: none; } .offer { transition: none; } }
	.sign { display: grid; grid-template-columns: auto 1fr; gap: var(--sp-4); align-items: start; }
	.sign ul { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
	.sign .warn { color: #f8c46b; }
	.years { grid-column: 1 / -1; display: grid; gap: 6px; font-size: var(--fs-sm); color: var(--text-3); }
</style>
