<script lang="ts">
	import { onMount } from 'svelte';
	import Logo from '#lib/ui/Logo.svelte';
	import { COMMUNITY, REPOSITORY } from '#lib/site.ts';

	let { data } = $props();

	const NAV = [
		{ id: 'jogo', label: 'O jogo' },
		{ id: 'galeria', label: 'Galeria' },
		{ id: 'novidades', label: 'Novidades' }
	] as const;

	const FEATURES = [
		{
			title: 'Seja o treinador.',
			lead: 'Comande o clube da primeira escalação à última rodada.',
			text: 'Escolha seu esquema, distribua funções e acompanhe o elenco. Negocie no mercado, peça verba à diretoria, renove contratos e encare o calendário das competições.',
			image: 'central', caption: 'Central do treinador'
		},
		{
			title: 'Pense o jogo.',
			lead: 'Táticas que o elenco aprende com o tempo.',
			text: 'Formação, mentalidade, estilo, funções e ordens individuais. Guarde suas favoritas em Minhas Táticas e leve-as para qualquer clube que assumir.',
			image: 'taticas', caption: 'Prancheta tática'
		},
		{
			title: 'Viva a partida.',
			lead: 'Acompanhe cada lance em 2D.',
			text: 'Transmissão clássica ou em pixel art, substituições, ajustes no intervalo, expulsões com time de 10 e o placar da rodada inteira ao lado.',
			image: 'partida', caption: 'Partida em pixel art'
		},
		{
			title: 'Divida a temporada.',
			lead: 'Vários treinadores no mesmo computador.',
			text: 'Crie um treinador para cada amigo e jogue em turnos, como nos clássicos: cada um prepara o seu clube, as partidas rolam juntas na central de resultados e negociações entre vocês acontecem na hora.',
			image: 'dia-de-jogo', caption: 'Rodada simultânea'
		}
	];

	const GALLERY = [
		{ image: 'central', caption: 'Central do treinador' },
		{ image: 'taticas', caption: 'Táticas' },
		{ image: 'mercado', caption: 'Mercado de transferências' },
		{ image: 'dia-de-jogo', caption: 'Dia de jogo' },
		{ image: 'partida', caption: 'Partida em pixel art' }
	];

	let active = $state<string>('jogo');
	let viewing = $state<(typeof GALLERY)[number] | null>(null);
	let dialog = $state<HTMLDialogElement>();

	const formatDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

	function open(item: (typeof GALLERY)[number]) {
		viewing = item;
		dialog?.showModal();
	}

	onMount(() => {
		const sections = NAV.map((n) => document.getElementById(n.id)).filter((el): el is HTMLElement => !!el);
		const observer = new IntersectionObserver((entries) => {
			for (const entry of entries) if (entry.isIntersecting) active = entry.target.id;
		}, { rootMargin: '-45% 0px -50% 0px' });
		sections.forEach((s) => observer.observe(s));
		return () => observer.disconnect();
	});
</script>

<svelte:head>
	<title>BRASFC · Simulador brasileiro de futebol</title>
	<meta name="description" content="Seu clube. Sua carreira. Seu futebol. Carreira de treinador, partidas em 2D e vários treinadores no mesmo PC. Grátis para Windows, 100% offline." />
	<meta property="og:title" content="BRASFC · Simulador brasileiro de futebol" />
	<meta property="og:description" content="Carreira de treinador, partidas em 2D e vários treinadores no mesmo PC. Grátis para Windows." />
	<meta property="og:image" content="/landing/central.webp" />
	<meta property="og:type" content="website" />
</svelte:head>

