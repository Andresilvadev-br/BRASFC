<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { MODE_LABELS } from '#lib/domain/career.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { formatShort } from '#lib/domain/dates.ts';
	import { DEFAULT_APPEARANCE } from '#lib/domain/appearance.ts';
	import { animate } from '#lib/motion/motion.svelte.ts';
	import { clubKit, coachKit } from '#lib/pixel/kits.ts';
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
	};

	const latest = $derived(data.careers[0]);
	const latestClub = $derived(latest ? getClub(latest.clubId) : undefined);

	const items = $derived<Item[]>([
		...(latest
			? [
					{
						id: 'continuar',
						label: 'Continuar',
						hint: `${latest.personName} · ${latestClub?.short ?? ''}`,
						icon: 'play' as IconName,
						href: `/carreira/${latest.id}`,
						eyebrow: MODE_LABELS[latest.mode],
						headline: `De volta ao ${latestClub?.name ?? 'clube'}`,
						text: `${formatShort(latest.gameDate)} · ${latest.unreadMessages ? `${latest.unreadMessages} mensagem(ns) não lida(s)` : 'caixa de entrada em dia'}.`,
						chips: data.careers.length > 1 ? [`${data.careers.length} carreiras salvas`] : ['Carreira salva no servidor'],
						cta: 'Continuar carreira'
					}
				]
			: []),
		{
			id: 'nova',
			label: 'Nova carreira',
			hint: 'Treinador ou jogador',
			icon: 'plus',
			href: '/nova-carreira',
			eyebrow: 'Modo carreira',
			headline: 'Pronto para escrever sua história?',
			text: 'Comande um clube do banco de reservas ou comece como jovem promessa e conquiste a titularidade.',
			chips: ['Carreira de Treinador', 'Carreira de Jogador', 'Salvamento automático'],
			cta: 'Criar carreira'
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
			id: 'multiplayer',
			label: 'Multiplayer',
			hint: 'Salas privadas · beta',
			icon: 'multiplayer',
			href: '/multiplayer',
			eyebrow: 'Com amigos',
			headline: 'Monte sua liga entre amigos',
			text: 'Crie uma sala privada, compartilhe o código e veja quem está online em tempo real. Carreiras compartilhadas chegam nas próximas etapas.',
			chips: ['Salas privadas', 'Presença em tempo real', 'Carreiras compartilhadas em breve'],
			cta: 'Abrir multiplayer',
			badge: 'Beta'
		},
		{
			id: 'config',
			label: 'Configurações',
			hint: 'Movimento, texto, perfil',
			icon: 'settings',
			href: '/configuracoes',
			eyebrow: 'Do seu jeito',
			headline: 'Ajuste a experiência',
			text: 'Animações, tamanho do texto, abertura e nome do perfil. Tudo vale imediatamente.',
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
		}
	]);

	let selected = $state(0);
	const current = $derived(items[Math.min(selected, items.length - 1)]);
	let stage: HTMLElement | undefined = $state();

	$effect(() => {
		void current.id;
		if (!stage) return;
		for (const [i, el] of [...stage.querySelectorAll<HTMLElement>('[data-stage]')].entries()) {
			void animate(el, { opacity: 1, x: 0 }, { spring: 'page', delay: i * 40, from: { opacity: 0, x: 18 } });
		}
	});

	function select(i: number) {
		selected = (i + items.length) % items.length;
	}

	function activate(i = selected) {
		void goto(items[i].href);
	}

	function onKey(e: KeyboardEvent) {
		if (e.target instanceof HTMLInputElement) return;
		if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'ArrowRight' || e.key === 'd') {
			e.preventDefault();
			select(selected + 1);
			focusItem();
		} else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'ArrowLeft' || e.key === 'a') {
			e.preventDefault();
			select(selected - 1);
			focusItem();
		}
	}

	function focusItem() {
		requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-menu-item="${selected}"]`)?.focus());
	}

	onMount(() => {
		setIslandContext('Menu principal');
		focusItem();
	});

	const heroAppearance = $derived(latest?.data.appearance ?? DEFAULT_APPEARANCE);
	const heroKit = $derived(latest ? (latest.mode === 'coach' ? coachKit(latest.clubId) : clubKit(latest.clubId)) : { shirt: '#10B981', trim: '#E7EDF0', shorts: '#101418', socks: '#10B981' });
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
				href={item.href}
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
				<span class="hint">{item.hint}</span>
			</a>
		{/each}
	</nav>

	<section class="stage" bind:this={stage} aria-live="polite">
		{#key current.id}
			<div class="copy">
				<span class="eyebrow" data-stage>{current.eyebrow}</span>
				<h1 data-stage>{current.headline}</h1>
				<p data-stage>{current.text}</p>
				<ul class="chips" data-stage>
					{#each current.chips as chip (chip)}<li>{chip}</li>{/each}
				</ul>
				<div class="cta" data-stage>
					<Button variant="primary" size="lg" iconRight="arrowRight" onclick={() => activate()}>{current.cta}</Button>
					{#if current.id === 'continuar' && data.careers.length > 1}
						<Button variant="ghost" href="/continuar">Todas as carreiras</Button>
					{/if}
				</div>
				{#if current.id === 'novidades'}<div class="desk" data-stage><DesktopDownload compact /></div>{/if}
			</div>
		{/key}
	</section>

	<div class="hero" aria-hidden="true">
		{#if current.id === 'nova'}
			<div class="duo">
				<div class="figure coach"><Pixel variant="full" appearance={{ skin: 3, hairColor: 0, hairStyle: 'curto' }} kit={coachKit()} size={300} idle ball={false} /></div>
				<div class="figure"><Pixel variant="full" appearance={DEFAULT_APPEARANCE} kit={{ shirt: '#10B981', trim: '#E7EDF0', shorts: '#101418', socks: '#10B981' }} size={360} idle /></div>
			</div>
		{:else}
			<div class="figure solo">
				{#if current.id === 'continuar' && latest}
					<div class="crest-float"><Crest clubId={latest.clubId} size={96} /></div>
				{/if}
				<Pixel variant="full" appearance={heroAppearance} kit={heroKit} size={400} idle ball={latest?.mode !== 'coach'} />
			</div>
		{/if}
		<div class="floor"></div>
	</div>

	<footer class="keys">
		<span><kbd>←</kbd><kbd>→</kbd> Navegar</span>
		<span><kbd>Enter</kbd> Selecionar</span>
		<span class="subtle">Clubes reais das Séries A–D 2026 (fontes públicas); elencos e atletas do universo BRASFC são fictícios.</span>
	</footer>
</div>

<style>
	.desk {
		margin-top: var(--sp-4);
		max-width: 620px;
	}
	.menu-screen {
		position: relative;
		min-height: var(--app-h, 100vh);
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(220px, 30vw);
		grid-template-rows: auto 1fr auto auto;
		grid-template-areas:
			'top top'
			'stage hero'
			'items items'
			'keys keys';
		padding: var(--sp-6) clamp(24px, 4vw, 64px);
		gap: var(--sp-6);
		overflow: hidden;
	}
	.top {
		grid-area: top;
		position: relative;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-top: 44px;
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
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: var(--sp-3);
	}
	.item {
		display: grid;
		grid-template-rows: auto auto 1fr;
		gap: 6px;
		min-height: 128px;
		padding: var(--sp-4);
		outline: none;
		transition: box-shadow 0.25s var(--ease-out), translate 0.3s var(--ease-out);
	}
	.item:focus-visible {
		box-shadow: 0 0 0 2px var(--emerald-strong);
	}
	.ic {
		width: 40px;
		height: 40px;
		border-radius: 12px;
		display: grid;
		place-items: center;
		background: rgb(231 237 240 / 0.06);
		color: var(--text-2);
		transition: background 0.25s, color 0.25s;
	}
	.label {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		font-family: var(--font-display);
		font-weight: 700;
		font-size: calc(1.35rem * var(--text-scale));
		line-height: 1.05;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: rgb(231 237 240 / 0.72);
	}
	.hint {
		font-size: var(--fs-xs);
		color: var(--text-3);
		align-self: end;
	}
	.item[data-active='true'] {
		translate: 0 -6px;
		box-shadow: var(--glow-emerald);
	}
	.item[data-active='true'] .label {
		color: var(--text);
	}
	.item[data-active='true'] .ic {
		background: var(--emerald-soft);
		color: var(--emerald-strong);
	}
	.stage {
		grid-area: stage;
		position: relative;
		display: flex;
		align-items: center;
		min-width: 0;
	}
	.copy {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		max-width: 560px;
		padding: var(--sp-6) 0;
	}
	.copy h1 {
		font-size: calc(clamp(2.5rem, 4vw, 3.75rem) * var(--text-scale));
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
	.duo {
		display: flex;
		align-items: flex-end;
		gap: 0;
	}
	.duo .coach {
		margin-right: -40px;
		filter: brightness(0.82);
	}
	.figure :global(svg.pixel) {
		height: min(50vh, 380px);
		width: auto;
	}
	.duo .coach :global(svg.pixel) {
		height: min(42vh, 320px);
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
	@media (max-width: 1100px) {
		.menu-screen {
			grid-template-columns: 1fr;
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
