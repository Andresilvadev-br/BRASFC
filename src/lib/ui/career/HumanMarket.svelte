<script lang="ts">
	import type { worldSnapshot } from '#lib/server/connected-world.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { formatShort } from '#lib/domain/dates.ts';
	import { formatSquadAge } from '#lib/domain/squad.ts';
	import { formatExactMoney } from '#lib/domain/market.ts';
	import { playerKit } from '#lib/pixel/kits.ts';
	import { enter } from '#lib/motion/actions.ts';
	import Badge from '../Badge.svelte';
	import Button from '../Button.svelte';
	import Crest from '../Crest.svelte';
	import Modal from '../Modal.svelte';
	import Panel from '../Panel.svelte';
	import Pixel from '../Pixel.svelte';

	type World = Awaited<ReturnType<typeof worldSnapshot>>;
	let { world, club, busy, send }: { world: World; club: string; busy: boolean; send: (action: string, payload: Record<string, unknown>) => Promise<boolean> } = $props();
	let target = $state('');
	let selected = $state<string | null>(null);
	let fee = $state<number | undefined>();
	let search = $state('');
	let show = $state(10);
	let open = $state(false);
	const clubs = $derived(world.members.filter((member) => member.assignment?.role === 'coach' && member.assignment.club !== club));
	const squad = $derived(world.marketRoster[target] ?? []);
	const rival = $derived(clubs.find((member) => member.profileId === target)?.assignment?.club);
	const player = $derived(squad.find((item) => item.id === selected));
	const matches = $derived(squad.filter((item) => (item.name + ' ' + item.position).toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))));
	const name = (id: string) => getClub(id)?.name ?? id;

	function choose(id: string) { target = id; search = ''; show = 10; }
	function negotiate(id: string) { selected = id; fee = undefined; open = true; }
	async function offer() {
		if (!player || fee === undefined || fee < 0 || !Number.isInteger(fee)) return;
		if (await send('deal', { target, player: player.id, fee })) open = false;
	}
</script>

<Panel title="Mercado entre clubes" icon="briefcase">
	{#if clubs.length}
		<div class="clubs">
			{#each clubs as member (member.profileId)}
				<button type="button" data-umx-press aria-pressed={target === member.profileId} onclick={() => choose(member.profileId)}>
					<Crest clubId={member.assignment?.club} size={28} /><span>{name(member.assignment!.club)}</span>
				</button>
			{/each}
		</div>
		{#if rival}
			<label class="search">Filtrar elenco <input type="search" placeholder="Nome ou posição" bind:value={search} oninput={() => show = 10} /></label>
			<div class="players" use:enter>
				{#each matches.slice(0, show) as athlete (athlete.id)}
					<button type="button" class="athlete" data-umx-press onclick={() => negotiate(athlete.id)}>
						<Pixel appearance={athlete.appearance} kit={playerKit(rival, athlete.position)} size={38} />
						<span><strong>{athlete.name}</strong><small>{athlete.position} · {formatSquadAge(athlete.age)}</small></span>
						<b>{athlete.overall}</b>
					</button>
				{:else}<p>Nenhum atleta corresponde ao filtro.</p>{/each}
			</div>
			{#if matches.length > show}<Button size="sm" variant="ghost" onclick={() => show += 10}>Ver mais atletas</Button>{/if}
		{/if}
	{:else}<p>Os demais treinadores precisam assumir um clube para negociar.</p>{/if}
</Panel>

<Panel title="Propostas registradas" icon="mail">
	<div class="bids">
		{#each world.deals as deal (deal.id)}
			<div class="bid" data-umx-surface><div><Badge tone="gold">{deal.from === club ? 'Recebida' : 'Enviada'}</Badge><strong>{deal.name}</strong><small>{name(deal.from)} → {name(deal.to)}</small></div>
				<b>{formatExactMoney(deal.fee)}</b>
				{#if deal.from === club}
					<div class="actions"><Button size="sm" disabled={busy} onclick={() => send('accept-deal', { id: deal.id })}>Autorizar venda</Button>
					<Button size="sm" variant="ghost" disabled={busy} onclick={() => send('reject-deal', { id: deal.id })}>Recusar</Button></div>
				{/if}
			</div>
		{/each}
		{#each world.dealHistory as deal (deal.id)}
			<div class="bid"><div><Badge tone={deal.status === 'aceita' ? 'emerald' : 'neutral'}>{deal.status === 'aceita' ? 'Venda concluída' : deal.status === 'recusada' ? 'Recusada' : 'Encerrada'}</Badge>
				<strong>{deal.name}</strong><small>{name(deal.from)} → {name(deal.to)} · {formatShort(deal.date)}</small></div><b>{formatExactMoney(deal.fee)}</b>
			</div>
		{/each}
		{#if !world.deals.length && !world.dealHistory.length}<p>Não há propostas registradas.</p>{/if}
	</div>
</Panel>

{#if player && rival}
	<Modal bind:open title={player.name} description={`${name(rival)} · ${player.position} · ${formatSquadAge(player.age)}`}>
		<label class="search">Valor da proposta (R$)<input type="number" min="0" step="1" bind:value={fee} placeholder="Informe o valor" /></label>
		{#snippet footer()}
			<Button variant="ghost" disabled={busy} onclick={() => open = false}>Cancelar</Button>
			<Button variant="primary" loading={busy} disabled={fee === undefined || fee < 0 || !Number.isInteger(fee)} onclick={offer}>Enviar proposta</Button>
		{/snippet}
	</Modal>
{/if}

<style>
	.clubs,.actions { display:flex; gap:7px; flex-wrap:wrap; }
	.clubs button { display:flex; align-items:center; gap:7px; padding:6px 9px; border:1px solid var(--line); border-radius:8px; color:var(--text); }
	.clubs button[aria-pressed='true'] { border-color:var(--emerald); background:var(--emerald-soft); }
	.players { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr)); gap:7px; margin-block:10px; }
	.athlete,.bid { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:8px; align-items:center; text-align:start; padding:8px; min-width:0;
		border:1px solid var(--line); border-radius:8px; background:var(--surface-sunken); color:var(--text); }
	.athlete:hover { border-color:var(--emerald); }
	.athlete small,.bid small { display:block; color:var(--text-2); }
	.athlete b { color:var(--emerald-strong); }
	.bids { display:grid; gap:6px; }
	.bid { grid-template-columns:minmax(0,1fr) auto; }
	.bid div:first-child { display:grid; justify-items:start; gap:4px; }
	.bid .actions { grid-column:1/-1; }
	.search { display:grid; gap:5px; margin-top:10px; }
	.search input { min-width:0; width:100%; padding:8px; border:1px solid var(--line); border-radius:8px; background:var(--surface-sunken); color:var(--text); }
</style>
