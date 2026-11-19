<script lang="ts">
	import { page } from '$app/state';
	import { invalidate } from '$app/navigation';
	import { api } from '#lib/api.ts';
	import { MODE_LABELS } from '#lib/domain/career.ts';
	import { formatShort } from '#lib/domain/dates.ts';
	import { formatMoney } from '#lib/domain/market.ts';
	import { count, indicator } from '#lib/motion/actions.ts';
	import { setIslandContext } from '#lib/stores/island.svelte.ts';
	import Crest from '#lib/ui/Crest.svelte';
	import Icon from '#lib/ui/Icon.svelte';
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
	type Item = { href: string; label: string; icon: IconName; badge?: number; alert?: boolean };
	const groups = $derived<Array<{ label: string; items: Item[] }>>([
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

	$effect(() => {
		setIslandContext(`${formatShort(data.career.gameDate)} · ${data.view.club.short}`);
	});
</script>

{#if data.degraded.length}
	<p class="load-notice" role="status">Não foi possível carregar {data.degraded.join(' e ')}. <button type="button" onclick={() => invalidate('app:career')}>Tentar novamente</button></p>
{/if}
<div class="shell" style="--club:{data.view.club.colors.primary}">
	<aside class="rail" aria-label="Navegação da carreira">
		<a class="club" href={base} data-umx-shared="career-crest">
			<Crest clubId={data.career.clubId} size={42} />
			<span class="names">
				<strong>{data.view.club.name}</strong>
				<small>{MODE_LABELS[data.career.mode]} · {data.career.personName}</small>
			</span>
		</a>

		<nav>
			<span class="ind" use:indicator={{ axis: 'y', key: page.url.pathname }}></span>
			{#each groups as g (g.label)}
				<p class="group">{g.label}</p>
				{#each g.items as t (t.href)}
					<a href={t.href} aria-current={current === t.href ? 'page' : undefined} data-sveltekit-preload-data="off" data-sveltekit-preload-code="hover">
						<Icon name={t.icon} size={18} />
						<span>{t.label}</span>
						{#if t.badge}<span class="count" aria-label="{t.badge} pendentes">{t.badge}</span>{/if}
						{#if t.alert}<span class="alert" aria-label="Atenção"></span>{/if}
					</a>
				{/each}
			{/each}
		</nav>

		<div class="foot">
			{#if coach}
				<div class="cash" title="Caixa do clube">
					<span>Caixa</span>
					<strong class:neg={data.manage.club.balance < 0} use:count={{ value: data.manage.club.balance, format: formatMoney }}>{formatMoney(data.manage.club.balance)}</strong>
				</div>
			{/if}
			<a class="exit" href="/menu" title="Menu principal" data-umx-press><Icon name="exit" size={18} /> Menu</a>
		</div>
	</aside>

	<header class="top">
		<div class="when">
			<Icon name="calendar" size={16} />
			<span class="num">{formatShort(data.career.gameDate)} {data.career.season}</span>
			<span class="sep"></span>
			<span class="step" class:cup={step?.kind === 'cup'}>{stepLabel}</span>
		</div>
		<a class="advance" href="{base}/partida" data-umx-press data-umx-magnet="0.25" aria-describedby="advance-hint">
			{data.view.next ? 'Ir para o jogo' : data.view.seasonOver ? 'Encerrar temporada' : 'Avançar'}
			<Icon name="chevronRight" size={18} />
		</a>
		<span id="advance-hint" class="hint">Abre o próximo passo do calendário: jogo, semana sem jogo ou fim de temporada.</span>
	</header>

	<main class="content">
		{@render children()}
	</main>
</div>

<style>
	.load-notice { margin: 0; padding: 8px var(--sp-4); background: var(--surface-2); color: var(--text-2); font-size: var(--fs-sm); }
	.load-notice button { color: var(--emerald-strong); }

	.shell {
		min-height: var(--app-h, 100vh);
		display: grid;
		grid-template-columns: 248px minmax(0, 1fr);
		grid-template-rows: auto 1fr;
		background:
			radial-gradient(60% 40% at 10% -10%, color-mix(in srgb, var(--club) 16%, transparent), transparent 70%),
			radial-gradient(50% 35% at 100% 0%, rgb(16 185 129 / 0.06), transparent 70%),
			var(--bg);
	}
	.rail {
		grid-row: 1 / -1;
		position: sticky;
		top: var(--desk-bar, 0px);
		height: var(--app-h, 100vh);
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		padding: var(--sp-5) var(--sp-3) var(--sp-4);
		border-right: 1px solid var(--line);
		background: linear-gradient(180deg, rgb(20 26 31 / 0.96), rgb(14 18 22 / 0.98));
	}
	.club {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: 0 var(--sp-2) var(--sp-3);
		border-bottom: 1px solid var(--line);
		min-width: 0;
	}
	.names {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.names strong {
		font-family: var(--font-display);
		font-size: var(--fs-lg);
		text-transform: uppercase;
		line-height: 1.05;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.names small {
		color: var(--text-3);
		font-size: var(--fs-xs);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	nav {
		position: relative;
		flex: 1;
		overflow-y: auto;
		scrollbar-width: thin;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.group {
		margin: var(--sp-3) var(--sp-3) 4px;
		font-size: 10px;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--text-3);
		font-weight: 800;
	}
	.ind {
		position: absolute;
		left: 0;
		top: 0;
		width: 100%;
		height: 40px;
		border-radius: var(--radius-m);
		background: linear-gradient(90deg, rgb(16 185 129 / 0.18), rgb(16 185 129 / 0.04));
		box-shadow: inset 3px 0 0 var(--emerald);
		pointer-events: none;
	}
	nav a {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		height: 40px;
		padding: 0 var(--sp-3);
		border-radius: var(--radius-m);
		color: var(--text-2);
		font-weight: 600;
		font-size: var(--fs-sm);
		transition: color 0.2s;
	}
	nav a:hover {
		color: var(--text);
	}
	nav a[aria-current='page'] {
		color: var(--text);
	}
	nav a[aria-current='page'] :global(.icon) {
		color: var(--emerald-strong);
	}
	.count {
		margin-left: auto;
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		border-radius: 10px;
		background: var(--emerald);
		color: #04140e;
		font-size: 11px;
		font-weight: 800;
		display: grid;
		place-items: center;
	}
	.alert {
		margin-left: auto;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--danger);
		box-shadow: 0 0 0 4px var(--danger-soft);
	}
	.foot {
		display: grid;
		gap: var(--sp-2);
		padding-top: var(--sp-3);
		border-top: 1px solid var(--line);
	}
	.cash {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		padding: 0 var(--sp-2);
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.cash strong {
		font-family: var(--font-display);
		font-size: var(--fs-lg);
		color: var(--text);
	}
	.cash strong.neg {
		color: var(--danger);
	}
	.exit {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: 8px var(--sp-3);
		border-radius: var(--radius-m);
		color: var(--text-3);
		font-size: var(--fs-sm);
		font-weight: 600;
	}
	.exit:hover {
		color: var(--text);
		background: rgb(231 237 240 / 0.04);
	}
	.top {
		position: sticky;
		top: var(--desk-bar, 0px);
		z-index: 30;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--sp-4);
		padding: var(--sp-3) clamp(16px, 2.5vw, 36px);
		background: linear-gradient(180deg, rgb(16 20 24 / 0.94), rgb(16 20 24 / 0.75));
		backdrop-filter: blur(10px);
		border-bottom: 1px solid var(--line);
	}
	.when {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		color: var(--text-2);
		font-size: var(--fs-sm);
		margin-right: auto;
	}
	.sep {
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: var(--text-3);
	}
	.step {
		font-weight: 700;
		color: var(--text);
	}
	.step.cup {
		color: var(--gold);
	}
	.advance {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		height: 42px;
		padding: 0 18px 0 22px;
		border-radius: var(--radius-pill);
		background: linear-gradient(180deg, var(--emerald-strong), var(--emerald));
		color: #03130d;
		font-weight: 800;
		letter-spacing: 0.01em;
		box-shadow: var(--glow-emerald);
	}
	.hint {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.content {
		min-width: 0;
		padding: var(--sp-5) clamp(16px, 2.5vw, 36px) var(--sp-8);
		max-width: var(--content-max);
		width: 100%;
	}
	@media (max-width: 960px) {
		.shell {
			grid-template-columns: 1fr;
			grid-template-rows: auto auto 1fr;
		}
		.rail {
			position: sticky;
			top: var(--desk-bar, 0px);
			z-index: 31;
			height: auto;
			flex-direction: row;
			align-items: center;
			padding: var(--sp-2) var(--sp-3);
			border-right: 0;
			border-bottom: 1px solid var(--line);
			overflow-x: auto;
		}
		.club {
			border: 0;
			padding: 0;
			flex: none;
		}
		.names small {
			display: none;
		}
		nav {
			flex-direction: row;
			overflow: visible;
		}
		.group,
		.ind,
		.foot {
			display: none;
		}
		nav a {
			white-space: nowrap;
		}
		nav a[aria-current='page'] {
			background: var(--emerald-soft);
		}
		.top {
			top: 58px;
		}
	}
</style>
