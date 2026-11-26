<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { api } from '#lib/api.ts';
	import { downloadOfficialCrests, expandZips, importCrestFiles, type Coverage, type ImportReport } from '#lib/crests/importer.ts';
	import { notify } from '#lib/stores/island.svelte.ts';
	import Button from '../Button.svelte';
	import Icon from '../Icon.svelte';

	/**
	 * Escudos dos clubes. "Baixar escudos" busca os pacotes oficiais do Brasfoot Next e instala tudo sozinho;
	 * "Importar pasta" aceita uma pasta que o jogador já tem (Brasfoot Next, inclusive os .zip da instalação,
	 * Megapatch ou imagens soltas). O processamento acontece neste computador e o resultado fica na pasta do jogo.
	 */
	let { compact = false, onstart, ondone }: { compact?: boolean; onstart?: () => void; ondone?: (report: ImportReport) => void } = $props();

	let coverage = $state<Coverage | null>(null);
	let catalog = $state<{ version: string; clubs: number; countries: number; players: number } | null>(null);
	let busy = $state(false);
	let stage = $state<{ label: string; done: number; total: number; bytes?: boolean } | null>(null);
	let report = $state<ImportReport | null>(null);
	let input = $state<HTMLInputElement>();

	onMount(() => {
		void api<{ coverage: Coverage; catalog: typeof catalog }>('/api/crests').then((r) => { coverage = r.coverage; catalog = r.catalog; }).catch(() => {});
	});

	const pct = (c: { covered: number; total: number }) => (c.total ? Math.round((c.covered / c.total) * 100) : 0);
	const mb = (n: number) => (n / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
	const LABELS = { baixando: 'Baixando escudos', lendo: 'Abrindo pacotes', padronizando: 'Padronizando' } as const;
	const progress = (s: keyof typeof LABELS, done: number, total: number) => (stage = { label: LABELS[s], done, total, bytes: s === 'baixando' });

	async function finish(files: Map<string, Blob>, origin: string) {
		report = await importCrestFiles(files, progress, (c) => (coverage = c));
		await invalidate('app:crests');
		notify({ icon: 'check', tone: 'success', title: 'Escudos instalados', detail: `${report.saved} clubes com escudo · ${origin}.` });
		ondone?.(report);
	}

	async function download() {
		if (busy) return;
		busy = true;
		report = null;
		onstart?.();
		try {
			const { files, version } = await downloadOfficialCrests(progress);
			await finish(files, `Brasfoot Next ${version}`);
		} catch (e) {
			notify({ icon: 'alert', tone: 'error', title: 'Download interrompido', detail: e instanceof Error ? e.message : 'Verifique a internet e tente de novo.', duration: 8000 });
		} finally {
			busy = false;
			stage = null;
		}
	}

	async function choose(event: Event) {
		const picked = [...((event.currentTarget as HTMLInputElement).files ?? [])];
		(event.currentTarget as HTMLInputElement).value = '';
		if (!picked.length || busy) return;
		busy = true;
		report = null;
		try {
			const files = await expandZips(new Map(picked.map((f) => [f.webkitRelativePath || f.name, f])), progress);
			await finish(files, 'pasta local');
		} catch (e) {
			notify({ icon: 'alert', tone: 'error', title: 'Importação interrompida', detail: e instanceof Error ? e.message : 'Tente novamente.' });
		} finally {
			busy = false;
			stage = null;
		}
	}

	async function clear() {
		busy = true;
		try {
			const r = await api<{ coverage: Coverage }>('/api/crests', { method: 'DELETE' });
			coverage = r.coverage;
			report = null;
			await invalidate('app:crests');
			notify({ icon: 'trash', tone: 'info', title: 'Escudos removidos', detail: 'Os clubes voltaram aos escudos gerados pelas cores.' });
		} finally {
			busy = false;
		}
	}
</script>

<div class="importer">
	{#if !compact}
		<p class="muted small lead">
			<b>Baixar escudos</b> busca o banco oficial do <b>Brasfoot Next</b> (cerca de 17 MB) e instala tudo sozinho. A internet só é usada nesse momento.
			Também dá para importar uma pasta que você já tenha (Brasfoot Next, Megapatch ou imagens com o nome do clube).
			Clubes sem imagem continuam com o escudo gerado pelas cores.
		</p>
	{/if}

	{#if coverage}
		<dl class="cover">
			<div><dt>Clubes brasileiros</dt><dd><b>{coverage.native.covered}</b> / {coverage.native.total}</dd><span class="bar"><i style="width:{pct(coverage.native)}%"></i></span></div>
			<div><dt>Internacionais</dt><dd><b>{coverage.world.covered}</b> / {coverage.world.total || '—'}</dd><span class="bar"><i style="width:{pct(coverage.world)}%"></i></span></div>
		</dl>
	{/if}

	<div class="row">
		<input bind:this={input} type="file" class="hidden" webkitdirectory multiple onchange={choose} aria-label="Pasta de escudos" />
		<Button variant="primary" icon="download" loading={busy} disabled={busy} onclick={download}>Baixar escudos</Button>
		{#if !compact}
			<Button variant="secondary" icon="save" disabled={busy} onclick={() => input?.click()}>Importar pasta</Button>
			{#if coverage && (coverage.native.covered || coverage.world.covered)}
				<Button variant="ghost" icon="trash" disabled={busy} onclick={clear}>Remover escudos</Button>
			{/if}
		{/if}
	</div>

	{#if busy && stage && stage.total}
		<div class="progress" role="progressbar" aria-valuemin={0} aria-valuemax={stage.total} aria-valuenow={stage.done} aria-label={stage.label}>
			<span class="bar"><i style="width:{Math.min(100, (stage.done / stage.total) * 100)}%"></i></span>
			<small>{stage.label} · {stage.bytes ? `${mb(stage.done)} de ${mb(stage.total)} MB` : `${stage.done} de ${stage.total}`}</small>
		</div>
	{/if}

	{#if catalog && !compact}
		<p class="muted small credit">
			Banco mundial instalado: {catalog.clubs.toLocaleString('pt-BR')} clubes de {catalog.countries} países e {catalog.players.toLocaleString('pt-BR')} jogadores.
			Dados do <a href="https://github.com/Brasfoot-Next/database" target="_blank" rel="noopener">Brasfoot Next</a>{catalog.version ? ` ${catalog.version}` : ''}, licença
			<a href="https://creativecommons.org/licenses/by-sa/4.0/deed.pt-br" target="_blank" rel="noopener">CC BY-SA 4.0</a>. Escudos e marcas pertencem aos respectivos clubes.
		</p>
	{/if}

	{#if report}
		<p class="result small" role="status">
			<Icon name="check" size={14} /> {report.matched} clubes reconhecidos · <b>{report.saved} escudos instalados</b>
			{#if report.unreadable} · {report.unreadable} sem imagem utilizável{/if}{#if report.rejected} · {report.rejected} recusados{/if}
		</p>
	{/if}
</div>

<style>
	.importer { display: grid; gap: var(--sp-3); }
	.lead, .credit { margin: 0; }
	.credit a { color: var(--emerald-strong); }
	.hidden { display: none; }
	.row { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
	.cover { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-3); margin: 0; }
	.cover div { display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; align-items: baseline; padding: 10px 12px; border-radius: var(--radius-m); background: var(--surface-2); border: 1px solid var(--line); }
	.cover dt { font-size: var(--fs-xs); color: var(--text-3); text-transform: uppercase; letter-spacing: 0.06em; }
	.cover dd { margin: 0; font-variant-numeric: tabular-nums; }
	.bar { grid-column: 1 / -1; display: block; height: 6px; border-radius: 99px; background: var(--surface-3); overflow: hidden; }
	.bar i { display: block; height: 100%; background: var(--emerald); transition: width 0.3s; }
	.progress { display: grid; gap: 4px; }
	.progress small { color: var(--text-3); }
	.result { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin: 0; color: var(--text-2); }
	@media (max-width: 560px) { .cover { grid-template-columns: minmax(0, 1fr); } }
	@media (prefers-reduced-motion: reduce) { .bar i { transition: none; } }
</style>
