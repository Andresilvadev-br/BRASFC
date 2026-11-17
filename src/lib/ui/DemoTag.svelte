<script lang="ts">
	let { label = 'Demonstrativo' }: { label?: string } = $props();
</script>

<span class="demo" title="Dados fictícios desta versão de desenvolvimento">{label}</span>

<style>
	.demo {
		display: inline-flex;
		align-items: center;
		height: 22px;
		padding: 0 8px;
		border-radius: var(--radius-pill);
		border: 1px dashed rgb(232 184 106 / 0.45);
		color: var(--gold);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		white-space: nowrap;
	}
</style>
