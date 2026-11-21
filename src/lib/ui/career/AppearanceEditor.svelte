<script lang="ts">
	import { APPEARANCE_FIELDS, APPEARANCE_OPTIONS, HAIR_COLORS, HAIR_STYLES, HAIR_STYLE_LABELS, SKIN_TONES, type Appearance } from '#lib/domain/appearance.ts';
	import { CLOTHING_COLORS, defaultOutfit, WARDROBE, type Outfit, type WardrobeCategory } from '#lib/domain/wardrobe.ts';
	import { enter, pop } from '#lib/motion/actions.ts';
	import type { Kit } from '#lib/pixel/sprites.ts';
	import Pixel from '../Pixel.svelte';
	import Segmented from '../Segmented.svelte';

	let { appearance = $bindable(), kit, clubId, preview = false, uniformOptions = true }: {
		appearance: Appearance; kit: Kit; clubId?: string; preview?: boolean; uniformOptions?: boolean;
	} = $props();

	let tab = $state<'rosto' | 'cabelo' | 'vestuario'>('vestuario');
	const fields = $derived((Object.keys(APPEARANCE_OPTIONS) as Array<keyof typeof APPEARANCE_OPTIONS>)
		.filter((field) => !['sleeves', 'socks', 'shirt'].includes(field) || uniformOptions));
	const outfit = $derived(appearance.wardrobe);
	const collection = $derived(outfit ? WARDROBE[outfit.category] : null);
	function choose(category: WardrobeCategory) { appearance = { ...appearance, wardrobe: defaultOutfit(category) }; }
	function setOutfit(patch: Partial<Outfit>) {
		if (!outfit) return;
		const next = { ...outfit, ...patch };
		if (next.top === 'clubeTerno') { next.bottom = 'social'; next.shoes = 'couro'; }
		else if (next.top === 'uniforme') { next.bottom = 'shorts'; next.shoes = 'chuteira'; }
		appearance = { ...appearance, wardrobe: next };
	}
</script>

