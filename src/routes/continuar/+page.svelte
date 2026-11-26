<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { api, ApiError, connectionIssue } from '#lib/api.ts';
	import { DEFAULT_APPEARANCE } from '#lib/domain/appearance.ts';
	import { MODE_LABELS, type Career } from '#lib/domain/career.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { formatShort } from '#lib/domain/dates.ts';
	import { latestValidSave, SAVE_SORTS, saveCompetition, saveIssue, savedAgo, saveTitle, sortSaves, type SaveSort } from '#lib/domain/saves.ts';
	import { enter, indicator } from '#lib/motion/actions.ts';
	import { coachKit } from '#lib/pixel/kits.ts';
	import { notify, setIslandContext } from '#lib/stores/island.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Crest from '#lib/ui/Crest.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Modal from '#lib/ui/Modal.svelte';
	import Pixel from '#lib/ui/Pixel.svelte';
	import ScreenHeader from '#lib/ui/ScreenHeader.svelte';

	let { data } = $props();
	const MAX = 12;
	const PAGE = 6;

	let sort = $state<SaveSort>('recentes');
	let shown = $state(PAGE);
	let selectedId = $state<string | null>(null);
	let opening = $state<string | null>(null);

	let target = $state<Career | null>(null);
	let deleteOpen = $state(false);
	let understood = $state(false);
	let deleting = $state(false);
	let deleteError = $state('');

	let renameOpen = $state(false);
	let renameValue = $state('');
	let renaming = $state(false);
	let renameError = $state('');

	$effect(() => setIslandContext('Biblioteca de carreiras'));

	const latest = $derived(latestValidSave(data.careers));
	const sorted = $derived(sortSaves(data.careers, sort));
	const visible = $derived(sorted.slice(0, shown));
	const invalidCount = $derived(data.careers.filter((c) => saveIssue(c)).length);
	const latestClub = $derived(latest ? getClub(latest.clubId) : undefined);

	const kit = (c: Career) => coachKit(c.clubId);
	const failure = (e: unknown, fallback: string) =>
		connectionIssue(e) ? 'O jogo local não respondeu. Nada foi alterado; tente de novo.' : e instanceof Error ? e.message : fallback;

	function toggle(id: string) {
		selectedId = selectedId === id ? null : id;
	}

	async function open(c: Career) {
		if (saveIssue(c) || opening) return;
		opening = c.id;
		try {
			await goto(`/carreira/${c.id}`);
		} finally {
			opening = null;
		}
	}

	function askDelete(c: Career) {
		target = c;
		understood = false;
		deleteError = '';
		deleteOpen = true;
	}

	async function remove() {
		if (!target || !understood || deleting) return;
		deleting = true;
		deleteError = '';
		const removed = target;
		try {
			await api(`/api/careers/${removed.id}`, { method: 'DELETE' });
			deleteOpen = false;
			if (selectedId === removed.id) selectedId = null;
			notify({ icon: 'trash', tone: 'info', title: 'Carreira excluída', detail: saveTitle(removed) });
			await invalidate('app:careers');
		} catch (e) {
			if (e instanceof ApiError && e.status === 404) {
				deleteOpen = false;
				notify({ icon: 'info', tone: 'info', title: 'Esta carreira já tinha sido excluída' });
				await invalidate('app:careers');
			} else deleteError = failure(e, 'Não foi possível excluir a carreira.');
		} finally {
			deleting = false;
		}
	}

	function askRename(c: Career) {
		target = c;
		renameValue = c.label ?? '';
		renameError = '';
		renameOpen = true;
	}

	async function rename(event: SubmitEvent) {
		event.preventDefault();
		if (!target || renaming) return;
		renaming = true;
		renameError = '';
		try {
			await api(`/api/careers/${target.id}`, { method: 'PATCH', body: { action: 'rename', label: renameValue } });
			renameOpen = false;
			await invalidate('app:careers');
		} catch (e) {
			renameError = failure(e, 'Não foi possível renomear.');
		} finally {
			renaming = false;
		}
	}
