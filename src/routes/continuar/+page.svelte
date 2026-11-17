<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { api } from '#lib/api.ts';
	import { DEFAULT_APPEARANCE } from '#lib/domain/appearance.ts';
	import { MODE_LABELS, type Career } from '#lib/domain/career.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { formatShort } from '#lib/domain/dates.ts';
	import { enter } from '#lib/motion/actions.ts';
	import { coachKit, playerKit } from '#lib/pixel/kits.ts';
	import { notify, setIslandContext } from '#lib/stores/island.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Crest from '#lib/ui/Crest.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Modal from '#lib/ui/Modal.svelte';
	import Pixel from '#lib/ui/Pixel.svelte';
	import ScreenHeader from '#lib/ui/ScreenHeader.svelte';

	let { data } = $props();
	let toDelete = $state<Career | null>(null);
	let confirmOpen = $state(false);
	let deleting = $state(false);

	$effect(() => setIslandContext('Carreiras salvas'));

	function askDelete(c: Career) {
		toDelete = c;
		confirmOpen = true;
	}

	async function remove() {
		if (!toDelete) return;
		deleting = true;
		try {
			await api(`/api/careers/${toDelete.id}`, { method: 'DELETE' });
			notify({ icon: 'trash', tone: 'info', title: 'Carreira excluída', detail: toDelete.personName });
			confirmOpen = false;
			await invalidate('app:careers');
		} catch (e) {
			notify({ icon: 'alert', tone: 'error', title: e instanceof Error ? e.message : 'Falha ao excluir' });
		} finally {
			deleting = false;
		}
	}
</script>

<svelte:head><title>Continuar · BRASFC</title></svelte:head>

<div class="page">
	<ScreenHeader title="Suas carreiras" eyebrow="{data.careers.length} salva(s) neste perfil">
		{#snippet actions()}<Button variant="primary" icon="plus" href="/nova-carreira">Nova carreira</Button>{/snippet}
	</ScreenHeader>

	{#if data.careers.length === 0}
		<div class="empty" data-umx-enter>
			<p class="muted">Você ainda não tem carreiras neste perfil.</p>
			<Button variant="primary" size="lg" icon="plus" href="/nova-carreira">Começar agora</Button>
		</div>
	{:else}
		<div class="grid">
			{#each data.careers as c, i (c.id)}
				{@const club = getClub(c.clubId)}
				<article class="card" style="--c:{club?.colors.primary}" use:enter={{ index: i }}>
					<a class="main" href="/carreira/{c.id}" data-umx-hover>
						<div class="art">
							<Pixel variant="full" appearance={c.data.appearance ?? DEFAULT_APPEARANCE} kit={c.mode === 'coach' ? coachKit(c.clubId) : playerKit(c.clubId, c.data.position ?? 'ATA')} size={150} ball={c.mode === 'player'} />
						</div>
						<div class="info">
							<span class="eyebrow">{MODE_LABELS[c.mode]}</span>
							<strong>{c.personName}</strong>
							<span class="club"><Crest clubId={c.clubId} size={24} /> {club?.name}</span>
							<span class="muted date"><Icon name="calendar" size={14} /> {formatShort(c.gameDate)} {c.season}</span>
							{#if c.unreadMessages}<span class="unread">{c.unreadMessages} mensagem(ns) nova(s)</span>{/if}
						</div>
					</a>
					<button class="del" onclick={() => askDelete(c)} aria-label="Excluir carreira de {c.personName}" title="Excluir"><Icon name="trash" size={18} /></button>
				</article>
			{/each}
		</div>
	{/if}
</div>

<Modal bind:open={confirmOpen} title="Excluir carreira?" size="sm" description={toDelete ? `${toDelete.personName} · ${getClub(toDelete.clubId)?.name}` : ''}>
	<p class="muted">A carreira e todas as suas mensagens serão apagadas do servidor. Isso não pode ser desfeito.</p>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (confirmOpen = false)}>Cancelar</Button>
		<Button variant="danger" icon="trash" loading={deleting} onclick={remove}>Excluir definitivamente</Button>
	{/snippet}
</Modal>

<style>
	.page {
		max-width: 1240px;
		margin: 0 auto;
		padding: 60px clamp(16px, 3vw, 40px) var(--sp-8);
	}
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-4);
		padding: var(--sp-8);
		border-radius: var(--radius-xl);
		border: 1px dashed var(--line-strong);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
		gap: var(--sp-4);
	}
	.card {
		position: relative;
		border-radius: var(--radius-xl);
		border: 1px solid var(--line);
		background:
			radial-gradient(90% 90% at 0% 100%, color-mix(in srgb, var(--c) 28%, transparent), transparent 65%),
			var(--surface);
		overflow: hidden;
		transition: border-color 0.15s;
	}
	.card:hover {
		border-color: var(--line-strong);
	}
	.main {
		display: flex;
		align-items: flex-end;
		gap: var(--sp-4);
		padding: var(--sp-5) var(--sp-5) 0;
	}
	.art :global(svg) {
		height: 150px;
		width: auto;
	}
	.info {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding-bottom: var(--sp-5);
		min-width: 0;
	}
	.info strong {
		font-family: var(--font-display);
		font-size: var(--fs-2xl);
		text-transform: uppercase;
		line-height: 1;
	}
	.club {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		font-weight: 600;
		font-size: var(--fs-sm);
	}
	.date {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: var(--fs-xs);
	}
	.unread {
		align-self: flex-start;
		margin-top: 4px;
		padding: 2px 8px;
		border-radius: 10px;
		background: var(--emerald-soft);
		color: var(--emerald-strong);
		font-size: var(--fs-xs);
		font-weight: 700;
	}
	.del {
		position: absolute;
		top: var(--sp-3);
		right: var(--sp-3);
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 10px;
		border: 0;
		background: rgb(16 20 24 / 0.6);
		color: var(--text-3);
	}
	.del:hover {
		color: var(--danger);
		background: var(--danger-soft);
	}
</style>
