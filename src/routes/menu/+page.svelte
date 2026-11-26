<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { MODE_LABELS } from '#lib/domain/career.ts';
	import { latestValidSave, saveTitle } from '#lib/domain/saves.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { formatShort } from '#lib/domain/dates.ts';
	import { DEFAULT_APPEARANCE } from '#lib/domain/appearance.ts';
	import { animate } from '#lib/motion/motion.svelte.ts';
	import { coachKit } from '#lib/pixel/kits.ts';
	import { setIslandContext } from '#lib/stores/island.svelte.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Crest from '#lib/ui/Crest.svelte';
	import DesktopDownload from '#lib/ui/desktop/DesktopDownload.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import type { IconName } from '#lib/ui/icons.ts';
	import Logo from '#lib/ui/Logo.svelte';
	import Pixel from '#lib/ui/Pixel.svelte';
	import Stadium from '#lib/ui/Stadium.svelte';
	import { updates } from '#lib/stores/updates.svelte.ts';
	import { desktop, quitApp } from '#lib/stores/desktop.svelte.ts';

	let { data } = $props();

	type Item = {
		id: string;
		label: string;
		hint: string;
		icon: IconName;
		href: string;
		eyebrow: string;
		headline: string;
		text: string;
		chips: string[];
		cta: string;
		badge?: string;
		disabled?: boolean;
	};

	// Continuar abre o último save válido; saves incompatíveis ficam só na biblioteca.
	const latest = $derived(latestValidSave(data.careers));
	const latestClub = $derived(latest ? getClub(latest.clubId) : undefined);

	const items = $derived<Item[]>([
		latest
			? {
					id: 'continuar',
					label: 'Continuar carreira',
					hint: `${saveTitle(latest)}`,
					icon: 'play' as IconName,
					href: `/carreira/${latest.id}`,
					eyebrow: MODE_LABELS[latest.mode],
					headline: `De volta ao ${latestClub?.name ?? 'clube'}`,
					text: `${latest.personName} · ${formatShort(latest.gameDate)} de ${latest.season} · ${latest.unreadMessages ? `${latest.unreadMessages} mensagem(ns) não lida(s)` : 'caixa de entrada em dia'}.`,
					chips: [saveTitle(latest), 'Último save válido', 'Salvamento local'],
					cta: 'Continuar carreira'
				}
			: {
					id: 'continuar',
					label: 'Continuar carreira',
					hint: data.careers.length ? 'Nenhum save compatível' : 'Nenhuma carreira salva',
					icon: 'play' as IconName,
					href: '/continuar',
					eyebrow: 'Continuar carreira',
					headline: data.careers.length ? 'Nenhum save pode ser aberto' : 'Nenhuma carreira ainda',
					text: data.careers.length
						? 'Os saves deste perfil não são compatíveis com esta versão. Eles continuam guardados na biblioteca.'
						: 'Crie sua primeira carreira para continuar de onde parou sempre que voltar.',
					chips: ['Indisponível'],
					cta: 'Continuar carreira',
					disabled: true
				},
		{
			id: 'nova',
			label: 'Nova carreira',
			hint: 'Crie um ou mais treinadores',
			icon: 'plus',
			href: '/nova-carreira',
			eyebrow: 'Carreira de treinador',
			headline: 'Pronto para escrever sua história?',
			text: 'Assuma qualquer clube das Séries A a D. Sozinho ou com amigos no mesmo computador: cada treinador cria o seu e todos jogam em turnos, no mesmo universo.',
			chips: ['Clubes reais 2026', 'Vários treinadores em turnos', 'Salvamento local'],
			cta: 'Criar carreira'
		},
		{
			id: 'carregar',
			label: 'Carregar carreira',
			hint: `${data.careers.length} de 12 salvas`,
			icon: 'save',
			href: '/continuar',
			eyebrow: 'Biblioteca de saves',
			headline: 'Todas as suas carreiras',
			text: 'Escolha qual carreira abrir, veja detalhes, renomeie ou exclua saves. Tudo fica salvo neste computador.',
			chips: [`${data.careers.length} de 12 carreiras`, 'Organizar por data, tipo ou clube', 'Exclusão com confirmação'],
			cta: 'Abrir biblioteca'
		},
		{
			id: 'laboratorio',
			label: 'Laboratório',
			hint: 'Partida rápida · clubes 2026',
			icon: 'flask',
			href: '/laboratorio',
			eyebrow: 'Partida rápida',
			headline: 'Teste qualquer confronto',
			text: 'Escolha dois clubes das Séries A a D de 2026, defina as táticas e acompanhe a partida em 2D, com substituições e mudanças em tempo real.',
			chips: ['Motor 2D determinístico', 'Clubes reais 2026', 'Elencos ainda pendentes'],
			cta: 'Abrir laboratório',
			badge: 'Novo'
		},
		{
			id: 'config',
			label: 'Configurações',
			hint: 'Personalize sua experiência',
			icon: 'settings',
			href: '/configuracoes',
			eyebrow: 'Do seu jeito',
			headline: 'Ajuste a experiência',
			text: 'Animações, tamanho do texto, abertura e janela. Tudo vale imediatamente.',
			chips: ['Movimento reduzido', 'Texto maior', 'Desempenho'],
			cta: 'Abrir configurações'
		},
		{
			id: 'novidades',
			label: 'Atualizações',
			hint: updates.status === 'disponivel' ? `Nova versão ${updates.remote?.version}` : `Versão ${data.build.version}`,
			icon: 'sparkle',
			href: '/novidades',
			eyebrow: `BRASFC Dev ${data.build.version}`,
			headline: updates.status === 'disponivel' ? 'Há uma versão nova' : 'Central de atualizações',
			text: 'Veja o que mudou, confira a versão em uso, atualize o jogo com um clique e baixe o BRASFC para Windows.',
			chips: [`Versão ${data.build.version}`, `Commit ${data.build.commit}`],
			cta: 'Abrir central',
			...(updates.status === 'disponivel' ? { badge: 'Nova' } : {})
		},
		...(desktop.active
			? [{
					id: 'sair',
					label: 'Sair',
					hint: 'Fechar o BRASFC',
					icon: 'exit' as IconName,
					href: '#sair',
					eyebrow: 'Até a próxima',
					headline: 'Fechar o BRASFC',
					text: 'A carreira já está salva neste computador. O jogo fecha o save com segurança antes de sair.',
					chips: ['Salvamento local'],
					cta: 'Sair do jogo'
				}]
			: [])
	]);

	let selected = $state(untrack(() => (latestValidSave(data.careers) ? 0 : 1)));
	const current = $derived(items[Math.min(selected, items.length - 1)]);
	let stage: HTMLElement | undefined = $state();

	$effect(() => {
		void current.id;
		if (!stage) return;
		for (const [i, el] of [...stage.querySelectorAll<HTMLElement>('.copy.active [data-stage]')].entries()) {
			void animate(el, { opacity: 1, x: 0 }, { spring: 'page', delay: i * 40, from: { opacity: 0, x: 18 } });
		}
	});

	function select(i: number) {
		selected = (i + items.length) % items.length;
	}

	function activate(item: Item) {
		if (item.disabled) return;
		if (item.id === 'sair') { quitApp(); return; }
		void goto(item.href);
	}

	function onKey(e: KeyboardEvent) {
		if (e.target instanceof HTMLInputElement) return;
		if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'ArrowRight' || e.key === 'd') {
			e.preventDefault();
			select(selected + 1);
			focusItem(true);
		} else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'ArrowLeft' || e.key === 'a') {
			e.preventDefault();
			select(selected - 1);
			focusItem(true);
		}
	}

	function focusItem(reveal = false) {
		requestAnimationFrame(() => {
			const item = document.querySelector<HTMLElement>(`[data-menu-item="${selected}"]`);
			item?.focus({ preventScroll: true });
			if (reveal) item?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		});
	}

	onMount(() => {
		setIslandContext('Menu principal');
		focusItem();
	});

	const heroAppearance = $derived(latest?.data.appearance ?? DEFAULT_APPEARANCE);
	const heroKit = $derived(coachKit(latest?.clubId));