<div class="editor" class:with-preview={preview}>
	{#if preview}<div class="preview"><span class="spot" aria-hidden="true"></span>{#key JSON.stringify(appearance)}<div class="figure" use:pop><Pixel {appearance} {kit} {clubId} styled variant="full" size={192} ball={false} label="Prévia do personagem" /></div>{/key}<span class="stage-label">Prévia ao vivo</span></div>{/if}
	<div class="tools">
		<Segmented label="Personalização" bind:value={tab} options={[{ value: 'vestuario', label: 'Vestuário' },
			{ value: 'cabelo', label: 'Cabelo' }, { value: 'rosto', label: 'Rosto e corpo' }]} />
		{#key tab}
			<div class="options" use:enter>
				{#if tab === 'vestuario'}
					<div class="items" aria-label="Categoria de roupa">
						{#each Object.entries(WARDROBE) as [key, category] (key)}
							<button type="button" class="item" data-umx-press aria-pressed={outfit?.category === key} onclick={() => choose(key as WardrobeCategory)}>
								<Pixel appearance={{ ...appearance, wardrobe: defaultOutfit(key as WardrobeCategory) }} {kit} {clubId} styled variant="full" size={54} ball={false} /><span>{category.label}</span></button>
						{/each}
						<button type="button" class="item" data-umx-press aria-pressed={!outfit} onclick={() => appearance = { ...appearance, wardrobe: undefined }}>
							<Pixel appearance={{ ...appearance, wardrobe: undefined }} {kit} {clubId} styled variant="full" size={54} ball={false} /><span>Padrão</span></button>
					</div>
					{#if outfit && collection}
						{#each [{ label: 'Parte de cima', key: 'top', items: collection.tops }, { label: 'Parte de baixo', key: 'bottom', items: collection.bottoms },
							{ label: 'Calçado', key: 'shoes', items: collection.shoes }] as field (field.key)}
							{@const locked = field.key !== 'top' && ['clubeTerno', 'uniforme'].includes(outfit.top)}
							<fieldset><legend>{field.label}</legend><div class="items">
								{#each Object.entries(field.items) as [key, label] (key)}
									<button type="button" class="item" data-umx-press aria-pressed={outfit[field.key as 'top' | 'bottom' | 'shoes'] === key} disabled={locked && outfit[field.key as 'bottom' | 'shoes'] !== key} onclick={() => setOutfit({ [field.key]: key })}>
										<Pixel appearance={{ ...appearance, wardrobe: { ...outfit, [field.key]: key } }} {kit} {clubId} styled variant="full" size={54} ball={false} /><span>{label}</span></button>
								{/each}
							</div></fieldset>
						{/each}
						{#if outfit.category !== 'clube' && outfit.top !== 'uniforme'}
							<fieldset><legend>Cor da roupa</legend><div class="choices">
								{#each CLOTHING_COLORS as color, index (color)}
									<button type="button" class="swatch" style:--color={color} aria-label={`Cor da roupa ${index + 1}`} aria-pressed={outfit.color === index} onclick={() => setOutfit({ color: index })}></button>
								{/each}
							</div></fieldset>
						{/if}
					{/if}
				{:else if tab === 'cabelo'}
					<div class="hair-grid">
						{#each HAIR_STYLES as hair (hair)}
							<button type="button" data-umx-press aria-pressed={appearance.hairStyle === hair} onclick={() => appearance = { ...appearance, hairStyle: hair }}>
								<Pixel appearance={{ ...appearance, hairStyle: hair }} {kit} size={42} /><span>{HAIR_STYLE_LABELS[hair]}</span></button>
						{/each}
					</div>
					<fieldset><legend>Cor do cabelo</legend><div class="choices">
						{#each HAIR_COLORS as color, index (color)}
							<button type="button" class="swatch" style:--color={color} aria-label={`Cor do cabelo ${index + 1}`} aria-pressed={appearance.hairColor === index} onclick={() => appearance = { ...appearance, hairColor: index }}></button>
						{/each}
					</div></fieldset>
				{:else}
					<fieldset><legend>Tom de pele</legend><div class="choices">
						{#each SKIN_TONES as color, index (color)}
							<button type="button" class="swatch" style:--color={color} aria-label={`Tom de pele ${index + 1}`} aria-pressed={appearance.skin === index} onclick={() => appearance = { ...appearance, skin: index }}></button>
						{/each}
					</div></fieldset>
					{#each fields as field (field)}
						<fieldset><legend>{APPEARANCE_FIELDS[field]}</legend><div class="choices">
							{#each Object.entries(APPEARANCE_OPTIONS[field]) as [key, label], index (key)}
								<button type="button" data-umx-press aria-pressed={appearance[field] ? appearance[field] === key : index === 0}
									onclick={() => appearance = { ...appearance, [field]: key }}>{label}</button>
							{/each}
						</div></fieldset>
					{/each}
				{/if}
			</div>
		{/key}
	</div>
</div>

<style>
	.editor { display:grid; gap:12px; min-width:0; }
	.editor.with-preview { grid-template-columns:minmax(125px,.56fr) minmax(0,1fr); }
	.preview { position:relative; display:grid; place-items:center; align-self:start; position:sticky; top:12px; min-height:260px; border:1px solid var(--line-strong); border-radius:var(--radius-l); overflow:hidden; isolation:isolate;
		background:linear-gradient(180deg,transparent 62%,rgb(16 185 129 / .16) 62%,rgb(10 122 86 / .3)),radial-gradient(70% 60% at 50% 40%,rgb(52 211 153 / .14),transparent),var(--bg-deep); }
	.spot { position:absolute; left:50%; bottom:22%; width:58%; height:16px; translate:-50% 50%; border-radius:50%; background:rgb(0 0 0 / .45); filter:blur(6px); z-index:-1; }
	.figure { filter:drop-shadow(0 10px 14px rgb(0 0 0 / .4)); }
	.stage-label { position:absolute; top:10px; left:12px; font-size:.6875rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--emerald-strong); }
	.items { display:grid; grid-template-columns:repeat(auto-fill,minmax(82px,1fr)); gap:6px; }
	button.item { display:grid; justify-items:center; align-content:space-between; gap:4px; min-height:96px; padding:8px 4px 6px; font-size:var(--fs-xs); font-weight:600; background:linear-gradient(180deg,var(--surface-2),var(--surface-sunken)); transition:border-color var(--dur-2) var(--ease-out),background var(--dur-2) var(--ease-out); }
	button.item span { line-height:1.2; text-align:center; }
	.tools,.options { min-width:0; }
	.tools { display:grid; gap:10px; align-content:start; }
	.options { display:grid; gap:10px; }
	fieldset { min-width:0; border:0; padding:0; margin:0; }
	legend { margin-bottom:4px; color:var(--text-2); font-size:var(--fs-sm); }
	.choices { display:flex; flex-wrap:wrap; gap:6px; }
	button { color:var(--text-2); padding:7px 9px; border:1px solid var(--line); border-radius:8px; min-height:36px; background:var(--surface); cursor:pointer; }
	button:disabled { opacity:.4; cursor:default; }
	button[aria-pressed='true'] { color:var(--emerald-strong); border-color:var(--emerald); background:var(--emerald-soft); }
	button.swatch { background:var(--color); width:36px; border:2px solid var(--surface); outline:1px solid var(--line); }
	button.swatch[aria-pressed='true'] { outline:2px solid var(--emerald); }
	.hair-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(75px,1fr)); gap:6px; }
	.hair-grid button { background:linear-gradient(180deg,var(--surface-2),var(--surface-sunken)); }
	.hair-grid button { display:grid; justify-items:center; align-content:space-between; gap:4px; min-height:70px; font-size:var(--fs-xs); }
	@media(max-width:520px) { .editor.with-preview { grid-template-columns:minmax(0,1fr); } .preview { position:relative; top:0; min-height:150px; } .preview :global(svg.pixel) { height:125px; width:auto; } }
</style>
