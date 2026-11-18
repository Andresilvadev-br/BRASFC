<script lang="ts">
	import { RELEASES } from '#lib/changelog.ts';
	import { animate } from '#lib/motion/motion.svelte.ts';
	import { CURRENT, markWhatsNewSeen } from '#lib/stores/updates.svelte.ts';
	import Button from '../Button.svelte';
	import Icon from '../Icon.svelte';
	import Logo from '../Logo.svelte';

	/** "O que há de novo": aparece uma vez depois de uma atualização importante; pode ser dispensada. */
	let { open = $bindable(false) }: { open?: boolean } = $props();
	const rel = RELEASES.find((r) => r.version === CURRENT.version) ?? RELEASES[0];
	const cards = $derived(rel.highlights?.length ? rel.highlights : rel.added.slice(0, 6).map((t) => ({ title: t, text: '', icon: 'sparkle' as const })));
	let idx = $state(0);
	let deck = $state<HTMLElement | null>(null);

	async function go(n: number) {
		const dir = n > idx ? 1 : -1;
		await animate(deck, { opacity: 0, x: -30 * dir, scale: 0.98 }, { spring: 'critical' });
		idx = n;
		void animate(deck, { opacity: 1, x: 0, scale: 1 }, { spring: 'capsule', from: { opacity: 0, x: 30 * dir, scale: 0.98 } });
	}
	function close() {
		markWhatsNewSeen();
		open = false;
	}
	function key(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
		if (e.key === 'ArrowRight' && idx < cards.length - 1) void go(idx + 1);
		if (e.key === 'ArrowLeft' && idx > 0) void go(idx - 1);
	}
</script>

{#if open}
	<div class="wn" role="dialog" aria-modal="true" aria-label="O que há de novo na versão {rel.version}" tabindex="-1" onkeydown={key}>
		<div class="panel glass gold">
			<header>
				<Logo size={30} />
				<div>
					<span class="eyebrow-gold">Atualizado para a versão {rel.version}</span>
					<h2 class="display">{rel.title}</h2>
				</div>
				<button class="x" onclick={close} aria-label="Fechar"><Icon name="x" /></button>
			</header>
			<div class="deck" bind:this={deck}>
				{#if cards[idx]}
					{@const card = cards[idx]}
					<div class="card">
						<span class="ic"><Icon name={card.icon ?? 'sparkle'} size={30} /></span>
						<h3>{card.title}</h3>
						{#if card.text}<p>{card.text}</p>{/if}
					</div>
				{/if}
			</div>
			<footer>
				<div class="dots">{#each cards as _, i (i)}<button class:on={i === idx} aria-label="Novidade {i + 1}" onclick={() => go(i)}></button>{/each}</div>
				{#if idx < cards.length - 1}
					<Button variant="ghost" onclick={close}>Pular</Button>
					<Button variant="primary" iconRight="chevronRight" onclick={() => go(idx + 1)}>Próxima</Button>
				{:else}
					<Button variant="primary" onclick={close}>Começar a jogar</Button>
				{/if}
			</footer>
		</div>
	</div>
{/if}

<style>
	.wn {
		position: fixed;
		inset: 0;
		z-index: 90;
		display: grid;
		place-items: center;
		padding: 16px;
		background: radial-gradient(60% 60% at 50% 40%, rgb(16 185 129 / 0.12), rgb(5 8 10 / 0.86));
		backdrop-filter: blur(6px);
	}
	.panel {
		width: min(640px, 100%);
		padding: var(--sp-6);
		display: grid;
		gap: var(--sp-5);
		background: var(--glass-hi);
	}
	header {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: var(--sp-4);
		align-items: center;
	}
	h2 {
		margin: 4px 0 0;
		font-size: var(--fs-2xl);
	}
	.x {
		background: rgb(231 237 240 / 0.06);
		border: 0;
		color: var(--text);
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		cursor: pointer;
	}
	.deck {
		min-height: 190px;
	}
	.card {
		display: grid;
		gap: var(--sp-3);
		justify-items: center;
		text-align: center;
		padding: var(--sp-5);
		border-radius: var(--radius-l);
		background: radial-gradient(80% 100% at 50% 0%, rgb(232 184 106 / 0.12), transparent 70%), rgb(10 13 16 / 0.4);
	}
	.ic {
		width: 64px;
		height: 64px;
		border-radius: 20px;
		display: grid;
		place-items: center;
		background: var(--emerald-soft);
		color: var(--emerald-strong);
	}
	h3 {
		margin: 0;
		font-size: var(--fs-xl);
	}
	.card p {
		margin: 0;
		color: var(--text-2);
		max-width: 46ch;
	}
	footer {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		justify-content: flex-end;
	}
	.dots {
		display: flex;
		gap: 6px;
		margin-right: auto;
	}
	.dots button {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		border: 0;
		background: rgb(231 237 240 / 0.2);
		cursor: pointer;
		padding: 0;
	}
	.dots button.on {
		width: 22px;
		border-radius: 8px;
		background: var(--emerald);
	}
</style>
