<script lang="ts">
	import { onMount } from 'svelte';
	import { RELEASES, type Release } from '#lib/changelog.ts';
	import { reveal } from '#lib/motion/actions.ts';
	import { setIslandContext } from '#lib/stores/island.svelte.ts';
	import { applyUpdate, checkForUpdate, CURRENT, installApp, updates } from '#lib/stores/updates.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import ScreenHeader from '#lib/ui/ScreenHeader.svelte';
	import DesktopDownload from '#lib/ui/desktop/DesktopDownload.svelte';
	import { desktop, nativeUpdate, nativeUpdateAction } from '#lib/stores/desktop.svelte.ts';

	let { data } = $props();
	let blocked = $state<string[]>([]);
	let applyError = $state('');
	let nativeError = $state('');
	async function restart() {
		if (!(await nativeUpdateAction('install'))) nativeError = 'Conclua os salvamentos e tente reiniciar novamente.';
	}
	let open = $state<string | null>(RELEASES[0]?.version ?? null);

	$effect(() => setIslandContext('Atualizações'));
	onMount(() => void checkForUpdate());

	const STATUS: Record<string, { label: string; tone: string; icon: 'check' | 'sparkle' | 'refresh' | 'alert' | 'globe' }> = {
		idle: { label: 'Ainda não verificado', tone: 'muted', icon: 'refresh' },
		verificando: { label: 'Verificando…', tone: 'muted', icon: 'refresh' },
		atualizado: { label: 'Você está na versão mais recente', tone: 'ok', icon: 'check' },
		disponivel: { label: 'Nova versão disponível', tone: 'gold', icon: 'sparkle' },
		aplicando: { label: 'Aplicando a atualização…', tone: 'gold', icon: 'refresh' },
		offline: { label: 'Sem conexão com o servidor', tone: 'bad', icon: 'globe' },
		erro: { label: 'Não foi possível verificar', tone: 'bad', icon: 'alert' }
	};
	const st = $derived(STATUS[updates.status]);
	const next = $derived<Release | null>(updates.status === 'disponivel' ? (updates.remote?.releases[0] ?? null) : null);
	const history = $derived.by(() => {
		const map = new Map<string, Release>();
		for (const r of [...(updates.remote?.releases ?? []), ...RELEASES]) if (!map.has(r.version)) map.set(r.version, r);
		return [...map.values()];
	});

	async function update() {
		applyError = '';
		blocked = [];
		const r = await applyUpdate();
		if (!r.ok && 'blocked' in r) blocked = r.blocked;
		else if (!r.ok) applyError = r.error;
	}
	const fmtDate = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('pt-BR');
</script>

<svelte:head><title>Central de atualizações · BRASFC</title></svelte:head>

