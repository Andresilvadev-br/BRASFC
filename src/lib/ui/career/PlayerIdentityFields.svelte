<script lang="ts">
	import { DOMINANT_FEET, SOUTH_AMERICAN_COUNTRIES, START_AGES, playerDevelopmentFactor, type DominantFoot } from '#lib/domain/player-profile.ts';

	let { age = $bindable(), nationality = $bindable('Brasil'), foot = $bindable('direito'), errors = {} }: {
		age?: number; nationality: string; foot: DominantFoot; errors?: Record<string, string>;
	} = $props();
	const expected = $derived(age === undefined ? undefined : playerDevelopmentFactor(age));
</script>

<div class="identity-fields">
	<label>Nacionalidade
		<select bind:value={nationality} aria-invalid={!!errors.nationality} required>
			{#each SOUTH_AMERICAN_COUNTRIES as country (country)}<option value={country}>{country}</option>{/each}
		</select>
		{#if errors.nationality}<small class="error" role="alert">{errors.nationality}</small>{/if}
	</label>
	<label>Idade inicial
		<select bind:value={age} aria-invalid={!!errors.age} required>
			{#each START_AGES as year (year)}<option value={year}>{year} anos</option>{/each}
		</select>
		{#if errors.age}<small class="error" role="alert">{errors.age}</small>{/if}
	</label>
	<label>Pé dominante
		<select bind:value={foot} aria-invalid={!!errors.foot} required>
			{#each Object.entries(DOMINANT_FEET) as [value, label] (value)}<option {value}>{label}</option>{/each}
		</select>
		{#if errors.foot}<small class="error" role="alert">{errors.foot}</small>{/if}
	</label>
	{#if expected !== undefined}
		<small class="hint">{expected === 1 ? 'Evolução rápida. Você começa com menos atributos e tem mais margem para desenvolver.' :
			expected === 0.7 ? 'Evolução moderada. Você começa com mais atributos e ainda pode melhorar com regularidade.' :
				'Evolução mais gradual. Você começa com mais atributos, com ganhos menores ao longo da carreira.'}</small>
	{/if}
</div>

<style>
	.identity-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 120px), 1fr)); gap: 8px; }
	label { min-width: 0; display: grid; gap: 5px; align-content: start; color: var(--text-2); font-size: var(--fs-sm); font-weight: 600; }
	select { min-width: 0; max-width: 100%; width: 100%; padding: 9px; border: 1px solid var(--line-strong); border-radius: 8px; color: var(--text); background: var(--surface-sunken); }
	.hint { grid-column: 1 / -1; color: var(--text-2); }
	.error { color: #ff9999; }
</style>
