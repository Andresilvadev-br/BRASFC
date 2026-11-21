<script lang="ts">
	import { MODE_LABELS, type CareerMode } from '#lib/domain/career.ts';
	import { DEFAULT_APPEARANCE } from '#lib/domain/appearance.ts';
	import { coachKit } from '#lib/pixel/kits.ts';
	import { enter } from '#lib/motion/actions.ts';
	import Icon from '../Icon.svelte';
	import Pixel from '../Pixel.svelte';

	let { chooseMode }: { chooseMode: (mode: CareerMode) => void } = $props();
</script>

<div class="modes">
	{#each [{ id: 'coach' as const, title: 'Treinador', tagline: 'Comande o clube inteiro', items: ['Escalação e tática do time', 'Plano semanal de treinos', 'Elenco, comissão e diretoria', 'Finanças, base e olheiros'], appearance: { skin: 3, hairColor: 0, hairStyle: 'curto' as const }, kit: coachKit(), ball: false }, { id: 'player' as const, title: 'Jogador', tagline: 'Viva a carreira de um atleta', items: ['Crie seu jogador e escolha a posição', 'Treino individual e evolução', 'Lute pela titularidade', 'Contratos, empresário e imprensa'], appearance: DEFAULT_APPEARANCE, kit: { shirt: '#10B981', trim: '#E7EDF0', shorts: '#101418', socks: '#10B981' }, ball: true }] as m, i (m.id)}
		<button class="mode" onclick={() => chooseMode(m.id)} use:enter={{ index: i + 1 }} data-umx-press="0.98">
			<div class="mode-art">
				<Pixel variant="full" appearance={m.appearance} kit={m.kit} size={230} ball={m.ball} idle />
			</div>
			<div class="mode-text">
				<span class="eyebrow">{MODE_LABELS[m.id]}</span>
				<h2>{m.title}</h2>
				<p>{m.tagline}</p>
				<ul>
					{#each m.items as item (item)}
						<li>
							<Icon name="check" size={16} stroke={2.2} />{item}
						</li>
					{/each}
				</ul>
				<span class="go">Escolher <Icon name="arrowRight" size={18} /></span>
			</div>
		</button>
	{/each}
</div>

<style>
	.modes {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--sp-6);
	}
	.mode {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: end;
		gap: var(--sp-5);
		padding: var(--sp-6) var(--sp-6) 0;
		text-align: left;
		border-radius: var(--radius-xl);
		border: 1px solid var(--line-strong);
		background:
			radial-gradient(90% 80% at 0% 100%, rgb(16 185 129 / 0.16), transparent 60%),
			linear-gradient(160deg, rgb(34 44 51 / 0.92), rgb(21 27 32 / 0.95));
		box-shadow: var(--shadow-2);
		transition:
			border-color 0.2s,
			box-shadow 0.2s;
		overflow: hidden;
	}
	.mode:hover,
	.mode:focus-visible {
		border-color: var(--emerald-line);
		box-shadow:
			var(--shadow-2),
			0 0 0 1px var(--emerald-line);
	}
	.mode-art :global(svg) {
		height: min(36vh, 230px);
		width: auto;
	}
	.mode-text {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		padding-bottom: var(--sp-6);
	}
	.mode h2 {
		font-size: calc(2.75rem * var(--text-scale));
		font-weight: 800;
		text-transform: uppercase;
		line-height: 1;
	}
	.mode p {
		font-size: var(--fs-lg);
		color: var(--text-2);
	}
	.mode ul {
		list-style: none;
		margin: var(--sp-2) 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.mode li {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		font-size: var(--fs-sm);
	}
	.mode li :global(.icon) {
		color: var(--emerald-strong);
	}
	.go {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		margin-top: var(--sp-2);
		font-family: var(--font-display);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--emerald-strong);
	}
	@media (max-width: 960px) {
		.modes { grid-template-columns: minmax(0, 1fr); }
	}
	@media (max-width: 640px) {
		.mode { grid-template-columns: minmax(0, 1fr); }
		.mode-art { display: none; }
	}
</style>
