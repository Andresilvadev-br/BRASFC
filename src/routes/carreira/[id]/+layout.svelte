<script lang="ts">
	import { page } from '$app/state';
	import { invalidate } from '$app/navigation';
	import { api } from '#lib/api.ts';
	import type { Appearance } from '#lib/domain/appearance.ts';
	import { coachKit, playerKit } from '#lib/pixel/kits.ts';
	import WardrobeDialog from '#lib/ui/career/WardrobeDialog.svelte';
	import { MODE_LABELS } from '#lib/domain/career.ts';
	import { formatShort } from '#lib/domain/dates.ts';
	import { setIslandContext } from '#lib/stores/island.svelte.ts';
	import CareerShell from '#lib/ui/career/CareerShell.svelte';
	import type { CareerGroup } from '#lib/ui/career/navigation.ts';
	import type { IconName } from '#lib/ui/icons.ts';

	let { data, children } = $props();

	const base = $derived(`/carreira/${data.career.id}`);
	let visited = '';
	$effect(() => {
		const id = data.career.id;
		if (visited !== id) {
			visited = id;
			void api(`/api/careers/${id}`, { method: 'PATCH', body: { action: 'touch' } }).catch(() => {});
		}
	});
	const unread = $derived(data.career.unreadMessages ?? 0);
	const coach = $derived(data.career.mode === 'coach');
	const brasil = $derived(data.view.world === 'brasil');
	const groups = $derived<CareerGroup[]>(coach && data.manage.club.board.dismissed
		? [{ label: 'Carreira', items: [{ href: `${base}/gabinete`, label: 'Propostas de emprego', icon: 'briefcase' as IconName }] }]
		: [
		{
			label: 'Jogo',
			items: [
				{ href: base, label: coach ? 'Painel' : 'Central do jogador', icon: 'home' },
				{ href: `${base}/partida`, label: 'Dia de jogo', icon: 'play' }
			]
		},
		{
			label: 'Time',
			items: [
				{ href: `${base}/elenco`, label: 'Elenco', icon: 'squad' },
				...(coach ? [{ href: `${base}/taticas`, label: 'Táticas', icon: 'tactics' as IconName }] : []),
				{ href: coach ? `${base}/treinos` : `${base}?secao=treino`, label: 'Treinos', icon: 'training' }
			]
		},
		...(coach
			? [
					{
						label: 'Clube',
						items: [
							{ href: `${base}/mercado`, label: 'Mercado', icon: 'briefcase' as IconName, badge: data.manage.club.incoming.length || undefined },
							{ href: `${base}/financas`, label: 'Finanças', icon: 'chart' as IconName },
							{ href: `${base}/clube`, label: 'Clube', icon: 'crown' as IconName, alert: data.manage.club.board.dismissed || data.manage.club.board.confidence < 30 },
							{ href: `${base}/base`, label: 'Base e olheiros', icon: 'sparkle' as IconName },
							{ href: `${base}/comissao`, label: 'Comissão técnica', icon: 'whistle' as IconName, alert: data.office.vacant.length >= 4 },
							{ href: `${base}/gabinete`, label: 'Gabinete', icon: 'user' as IconName, badge: data.office.pending || undefined }
						]
					}
				]
			: [{ label: 'Carreira', items: [{ href: `${base}?secao=mercado`, label: 'Contratos e mercado', icon: 'user' as IconName, badge: data.career.data.playerCareer?.offers?.length || undefined }] }]),
		{
			label: 'Mundo',
			items: [
				{ href: `${base}/mundo`, label: 'Notícias e mundo', icon: 'globe' },
				{ href: `${base}/competicoes`, label: 'Competições', icon: 'trophy' },
				...(brasil ? [{ href: `${base}/copa`, label: 'Copa do Brasil', icon: 'star' as IconName }] : []),
				{ href: `${base}/calendario`, label: 'Calendário', icon: 'calendar' },
				{ href: `${base}/estatisticas`, label: 'Estatísticas', icon: 'field' },
				{ href: `${base}/historia`, label: 'História', icon: 'news' },
				{ href: `${base}/mensagens`, label: 'Mensagens', icon: 'mail', badge: unread || undefined }
			]
		}
	]);
	const items = $derived(groups.flatMap((g) => g.items));
	const current = $derived(items.find((i) => i.href === page.url.pathname + page.url.search)?.href ??
		items.find((i) => i.href === page.url.pathname)?.href ?? (page.url.pathname.startsWith(`${base}/`) ? null : base));
	const step = $derived(data.view.step);
	const stepLabel = $derived(!step ? 'Fim da temporada' : step.kind === 'cup' ? 'Copa do Brasil' : `Rodada ${step.round}`);

	async function saveAppearance(appearance: Appearance) {
		await api(`/api/careers/${data.career.id}`, { method: 'PATCH', body: { version: data.career.version, appearance } });
		await invalidate('app:career').catch(() => {});
		return true;
	}
	$effect(() => {
		setIslandContext(`${formatShort(data.career.gameDate)} · ${data.view.club.short}`);
	});
</script>

{#if data.degraded.length}
	<p class="load-notice" role="status">Não foi possível carregar {data.degraded.join(' e ')}. <button type="button" onclick={() => invalidate('app:career')}>Tentar novamente</button></p>
{/if}
<CareerShell {base} clubId={data.career.clubId} clubName={data.view.club.name} color={data.view.club.colors.primary}
	personName={data.career.personName} roleLabel={MODE_LABELS[data.career.mode]} {groups} {current}
	date={data.career.gameDate} season={data.career.season} cup={step?.kind === 'cup'} {stepLabel}
	balance={coach ? data.manage.club.balance : undefined}
	match={coach && data.manage.club.board.dismissed
		? { href: `${base}/gabinete`, label: 'Ver propostas de emprego' }
		: { href: `${base}/partida`, label: data.view.next ? 'Ir para o jogo' : data.view.seasonOver ? 'Encerrar temporada' : 'Avançar' }}>
	{#snippet status()}
		<WardrobeDialog value={data.career.data.appearance} clubId={data.career.clubId} uniformOptions={!coach} onsave={saveAppearance}
			kit={coach ? coachKit(data.career.clubId) : playerKit(data.career.clubId, data.career.data.position ?? 'ATA')} />
	{/snippet}
	{@render children()}
</CareerShell>

<style>
	.load-notice { margin: 0; padding: 8px var(--sp-4); background: var(--surface-2); color: var(--text-2); font-size: var(--fs-sm); }
	.load-notice button { color: var(--emerald-strong); }
</style>
