<script lang="ts">
	// Fond d'ambiance du haut de page, derrière l'en-tête vitré (consignes de style, §6).
	// `fond` : lueur (dégradés CSS) ; `jaquette` : visuel flouté (image par-dessus son dégradé).
	import { fondImage, LUEUR_NEUTRE, type Art } from '#lib/design/art.ts';

	let {
		fond = null,
		jaquette = null,
		hauteur = null
	}: { fond?: string | null; jaquette?: { art: Art; image?: string | null } | null; hauteur?: string | null } = $props();
	const h = $derived(hauteur ?? (jaquette ? 'min(760px, 95vh)' : 'min(960px, 115vh)'));
</script>

<div class="lueur" aria-hidden="true" style:height={h} style:background={jaquette ? null : (fond ?? LUEUR_NEUTRE)}>
	{#if jaquette}
		<div class="flou" style:background-color={jaquette.art.solid} style:background-image={fondImage(jaquette.art, jaquette.image)}></div>
		<div class="voile"></div>
	{/if}
</div>

<style>
	.lueur {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		overflow: hidden;
		pointer-events: none;
		transition: background 0.6s var(--ease-out);
	}
	.flou {
		position: absolute;
		inset: -80px;
		background-size: cover;
		background-position: center 30%;
		filter: blur(36px) saturate(1.25);
		opacity: 0.55;
		transition: background 0.6s var(--ease-out);
	}
	.voile {
		position: absolute;
		inset: 0;
		background: linear-gradient(180deg, rgba(11, 21, 28, 0.45) 0%, rgba(11, 21, 28, 0.72) 50%, rgba(11, 21, 28, 1) 100%);
	}
</style>
