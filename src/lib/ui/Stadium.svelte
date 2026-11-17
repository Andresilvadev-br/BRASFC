<script lang="ts">
	import { animate, motion } from '#lib/motion/motion.svelte.ts';

	/**
	 * Fundo cinematográfico original: estádio noturno em camadas CSS/SVG
	 * (refletores, arquibancada, gramado em perspectiva, neblina).
	 * Paralaxe leve com molas da Ultra Motion X; desligada com movimento reduzido.
	 */
	let { tint = '#10B981', parallax = true, dim = 0 }: { tint?: string; parallax?: boolean; dim?: number } = $props();

	let root: HTMLDivElement;
	let far: HTMLDivElement;
	let mid: HTMLDivElement;
	let near: HTMLDivElement;
	let frame = 0;
	let px = 0;
	let py = 0;

	function onMove(e: PointerEvent) {
		if (!parallax || motion.reduced) return;
		px = e.clientX / window.innerWidth - 0.5;
		py = e.clientY / window.innerHeight - 0.5;
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			void animate(far, { x: px * -8, y: py * -5 }, { spring: 'gentle' });
			void animate(mid, { x: px * -16, y: py * -8 }, { spring: 'gentle' });
			void animate(near, { x: px * -26, y: py * -10 }, { spring: 'gentle' });
		});
	}
</script>

<svelte:window onpointermove={onMove} />

<div class="stadium" bind:this={root} style="--tint:{tint}; --dim:{dim}" aria-hidden="true">
	<div class="sky"></div>
	<div class="layer far" bind:this={far}>
		<div class="lights">
			{#each [8, 30, 70, 92] as x, i (x)}
				<div class="rig" style="left:{x}%; --d:{i * 0.6}s">
					<div class="beam"></div>
					<div class="lamp"></div>
				</div>
			{/each}
		</div>
		<div class="stands"><div class="crowd"></div><div class="crowd c2"></div></div>
	</div>
	<div class="layer mid" bind:this={mid}>
		<div class="pitch-wrap">
			<svg class="pitch" viewBox="0 0 1000 620" preserveAspectRatio="none">
				<defs>
					<pattern id="mow" width="100" height="620" patternUnits="userSpaceOnUse">
						<rect width="50" height="620" fill="#0f3d2b" />
						<rect x="50" width="50" height="620" fill="#0c3324" />
					</pattern>
				</defs>
				<rect width="1000" height="620" fill="url(#mow)" />
				<g fill="none" stroke="#d8f3e7" stroke-opacity="0.32" stroke-width="3">
					<rect x="30" y="20" width="940" height="580" />
					<line x1="500" y1="20" x2="500" y2="600" />
					<circle cx="500" cy="310" r="80" />
					<rect x="30" y="170" width="150" height="280" />
					<rect x="820" y="170" width="150" height="280" />
					<rect x="30" y="240" width="55" height="140" />
					<rect x="915" y="240" width="55" height="140" />
				</g>
			</svg>
		</div>
	</div>
	<div class="layer near" bind:this={near}>
		<div class="haze"></div>
	</div>
	<div class="vignette"></div>
</div>

<style>
	.stadium {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background: var(--bg-deep);
		isolation: isolate;
	}
	.layer {
		position: absolute;
		inset: -30px;
		will-change: translate;
	}
	.sky {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(60% 50% at 50% 0%, color-mix(in srgb, var(--tint) 22%, transparent), transparent 70%),
			radial-gradient(90% 60% at 50% 110%, rgb(16 185 129 / 0.18), transparent 70%),
			linear-gradient(180deg, #070a0d 0%, #0d1317 45%, #0b1512 100%);
	}
	.lights {
		position: absolute;
		inset: 0 0 auto;
		height: 42%;
	}
	.rig {
		position: absolute;
		top: 2%;
		width: 120px;
		scale: 0.75;
		translate: -50% 0;
	}
	.lamp {
		width: 120px;
		height: 18px;
		border-radius: 4px;
		background:
			radial-gradient(circle at 15% 50%, #fff 0 4px, transparent 5px),
			radial-gradient(circle at 38% 50%, #fff 0 4px, transparent 5px),
			radial-gradient(circle at 62% 50%, #fff 0 4px, transparent 5px),
			radial-gradient(circle at 85% 50%, #fff 0 4px, transparent 5px),
			#1b2329;
		box-shadow:
			0 0 30px 8px rgb(220 245 235 / 0.35),
			0 0 90px 30px rgb(16 185 129 / 0.12);
	}
	.beam {
		position: absolute;
		top: 10px;
		left: 50%;
		width: 380px;
		height: 620px;
		translate: -50% 0;
		background: conic-gradient(from 180deg at 50% 0%, transparent 160deg, rgb(225 245 238 / 0.07) 175deg, rgb(225 245 238 / 0.11) 180deg, rgb(225 245 238 / 0.07) 185deg, transparent 200deg);
		filter: blur(6px);
		animation: flicker 7s ease-in-out infinite;
		animation-delay: var(--d);
	}
	@keyframes flicker {
		0%,
		100% {
			opacity: 0.85;
		}
		50% {
			opacity: 1;
		}
	}
	.stands {
		position: absolute;
		left: 0;
		right: 0;
		top: 30%;
		height: 26%;
		background: linear-gradient(180deg, #0c1115, #111a1f 60%, #0b1411);
		mask-image: linear-gradient(180deg, transparent, #000 25%, #000 85%, transparent);
	}
	.crowd {
		position: absolute;
		inset: 0;
		background-image:
			radial-gradient(circle, rgb(231 237 240 / 0.22) 1.2px, transparent 1.8px),
			radial-gradient(circle, rgb(16 185 129 / 0.28) 1.2px, transparent 1.8px),
			radial-gradient(circle, rgb(232 184 106 / 0.2) 1.1px, transparent 1.7px);
		background-size:
			11px 9px,
			17px 13px,
			23px 15px;
		background-position:
			0 0,
			5px 4px,
			9px 2px;
		opacity: 0.55;
	}
	.c2 {
		background-size:
			7px 7px,
			13px 11px,
			19px 17px;
		opacity: 0.25;
		mask-image: linear-gradient(180deg, #000, transparent);
	}
	.pitch-wrap {
		position: absolute;
		left: -10%;
		right: -10%;
		bottom: -6%;
		height: 52%;
		perspective: 700px;
		perspective-origin: 50% 0%;
	}
	.pitch {
		width: 100%;
		height: 100%;
		transform: rotateX(58deg);
		transform-origin: 50% 0%;
		filter: saturate(0.9);
	}
	.haze {
		position: absolute;
		inset: auto 0 0;
		height: 70%;
		background:
			radial-gradient(70% 60% at 50% 30%, rgb(231 237 240 / 0.07), transparent 70%),
			linear-gradient(180deg, transparent, rgb(10 13 16 / 0.6));
	}
	.vignette {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(120% 90% at 50% 40%, transparent 50%, rgb(4 6 8 / 0.85) 100%),
			rgb(8 11 14 / var(--dim));
	}
</style>
