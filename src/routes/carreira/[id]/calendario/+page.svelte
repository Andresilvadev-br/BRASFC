<script lang="ts">
	import CalendarScreen from '#lib/ui/career/screens/CalendarScreen.svelte';
	let { data } = $props();
</script>

<CalendarScreen {data} />