</script>

<svelte:head><title>Carreiras · BRASFC</title></svelte:head>

<div class="page">
	<ScreenHeader title="Carregar carreira" eyebrow="Biblioteca de saves · {data.careers.length} de {MAX}" back="/menu">
		{#snippet actions()}<Button variant="primary" icon="plus" href="/nova-carreira" disabled={data.careers.length >= MAX}>Nova carreira</Button>{/snippet}
	</ScreenHeader>

	{#if page.url.searchParams.get('legado')}
		<p class="legacy" role="status"><Icon name="info" size={16} /> A carreira de jogador foi descontinuada na versão 0.12. Seu save continua guardado aqui como legado e só sai da biblioteca se você excluir.</p>
	{/if}

	{#if data.careers.length === 0}
		<section class="empty" use:enter>
			<span class="empty-art" aria-hidden="true"><Icon name="trophy" size={40} /></span>
			<h2 class="display">Nenhuma carreira salva</h2>
			<p class="muted">Crie uma carreira de treinador. Cada uma fica salva separada das outras.</p>
			<Button variant="primary" size="lg" icon="plus" href="/nova-carreira">Começar uma carreira</Button>
		</section>
	{:else}
		{#if latest}
			<section class="continue" style:--club={latestClub?.colors.primary ?? 'var(--emerald-deep)'} use:enter>
				<span class="stripes" aria-hidden="true"></span>
				<div class="continue-art"><Pixel variant="full" appearance={latest.data.appearance ?? DEFAULT_APPEARANCE} kit={kit(latest)} clubId={latest.clubId} styled size={140} /></div>
				<div class="continue-copy">
					<p class="eyebrow">Continuar · {MODE_LABELS[latest.mode]}</p>
					<h2 class="display">{saveTitle(latest)}</h2>
					<p class="muted">{latest.personName} · {latestClub?.name} · {formatShort(latest.gameDate)} de {latest.season}{saveCompetition(latest) ? ` · ${saveCompetition(latest)}` : ''}</p>
					<div class="continue-actions">
						<Button variant="primary" size="lg" iconRight="arrowRight" loading={opening === latest.id} onclick={() => open(latest)}>Continuar carreira</Button>
						<span class="saved"><Icon name="clock" size={14} />Última atividade {savedAgo(latest.updatedAt)}</span>
					</div>
				</div>
				<div class="continue-crest"><Crest clubId={latest.clubId} size={96} /></div>
			</section>
		{/if}

		<div class="toolbar">
			<h2 class="section-title">Carreiras individuais</h2>
			<div class="sorts" role="radiogroup" aria-label="Organizar carreiras">
				<span class="sort-line" use:indicator={{ axis: 'x', key: sort }}></span>
				{#each SAVE_SORTS as option (option.value)}
					<button type="button" role="radio" aria-checked={sort === option.value} data-active={sort === option.value || undefined} onclick={() => { sort = option.value; shown = PAGE; }} data-umx-press>{option.label}</button>
				{/each}
			</div>
		</div>
		{#if invalidCount}<p class="warn" role="status"><Icon name="alert" size={16} />{invalidCount === 1 ? 'Uma carreira não é compatível' : `${invalidCount} carreiras não são compatíveis`} com esta versão. Elas continuam guardadas e podem ser excluídas.</p>{/if}

		<div class="grid">
			{#each visible as c, i (c.id)}
				{@const club = getClub(c.clubId)}
				{@const issue = saveIssue(c)}
				{@const selected = selectedId === c.id}
				{@const competition = saveCompetition(c)}
				<article class="save" class:selected class:invalid={!!issue} style:--c={club?.colors.primary ?? 'var(--surface-3)'} use:enter={{ index: i }}>
					<button type="button" class="save-main" aria-expanded={selected} aria-controls="detalhes-{c.id}" onclick={() => toggle(c.id)} data-umx-press>
						<span class="art">
							<Pixel variant="full" appearance={c.data.appearance ?? DEFAULT_APPEARANCE} kit={kit(c)} clubId={club ? c.clubId : undefined} styled size={112} />
						</span>
						<span class="info">
							<span class="tags">
								<span class="mode"><Icon name={c.mode === 'coach' ? 'whistle' : 'shirt'} size={13} />{c.mode === 'coach' ? 'Treinador' : 'Legado'}</span>
								{#if latest?.id === c.id}<span class="recent">Mais recente</span>{/if}
								{#if issue}<span class="bad">Save incompatível</span>{/if}
							</span>
							<strong>{saveTitle(c)}</strong>
							<span class="club">{#if club}<Crest clubId={c.clubId} size={22} />{:else}<span class="crest-fallback" aria-hidden="true">?</span>{/if}{club?.name ?? 'Clube indisponível'}</span>
							<span class="meta">{c.personName}</span>
							<span class="meta"><Icon name="calendar" size={13} />{formatShort(c.gameDate)} · Temporada {c.season}{competition ? ` · ${competition}` : ''}</span>
						</span>
						<span class="chev" aria-hidden="true"><Icon name="chevronDown" size={18} /></span>
					</button>
					{#if selected}
						<div class="details" id="detalhes-{c.id}" use:enter={{ y: 6 }}>
							{#if issue}<p class="issue"><Icon name="alert" size={15} />{issue}</p>{/if}
							<dl>
								<div><dt>Modalidade</dt><dd>{MODE_LABELS[c.mode] ?? c.mode}</dd></div>
								<div><dt>Competição</dt><dd>{competition ?? 'Não informada'}</dd></div>
								<div><dt>Última atividade</dt><dd>{new Date(c.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</dd></div>
								<div><dt>Criada em</dt><dd>{new Date(c.createdAt).toLocaleDateString('pt-BR')}</dd></div>
								{#if c.unreadMessages}<div><dt>Mensagens</dt><dd>{c.unreadMessages} não lida(s)</dd></div>{/if}
							</dl>
						</div>
					{/if}
					<footer class="save-actions">
						<Button size="sm" variant="primary" iconRight="arrowRight" disabled={!!issue} loading={opening === c.id} onclick={() => open(c)}>Carregar</Button>
						<Button size="sm" variant="ghost" icon="settings" onclick={() => askRename(c)}>Renomear</Button>
						<Button size="sm" variant="ghost" icon="trash" onclick={() => askDelete(c)} aria-label="Excluir {saveTitle(c)}">Excluir</Button>
					</footer>
				</article>
			{/each}
		</div>
		{#if shown < sorted.length}
			<div class="more"><Button variant="secondary" onclick={() => (shown += PAGE)}>Mostrar mais {Math.min(PAGE, sorted.length - shown)} de {sorted.length - shown}</Button></div>
		{/if}
	{/if}

</div>

<Modal bind:open={deleteOpen} title="Excluir carreira?" size="sm">
	{#if target}
		<div class="target"><Crest clubId={target.clubId} size={40} /><div><strong>{saveTitle(target)}</strong><small>{MODE_LABELS[target.mode] ?? target.mode} · {target.personName} · {formatShort(target.gameDate)} de {target.season}</small></div></div>
		<p>Serão apagados <strong>somente desta carreira</strong>: o progresso, as partidas, as mensagens, o histórico de temporadas, as transferências e as finanças.</p>
		<p class="muted small">Suas outras carreiras não são afetadas. A exclusão é permanente e não pode ser desfeita.</p>
		<label class="confirm"><input type="checkbox" bind:checked={understood} /> Entendo que esta exclusão é permanente</label>
		{#if deleteError}<p class="error" role="alert">{deleteError}</p>{/if}
	{/if}
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (deleteOpen = false)}>Cancelar</Button>
		<Button variant="danger" icon="trash" disabled={!understood} loading={deleting} onclick={remove}>Excluir definitivamente</Button>
	{/snippet}
</Modal>

<Modal bind:open={renameOpen} title="Renomear carreira" size="sm" description="O nome aparece só na biblioteca. O progresso e o identificador do save não mudam.">
	<form id="renomear" onsubmit={rename}>
		<label class="field">Nome do save
			<input bind:value={renameValue} maxlength={40} placeholder={target ? `${getClub(target.clubId)?.name ?? 'Carreira'} · ${target.season}` : ''} autocomplete="off" />
		</label>
		<small class="muted">Deixe em branco para usar o nome padrão. Até 40 caracteres.</small>
		{#if renameError}<p class="error" role="alert">{renameError}</p>{/if}
	</form>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (renameOpen = false)}>Cancelar</Button>
		<Button type="submit" form="renomear" variant="primary" loading={renaming}>Salvar nome</Button>
	{/snippet}
</Modal>

<style>
	.legacy { display: flex; gap: 8px; align-items: center; margin: 0; padding: 10px 14px; border-radius: 12px; background: rgb(59 130 246 / 0.12); }
	.page { max-width: 1240px; margin: 0 auto; padding: 60px clamp(16px, 3vw, 40px) var(--sp-8); }
	.empty { display: grid; justify-items: center; gap: var(--sp-3); padding: var(--sp-8) var(--sp-5); text-align: center; border-radius: var(--radius-xl); border: 1px dashed var(--line-strong);
		background: radial-gradient(60% 80% at 50% 0, var(--emerald-soft), transparent); }
	.empty-art { display: grid; place-items: center; width: 76px; height: 76px; border-radius: 50%; background: var(--gold-soft); color: var(--gold); }
	.empty h2 { font-size: var(--fs-2xl); }
	.empty p { max-width: 460px; }

	.continue { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: clamp(12px, 3vw, 28px);
		padding: clamp(16px, 3vw, 28px); margin-bottom: 28px; border-radius: var(--radius-xl); border: 1px solid var(--line-strong); overflow: hidden; isolation: isolate;
		background: radial-gradient(110% 140% at 100% 100%, color-mix(in srgb, var(--club) 50%, transparent), transparent 60%), linear-gradient(160deg, #182127, var(--bg-deep)); box-shadow: var(--shadow-2); }
	.stripes { position: absolute; inset: 0; z-index: -1; background: repeating-linear-gradient(115deg, transparent 0 46px, rgb(255 255 255 / .025) 46px 92px); mask-image: linear-gradient(90deg, transparent 30%, #000); pointer-events: none; }
	.continue-art :global(svg) { height: 140px; width: auto; filter: drop-shadow(0 12px 16px rgb(0 0 0 / .45)); }
	.continue .eyebrow { color: var(--emerald-strong); }
	.continue h2 { margin: 4px 0 6px; font-size: clamp(1.9rem, 4.4vw, 3.2rem); overflow-wrap: anywhere; }
	.continue-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 16px; }
	.saved { display: inline-flex; align-items: center; gap: 6px; color: var(--text-3); font-size: var(--fs-xs); }
	.continue-crest { opacity: .95; filter: drop-shadow(0 10px 20px rgb(0 0 0 / .5)); }

	.toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px 16px; margin-bottom: 12px; }
	.toolbar .section-title { flex: 1 1 220px; margin: 0; }
	.sorts { position: relative; display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px; border-radius: 999px; background: var(--surface-sunken); border: 1px solid var(--line); }
	.sort-line { position: absolute; top: 3px; bottom: 3px; left: 0; border-radius: 999px; background: var(--emerald-soft); pointer-events: none; }
	.sorts button { position: relative; min-height: 34px; padding: 4px 14px; border: 0; border-radius: 999px; background: transparent; color: var(--text-2); font-size: var(--fs-xs); font-weight: 700; }
	.sorts button[aria-checked='true'] { color: var(--emerald-strong); }
	.warn { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; padding: 10px 12px; border-radius: 10px; background: var(--warning-soft); color: var(--warning); font-size: var(--fs-sm); }

	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); gap: 12px; align-items: start; }
	.save { position: relative; display: grid; min-width: 0; border-radius: var(--radius-l); border: 1px solid var(--line); overflow: hidden; isolation: isolate;
		background: radial-gradient(90% 100% at 0 100%, color-mix(in srgb, var(--c) 30%, transparent), transparent 62%), var(--card-bg);
		transition: border-color var(--dur-2) var(--ease-out), box-shadow var(--dur-2) var(--ease-out); }
	.save::before { content: ''; position: absolute; inset: 0 0 auto; height: 3px; background: linear-gradient(90deg, var(--c), transparent); }
	.save:hover { border-color: var(--line-strong); }
	.save.selected { border-color: var(--emerald-line); box-shadow: 0 0 0 1px var(--emerald-line) inset, 0 16px 40px -24px rgb(16 185 129 / .7); }
	.save.invalid { border-style: dashed; }
	.save.invalid .art { filter: grayscale(.8); opacity: .7; }
	.save-main { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: end; gap: 14px; width: 100%; padding: 16px 16px 0; border: 0; background: transparent; color: inherit; text-align: start; }
	.art :global(svg) { height: 112px; width: auto; }
	.info { display: grid; gap: 4px; padding-bottom: 14px; min-width: 0; }
	.tags { display: flex; flex-wrap: wrap; gap: 5px; }
	.tags > span { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 99px; font-size: .6875rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
	.mode { background: rgb(231 237 240 / .07); color: var(--text-2); }
	.recent { background: var(--emerald-soft); color: var(--emerald-strong); }
	.bad { background: var(--warning-soft); color: var(--warning); }
	.info strong { font-family: var(--font-display); font-size: var(--fs-xl); text-transform: uppercase; line-height: 1.05; overflow-wrap: anywhere; }
	.club { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: var(--fs-sm); }
	.crest-fallback { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--surface-3); color: var(--text-3); font-size: .75rem; font-weight: 800; }
	.meta { display: flex; align-items: center; gap: 5px; color: var(--text-3); font-size: var(--fs-xs); }
	.chev { align-self: start; color: var(--text-3); transition: rotate var(--dur-2) var(--ease-out); }
	.selected .chev { rotate: 180deg; color: var(--emerald-strong); }
	.details { padding: 0 16px 12px; }
	.details dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 6px; margin: 0; }
	.details dl div { padding: 7px 9px; border-radius: 9px; background: rgb(0 0 0 / .22); }
	.details dt { font-size: .6875rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--text-3); }
	.details dd { margin: 0; font-size: var(--fs-sm); font-weight: 600; }
	.issue { display: flex; align-items: center; gap: 6px; margin: 0 0 8px; color: var(--warning); font-size: var(--fs-sm); }
	.save-actions { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 12px; border-top: 1px solid var(--line); background: rgb(0 0 0 / .18); }
	.save-actions > :global(:first-child) { margin-inline-end: auto; }
	.more { display: flex; justify-content: center; margin-top: 16px; }

	.small { font-size: var(--fs-sm); }

	.target { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; padding: 10px 12px; border-radius: 12px; background: var(--surface-sunken); border: 1px solid var(--line); }
	.target div { display: grid; min-width: 0; }
	.target small { color: var(--text-3); }
	.target + p { margin-bottom: 8px; }
	.confirm { display: flex; align-items: center; gap: 10px; margin-top: 14px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--danger-soft); background: var(--danger-soft); font-weight: 600; cursor: pointer; }
	.confirm input { width: 20px; height: 20px; accent-color: var(--danger); }
	.error { margin-top: 10px; color: var(--danger); font-size: var(--fs-sm); }
	.field { display: grid; gap: 6px; font-weight: 600; }
	.field input { width: 100%; font-size: max(16px, var(--fs-md)); }
	#renomear { display: grid; gap: 6px; }

	@media (max-width: 640px) {
		.continue { grid-template-columns: auto minmax(0, 1fr); }
		.continue-crest { display: none; }
		.continue-art :global(svg) { height: 104px; }
		.art :global(svg) { height: 92px; }
		.sorts { width: 100%; }
		.sorts button { flex: 1 1 auto; padding-inline: 8px; }
	}
</style>
