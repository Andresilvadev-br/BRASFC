<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { api } from '#lib/api.ts';
	import { motion, setMotionProfile, type MotionPreference, type MotionProfileId } from '#lib/motion/motion.svelte.ts';
	import { notify, setIslandContext } from '#lib/stores/island.svelte.ts';
	import { prefs, savePrefs, type IntroMode, type TextScale } from '#lib/stores/prefs.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import type { IconName } from '#lib/ui/icons.ts';
	import Panel from '#lib/ui/Panel.svelte';
	import ScreenHeader from '#lib/ui/ScreenHeader.svelte';

	let { data } = $props();
	let name = $state(untrack(() => data.profile?.displayName ?? ''));
	let savingName = $state(false);
	let nameError = $state<string | null>(null);

	$effect(() => setIslandContext('Configurações'));

	type Opt<T> = { value: T; label: string; hint: string; icon: IconName };
	const MOTION: Opt<MotionPreference>[] = [
		{ value: 'auto', label: 'Automático', hint: 'Segue a preferência do sistema', icon: 'sparkle' },
		{ value: 'completo', label: 'Completo', hint: 'Transições e efeitos cinematográficos', icon: 'play' },
		{ value: 'leve', label: 'Leve', hint: 'Menos efeitos, ideal para computadores modestos', icon: 'refresh' },
		{ value: 'reduzido', label: 'Reduzido', hint: 'Sem deslocamentos nem efeitos', icon: 'eye' }
	];
	const PROFILES: Array<Opt<MotionProfileId> & { level: number }> = [
		{ value: 'ultra', label: 'Ultra', hint: 'Partículas, brilho e luz', icon: 'sparkle', level: 3 },
		{ value: 'balanced', label: 'Equilibrado', hint: 'Menos efeitos decorativos', icon: 'chart', level: 2 },
		{ value: 'performance', label: 'Desempenho', hint: 'PCs modestos: só o essencial', icon: 'training', level: 1 }
	];
	const INTRO: Opt<IntroMode>[] = [
		{ value: 'sessao', label: 'Uma vez por sessão', hint: 'Ao abrir o navegador', icon: 'clock' },
		{ value: 'sempre', label: 'Sempre', hint: 'Toda vez que entrar', icon: 'play' },
		{ value: 'nunca', label: 'Nunca', hint: 'Direto para o menu', icon: 'arrowRight' }
	];
	const SIZES: TextScale[] = [100, 112, 125];

	async function setProfile(p: MotionProfileId) {
		savePrefs({ motionProfile: p });
		await setMotionProfile(p);
	}

	async function saveName(e: SubmitEvent) {
		e.preventDefault();
		nameError = null;
		savingName = true;
		try {
			if (!data.profile) await api('/api/session', { method: 'POST' });
			await api('/api/session', { method: 'PATCH', body: { displayName: name } });
			await invalidateAll();
			notify({ icon: 'user', tone: 'success', title: 'Nome do perfil salvo', detail: name });
		} catch (err) {
			nameError = err instanceof Error ? err.message : 'Falha ao salvar.';
		} finally {
			savingName = false;
		}
	}
</script>

<svelte:head><title>Configurações · BRASFC</title></svelte:head>

