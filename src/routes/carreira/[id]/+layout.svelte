<script lang="ts">
	import { page } from '$app/state';
	import { MODE_LABELS } from '#lib/domain/career.ts';
	import { formatShort } from '#lib/domain/dates.ts';
	import { indicator } from '#lib/motion/actions.ts';
	import { setIslandContext } from '#lib/stores/island.svelte.ts';
	import Crest from '#lib/ui/Crest.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import type { IconName } from '#lib/ui/icons.ts';

	let { data, children } = $props();

	const base = $derived(`/carreira/${data.career.id}`);
	const unread = $derived(data.messages.filter((m) => !m.read).length);
	const tabs = $derived<Array<{ href: string; label: string; icon: IconName; badge?: number }>>(
		data.career.mode === 'coach'
			? [
					{ href: base, label: 'Painel', icon: 'home' },
					{ href: `${base}/elenco`, label: 'Elenco', icon: 'squad' },
					{ href: `${base}/taticas`, label: 'Táticas', icon: 'tactics' },
					{ href: `${base}/treinos`, label: 'Treinos', icon: 'training' },
					{ href: `${base}/calendario`, label: 'Calendário', icon: 'calendar' },
					{ href: `${base}/competicoes`, label: 'Competições', icon: 'trophy' },
					{ href: `${base}/estatisticas`, label: 'Estatísticas', icon: 'chart' },
					{ href: `${base}/mensagens`, label: 'Mensagens', icon: 'mail', badge: unread }
				]
			: [
					{ href: base, label: 'Painel', icon: 'home' },
					{ href: `${base}/treinos`, label: 'Treinos', icon: 'training' },
					{ href: `${base}/elenco`, label: 'Elenco', icon: 'squad' },
					{ href: `${base}/calendario`, label: 'Calendário', icon: 'calendar' },
					{ href: `${base}/competicoes`, label: 'Competições', icon: 'trophy' },
					{ href: `${base}/estatisticas`, label: 'Estatísticas', icon: 'chart' },
					{ href: `${base}/mensagens`, label: 'Mensagens', icon: 'mail', badge: unread }
				]
	);

	$effect(() => {
		setIslandContext(`${formatShort(data.career.gameDate)} · ${data.view.club.short}`);
	});
</script>

<div class="shell" style="--club:{data.view.club.colors.primary}">
	<header class="bar">
		<a class="club" href={base} data-umx-shared="career-crest">
			<Crest clubId={data.career.clubId} size={44} />
			<span class="names">
				<strong>{data.view.club.name}</strong>
				<small>{MODE_LABELS[data.career.mode]} · {data.career.personName}</small>
			</span>
		</a>

		<nav class="tabs" aria-label="Seções da carreira">
			<span class="ind" use:indicator={{ axis: 'x', key: page.url.pathname }}></span>
			{#each tabs as t (t.href)}
				<a href={t.href} aria-current={page.url.pathname === t.href ? 'page' : undefined}>
					<Icon name={t.icon} size={18} />
					<span>{t.label}</span>
					{#if t.badge}<span class="count" aria-label="{t.badge} não lidas">{t.badge}</span>{/if}
				</a>
			{/each}
		</nav>

		<div class="right">
			<span class="date" title="Data atual no jogo">
				<Icon name="calendar" size={16} />
				<span class="num">{formatShort(data.career.gameDate)} {data.career.season}</span>
			</span>
			<button class="advance" disabled aria-describedby="advance-hint">
				Avançar <Icon name="chevronRight" size={18} />
			</button>
			<span id="advance-hint" class="hint">O avanço do calendário chega com o motor de partidas (Etapa 2).</span>
			<a class="exit" href="/menu" aria-label="Voltar ao menu principal" title="Menu principal" data-umx-press><Icon name="exit" /></a>
		</div>
	</header>

	<main class="content">
		{@render children()}
	</main>
</div>

<style>
	.shell {
		min-height: 100vh;
		background:
			radial-gradient(70% 40% at 15% -10%, color-mix(in srgb, var(--club) 14%, transparent), transparent 70%),
			var(--bg);
	}
	.bar {
		position: sticky;
		top: 0;
		z-index: 30;
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: center;
		column-gap: var(--sp-5);
		padding: 60px clamp(16px, 2.5vw, 36px) 0;
		background: linear-gradient(180deg, var(--bg) 70%, rgb(16 20 24 / 0.92));
		border-bottom: 1px solid var(--line);
		backdrop-filter: blur(8px);
	}
	.club {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding-bottom: var(--sp-2);
		min-width: 0;
	}
	.names {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.names strong {
		font-family: var(--font-display);
		font-size: var(--fs-xl);
		text-transform: uppercase;
		line-height: 1.05;
		white-space: nowrap;
	}
	.names small {
		color: var(--text-3);
		font-size: var(--fs-xs);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tabs {
		grid-column: 1 / -1;
		grid-row: 2;
		margin: 0 calc(-1 * var(--sp-2));
		position: relative;
		display: flex;
		align-self: end;
		gap: 2px;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.ind {
		position: absolute;
		bottom: 0;
		left: 0;
		height: 3px;
		border-radius: 3px 3px 0 0;
		background: var(--emerald);
	}
	.tabs a {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		height: 52px;
		padding: 0 14px;
		color: var(--text-2);
		font-weight: 600;
		font-size: var(--fs-sm);
		white-space: nowrap;
		border-radius: var(--radius-s) var(--radius-s) 0 0;
	}
	.tabs a:hover {
		color: var(--text);
		background: rgb(231 237 240 / 0.03);
	}
	.tabs a[aria-current='page'] {
		color: var(--text);
	}
	.tabs a[aria-current='page'] :global(.icon) {
		color: var(--emerald-strong);
	}
	.count {
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
	.right {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding-bottom: var(--sp-2);
	}
	.date {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 40px;
		padding: 0 12px;
		border-radius: var(--radius-m);
		background: var(--surface);
		border: 1px solid var(--line);
		font-size: var(--fs-sm);
		font-weight: 600;
		white-space: nowrap;
	}
	.advance {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 40px;
		padding: 0 12px 0 16px;
		border-radius: var(--radius-m);
		border: 0;
		background: var(--emerald);
		color: #04140e;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: var(--fs-md);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.advance:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.hint {
		position: absolute;
		top: calc(100% + 2px);
		right: 0;
		width: 260px;
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-s);
		background: var(--surface-3);
		font-size: var(--fs-xs);
		color: var(--text-2);
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.15s;
	}
	.right:has(.advance:hover) .hint {
		opacity: 1;
	}
	.exit {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: var(--radius-m);
		color: var(--text-2);
		border: 1px solid var(--line);
	}
	.exit:hover {
		color: var(--text);
		background: var(--surface);
	}
	.content {
		max-width: var(--content-max);
		margin: 0 auto;
		padding: var(--sp-6) clamp(16px, 2.5vw, 36px) var(--sp-8);
	}
	@media (max-width: 900px) {
		.names small {
			display: none;
		}
	}
	@media (max-width: 720px) {
		.tabs a span:not(.count) {
			display: none;
		}
		.date span {
			display: none;
		}
	}
</style>
