<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { api } from '#lib/api.ts';
	import { formatShort } from '#lib/domain/dates.ts';
	import { animate } from '#lib/motion/motion.svelte.ts';
	import { notify } from '#lib/stores/island.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Panel from '#lib/ui/Panel.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';

	let { data } = $props();
	type CareerMessage = (typeof data.messages)[number];
	const c = $derived(data.career);

	let filter = $state<'todas' | 'importantes' | 'naolidas'>('todas');
	let openId = $state<string | null>(page.url.searchParams.get('m'));
	let reading: HTMLElement | undefined = $state();
	const marking = new Set<string>();

	const list = $derived(
		data.messages.filter((m) => (filter === 'importantes' ? m.kind === 'important' : filter === 'naolidas' ? !m.read : true))
	);
	const open = $derived(data.messages.find((m) => m.id === openId) ?? list[0]);
	const unread = $derived(data.messages.filter((m) => !m.read).length);

	async function markRead(message: CareerMessage) {
		const { id } = message;
		if (message.read || marking.has(id)) return;
		marking.add(id);
		try {
			await api(`/api/careers/${c.id}/messages`, { body: { action: 'read', id } });
			await invalidate('app:career');
		} catch (e) {
			notify({ icon: 'alert', tone: 'error', title: e instanceof Error ? e.message : 'Falha ao atualizar' });
		} finally {
			marking.delete(id);
		}
	}

	async function readAll() {
		try {
			await api(`/api/careers/${c.id}/messages`, { body: { action: 'read-all' } });
			await invalidate('app:career');
			notify({ icon: 'check', tone: 'success', title: 'Todas as mensagens lidas' });
		} catch (e) {
			notify({ icon: 'alert', tone: 'error', title: e instanceof Error ? e.message : 'Falha ao atualizar' });
		}
	}

	function select(message: CareerMessage) {
		openId = message.id;
		if (reading) void animate(reading, { opacity: 1, y: 0 }, { spring: 'snappy', from: { opacity: 0.3, y: 6 } });
		void markRead(message);
	}

	onMount(() => {
		if (open) void markRead(open);
	});
</script>

<svelte:head><title>Mensagens · BRASFC</title></svelte:head>

<div class="head" data-umx-enter>
	<div>
		<span class="eyebrow">{unread ? `${unread} não lida(s)` : 'Caixa em dia'}</span>
		<h1>Mensagens</h1>
	</div>
	<div class="tools">
		<Segmented
			label="Filtrar mensagens"
			bind:value={filter}
			options={[
				{ value: 'todas', label: 'Todas' },
				{ value: 'importantes', label: 'Importantes' },
				{ value: 'naolidas', label: 'Não lidas' }
			]}
		/>
		<Button variant="ghost" icon="check" disabled={!unread || data.messagesUnavailable} onclick={readAll}>Marcar todas como lidas</Button>
	</div>
</div>

<div class="layout">
	<Panel pad={false} index={0}>
		{#if data.messagesUnavailable}
			<div class="empty">
				<p>O restante da caixa de mensagens está indisponível.</p>
				<Button size="sm" onclick={() => invalidate('app:career')}>Tentar novamente</Button>
			</div>
		{/if}
		{#if list.length}
			<ul class="inbox">
				{#each list as m (m.id)}
					<li>
						<button class:active={open?.id === m.id} class:unread={!m.read} class:important={m.kind === 'important'} onclick={() => select(m)}>
							<span class="avatar" aria-hidden="true"><Icon name={m.kind === 'important' ? 'bell' : 'mail'} size={18} /></span>
							<span class="txt">
								<span class="from">{m.sender}</span>
								<span class="subj" title={m.subject}>{m.subject}</span>
							</span>
							<span class="date">{formatShort(m.gameDate)}</span>
						</button>
					</li>
				{/each}
			</ul>
		{:else if !data.messagesUnavailable}
			<p class="empty muted">Nenhuma mensagem neste filtro.</p>
		{/if}
	</Panel>

	<article class="reader" bind:this={reading} aria-live="polite">
		{#if open}
			<Panel tone={open.kind === 'important' ? 'highlight' : 'raised'} index={1}>
				<div class="meta">
					{#if open.kind === 'important'}<span class="imp"><Icon name="bell" size={14} /> Importante</span>{/if}
					<span class="muted">{open.sender} · {formatShort(open.gameDate)}</span>
				</div>
				<h2>{open.subject}</h2>
				<p class="body">{open.body}</p>
			</Panel>
		{/if}
	</article>
</div>

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: var(--sp-4);
		flex-wrap: wrap;
		margin-bottom: var(--sp-5);
	}
	h1 {
		font-size: var(--fs-3xl);
		text-transform: uppercase;
		font-weight: 800;
	}
	.tools {
		display: flex;
		gap: var(--sp-3);
		align-items: center;
		flex-wrap: wrap;
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(300px, 0.9fr) minmax(0, 1.3fr);
		gap: var(--sp-4);
		align-items: start;
	}
	.inbox {
		list-style: none;
		margin: 0;
		padding: var(--sp-2);
	}
	.inbox button {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: var(--sp-3);
		width: 100%;
		padding: var(--sp-3);
		border: 0;
		border-radius: var(--radius-m);
		background: transparent;
		text-align: left;
		position: relative;
	}
	.inbox button:hover {
		background: var(--surface-2);
	}
	.inbox button.active {
		background: var(--surface-3);
	}
	.inbox button.important::before {
		content: '';
		position: absolute;
		left: 0;
		top: 10px;
		bottom: 10px;
		width: 3px;
		border-radius: 2px;
		background: var(--gold);
	}
	.avatar {
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		border-radius: 12px;
		background: var(--surface-3);
		color: var(--text-2);
	}
	.important .avatar {
		background: var(--gold-soft);
		color: var(--gold);
	}
	.txt {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.from {
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.subj {
		font-size: var(--fs-sm);
		color: var(--text-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.unread .subj {
		color: var(--text);
		font-weight: 700;
	}
	.date {
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.empty {
		padding: var(--sp-6);
		text-align: center;
	}
	.meta {
		display: flex;
		gap: var(--sp-3);
		align-items: center;
		font-size: var(--fs-sm);
	}
	.imp {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--gold);
		font-weight: 700;
		font-size: var(--fs-xs);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.reader h2 {
		font-size: var(--fs-2xl);
		margin: var(--sp-3) 0;
	}
	.body {
		font-size: var(--fs-md);
		line-height: 1.65;
		color: var(--text-2);
		max-width: 64ch;
	}
	@media (max-width: 900px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}
</style>
