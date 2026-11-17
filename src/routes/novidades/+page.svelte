<script lang="ts">
	import { updated } from '$app/state';
	import { RELEASES } from '#lib/changelog.ts';
	import { notify, setIslandContext } from '#lib/stores/island.svelte.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Panel from '#lib/ui/Panel.svelte';
	import ScreenHeader from '#lib/ui/ScreenHeader.svelte';

	let { data } = $props();
	let checking = $state(false);

	$effect(() => setIslandContext('Novidades'));

	async function check() {
		checking = true;
		try {
			const has = await updated.check();
			notify(has ? { icon: 'sparkle', tone: 'gold', title: 'Há uma versão nova!' } : { icon: 'check', tone: 'success', title: 'Você está na versão mais recente' });
		} catch {
			notify({ icon: 'alert', tone: 'error', title: 'Não foi possível verificar agora' });
		} finally {
			checking = false;
		}
	}
</script>

<svelte:head><title>Novidades · BRASFC</title></svelte:head>

<div class="page">
	<ScreenHeader title="Novidades" eyebrow="Versão atual {data.build.version}">
		{#snippet actions()}<Button variant="secondary" icon="refresh" loading={checking} onclick={check}>Verificar atualização</Button>{/snippet}
	</ScreenHeader>

	<div class="build" data-umx-enter>
		<span><Icon name="info" size={16} /> Versão <strong>{data.build.version}</strong></span>
		<span>Commit <code>{data.build.commit}</code></span>
		<span>Ambiente <strong>{data.build.environment}</strong></span>
	</div>

	{#each RELEASES as r, i (r.version)}
		<Panel tone={i === 0 ? 'highlight' : 'default'} index={i}>
			<div class="rel">
				<div class="rh">
					<Badge tone="gold">v{r.version}</Badge>
					<h2>{r.title}</h2>
					<span class="muted">{new Date(`${r.date}T12:00:00Z`).toLocaleDateString('pt-BR')}</span>
				</div>
				<div class="cols">
					<div>
						<h3><Icon name="check" size={18} /> Funcionando nesta versão</h3>
						<ul>{#each r.added as a (a)}<li>{a}</li>{/each}</ul>
					</div>
					<div>
						<h3 class="soon"><Icon name="clock" size={18} /> Próximas etapas</h3>
						<ul class="next">{#each r.next as n (n)}<li>{n}</li>{/each}</ul>
					</div>
				</div>
			</div>
		</Panel>
	{/each}
</div>

<style>
	.page {
		max-width: 1100px;
		margin: 0 auto;
		padding: 60px clamp(16px, 3vw, 40px) var(--sp-8);
	}
	.build {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-5);
		margin-bottom: var(--sp-4);
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.build span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	code {
		padding: 2px 6px;
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--text);
	}
	.rh {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		flex-wrap: wrap;
		margin-bottom: var(--sp-4);
	}
	.rh h2 {
		font-size: var(--fs-2xl);
		text-transform: uppercase;
	}
	.cols {
		display: grid;
		grid-template-columns: 1.3fr 1fr;
		gap: var(--sp-6);
	}
	h3 {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		font-size: var(--fs-lg);
		text-transform: uppercase;
		color: var(--emerald-strong);
		margin-bottom: var(--sp-2);
	}
	h3.soon {
		color: var(--text-3);
	}
	ul {
		margin: 0;
		padding-left: var(--sp-5);
		display: grid;
		gap: 6px;
	}
	.next {
		color: var(--text-2);
	}
	@media (max-width: 760px) {
		.cols {
			grid-template-columns: 1fr;
		}
	}
</style>
