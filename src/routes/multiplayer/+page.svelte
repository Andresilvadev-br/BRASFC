<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '#lib/api.ts';
	import { notify, setIslandContext } from '#lib/stores/island.svelte.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Panel from '#lib/ui/Panel.svelte';
	import Pixel from '#lib/ui/Pixel.svelte';
	import ScreenHeader from '#lib/ui/ScreenHeader.svelte';
	import Unavailable from '#lib/ui/Unavailable.svelte';

	let { data } = $props();

	let roomName = $state('');
	let code = $state('');
	let creating = $state(false);
	let joining = $state(false);
	let createError = $state<string | null>(null);
	let joinError = $state<string | null>(null);

	$effect(() => setIslandContext('Multiplayer'));

	async function create(e: SubmitEvent) {
		e.preventDefault();
		createError = null;
		creating = true;
		try {
			const res = await api<{ room: { code: string } }>('/api/rooms', { body: { name: roomName } });
			notify({ icon: 'multiplayer', tone: 'success', title: 'Sala criada', detail: `Código ${res.room.code}` });
			await goto(`/multiplayer/sala/${res.room.code}`, { invalidateAll: true });
		} catch (err) {
			createError = err instanceof Error ? err.message : 'Falha ao criar a sala.';
		} finally {
			creating = false;
		}
	}

	async function join(e: SubmitEvent) {
		e.preventDefault();
		joinError = null;
		const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
		if (clean.length !== 6) {
			joinError = 'O código tem 6 letras e números.';
			return;
		}
		joining = true;
		try {
			await api(`/api/rooms/${clean}`, { method: 'POST' });
			await goto(`/multiplayer/sala/${clean}`, { invalidateAll: true });
		} catch (err) {
			joinError = err instanceof Error ? err.message : 'Não foi possível entrar.';
		} finally {
			joining = false;
		}
	}

	const friends = [
		{ skin: 1, hairColor: 3, hairStyle: 'cacheado' as const, shirt: '#0E7490' },
		{ skin: 4, hairColor: 0, hairStyle: 'raspado' as const, shirt: '#B45309' },
		{ skin: 2, hairColor: 1, hairStyle: 'espetado' as const, shirt: '#10B981' }
	];
</script>

<svelte:head><title>Multiplayer · BRASFC</title></svelte:head>

