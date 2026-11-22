<script lang="ts">
	/** Chave liga/desliga acessível (checkbox nativo com role="switch") no visual do jogo. */
	let { checked = $bindable(false), label, hint, disabled = false, onchange }: {
		checked?: boolean; label: string; hint?: string; disabled?: boolean; onchange?: (checked: boolean) => void;
	} = $props();
</script>

<label class="switch" class:disabled>
	<input type="checkbox" role="switch" bind:checked {disabled} onchange={(e) => onchange?.(e.currentTarget.checked)} />
	<span class="knob" aria-hidden="true"></span>
	<span class="copy"><strong>{label}</strong>{#if hint}<small>{hint}</small>{/if}</span>
</label>

<style>
	.switch { position: relative; display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px; background: var(--surface-sunken); border: 1px solid var(--line); cursor: pointer; transition: border-color var(--dur-2) var(--ease-out); }
	.switch:hover:not(.disabled) { border-color: var(--line-strong); }
	.disabled { opacity: 0.6; cursor: not-allowed; }
	input { position: absolute; opacity: 0; width: 1px; height: 1px; }
	.knob { position: relative; flex: none; width: 40px; height: 22px; border-radius: 99px; background: var(--surface-3); transition: background var(--dur-2) var(--ease-out); }
	.knob::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--text); transition: translate var(--dur-2) var(--ease-spring); }
	input:checked + .knob { background: var(--emerald); }
	input:checked + .knob::after { translate: 18px 0; }
	input:focus-visible + .knob { box-shadow: var(--focus); }
	.copy { display: grid; min-width: 0; }
	.copy strong { font-weight: 700; font-size: var(--fs-sm); }
	small { color: var(--text-3); font-size: var(--fs-xs); }
</style>
