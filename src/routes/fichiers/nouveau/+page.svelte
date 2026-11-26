<script lang="ts">
	import Lueur from '#lib/components/Lueur.svelte';
	import FormulaireProjet from '#lib/components/fichiers/FormulaireProjet.svelte';

	let { form } = $props();
</script>

<svelte:head><title>Nouveau projet · Fichiers · Nohriancons</title></svelte:head>

<Lueur />

<main class="nh-page" style="gap:24px;max-width:1040px">
	<FormulaireProjet erreur={form?.erreur ?? null} />
</main>
