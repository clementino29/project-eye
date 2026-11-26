<script lang="ts">
	import Lueur from '#lib/components/Lueur.svelte';
	import FormulaireProjet from '#lib/components/fichiers/FormulaireProjet.svelte';

	let { data, form } = $props();
</script>

<svelte:head><title>Modifier {data.projet.nom} · Fichiers · Nohriancons</title></svelte:head>

<Lueur />

<main class="nh-page" style="gap:24px;max-width:1040px">
	{#key data.projet.id}<FormulaireProjet projet={data.projet} erreur={form?.erreur ?? null} />{/key}
</main>