<div class="site">
	<header class="top">
		<div class="bar wrap">
			<a class="brand" href="/" aria-label="BRASFC — início"><Logo size={34} /></a>
			<div class="actions">
				<a class="btn primary sm" href={data.desktop.download}><svg class="win" viewBox="0 0 16 16" aria-hidden="true"><path d="M0 2.2 6.5 1.3v6.3H0zm7.3-1L16 0v7.6H7.3zM0 8.4h6.5v6.3L0 13.8zm7.3 0H16V16l-8.7-1.2z" /></svg>Download</a>
			</div>
		</div>
		<nav class="tabs wrap" aria-label="Seções">
			{#each NAV as item (item.id)}
				<a href="#{item.id}" class:on={active === item.id} aria-current={active === item.id ? 'true' : undefined}>{item.label}</a>
			{/each}
		</nav>
	</header>

	<main>
		<section class="hero" aria-labelledby="hero-title">
			<div class="stadium" aria-hidden="true">
				<span class="light l1"></span><span class="light l2"></span><span class="light l3"></span>
				<svg class="pitch" viewBox="0 0 1200 400" preserveAspectRatio="none">
					<path d="M-200 400 300 120H900L1400 400Z" class="grass" />
					<path d="M300 120H900M120 225H1080M-60 330H1260M600 120V400" class="lines" />
					<ellipse cx="600" cy="265" rx="150" ry="42" class="lines" />
					<path d="M480 120 470 150H730L720 120" class="lines" />
				</svg>
			</div>
			<div class="wrap hero-grid">
			<div class="hero-body">
				<p class="eyebrow"><span></span>Simulador brasileiro de futebol</p>
				<h1 id="hero-title" class="display">Seu clube.<br />Sua carreira.<br /><em>Seu futebol.</em></h1>
				<p class="lead">Assuma o vestiário, monte seu time do seu jeito e dispute temporadas sozinho ou com amigos no mesmo computador. Um jogo de futebol para Windows, 100% offline.</p>
				<div class="ctas">
					<a class="btn primary" href={data.desktop.download}><svg class="win" viewBox="0 0 16 16" aria-hidden="true"><path d="M0 2.2 6.5 1.3v6.3H0zm7.3-1L16 0v7.6H7.3zM0 8.4h6.5v6.3L0 13.8zm7.3 0H16V16l-8.7-1.2z" /></svg>Baixar para Windows</a>
					<a class="btn ghost" href="#jogo">Conhecer o jogo</a>
				</div>
				<p class="meta">Versão {data.latest.version} · Windows {data.desktop.version} <i></i> {data.desktop.platform} <i></i> Grátis</p>
			</div>
			<figure class="hero-shot" aria-hidden="true">
				<img src="/landing/central.webp" alt="" width="1200" height="750" fetchpriority="high" />
			</figure>
			</div>
			<ul class="facts wrap">
				<li><strong>Carreira de treinador</strong><span>Contratos, mercado e diretoria</span></li>
				<li><strong>Partidas em 2D</strong><span>Clássico e pixel art</span></li>
				<li><strong>100% offline</strong><span>Sozinho ou em turnos com amigos</span></li>
			</ul>
		</section>

		<section id="jogo" class="wrap block" aria-labelledby="jogo-title">
			<p class="kicker">Dentro do BRASFC</p>
			<h2 id="jogo-title" class="display">O jogo é seu.</h2>
			{#each FEATURES as f, i (f.title)}
				<article class="feature" class:flip={i % 2 === 1}>
					<div class="copy">
						<h3 class="display">{f.title}</h3>
						<p class="feature-lead">{f.lead}</p>
						<p class="muted">{f.text}</p>
						<a class="more" href="#galeria">Explorar galeria</a>
					</div>
					<figure class="shot">
						<img src="/landing/{f.image}.webp" alt={f.caption} width="1200" height="750" loading={i === 0 ? 'eager' : 'lazy'} decoding="async" />
						<figcaption><span>{f.caption}</span><small>BRASFC {data.latest.version}</small></figcaption>
					</figure>
				</article>
			{/each}
		</section>

		<section class="band" aria-labelledby="save-title">
			<div class="wrap save">
				<div>
					<p class="kicker">Seu save em segurança</p>
					<h2 id="save-title" class="display">Caiu a conexão? O jogo continua.</h2>
					<p class="muted">Tática e treinos ficam salvos no aparelho e sincronizam sozinhos quando a rede volta, sem duplicar nada. No Windows, a carreira também roda totalmente offline.</p>
				</div>
				<ul class="states" aria-label="Estados de salvamento">
					<li><i class="warn"></i>Salvo localmente</li>
					<li><i class="warn"></i>Sincronizando</li>
					<li><i class="ok"></i>Sincronizado</li>
				</ul>
			</div>
		</section>

		<section id="galeria" class="wrap block" aria-labelledby="galeria-title">
			<p class="kicker">Galeria</p>
			<h2 id="galeria-title" class="display">Veja de perto.</h2>
			<ul class="gallery">
				{#each GALLERY as g (g.image)}
					<li>
						<button type="button" onclick={() => open(g)} aria-label="Ampliar: {g.caption}">
							<img src="/landing/{g.image}.webp" alt="" width="1200" height="750" loading="lazy" decoding="async" />
							<span>{g.caption}</span>
						</button>
					</li>
				{/each}
			</ul>
		</section>

		<section id="novidades" class="wrap block" aria-labelledby="novidades-title">
			<p class="kicker">Novidades · versão {data.latest.version}</p>
			<h2 id="novidades-title" class="display">{data.latest.title}.</h2>
			{#if data.latest.highlights.length}
				<ul class="news">
					{#each data.latest.highlights as h (h.title)}
						<li><strong>{h.title}</strong><p class="muted">{h.text}</p></li>
					{/each}
				</ul>
			{/if}
			<ol class="versions" aria-label="Versões recentes">
				{#each data.recent as r (r.version)}
					<li><b>{r.version}</b><span>{r.title}</span><time datetime={r.date}>{formatDate(r.date)}</time></li>
				{/each}
			</ol>
			<a class="more" href="/novidades">Ver todas as novidades</a>
		</section>


		<section class="wrap block download" aria-labelledby="download-title">
			<p class="kicker">BRASFC para PC</p>
			<h2 id="download-title" class="display">Seu próximo clube espera.</h2>
			<p class="muted">{data.desktop.platform} · {data.desktop.version} · atualizações pelo próprio app, saves preservados.</p>
			<div class="ctas">
				<a class="btn primary" href={data.desktop.download}>Baixar para Windows</a>
				<a class="btn ghost" href={data.desktop.page} rel="noopener" target="_blank">Ver download e requisitos</a>
			</div>
		</section>
	</main>

	<footer class="foot">
		<div class="wrap">
			<Logo size={30} />
			<p class="muted">Seu clube. Sua carreira. Seu futebol.</p>
			<nav aria-label="Rodapé">
				<a href="/novidades">Novidades</a>
				<a href={COMMUNITY.newIssue} rel="noopener" target="_blank">Suporte</a>
				<a href={REPOSITORY} rel="noopener" target="_blank">GitHub</a>
			</nav>
		</div>
	</footer>
</div>

<dialog bind:this={dialog} class="viewer" aria-label={viewing?.caption ?? 'Imagem'} onclose={() => (viewing = null)} onclick={(e) => e.target === dialog && dialog?.close()}>
	{#if viewing}
		<figure>
			<img src="/landing/{viewing.image}.webp" alt={viewing.caption} width="1200" height="750" />
			<figcaption>{viewing.caption}</figcaption>
		</figure>
		<button type="button" class="close" onclick={() => dialog?.close()} aria-label="Fechar">×</button>
	{/if}
</dialog>

<style>
	.site {
		--mint: #6ee7a8;
		--mint-ink: #052e1b;
		--ink: #eef5f1;
		--ink-2: #b4c3bc;
		--ink-3: #8a9a93;
		--line: rgb(238 245 241 / 0.12);
		--bg: #0b1311;
		--bg-2: #0f1a17;
		min-height: 100vh;
		background: var(--bg);
		color: var(--ink);
		font-family: var(--font-ui);
		overflow-x: clip;
	}
	.wrap { width: min(1180px, 100% - 32px); margin-inline: auto; }
	.display { font-family: var(--font-display); font-weight: 800; text-transform: uppercase; letter-spacing: -0.01em; line-height: 0.92; margin: 0; }
	.muted { color: var(--ink-2); line-height: 1.6; }

	/* cabeçalho */
	.top { position: sticky; top: 0; z-index: 20; background: rgb(11 19 17 / 0.86); backdrop-filter: blur(14px); border-bottom: 1px solid var(--line); }
	.bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--line); }
	.brand { color: inherit; text-decoration: none; }
	.actions { display: flex; align-items: center; gap: 18px; }
	.tabs { display: flex; gap: clamp(18px, 6vw, 56px); overflow-x: auto; scrollbar-width: none; }
	.tabs a { padding: 14px 0 12px; color: var(--ink-2); text-decoration: none; font-weight: 600; white-space: nowrap; border-bottom: 2px solid transparent; }
	.tabs a:hover { color: var(--ink); }
	@media (max-width: 420px) { .tabs { justify-content: space-between; gap: 10px; } .tabs a { font-size: 0.92rem; } }
	.tabs a.on { color: var(--mint); border-color: var(--mint); }

	/* botões */
	.btn { display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 52px; padding: 0 24px; border-radius: 8px; font-weight: 800; font-size: 1.05rem; text-decoration: none; transition: transform 0.15s, background 0.15s, border-color 0.15s; }
	.btn:hover { transform: translateY(-1px); }
	.btn:focus-visible, .tabs a:focus-visible, .gallery button:focus-visible { outline: 3px solid var(--mint); outline-offset: 3px; }
	.btn.sm { min-height: 42px; padding: 0 16px; font-size: 0.95rem; }
	.primary { background: var(--mint); color: var(--mint-ink); }
	.primary:hover { background: #8ef0bd; }
	.ghost { border: 1px solid rgb(238 245 241 / 0.28); color: var(--ink); }
	.ghost:hover { border-color: var(--mint); }
	.win { width: 18px; height: 18px; fill: currentColor; flex: none; }
	.ctas { display: flex; flex-wrap: wrap; gap: 14px; }

	/* herói */
	.hero { position: relative; isolation: isolate; padding-top: clamp(48px, 7vw, 88px); background: radial-gradient(120% 80% at 70% 15%, #173a2b 0%, transparent 60%), linear-gradient(180deg, #0c1714 0%, #0d1d17 70%, var(--bg) 100%); border-bottom: 1px solid var(--line); }
	.stadium { position: absolute; inset: 0; z-index: -1; overflow: hidden; }
	.light { position: absolute; top: 6%; width: 46vw; height: 10px; border-radius: 99px; background: #e9fff4; filter: blur(14px); opacity: 0.35; }
	.l1 { right: -8vw; transform: rotate(-14deg); }
	.l2 { right: 6vw; top: 18%; width: 30vw; opacity: 0.22; transform: rotate(-10deg); }
	.l3 { right: 22vw; top: 2%; width: 18vw; opacity: 0.18; }
	.pitch { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: 48%; opacity: 0.9; }
	.grass { fill: rgb(27 77 52 / 0.45); }
	.lines { fill: none; stroke: rgb(238 245 241 / 0.14); stroke-width: 2; vector-effect: non-scaling-stroke; }
	.hero-grid { display: grid; grid-template-columns: minmax(0, 1fr); align-items: center; gap: 40px; padding-bottom: clamp(40px, 6vw, 72px); }
	.hero-body { display: grid; gap: 24px; min-width: 0; }
	.hero-shot { display: none; margin: 0; border-radius: 16px; overflow: hidden; border: 1px solid rgb(110 231 168 / 0.25); box-shadow: 0 40px 90px -30px #000, 0 0 0 8px rgb(110 231 168 / 0.04); transform: perspective(1400px) rotateY(-9deg) rotateX(3deg); }
	.hero-shot img { display: block; width: 100%; height: auto; }
	@media (min-width: 1100px) {
		.hero-grid { grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); }
		.hero-shot { display: block; }
	}
	.eyebrow { display: flex; align-items: center; gap: 14px; margin: 0; color: var(--mint); font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase; font-size: clamp(0.78rem, 2.4vw, 0.95rem); }
	.eyebrow span { width: 40px; height: 3px; background: var(--mint); flex: none; }
	h1 { font-size: clamp(3.3rem, min(11vw, 12vh), 6.6rem); text-shadow: 0 6px 40px rgb(0 0 0 / 0.5); }
	h1 em { font-style: normal; color: var(--mint); }
	.lead { max-width: 640px; margin: 0; font-size: clamp(1.05rem, 2.6vw, 1.3rem); line-height: 1.6; color: #d7e3dd; }
	.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 0; color: var(--ink-2); }
	.meta i { width: 5px; height: 5px; border-radius: 50%; background: #e8b86a; }
	.facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 8px; padding: 0; list-style: none; border-top: 1px solid var(--line); }
	.facts li { display: grid; gap: 6px; padding: 26px 18px 30px; border-left: 1px solid var(--line); min-width: 0; }
	.facts li:first-child { border-left: 0; padding-left: 0; }
	.facts strong { font-family: var(--font-display); font-weight: 800; text-transform: uppercase; font-size: clamp(1.35rem, 3.6vw, 2rem); line-height: 1; }
	.facts span { color: var(--ink-2); font-size: 0.95rem; }

	/* blocos */
	section[id] { scroll-margin-top: 120px; }
	.block { padding-block: clamp(64px, 9vw, 110px); }
	.kicker { margin: 0 0 14px; color: var(--mint); font-weight: 800; letter-spacing: 0.2em; text-transform: uppercase; font-size: 0.9rem; }
	h2 { font-size: clamp(2.6rem, 7vw, 4.6rem); }
	.feature { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: clamp(28px, 5vw, 64px); align-items: center; padding-top: clamp(40px, 6vw, 72px); margin-top: clamp(40px, 6vw, 72px); border-top: 1px solid var(--line); }
	.feature.flip .copy { order: 2; }
	.copy { display: grid; gap: 14px; align-content: start; }
	h3 { font-size: clamp(2rem, 5vw, 3rem); }
	.feature-lead { margin: 0; font-weight: 800; font-size: clamp(1.15rem, 2.6vw, 1.45rem); line-height: 1.4; }
	.copy .muted { margin: 0; font-size: 1.05rem; }
	.more { color: var(--mint); font-weight: 800; text-decoration: none; justify-self: start; }
	.more:hover { text-decoration: underline; }
	.shot { margin: 0; border: 1px solid var(--line); border-radius: 14px; overflow: hidden; background: #060b0a; box-shadow: 0 30px 70px -30px #000; }
	.shot img, .gallery img { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; object-fit: cover; object-position: top; }
	.shot figcaption { display: flex; justify-content: space-between; gap: 12px; padding: 16px 20px; background: var(--bg-2); border-top: 1px solid var(--line); }
	.shot small { color: var(--ink-3); }

	.band { background: linear-gradient(120deg, #0f241c, #0b1311 70%); border-block: 1px solid var(--line); }
	.save { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 32px; align-items: center; padding-block: clamp(56px, 8vw, 96px); }
	.save h2 { font-size: clamp(2.2rem, 5.5vw, 3.6rem); margin-bottom: 16px; }
	.states { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
	.states li { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-radius: 999px; background: #0d1816; border: 1px solid #2b5146; font-weight: 600; }
	.states i { width: 9px; height: 9px; border-radius: 50%; }
	.states .warn { background: #f5c451; }
	.states .ok { background: #46df93; }

	.gallery { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin: 36px 0 0; padding: 0; list-style: none; }
	.gallery button { display: grid; width: 100%; padding: 0; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--bg-2); color: var(--ink); cursor: zoom-in; text-align: left; font: inherit; transition: border-color 0.15s, transform 0.15s; }
	.gallery button:hover { border-color: var(--mint); transform: translateY(-2px); }
	.gallery span { padding: 12px 14px; font-weight: 600; }

	.news { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin: 36px 0 0; padding: 0; list-style: none; }
	.news li { padding: 22px; border-radius: 12px; background: var(--bg-2); border: 1px solid var(--line); }
	.news strong { font-size: 1.1rem; }
	.news p { margin: 8px 0 0; }
	.versions { display: grid; gap: 0; margin: 28px 0 20px; padding: 0; list-style: none; border-top: 1px solid var(--line); }
	.versions li { display: grid; grid-template-columns: 70px minmax(0, 1fr) auto; gap: 14px; padding: 14px 0; border-bottom: 1px solid var(--line); }
	.versions b { color: var(--mint); }
	.versions time { color: var(--ink-3); }

	.download .muted { margin: 18px 0 32px; font-size: 1.1rem; }

	.foot { border-top: 1px solid var(--line); padding-block: 48px 64px; }
	.foot .wrap { display: grid; gap: 18px; }
	.foot p { margin: 0; }
	.foot nav { display: flex; flex-wrap: wrap; gap: 14px 28px; }
	.foot nav a { color: var(--ink-2); text-decoration: none; font-weight: 600; }
	.foot nav a:hover { color: var(--ink); }

	.viewer { width: min(1200px, 96vw); max-width: none; padding: 0; border: 1px solid var(--line); border-radius: 14px; background: #060b0a; color: var(--ink); }
	.viewer::backdrop { background: rgb(0 0 0 / 0.75); backdrop-filter: blur(4px); }
	.viewer figure { margin: 0; }
	.viewer img { display: block; width: 100%; height: auto; }
	.viewer figcaption { padding: 14px 18px; }
	.close { position: absolute; top: 10px; right: 10px; width: 40px; height: 40px; border-radius: 50%; border: 0; background: rgb(0 0 0 / 0.6); color: #fff; font-size: 1.6rem; line-height: 1; cursor: pointer; }

	@media (max-width: 900px) {
		.feature, .save { grid-template-columns: minmax(0, 1fr); }
		.feature.flip .copy { order: 0; }
		.gallery { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.news { grid-template-columns: minmax(0, 1fr); }
	}
	@media (max-width: 560px) {
		.actions { gap: 12px; }
		.facts { grid-template-columns: minmax(0, 1fr); }
		.facts li, .facts li:first-child { border-left: 0; border-top: 1px solid var(--line); padding: 18px 0; }
		.facts li:first-child { border-top: 0; }
		.gallery { grid-template-columns: minmax(0, 1fr); }
		.versions li { grid-template-columns: 56px minmax(0, 1fr); }
		.versions time { grid-column: 2; }
		.ctas .btn { flex: 1 1 100%; }
		.shot figcaption { flex-direction: column; gap: 2px; }
	}
	@media (prefers-reduced-motion: reduce) { .btn, .gallery button { transition: none; } .btn:hover, .gallery button:hover { transform: none; } }
</style>
