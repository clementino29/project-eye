<script lang="ts">
	// Pastille d'état vive : fond plein, texte foncé, pictogramme. `taille="rond"` : petit rond à icône seule (résumés).
	import type { Pastille } from '#lib/design/pastilles.ts';

	let { pastille, taille = 'normale' }: { pastille: Pastille; taille?: 'normale' | 'rond' } = $props();
</script>

{#if taille === 'rond'}
	<span class="rond" style:background={pastille.c} style:color={pastille.encre} aria-hidden="true"><i class="icon-{pastille.icone}"></i></span>
{:else}
	<span class="pilule" style:background={pastille.c} style:color={pastille.encre}><i class="icon-{pastille.icone}" aria-hidden="true"></i>{pastille.l}</span>
{/if}

<style>
	.pilule {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 26px;
		padding: 0 10px 0 8px;
		border-radius: var(--radius-pill);
		font: 700 12px/1 var(--font-sans);
		white-space: nowrap;
	}
	.pilule i {
		font-size: 14px;
	}
	.rond {
		flex: none;
		display: inline-grid;
		place-items: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		font-size: 12px;
	}
</style>