<div class="page">
	<ScreenHeader title="Atualizações" eyebrow="Central de atualizações" />

	<div class="desk"><DesktopDownload /></div>

	<section class="now">
		<article class="glass current" data-umx-surface use:reveal>
			<span class="eyebrow-gold">Versão em uso</span>
			<strong class="ver display">{CURRENT.version}</strong>
			<dl>
				<div><dt>Build</dt><dd><code>{CURRENT.commit}</code></dd></div>
				<div><dt>Gerada em</dt><dd>{fmtDate(CURRENT.builtAt)}</dd></div>
				<div><dt>Ambiente</dt><dd>{data.build.environment}</dd></div>
				<div><dt>Canal</dt><dd>{updates.remote?.channel ?? '—'}</dd></div>
			</dl>
		</article>

		<article class="glass status" data-tone={st.tone} use:reveal={{ index: 1 }} aria-live="polite">
			<div class="pill"><Icon name={st.icon} size={18} /> {st.label}</div>
			{#if updates.message && updates.status !== 'atualizado'}<p class="muted">{updates.message}</p>{/if}
			{#if updates.checkedAt}<p class="muted small">Última verificação: {new Date(updates.checkedAt).toLocaleTimeString('pt-BR')}{updates.remote ? ` · servidor na ${updates.remote.version} (${updates.remote.commit})` : ''}</p>{/if}
			{#if updates.otherTab}<p class="note"><Icon name="info" size={16} /> A atualização foi aplicada em outra aba. Salve o que estiver fazendo e recarregue esta.</p>{/if}
			<div class="row">
				<Button variant="secondary" icon="refresh" loading={updates.status === 'verificando'} onclick={() => checkForUpdate()}>Verificar novamente</Button>
				{#if updates.status === 'disponivel' || updates.status === 'aplicando'}<Button variant="gold" icon="sparkle" loading={updates.status === 'aplicando'} onclick={update}>Atualizar agora</Button>{/if}
			</div>
			{#if blocked.length}
				<div class="blocked" role="alert">
					<strong>Há alterações não salvas:</strong>
					<ul>{#each blocked as b (b)}<li>{b}</li>{/each}</ul>
					<p class="small">Salve antes de atualizar. Nada é aplicado enquanto houver algo pendente.</p>
					<Button size="sm" variant="danger" onclick={() => applyUpdate({ force: true })}>Atualizar mesmo assim</Button>
				</div>
			{/if}
			{#if applyError}<p class="bad" role="alert">{applyError}</p>{/if}
		</article>

		<article class="glass install" use:reveal={{ index: 2 }}>
			<span class="eyebrow-gold">Aplicativo</span>
			{#if desktop.active}
				<p>Aplicativo Windows {desktop.version} · modo {desktop.mode === 'online' ? 'online' : 'offline'}</p>
				{#if nativeUpdate.value}
					{@const update = nativeUpdate.value}
					<label><input type="checkbox" checked={update.automatic} onchange={(e) => nativeUpdateAction('auto', e.currentTarget.checked)} /> Baixar automaticamente</label>
					<p role="status">{({ checking: 'Verificando versão', current: 'Em dia', available: 'Atualização disponível', downloading: 'Baixando', ready: 'Pronta para instalar', installing: 'Reiniciando', error: 'Falha na atualização' } as Record<string, string>)[update.status] ?? 'Pronto para verificar'} {update.version ?? ''}</p>
					{#if update.status === 'downloading'}<progress max="100" value={update.progress} aria-label="Download do instalador"></progress> {Math.floor(update.progress)}%{/if}
					{#if update.error || nativeError}<p role="alert">{update.error ?? nativeError}</p>{/if}
					<div class="row">
						{#if update.status === 'ready'}<Button onclick={restart}>Reiniciar e atualizar</Button>
						{:else if update.status === 'available' || (update.status === 'error' && update.version)}<Button onclick={() => nativeUpdateAction('download')}>Baixar atualização</Button>
						{:else if !['checking', 'downloading', 'installing'].includes(update.status)}<Button onclick={() => nativeUpdateAction('check', true)}>Verificar aplicativo</Button>{/if}
					</div>
				{/if}
			{:else if updates.installed}
				<p><Icon name="check" size={16} /> O BRASFC está instalado como aplicativo neste computador. As atualizações chegam por aqui.</p>
			{:else if updates.installable}
				<p>Instale o BRASFC para abrir em janela própria, com ícone na área de trabalho e no menu Iniciar.</p>
				<Button variant="primary" icon="plus" onclick={() => installApp()}>Instalar o BRASFC</Button>
			{:else}
				<p class="muted">Para instalar, use o botão de instalar na barra de endereço do Edge/Chrome (ícone de computador) ou o menu do navegador → “Instalar BRASFC”.</p>
			{/if}
		</article>
	</section>

	{#if next}
		<section class="next glass gold" use:reveal>
			<div class="spread">
				<div>
					<span class="eyebrow-gold">Disponível · {fmtDate(next.date)}</span>
					<h2 class="display">v{next.version} — {next.title}</h2>
				</div>
				{#if updates.required}<span class="chip warn">Atualização necessária para continuar jogando online</span>{/if}
			</div>
			{#if next.highlights?.length}
				<div class="grid-auto" style="--min:220px;--gap:10px">
					{#each next.highlights as h, i (h.title)}
						<div class="hl" use:reveal={{ index: i }}><span class="ic"><Icon name={h.icon ?? 'sparkle'} size={22} /></span><strong>{h.title}</strong><p class="muted">{h.text}</p></div>
					{/each}
				</div>
			{/if}
			<div class="cols">
				<div><h3>Novidades</h3><ul>{#each next.added as a (a)}<li>{a}</li>{/each}</ul></div>
				{#if next.improved?.length}<div><h3>Melhorias</h3><ul>{#each next.improved as a (a)}<li>{a}</li>{/each}</ul></div>{/if}
				{#if next.fixed?.length}<div><h3>Correções</h3><ul>{#each next.fixed as a (a)}<li>{a}</li>{/each}</ul></div>{/if}
			</div>
			{#if next.compat}<p class="compat"><Icon name="info" size={16} /> Banco: {next.compat.database} · Saves: {next.compat.saves}{next.compat.notes ? ` · ${next.compat.notes}` : ''}</p>{/if}
		</section>
	{/if}

	<h2 class="display section">Histórico de versões</h2>
	<ol class="timeline">
		{#each history as r, i (r.version)}
			<li class="glass" class:current={r.version === CURRENT.version} use:reveal={{ index: i }}>
				<button class="head" aria-expanded={open === r.version} onclick={() => (open = open === r.version ? null : r.version)}>
					<span class="v">v{r.version}</span>
					<span class="t">{r.title}</span>
					<span class="d muted">{fmtDate(r.date)}</span>
					{#if r.version === CURRENT.version}<span class="chip on">em uso</span>{/if}
					<Icon name="chevronDown" size={18} />
				</button>
				{#if open === r.version}
					<div class="body">
						<div class="cols">
							<div><h3>Funcionando nesta versão</h3><ul>{#each r.added as a (a)}<li>{a}</li>{/each}</ul></div>
							{#if r.improved?.length}<div><h3>Melhorias</h3><ul>{#each r.improved as a (a)}<li>{a}</li>{/each}</ul></div>{/if}
							{#if r.fixed?.length}<div><h3>Correções</h3><ul>{#each r.fixed as a (a)}<li>{a}</li>{/each}</ul></div>{/if}
							{#if r.next.length}<div><h3>Próximas etapas</h3><ul class="soon">{#each r.next as a (a)}<li>{a}</li>{/each}</ul></div>{/if}
						</div>
						{#if r.compat}<p class="compat"><Icon name="info" size={16} /> Banco: {r.compat.database} · Saves: {r.compat.saves}</p>{/if}
					</div>
				{/if}
			</li>
		{/each}
	</ol>
</div>

<style>
	.desk {
		margin-bottom: var(--sp-5);
	}
	.page {
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--sp-6) clamp(16px, 3vw, 40px) var(--sp-8);
	}
	.now {
		display: grid;
		grid-template-columns: 1fr 1.4fr 1fr;
		gap: var(--sp-4);
		margin-top: var(--sp-4);
	}
	.current,
	.status,
	.install {
		padding: var(--sp-5);
		display: grid;
		gap: var(--sp-3);
		align-content: start;
	}
	.ver {
		font-size: 3.4rem;
		line-height: 1;
	}
	dl {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin: 0;
	}
	dt {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--text-3);
		font-weight: 700;
	}
	dd {
		margin: 0;
		font-size: var(--fs-sm);
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		width: fit-content;
		padding: 8px 14px;
		border-radius: var(--radius-pill);
		font-weight: 700;
		background: rgb(231 237 240 / 0.06);
	}
	.status[data-tone='ok'] .pill {
		background: var(--emerald-soft);
		color: var(--emerald-strong);
	}
	.status[data-tone='gold'] .pill {
		background: var(--gold-soft);
		color: var(--gold);
	}
	.status[data-tone='bad'] .pill {
		background: var(--danger-soft);
		color: var(--danger);
	}
	.small {
		font-size: var(--fs-xs);
	}
	.note {
		display: flex;
		gap: 6px;
		align-items: center;
		color: var(--info);
	}
	.blocked {
		padding: var(--sp-3);
		border-radius: var(--radius-m);
		background: var(--warning-soft);
	}
	.blocked ul {
		margin: 6px 0;
	}
	.bad {
		color: var(--danger);
	}
	.next {
		margin-top: var(--sp-5);
		padding: var(--sp-6);
		display: grid;
		gap: var(--sp-4);
	}
	.next h2 {
		margin: 4px 0 0;
		font-size: var(--fs-2xl);
	}
	.warn {
		color: var(--warning);
		border-color: rgb(251 191 36 / 0.3);
	}
	.hl {
		display: grid;
		gap: 6px;
		padding: var(--sp-4);
		border-radius: var(--radius-m);
		background: rgb(10 13 16 / 0.4);
	}
	.hl p {
		margin: 0;
		font-size: var(--fs-sm);
	}
	.ic {
		width: 40px;
		height: 40px;
		border-radius: 12px;
		display: grid;
		place-items: center;
		background: var(--emerald-soft);
		color: var(--emerald-strong);
	}
	.cols {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: var(--sp-4);
	}
	h3 {
		margin: 0 0 6px;
		font-size: var(--fs-xs);
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--text-3);
	}
	ul {
		margin: 0;
		padding-left: 18px;
		display: grid;
		gap: 4px;
		font-size: var(--fs-sm);
	}
	.soon {
		color: var(--text-2);
	}
	.compat {
		display: flex;
		gap: 6px;
		align-items: center;
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.section {
		margin: var(--sp-6) 0 var(--sp-3);
		font-size: var(--fs-2xl);
	}
	.timeline {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
	}
	.timeline li.current {
		box-shadow: 0 0 0 1px var(--emerald-line);
	}
	.head {
		width: 100%;
		display: grid;
		grid-template-columns: 70px 1fr auto auto auto;
		gap: var(--sp-3);
		align-items: center;
		padding: var(--sp-4);
		background: none;
		border: 0;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.v {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: var(--fs-lg);
		color: var(--gold);
	}
	.t {
		font-weight: 700;
	}
	.body {
		padding: 0 var(--sp-4) var(--sp-4);
		display: grid;
		gap: var(--sp-3);
	}
	@media (max-width: 1000px) {
		.now {
			grid-template-columns: 1fr;
		}
		.head {
			grid-template-columns: 60px 1fr auto;
		}
		.head .d {
			display: none;
		}
	}
</style>