<div class="page">
	<ScreenHeader title="Configurações" eyebrow="Valem imediatamente neste dispositivo" />

	<div class="grid">
		<Panel title="Animações" icon="sparkle" index={0}>
			<div class="opts three" role="radiogroup" aria-label="Animações">
				{#each MOTION as o (o.value)}
					<button type="button" role="radio" aria-checked={prefs.motion === o.value} class="opt" onclick={() => savePrefs({ motion: o.value })}>
						<span class="oi"><Icon name={o.icon} size={22} /></span>
						<strong>{o.label}</strong>
						<small>{o.hint}</small>
					</button>
				{/each}
			</div>
			<p class="state muted">Agora: <strong>{motion.reduced ? 'movimento reduzido' : 'movimento completo'}</strong>{#if motion.ready} · Ultra Motion X {motion.version}{/if}</p>
		</Panel>

		<Panel title="Desempenho visual" icon="chart" index={1}>
			<div class="opts three" role="radiogroup" aria-label="Perfil de desempenho">
				{#each PROFILES as o (o.value)}
					<button type="button" role="radio" aria-checked={prefs.motionProfile === o.value} class="opt" onclick={() => setProfile(o.value)}>
						<span class="gauge" aria-hidden="true">{#each [1, 2, 3] as l (l)}<span class:on={l <= o.level}></span>{/each}</span>
						<strong>{o.label}</strong>
						<small>{o.hint}</small>
					</button>
				{/each}
			</div>
		</Panel>

		<Panel title="Tamanho do texto" icon="eye" index={2}>
			<div class="opts three" role="radiogroup" aria-label="Tamanho do texto">
				{#each SIZES as s (s)}
					<button type="button" role="radio" aria-checked={prefs.textScale === s} class="opt size" onclick={() => savePrefs({ textScale: s })}>
						<span class="aa" style="font-size:{(s / 100) * 34}px">Aa</span>
						<small>{s === 100 ? 'Padrão' : s === 112 ? 'Maior' : 'Grande'}</small>
					</button>
				{/each}
			</div>
		</Panel>

		<Panel title="Abertura" icon="play" index={3}>
			<div class="opts three" role="radiogroup" aria-label="Quando mostrar a abertura">
				{#each INTRO as o (o.value)}
					<button type="button" role="radio" aria-checked={prefs.intro === o.value} class="opt" onclick={() => savePrefs({ intro: o.value })}>
						<span class="oi"><Icon name={o.icon} size={22} /></span>
						<strong>{o.label}</strong>
						<small>{o.hint}</small>
					</button>
				{/each}
			</div>
		</Panel>

		<Panel title="Perfil" icon="user" index={4} class="wide">
			<form onsubmit={saveName}>
				<label>
					<span>Nome exibido no multiplayer</span>
					<input bind:value={name} maxlength="32" minlength="2" required />
				</label>
				<Button type="submit" variant="primary" icon="save" loading={savingName}>Salvar nome</Button>
			</form>
			{#if nameError}<small class="err" role="alert">{nameError}</small>{/if}
			<p class="muted small">
				Seu perfil de convidado fica neste navegador (cookie seguro). Contas com login e recuperação entre dispositivos chegam em uma próxima etapa.
			</p>
		</Panel>
	</div>
</div>

<style>
	.page {
		max-width: 1100px;
		margin: 0 auto;
		padding: 60px clamp(16px, 3vw, 40px) var(--sp-8);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--sp-4);
	}
	.grid > :global(.wide) {
		grid-column: 1 / -1;
	}
	.opts {
		display: grid;
		gap: var(--sp-2);
	}
	.opts.three {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.opt {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		padding: var(--sp-3);
		border-radius: var(--radius-m);
		border: 1px solid var(--line);
		background: var(--surface-2);
		text-align: left;
		transition: border-color 0.15s, background 0.15s;
	}
	.opt:hover {
		border-color: var(--line-strong);
	}
	.opt[aria-checked='true'] {
		border-color: var(--emerald);
		background: linear-gradient(160deg, rgb(16 185 129 / 0.14), var(--surface-2));
	}
	.oi {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 12px;
		background: var(--surface-3);
		color: var(--emerald-strong);
		margin-bottom: 4px;
	}
	.opt strong {
		font-size: var(--fs-sm);
	}
	.opt small {
		font-size: var(--fs-xs);
		color: var(--text-3);
	}
	.gauge {
		display: flex;
		align-items: flex-end;
		gap: 3px;
		height: 40px;
		margin-bottom: 4px;
	}
	.gauge span {
		width: 9px;
		border-radius: 3px;
		background: var(--surface-3);
	}
	.gauge span:nth-child(1) {
		height: 14px;
	}
	.gauge span:nth-child(2) {
		height: 24px;
	}
	.gauge span:nth-child(3) {
		height: 34px;
	}
	.gauge span.on {
		background: var(--emerald);
	}
	.size {
		align-items: center;
		text-align: center;
	}
	.aa {
		font-family: var(--font-display);
		font-weight: 700;
		line-height: 48px;
		height: 48px;
	}
	.state {
		margin-top: var(--sp-3);
		font-size: var(--fs-sm);
	}
	form {
		display: flex;
		align-items: flex-end;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		font-size: var(--fs-sm);
		font-weight: 600;
		flex: 1;
		min-width: 240px;
	}
	input {
		height: 44px;
		padding: 0 var(--sp-4);
		border-radius: var(--radius-m);
		border: 1px solid var(--line-strong);
		background: var(--surface-sunken);
	}
	input:focus {
		outline: none;
		border-color: var(--emerald);
		box-shadow: 0 0 0 3px var(--emerald-soft);
	}
	.err {
		color: var(--danger);
		font-size: var(--fs-sm);
	}
	.small {
		margin-top: var(--sp-3);
		font-size: var(--fs-sm);
	}
	@media (max-width: 860px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
