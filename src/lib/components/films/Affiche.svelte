<script lang="ts">
	// Affiche d'un film ou d'une série : affiche dessinée (dégradé tiré du titre, titre en condensé),
	// recouverte par l'affiche TMDB quand elle charge. Si l'image est bloquée, le dessin reste.
	import type { Snippet } from 'svelte';
	import { posterOf } from '#lib/design/art.ts';

	let {
		titre,
		annee = null,
		ligne = null,
		image = null,
		taille = 'carte',
		children
	}: {
		titre: string;
		annee?: number | null;
		/** Texte sous le trait (par défaut l'année). */
		ligne?: string | null;
		image?: string | null;
		taille?: 'mini' | 'resume' | 'potes' | 'carte' | 'fiche';
		/** Pastilles posées sur l'affiche (statut, type). */
		children?: Snippet;
	} = $props();
	let echec = $state(false);
	const bas = $derived(ligne ?? (annee ? String(annee) : ''));
</script>

<div class="affiche {taille}" style:background={posterOf(titre)} aria-hidden={taille === 'mini' ? 'true' : undefined}>
	{#if taille !== 'mini'}
		<span class="titre">{titre}</span>
		{#if bas && taille !== 'resume'}<span class="trait"></span><span class="bas">{bas}</span>{/if}
	{/if}
	{#if image && !echec}<img src={image} alt="" loading="lazy" onerror={() => (echec = true)} />{/if}
	{@render children?.()}
</div>

<style>
	.affiche {
		position: relative;
		overflow: hidden;
		aspect-ratio: 2 / 3;
		border-radius: 12px;
		border: 1px solid var(--border-subtle);
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		gap: 6px;
		padding: 14px;
		color: var(--ink-100);
		/* Le titre suit la largeur de l'affiche, pour qu'un mot long tienne sur une ligne. */
		container-type: inline-size;
	}
	img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.titre {
		font-family: var(--font-condensed);
		font-weight: 800;
		font-size: min(24px, 12.5cqi);
		line-height: 0.95;
		text-transform: uppercase;
		letter-spacing: 0.01em;
		overflow-wrap: break-word;
	}
	.trait {
		height: 1px;
		background: rgba(245, 240, 242, 0.25);
	}
	.bas {
		font-family: var(--font-condensed);
		font-weight: 500;
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: rgba(245, 240, 242, 0.75);
	}
	.carte {
		box-shadow: var(--shadow-1);
	}
	.potes {
		padding: 12px;
		box-shadow: var(--shadow-1);
	}
	.potes .titre {
		font-size: min(20px, 12.5cqi);
	}
	.fiche {
		width: 260px;
		max-width: 100%;
		border-radius: 16px;
		padding: 20px;
		gap: 8px;
		box-shadow: var(--shadow-2);
	}
	.fiche .titre {
		font-size: min(40px, 14cqi);
	}
	.fiche .bas {
		font-size: 13px;
	}
	.resume {
		flex: none;
		width: 64px;
		height: 96px;
		border-radius: 8px;
		padding: 6px;
	}
	.resume .titre {
		font-size: min(11px, 13cqi);
		line-height: 1;
	}
	.mini {
		flex: none;
		width: 44px;
		height: 66px;
		border-radius: 6px;
		padding: 0;
	}
	@media (max-width: 559px) {
		.fiche {
			width: 180px;
		}
	}
</style>
