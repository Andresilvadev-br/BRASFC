<script lang="ts">
	import { clubAction } from '#lib/client/club.ts';
	import { findPlayer } from '#lib/domain/market.ts';
	import MarketWorkspace from '#lib/ui/market/MarketWorkspace.svelte';
	import MarketSquad from '#lib/ui/market/MarketSquad.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const c = $derived(data.career);
	const m = $derived(data.manage);
	const v = $derived(data.view);

	async function commit(action: Record<string, unknown>) {
		const result = await clubAction(c.id, c.version, action);
		return { ok: true, log: result.negotiation };
	}

	const names = (id: string) => findPlayer(m.ctx, id)?.name;
</script>

<svelte:head><title>Mercado · {v.club.name} · BRASFC</title></svelte:head>

{#key c.id}
	<MarketWorkspace endpoint={`/api/careers/${c.id}/market`} storageKey={`market:${c.id}`} revision={c.version} clubId={c.clubId}
		budget={Math.max(0, Math.min(m.club.transferBudget, m.club.balance))} wages={m.payroll} wageBudget={m.club.wageBudget}
		window={m.window} incoming={m.club.incoming} logs={m.club.negotiations} {names} {commit}>
		{#snippet own()}<MarketSquad players={m.roster} listed={m.market.listed} toggle={async (id) => (await commit({ action: 'listar', playerId: id })).ok} />{/snippet}
	</MarketWorkspace>
{/key}
