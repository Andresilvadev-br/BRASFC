<script lang="ts">
	import { getClub } from '#lib/domain/clubs.ts';
	import { formatShort } from '#lib/domain/dates.ts';
	import { formatExactMoney } from '#lib/domain/market.ts';
	import { MARKET_STATUS, ratingText, type MarketProfile } from '#lib/domain/market-search.ts';
	import { ATTRIBUTE_LABELS, TECHNICAL, PHYSICAL, MENTAL, GOALKEEPING } from '#lib/engine/attributes.ts';
	import { playerKit } from '#lib/pixel/kits.ts';
	import Badge from '../Badge.svelte';
	import Button from '../Button.svelte';
	import Crest from '../Crest.svelte';
	import Pixel from '../Pixel.svelte';

	let { player, busy, windowOpen, comparison, observe, compare, propose, recommend, canPropose, canLoan = true }: {
		player: MarketProfile; busy: boolean; windowOpen: boolean; comparison: boolean;
		canLoan?: boolean; canPropose?: (player: MarketProfile) => boolean; observe?: () => unknown; recommend?: () => unknown; compare: () => unknown; propose?: (kind: 'compra' | 'emprestimo' | 'livre') => unknown;
	} = $props();

	const groups = [
		{ label: 'Técnica', keys: TECHNICAL }, { label: 'Físico', keys: PHYSICAL },
		{ label: 'Decisão e leitura', keys: MENTAL }, { label: 'Goleiro', keys: GOALKEEPING }
	];
	let section = $state<'atributos' | 'contrato' | 'historico'>('atributos');
	const sections = [{ id: 'atributos', label: 'Atributos' }, { id: 'contrato', label: 'Contrato' }, { id: 'historico', label: 'Histórico' }] as const;
	const reason = $derived(player.isMine ? 'Atleta do seu elenco.' : player.loanFrom ? 'Atleta emprestado até o fim do vínculo.' :
		!windowOpen && player.club ? 'A janela de transferências está fechada.' : '');
	const clubName = (id: string | null) => id ? (getClub(id)?.name ?? id) : 'Sem clube';
</script>

