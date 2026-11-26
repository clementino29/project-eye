<script lang="ts">
	// Pastille d'état pleine (pages Status et Panel du design) : fond vif, texte foncé, icône.
	let { couleur, encre, icone, libelle }: { couleur: string; encre: string; icone: string; libelle: string } = $props();
</script>

<span class="pilule" style:background={couleur} style:color={encre}><i class="icon-{icone}" aria-hidden="true"></i>{libelle}</span>

<style>
	.pilule {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 26px;
		padding: 0 10px 0 8px;
		border-radius: var(--radius-pill);
		font-family: var(--font-sans);
		font-size: 12px;
		font-weight: var(--weight-bold);
		line-height: 1;
		white-space: nowrap;
	}
	.pilule i {
		font-size: 14px;
	}
</style>
