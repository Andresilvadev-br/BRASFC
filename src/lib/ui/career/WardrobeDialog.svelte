<script lang="ts">
	import { DEFAULT_APPEARANCE, type Appearance } from '#lib/domain/appearance.ts';
	import { markClean, markDirty } from '#lib/stores/unsaved.svelte.ts';
	import type { Kit } from '#lib/pixel/sprites.ts';
	import Button from '../Button.svelte';
	import Modal from '../Modal.svelte';
	import AppearanceEditor from './AppearanceEditor.svelte';

	let { value, kit, clubId, uniformOptions = true, onsave }: {
		value?: Appearance; kit: Kit; clubId: string; uniformOptions?: boolean; onsave: (appearance: Appearance) => Promise<boolean>;
	} = $props();

	const id = $props.id();
	const key = `appearance:${id}`;
	let open = $state(false);
	let busy = $state(false);
	let draft = $state<Appearance>({ ...DEFAULT_APPEARANCE });
	let initial = $state('');
	let failed = $state(false);
	const changed = $derived(JSON.stringify(draft) !== initial);
	$effect(() => {
		if (open && changed) markDirty(key, 'Aparência do personagem');
		else markClean(key);
		return () => markClean(key);
	});
	function edit() {
		draft = structuredClone($state.snapshot(value ?? DEFAULT_APPEARANCE));
		initial = JSON.stringify(draft);
		failed = false;
		open = true;
	}
	async function save() {
		busy = true;
		failed = false;
		try {
			if (await onsave($state.snapshot(draft))) open = false;
			else failed = true;
		} catch { failed = true; }
		finally { busy = false; }
	}
</script>

<Button size="sm" variant="ghost" icon="user" onclick={edit}>Aparência</Button>
{#if open}
	<Modal bind:open title="Aparência do personagem" size="lg">
		<AppearanceEditor bind:appearance={draft} {kit} {clubId} {uniformOptions} preview />
		{#if failed}<p role="alert">A aparência ainda não foi confirmada. Confira a conexão e tente novamente.</p>{/if}
		{#snippet footer()}
			<Button variant="ghost" disabled={busy} onclick={() => open = false}>Cancelar</Button>
			<Button variant="primary" icon="save" disabled={!changed} loading={busy} onclick={save}>Salvar aparência</Button>
		{/snippet}
	</Modal>
{/if}