<div class="page">
	<ScreenHeader title="Multiplayer" eyebrow="Beta · salas privadas" />

	<section class="hero" data-umx-enter>
		<div class="squad" aria-hidden="true">
			{#each friends as f, i (i)}
				<div class="f" style="--i:{i}"><Pixel variant="full" appearance={{ skin: f.skin, hairColor: f.hairColor, hairStyle: f.hairStyle }} kit={{ shirt: f.shirt, trim: '#E7EDF0', shorts: '#101418', socks: f.shirt }} size={150} ball={i === 2} /></div>
			{/each}
		</div>
		<div class="copy">
			<h2>Jogue com seus amigos</h2>
			<p class="muted">Crie uma sala, mande o código e vejam juntos quem está online e pronto. É o primeiro passo das carreiras compartilhadas.</p>
			<div class="works">
				<Badge tone="emerald" icon="check">Salas privadas com código</Badge>
				<Badge tone="emerald" icon="check">Presença em tempo real</Badge>
				<Badge tone="emerald" icon="check">Servidor autoritativo</Badge>
			</div>
		</div>
	</section>

	<div class="actions">
		<Panel title="Criar sala" icon="plus" index={1}>
			<form onsubmit={create}>
				<label>
					<span>Nome da sala</span>
					<input bind:value={roomName} maxlength="40" placeholder="Ex.: Liga da firma" required minlength="2" />
				</label>
				{#if createError}<small class="err" role="alert">{createError}</small>{/if}
				<Button type="submit" variant="primary" icon="plus" loading={creating} full>Criar e convidar</Button>
			</form>
		</Panel>
		<Panel title="Entrar com código" icon="link" index={2}>
			<form onsubmit={join}>
				<label>
					<span>Código de 6 caracteres</span>
					<input class="code" bind:value={code} maxlength="7" placeholder="ABC123" autocomplete="off" autocapitalize="characters" spellcheck="false" />
				</label>
				{#if joinError}<small class="err" role="alert">{joinError}</small>{/if}
				<Button type="submit" variant="secondary" icon="arrowRight" loading={joining} full>Entrar na sala</Button>
			</form>
		</Panel>
		<Panel title="Suas salas abertas" icon="multiplayer" index={3}>
			{#if data.rooms.length}
				<div class="rooms">
					{#each data.rooms as r (r.id)}
						<a href="/multiplayer/sala/{r.code}" data-umx-hover>
							<span class="rc">{r.code}</span>
							<span class="rn">{r.name}</span>
							<span class="rm"><Icon name="squad" size={14} /> {r.members}/{r.maxMembers}</span>
						</a>
					{/each}
				</div>
			{:else}
				<p class="muted small">Nenhuma sala aberta ainda.</p>
			{/if}
		</Panel>
	</div>

	<h3 class="soon-title">Chegando nas próximas etapas</h3>
	<div class="soon">
		<Unavailable title="Carreiras compartilhadas" detail="Mesmo mundo, calendário sincronizado" icon="globe" />
		<Unavailable title="Técnico e auxiliar no mesmo clube" icon="squad" />
		<Unavailable title="Treinadores de clubes diferentes" icon="trophy" />
		<Unavailable title="Convites e propostas profissionais" icon="briefcase" />
		<Unavailable title="Carreira de jogador multiplayer" icon="user" />
		<Unavailable title="Salvamento contínuo da sala" icon="save" />
	</div>
</div>

<style>
	.page {
		max-width: 1240px;
		margin: 0 auto;
		padding: 60px clamp(16px, 3vw, 40px) var(--sp-8);
	}
	.hero {
		display: flex;
		align-items: flex-end;
		gap: var(--sp-7);
		padding: var(--sp-6) var(--sp-7) 0;
		margin-bottom: var(--sp-5);
		border-radius: var(--radius-xl);
		background:
			radial-gradient(70% 120% at 20% 100%, rgb(16 185 129 / 0.2), transparent 60%),
			linear-gradient(180deg, var(--surface-2), var(--surface));
		border: 1px solid var(--line);
		overflow: hidden;
	}
	.squad {
		display: flex;
		align-items: flex-end;
	}
	.f {
		margin-left: calc(var(--i) * -26px);
	}
	.f :global(svg) {
		height: 150px;
		width: auto;
	}
	.copy {
		padding-bottom: var(--sp-6);
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}
	.copy h2 {
		font-size: var(--fs-3xl);
		text-transform: uppercase;
	}
	.copy p {
		max-width: 56ch;
	}
	.works {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}
	.actions {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--sp-4);
	}
	form {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}
	label {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		font-size: var(--fs-sm);
		font-weight: 600;
	}
	input {
		height: 46px;
		padding: 0 var(--sp-4);
		border-radius: var(--radius-m);
		border: 1px solid var(--line-strong);
		background: var(--surface-sunken);
		font-size: var(--fs-md);
	}
	input:focus {
		outline: none;
		border-color: var(--emerald);
		box-shadow: 0 0 0 3px var(--emerald-soft);
	}
	.code {
		font-family: var(--font-display);
		font-size: var(--fs-xl);
		letter-spacing: 0.3em;
		text-transform: uppercase;
	}
	.err {
		color: var(--danger);
		font-size: var(--fs-sm);
	}
	.rooms {
		display: grid;
		gap: var(--sp-2);
	}
	.rooms a {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: var(--sp-3);
		align-items: center;
		padding: var(--sp-3);
		border-radius: var(--radius-m);
		background: var(--surface-2);
	}
	.rc {
		font-family: var(--font-display);
		font-weight: 700;
		letter-spacing: 0.12em;
		color: var(--emerald-strong);
	}
	.rn {
		font-weight: 600;
		font-size: var(--fs-sm);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.rm {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.small {
		font-size: var(--fs-sm);
	}
	.soon-title {
		margin: var(--sp-7) 0 var(--sp-3);
		font-size: var(--fs-xl);
		text-transform: uppercase;
	}
	.soon {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: var(--sp-2);
	}
	@media (max-width: 1000px) {
		.actions {
			grid-template-columns: 1fr;
		}
		.squad {
			display: none;
		}
		.hero {
			padding: var(--sp-6);
		}
	}
</style>
