<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { api } from '#lib/api.ts';
	import { processCrest, toBase64 } from '#lib/crests/process.ts';
	import { notify } from '#lib/stores/island.svelte.ts';
	import Button from '../Button.svelte';
	import Icon from '../Icon.svelte';

	/**
	 * Importação de escudos de uma pasta que o jogador já tem (Brasfoot Next, Megapatch ou pasta solta).
	 * Tudo acontece neste computador: as imagens são lidas, padronizadas e gravadas na pasta de dados do jogo.
	 */
	type Coverage = { native: { covered: number; total: number }; world: { covered: number; total: number } };
	type Group = { club: string; candidates: Array<{ path: string; source: string }> };

	let coverage = $state<Coverage | null>(null);
	let busy = $state(false);
	let progress = $state({ done: 0, total: 0 });
	let report = $state<{ scanned: number; matched: number; saved: number; unreadable: number; rejected: number } | null>(null);
	let input = $state<HTMLInputElement>();

	onMount(() => {
		void api<{ coverage: Coverage }>('/api/crests').then((r) => (coverage = r.coverage)).catch(() => {});
	});

	const pct = (c: { covered: number; total: number }) => (c.total ? Math.round((c.covered / c.total) * 100) : 0);
	const BATCH = 24;

	async function choose(event: Event) {
		const files = [...((event.currentTarget as HTMLInputElement).files ?? [])];
		(event.currentTarget as HTMLInputElement).value = '';
		if (!files.length || busy) return;
		busy = true;
		report = null;
		try {
			const byPath = new Map(files.map((f) => [f.webkitRelativePath || f.name, f]));
			const { groups, scanned } = await api<{ groups: Group[]; scanned: number }>('/api/crests', { body: { action: 'match', paths: [...byPath.keys()] } });
			progress = { done: 0, total: groups.length };
			let saved = 0, unreadable = 0, rejected = 0, batch: Array<{ club: string; source: string; data: string }> = [];
			const flush = async () => {
				if (!batch.length) return;
				const r = await api<{ saved: number; rejected: number; coverage: Coverage }>('/api/crests', { body: { action: 'save', items: batch } });
				saved += r.saved;
				rejected += r.rejected;
				coverage = r.coverage;
				batch = [];
			};
			for (const group of groups) {
				// Entre as fontes disponíveis, fica a de maior arte visível (melhor resolução); empate segue a ordem do servidor.
				let best: { data: Uint8Array; area: number; source: string } | null = null;
				for (const candidate of group.candidates) {
					const file = byPath.get(candidate.path);
					const out = file ? await processCrest(file) : null;
					if (!out) continue;
					const area = out.box.w * out.box.h;
					if (!best || area > best.area) best = { data: out.data, area, source: candidate.source };
				}
				if (best) batch.push({ club: group.club, source: best.source, data: toBase64(best.data) });
				else unreadable++;
				progress = { done: progress.done + 1, total: groups.length };
				if (batch.length >= BATCH) await flush();
			}
			await flush();
			report = { scanned, matched: groups.length, saved, unreadable, rejected };
			await invalidate('app:crests');
			notify({ icon: 'check', tone: 'success', title: 'Escudos importados', detail: `${saved} clubes com escudo padronizado.` });
		} catch (e) {
			notify({ icon: 'alert', tone: 'error', title: 'Importação interrompida', detail: e instanceof Error ? e.message : 'Tente novamente.' });
		} finally {
			busy = false;
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
	<p class="muted small lead">
		Escolha a pasta do <b>Brasfoot Next</b> (banco <code>database</code>), do <b>Megapatch</b> ou uma pasta com imagens nomeadas pelo clube.
		Os escudos são padronizados aqui mesmo, sem internet, e ficam só neste computador. Clubes sem imagem continuam com o escudo gerado pelas cores.
	</p>

	{#if coverage}
		<dl class="cover">
			<div><dt>Clubes brasileiros</dt><dd><b>{coverage.native.covered}</b> / {coverage.native.total}</dd><span class="bar"><i style="width:{pct(coverage.native)}%"></i></span></div>
			<div><dt>Internacionais</dt><dd><b>{coverage.world.covered}</b> / {coverage.world.total || '—'}</dd><span class="bar"><i style="width:{pct(coverage.world)}%"></i></span></div>
		</dl>
	{/if}

	<div class="row">
		<input bind:this={input} type="file" class="hidden" webkitdirectory multiple accept="image/*" onchange={choose} aria-label="Pasta de escudos" />
		<Button variant="primary" icon="download" loading={busy} disabled={busy} onclick={() => input?.click()}>Importar pasta de escudos</Button>
		{#if coverage && (coverage.native.covered || coverage.world.covered)}
			<Button variant="ghost" icon="trash" disabled={busy} onclick={clear}>Remover escudos importados</Button>
		{/if}
	</div>

	{#if busy && progress.total}
		<div class="progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label="Padronizando escudos">
			<span class="bar"><i style="width:{(progress.done / progress.total) * 100}%"></i></span>
			<small>{progress.done} de {progress.total} clubes</small>
		</div>
	{/if}

	{#if report}
		<p class="result small" role="status">
			<Icon name="check" size={14} /> {report.scanned} arquivos lidos · {report.matched} clubes reconhecidos · <b>{report.saved} escudos salvos</b>
			{#if report.unreadable} · {report.unreadable} sem imagem utilizável{/if}{#if report.rejected} · {report.rejected} recusados{/if}
		</p>
	{/if}
</div>

<style>
	.importer { display: grid; gap: var(--sp-3); }
	.lead { margin: 0; }
	code { font-size: 0.92em; }
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