</script>

<svelte:head><title>Menu · BRASFC</title></svelte:head>
<svelte:window onkeydown={onKey} />

<div class="menu-screen">
	<Stadium tint={latestClub?.colors.primary ?? '#10B981'} />

	<header class="top" data-umx-enter>
		<Logo size={40} tagline />
		<div class="who">
			{#if data.profile}
				<a class="profile" href="/configuracoes" data-umx-press>
					<Icon name="user" size={18} />
					<span>{data.profile.displayName}</span>
				</a>
			{/if}
			<span class="env">{data.build.environment} · v{data.build.version}</span>
		</div>
	</header>

	<nav class="items" aria-label="Menu principal">
		{#each items as item, i (item.id)}
			<a
				href={item.disabled ? undefined : item.href}
				onclick={(e) => { if (item.id === 'sair') { e.preventDefault(); quitApp(); } }}
				aria-disabled={item.disabled || undefined}
				tabindex={item.disabled ? 0 : undefined}
				class="item glass"
				data-menu-item={i}
				data-active={i === selected}
				aria-current={i === selected ? 'true' : undefined}
				onpointerenter={() => select(i)}
				onfocus={() => select(i)}
				data-umx-surface
				data-umx-press
				style="--i:{i}"
			>
				<span class="ic"><Icon name={item.icon} size={22} /></span>
				<span class="label">
					{item.label}
					{#if item.badge}<Badge tone="gold">{item.badge}</Badge>{/if}
				</span>
				<span class="hint" title={item.hint}>{item.hint}</span>
			</a>
		{/each}
	</nav>

	<section class="stage" bind:this={stage} aria-live="polite">
		{#each items as item (item.id)}
			<div class="copy" class:active={item.id === current.id} inert={item.id !== current.id}>
				<span class="eyebrow" data-stage>{item.eyebrow}</span>
				<h1 data-stage>{item.headline}</h1>
				<p data-stage>{item.text}</p>
				<ul class="chips" data-stage>
					{#each item.chips as chip (chip)}<li>{chip}</li>{/each}
				</ul>
				<div class="cta" data-stage>
					{#if item.id === 'continuar'}
						<!-- A ação "Continuar carreira" fica só no menu: aqui aparece o resumo do save. -->
						{#if item.disabled}<Button variant="secondary" icon="plus" href="/nova-carreira">Criar uma carreira</Button>{:else}<span class="hint-key"><kbd>Enter</kbd> ou clique em “Continuar carreira” para entrar</span>{/if}
					{:else}
						<Button variant="primary" size="lg" iconRight="arrowRight" disabled={item.disabled} onclick={() => activate(item)}>{item.cta}</Button>
					{/if}
				</div>
				{#if item.id === 'novidades'}<div class="desk" data-stage><DesktopDownload compact /></div>{/if}
			</div>
		{/each}
	</section>

	<div class="hero" aria-hidden="true">
			<div class="figure solo">
				{#if current.id === 'continuar' && latest}
					<div class="crest-float"><Crest clubId={latest.clubId} size={96} /></div>
				{/if}
				<Pixel variant="full" appearance={heroAppearance} kit={heroKit} clubId={latest?.clubId} styled size={320} idle ball={false} />
			</div>
		<div class="floor"></div>
	</div>

	<footer class="keys">
		<span><kbd>↑</kbd><kbd>↓</kbd> Navegar</span>
		<span><kbd>Enter</kbd> Selecionar</span>
		<span class="subtle">Clubes brasileiros das Séries A–D 2026.</span>
	</footer>
</div>

<style>
	.desk {
		margin-top: var(--sp-4);
		max-width: 620px;
	}
	/*
	 * Dev 0.12: menu de jogo para computador — lista vertical à esquerda, apresentação no centro e
	 * treinador à direita, tudo dentro da altura da janela (1280×720 a 4K, sem rolagem).
	 */
	.menu-screen {
		position: relative;
		height: var(--app-h, 100vh);
		min-height: 560px;
		display: grid;
		grid-template-columns: minmax(250px, 320px) minmax(0, 1fr) minmax(200px, 26vw);
		grid-template-rows: auto minmax(0, 1fr) auto;
		grid-template-areas:
			'top top top'
			'items stage hero'
			'keys keys keys';
		padding: clamp(14px, 2.2vh, 32px) clamp(24px, 4vw, 72px);
		column-gap: clamp(24px, 3vw, 56px);
		row-gap: clamp(10px, 2vh, 28px);
		overflow: hidden;
	}
	.top {
		grid-area: top;
		position: relative;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-top: clamp(8px, 3vh, 44px);
	}
	.who {
		display: flex;
		align-items: center;
		gap: var(--sp-4);
	}
	.profile {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		padding: 8px 14px;
		border-radius: var(--radius-pill);
		background: rgb(16 20 24 / 0.65);
		border: 1px solid var(--line-strong);
		font-size: var(--fs-sm);
		font-weight: 600;
	}
	.profile:hover {
		border-color: var(--emerald-line);
	}
	.env {
		font-size: var(--fs-xs);
		color: var(--text-3);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	.items {
		grid-area: items;
		position: relative;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: clamp(6px, 1vh, 12px);
		min-height: 0;
	}
	.item {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		grid-template-rows: auto auto;
		column-gap: 12px;
		row-gap: 2px;
		align-items: center;
		padding: clamp(8px, 1.3vh, 14px) 14px;
		outline: none;
		min-width: 0;
		transition: box-shadow 0.25s var(--ease-out), transform 0.2s var(--ease-out);
	}
	.item[data-active='true'] {
		transform: translateX(4px);
	}
	.item:focus-visible {
		box-shadow: 0 0 0 2px var(--emerald-strong);
	}
	.ic {
		grid-row: 1 / 3;
		width: 38px;
		height: 38px;
		border-radius: 12px;
		display: grid;
		place-items: center;
		background: rgb(231 237 240 / 0.06);
		color: var(--text-2);
		transition: background 0.25s, color 0.25s;
	}
	.label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-2);
		min-width: 0;
		white-space: nowrap;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: calc(clamp(1.05rem, 1.25vw, 1.35rem) * var(--text-scale));
		line-height: 1.1;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: rgb(231 237 240 / 0.72);
	}
	.hint {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.item[data-active='true'] {
		box-shadow: var(--glow-emerald);
	}
	.item[data-active='true'] .label {
		color: var(--text);
	}
	.item[data-active='true'] .ic {
		background: var(--emerald-soft);
		color: var(--emerald-strong);
	}
	.item[aria-disabled='true'] {
		cursor: not-allowed;
		opacity: 0.55;
	}
	.item[aria-disabled='true'] .ic {
		background: rgb(231 237 240 / 0.04);
		color: var(--text-3);
	}
	.stage {
		grid-area: stage;
		position: relative;
		display: grid;
		align-content: center;
		min-width: 0;
	}
	.copy {
		grid-area: 1 / 1;
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		visibility: hidden;
		max-width: 600px;
		padding: var(--sp-3) 0;
	}
	.copy.active {
		visibility: visible;
	}
	.hint-key {
		color: var(--text-3);
		font-size: var(--fs-sm);
	}
	.copy h1 {
		font-size: calc(clamp(2rem, min(3.4vw, 6vh), 3.75rem) * var(--text-scale));
		text-wrap: balance;
		font-weight: 800;
		text-transform: uppercase;
		line-height: 0.98;
		text-shadow: 0 4px 30px rgb(0 0 0 / 0.5);
	}
	.copy p {
		font-size: var(--fs-lg);
		color: var(--text-2);
		max-width: 46ch;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.chips li {
		padding: 6px 12px;
		border-radius: var(--radius-pill);
		background: rgb(16 20 24 / 0.7);
		border: 1px solid var(--line-strong);
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.cta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
		margin-top: var(--sp-2);
	}
	.hero {
		grid-area: hero;
		position: relative;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding-bottom: var(--sp-4);
		pointer-events: none;
	}
	.figure :global(svg.pixel) {
		height: min(44vh, 340px);
		width: auto;
	}
	.figure {
		position: relative;
		z-index: 1;
		filter: drop-shadow(0 20px 30px rgb(0 0 0 / 0.55));
	}
	.crest-float {
		position: absolute;
		top: -24px;
		left: -64px;
		z-index: 2;
	}
	.floor {
		position: absolute;
		bottom: -8px;
		left: 50%;
		width: 70%;
		height: 40px;
		translate: -50% 0;
		background: radial-gradient(closest-side, rgb(0 0 0 / 0.6), transparent);
	}
	.keys {
		grid-area: keys;
		position: relative;
		display: flex;
		gap: var(--sp-6);
		align-items: center;
		font-size: var(--fs-xs);
		color: var(--text-2);
	}
	.keys .subtle {
		margin-left: auto;
	}
	kbd {
		display: inline-block;
		min-width: 22px;
		margin-right: 4px;
		padding: 2px 6px;
		border-radius: 5px;
		background: var(--surface-2);
		border: 1px solid var(--line-strong);
		font-family: var(--font-ui);
		font-size: 11px;
		text-align: center;
	}
	@media (min-width: 1101px) and (max-height: 840px) {
		.menu-screen {
			gap: var(--sp-3);
			padding-block: var(--sp-4);
		}
		.top {
			padding-top: 30px;
		}
		.copy {
			padding-block: var(--sp-3);
		}
		.figure :global(svg.pixel) {
			height: min(38vh, 300px);
		}
	}
	@media (max-width: 1100px) {
		.menu-screen {
			height: auto;
			min-height: var(--app-h, 100vh);
			grid-template-columns: 1fr;
			grid-template-rows: auto auto auto auto;
			grid-template-areas:
				'top'
				'stage'
				'items'
				'keys';
		}
		.hero {
			display: none;
		}
	}
	@media (max-width: 760px) {
		.menu-screen {
			grid-template-columns: 1fr;
			grid-template-areas: 'top' 'stage' 'items' 'keys';
			padding: var(--sp-4);
		}
		.top {
			flex-wrap: wrap;
			gap: var(--sp-3);
		}
		.keys span:not(.subtle) {
			display: none;
		}
	}
</style>