<div class="profile">
	<header>
		<div class="portrait"><Pixel appearance={player.appearance} kit={playerKit(player.club, player.position)} size={82} /></div>
		<div class="identity">
			<p class="affiliation">{#if player.club}<Crest clubId={player.club} size={20} />{/if}{player.clubName}</p>
			<h3 class="display">{player.name}</h3>
			<p class="muted">{[player.position, ...player.secondary].join(' / ')} · {player.age === null ? 'Idade pendente' : `${player.age} anos`}{player.nationality ? ` · ${player.nationality}` : ''}</p>
		</div>
	</header>
	<div class="measurements">
		<div><span>{player.isMine ? 'Overall' : 'Overall estimado'}</span><strong>{ratingText(player.overall)}</strong></div>
		<div><span>{player.isMine ? 'Potencial' : 'Potencial estimado'}</span><strong>{ratingText(player.potential)}</strong></div>
		<div><span>Valor de mercado</span><strong>{formatExactMoney(player.value)}</strong></div>
	</div>
	<div class="buttons">
		{#if observe}<Button size="sm" variant={player.observed ? 'secondary' : 'ghost'} disabled={busy} onclick={observe}>{player.observed ? 'Retirar da observação' : 'Observar'}</Button>{/if}
		<Button size="sm" variant="ghost" onclick={compare}>{comparison ? 'Retirar da comparação' : 'Comparar'}</Button>
	</div>
	{#if recommend && !player.isMine}<Button size="sm" variant="primary" disabled={busy} onclick={recommend}>Recomendar à comissão</Button>{/if}
	{#if propose && (!canPropose || canPropose(player))}<div class="buttons negotiation">
		<Button size="sm" variant="primary" disabled={busy || !!reason} onclick={() => propose?.(player.club ? 'compra' : 'livre')}>{player.club ? 'Fazer proposta' : 'Oferecer contrato'}</Button>
		{#if canLoan && player.club && !player.isMine}
			<Button size="sm" variant="secondary" disabled={busy || !!reason || !player.loanable} onclick={() => propose?.('emprestimo')}>Pedir empréstimo</Button>
		{/if}
	</div>{/if}
	{#if propose && reason}<p class="hint">{reason}</p>
	{:else if propose && player.humanSeller}<p class="hint">A compra depende da aprovação do outro treinador. Confira a próxima etapa em Negociações.</p>
	{:else if canLoan && propose && player.club && !player.loanable}<p class="hint">O clube não libera este atleta por empréstimo nas condições atuais.</p>{/if}
	<div class="profile-tabs" role="group" aria-label="Informações do atleta">
		{#each sections as item (item.id)}<button type="button" data-umx-press aria-pressed={section === item.id} onclick={() => section = item.id}>{item.label}</button>{/each}
	</div>
	{#if section === 'atributos'}
		<p class="hint">{player.isMine ? 'Atributos do seu elenco no BRASFC.' : player.report ? 'Estimativas do relatório do olheiro e da estrutura de observação.' : 'Estimativas da estrutura de observação. O potencial requer relatório.'}</p>
		{#each groups.filter((group) => group.keys.some((key) => player.attributes[key])) as group (group.label)}
			<details open={group.label === (player.position === 'GOL' ? 'Goleiro' : 'Técnica')}>
				<summary>{group.label}</summary>
				<div class="attributes">
					{#each group.keys as key (key)}
						{@const value = player.attributes[key]}
						{#if value}
							<div class="attribute"><span>{ATTRIBUTE_LABELS[key]}</span><strong>{ratingText(value)}</strong>
								<div class="bar" aria-hidden="true"><i style:width={`${value.min}%`}></i><b style:width={`${value.max - value.min}%`}></b></div>
							</div>
						{/if}
					{/each}
				</div>
			</details>
		{/each}
	{:else if section === 'contrato'}
		<dl class="contract">
			<div><dt>Situação</dt><dd>{MARKET_STATUS[player.status]}{player.listed ? ' · À venda' : ''}</dd></div>
			<div><dt>Salário mensal</dt><dd>{player.wage === null ? '—' : formatExactMoney(player.wage)}</dd></div>
			{#if player.contractStart}<div><dt>Início</dt><dd>{formatShort(player.contractStart)}</dd></div>{/if}
			{#if player.until !== null}<div><dt>Fim do contrato</dt><dd>Fim de {player.until}</dd></div>{/if}
			{#if player.clause !== undefined}<div><dt>Multa rescisória</dt><dd>{formatExactMoney(player.clause)}</dd></div>{/if}
			{#if player.loanFrom}<div><dt>Empréstimo</dt><dd>{clubName(player.loanFrom)} · até o fim de {player.loanUntil} · {Math.round((player.loanShare ?? 0) * 100)}% da folha no clube atual</dd></div>{/if}
		</dl>
	{:else}
		<div class="history">
			<h4>Desempenho registrado</h4>
			{#each player.stats as stats (stats.season)}
				<div><strong>{stats.season}</strong><p>{stats.games} jogos · {stats.minutes} min · {stats.goals} gols · {stats.assists} assist. · {stats.yellow} amarelos · {stats.red} vermelhos</p></div>
			{:else}<p class="hint">Sem súmulas registradas para este atleta.</p>{/each}
			<h4>Movimentações</h4>
			{#each player.transfers as move, i (`${move.gameDate}:${i}`)}
				<div><Badge tone="neutral">{move.kind}</Badge> <strong>{formatShort(move.gameDate)}</strong><p>{clubName(move.from)} → {clubName(move.to)} · {formatExactMoney(move.fee)}</p></div>
			{:else}<p class="hint">Sem movimentações registradas.</p>{/each}
		</div>
	{/if}
</div>

<style>
	.profile { display: grid; gap: .8rem; min-width: 0; }
	header { display: flex; gap: 1rem; align-items: center; justify-content: flex-start; }
	.portrait { display: grid; place-items: center; width: 92px; aspect-ratio: 1; flex: none; border-radius: 16px; background: radial-gradient(ellipse at bottom, var(--emerald-soft), transparent 75%), var(--surface-sunken); border: 1px solid var(--line); }
	.identity { min-width: 0; overflow-wrap: anywhere; }
	.affiliation { display: flex; gap: .45rem; align-items: center; color: var(--emerald-strong); font-size: var(--fs-xs); }
	h3 { margin: .2rem 0; font-size: clamp(1.55rem, 3vw, 2.65rem); line-height: .98; }
	p, h4, dl, dd { margin: 0; }
	.identity p { font-size: var(--fs-sm); }
	.measurements { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid var(--line); border-radius: 12px; background: var(--surface-sunken); }
	.measurements > div { padding: .55rem .63rem; min-width: 0; overflow-wrap: anywhere; }
	.measurements > div + div { border-left: 1px solid var(--line); }
	.measurements span, dt, .hint { color: var(--text-2); font-size: var(--fs-xs); }
	.measurements strong { display: block; margin-top: .15rem; font-family: var(--font-display); font-size: clamp(1.05rem, 2vw, 1.55rem); color: var(--emerald-strong); }
	.buttons, .profile-tabs { display: flex; flex-wrap: wrap; gap: .45rem; }
	.negotiation { padding-bottom: .2rem; }
	.profile-tabs { border-bottom: 1px solid var(--line); }
	.profile-tabs button { border: 0; background: transparent; color: var(--text-2); padding: .45rem .65rem .58rem; border-bottom: 2px solid transparent; }
	.profile-tabs button[aria-pressed='true'] { border-bottom-color: var(--emerald); color: var(--text); }
	details, .contract, .history > div { border: 1px solid var(--line); border-radius: 10px; padding: .6rem .72rem; }
	summary { cursor: pointer; font-weight: 700; }
	.attributes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .7rem; padding-block: .7rem .15rem; }
	.attribute { display: grid; grid-template-columns: 1fr auto; gap: .3rem; align-items: baseline; font-size: var(--fs-xs); }
	.attribute strong { white-space: nowrap; }
	.bar { grid-column: 1/-1; display: flex; height: 5px; border-radius: 6px; background: var(--surface-sunken); overflow: hidden; }
	.bar i { background: var(--emerald); }.bar b { background: var(--gold); opacity: .6; }
	.contract > div { padding-block: .4rem; border-bottom: 1px solid var(--line); }
	.contract > div:last-child { border: 0; }
	.history { display: grid; gap: .55rem; }.history p { font-size: var(--fs-sm); }
</style>
