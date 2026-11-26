<script lang="ts">
	// Halo coloré en haut de page, derrière l'en-tête vitré (comme dans le design).
	// `fond` : dégradés CSS ; `image` : jaquette floutée (page Panel).
	let { fond = null, image = null, hauteur = 'min(900px, 110vh)' }: { fond?: string | null; image?: { couleur: string; degrade: string } | null; hauteur?: string } = $props();
</script>

<div class="lueur" aria-hidden="true" style:height={hauteur} style:background={fond}>
	{#if image}
		<div class="flou" style:background-color={image.couleur} style:background-image={image.degrade}></div>
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
	}
	.voile {
		position: absolute;
		inset: 0;
		background: linear-gradient(180deg, rgba(11, 21, 28, 0.45) 0%, rgba(11, 21, 28, 0.72) 50%, rgba(11, 21, 28, 1) 100%);
	}
</style>
