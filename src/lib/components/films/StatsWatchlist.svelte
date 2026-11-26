<script lang="ts">
	// Zone « Tes stats » (consignes de style) : quatre cartes, avec la valeur du membre connecté en rappel sur Les potes.
	import type { TuileStats } from '#lib/watchlist.ts';

	let { titre, tuiles, moi = null }: { titre: string; tuiles: TuileStats[]; moi?: TuileStats[] | null } = $props();
</script>

<section class="stats" aria-labelledby="stats-titre">
	<div class="tete">
		<h2 id="stats-titre">{titre}</h2>
		<span class="nh-badge nh-badge--accent">Prototype</span>
	</div>
	<div class="grille">
		{#each tuiles as t, i (t.icone)}
			{@const indice = [t.indice, moi ? `Toi : ${moi[i].valeur}` : ''].filter(Boolean).join(' · ')}
			<div class="nh-card tuile">
				<span class="ico" aria-hidden="true"><i class="icon-{t.icone}"></i></span>
				<span class="lib">{t.libelle}</span>
				<span class="val">{t.valeur}</span>
				{#if t.barre !== null}<div class="barre" aria-hidden="true"><span style:width="{t.barre}%"></span></div>{/if}
				<span class="sous">{t.sous}</span>
				{#if indice}<span class="indice">{indice}</span>{/if}
			</div>
		{/each}
	</div>
</section>

<style>
	.stats {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.tete {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}
	h2 {
		margin: 0;
		font-size: 22px;
		line-height: 1.3;
		font-weight: 700;
		color: var(--fg-1);
	}
	.grille {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 16px;
	}
	.tuile {
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	.ico {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 12px;
		background: var(--petrol-500);
		color: var(--apricot-300);
		margin-bottom: 4px;
		font-size: 20px;
	}
	.lib {
		font-size: 13px;
		font-weight: 500;
		color: var(--fg-3);
	}
	.val {
		font-weight: 700;
		font-size: 34px;
		line-height: 1.05;
		letter-spacing: -0.02em;
		color: var(--fg-1);
	}
	.barre {
		display: flex;
		height: 6px;
		border-radius: 999px;
		overflow: hidden;
		background: var(--apricot-300);
		margin-top: 2px;
	}
	.barre span {
		background: var(--petrol-300);
	}
	.sous {
		font-size: 13px;
		color: var(--fg-2);
	}
	.indice {
		font-size: 12px;
		color: var(--fg-3);
	}
	@media (max-width: 559px) {
		.grille {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 12px;
		}
		.tuile {
			padding: 16px;
		}
		.val {
			font-size: 28px;
		}
	}
</style>
