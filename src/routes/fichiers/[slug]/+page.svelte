<script lang="ts">
	// Page d'un projet (prototype « Fichiers », vue projet) : bannière, logo ou titre,
	// « Comment installer », puis les fichiers filtrés par plateforme.
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import AjouterFichier from '#lib/components/fichiers/AjouterFichier.svelte';
	import LigneFichier from '#lib/components/fichiers/LigneFichier.svelte';
	import { artOf } from '#lib/design/art.ts';
	import { depuis, ORDRE_PLATEFORMES, PLATEFORMES, type Plateforme } from '#lib/fichiers.ts';
	import { pluriel } from '#lib/commune.ts';
	import type { VueFichier } from '#lib/server/fichiers.ts';

	let { data } = $props();
	const p = $derived(data.projet);
	const art = $derived(artOf(p.nom));

	let plateforme = $state<'toutes' | Plateforme>('toutes');
	// « ?ajouter » (après la création du projet) ouvre directement la fenêtre d'ajout.
	let ajout = $state(untrack(() => page.url.searchParams.has('ajouter') && data.peutDeposer));
	let edition = $state<VueFichier | null>(null);

	const compatible = (f: VueFichier) => plateforme === 'toutes' || f.plateformes.includes(plateforme);
	// Les fichiers d'une autre plateforme restent visibles, grisés, après les autres.
	const fichiers = $derived([...p.fichiers].sort((a, b) => Number(compatible(b)) - Number(compatible(a))));
	const meta = $derived([p.sousTitre, pluriel(p.fichiers.length, 'fichier'), p.majFichiers ? `màj ${depuis(p.majFichiers)}` : null].filter(Boolean).join(' · '));
	const avecLogo = $derived(p.affichage !== 'titre' && !!p.logo);
	const avecTitre = $derived(p.affichage !== 'logo' || !p.logo);
</script>

<svelte:head><title>{p.nom} · Fichiers · Nohriancons</title></svelte:head>

<div class="banniere" aria-hidden="true">
	<div class="fond" style:background={art.grad}><i class="icon-{art.icon}"></i></div>
	{#if p.banniere}<img src={p.banniere} alt="" />{/if}
	<div class="voile"></div>
</div>

<main class="nh-page projet">
	<div class="haut">
		<nav class="fil" aria-label="Fil d’Ariane"><a href="/fichiers">Fichiers</a><i class="icon-chevron-right" aria-hidden="true"></i><span aria-current="page">{p.nom}</span></nav>
		{#if data.peutDeposer}<a href="/fichiers/{p.slug}/modifier" class="nh-btn nh-btn--outline nh-btn--sm"><i class="icon-pencil" aria-hidden="true"></i>Modifier</a>{/if}
	</div>

	<header class="entete">
		{#if avecLogo}<img class="logo" src={p.logo} alt={avecTitre ? '' : p.nom} />{/if}
		{#if avecTitre}<h1>{p.nom}</h1>{:else}<h1 class="sr">{p.nom}</h1>{/if}
		<p class="meta">{meta}</p>
	</header>

	<div class="corps">
		{#if p.etapes.length}
			<section class="nh-card etapes" aria-labelledby="install-titre">
				<h2 id="install-titre">Comment installer</h2>
				<ol>
					{#each p.etapes as e, i (i)}<li><span class="num" aria-hidden="true">{i + 1}</span><span>{e}</span></li>{/each}
				</ol>
			</section>
		{/if}

		<section class="fichiers" aria-labelledby="fichiers-titre">
			<div class="f-tete">
				<div class="f-titre"><h2 id="fichiers-titre">Fichiers</h2><span>{p.fichiers.length}</span></div>
				<div class="filtres">
					<div class="tags" role="group" aria-label="Plateforme">
						{#each [['toutes', 'Toutes'], ...ORDRE_PLATEFORMES.map((x) => [x, PLATEFORMES[x]])] as [v, l] (v)}
							<button type="button" class="nh-tag nh-tag--clickable" class:nh-tag--selected={plateforme === v} aria-pressed={plateforme === v} onclick={() => (plateforme = v as typeof plateforme)}>{l}</button>
						{/each}
					</div>
					{#if data.peutDeposer}<button type="button" class="nh-btn nh-btn--primary nh-btn--sm" onclick={() => (ajout = true)}><i class="icon-plus" aria-hidden="true"></i>Ajouter</button>{/if}
				</div>
			</div>
			<div class="nh-card liste">
				{#each fichiers as f (f.id)}
					<LigneFichier {f} grise={!compatible(f)} onmodifier={data.peutDeposer ? () => (edition = f) : null} />
				{:else}
					<p class="vide">Aucun fichier pour l’instant.{data.peutDeposer ? ' Ajoute le premier avec « Ajouter ».' : ''}</p>
				{/each}
				{#if p.fichiers.length && !p.fichiers.some(compatible)}<p class="vide">Rien pour {PLATEFORMES[plateforme as Plateforme]} pour l’instant.</p>{/if}
			</div>
		</section>
	</div>
</main>

{#if ajout}
	<AjouterFichier projets={[{ id: p.id, nom: p.nom }]} projetId={p.id} tailleMax={data.tailleMax} onfermer={() => (ajout = false)} />
{/if}
{#if edition}
	<AjouterFichier projets={[{ id: p.id, nom: p.nom }]} projetId={p.id} fichier={edition} tailleMax={data.tailleMax} onfermer={() => (edition = null)} />
{/if}

<style>
	.banniere {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: clamp(440px, 34vw, 620px);
		pointer-events: none;
		-webkit-mask-image: linear-gradient(to bottom, #000 25%, transparent 100%);
		mask-image: linear-gradient(to bottom, #000 25%, transparent 100%);
	}
	.fond,
	.banniere img,
	.voile {
		position: absolute;
		inset: 0;
	}
	.fond {
		overflow: hidden;
	}
	.fond i {
		position: absolute;
		right: 6%;
		top: 42%;
		transform: translateY(-50%) rotate(-12deg);
		font-size: clamp(200px, 22vw, 380px);
		line-height: 1;
		color: rgba(255, 255, 255, 0.12);
	}
	.banniere img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.voile {
		background: linear-gradient(to bottom, rgba(11, 21, 28, 0.55), rgba(11, 21, 28, 0) 35%);
	}
	.projet {
		position: relative;
		gap: 32px;
		padding-top: 24px;
	}
	.haut {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.fil {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		color: var(--fg-1);
		text-shadow: 0 1px 8px rgba(0, 0, 0, 0.6);
	}
	.fil a {
		color: inherit;
	}
	.entete {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: clamp(56px, 6vw, 112px) 0 clamp(72px, 7vw, 132px);
		text-align: center;
	}
	.logo {
		width: clamp(240px, 36vw, 640px);
		max-width: 100%;
		max-height: clamp(140px, 13vw, 240px);
		object-fit: contain;
	}
	h1 {
		font: var(--type-h1);
		letter-spacing: var(--tracking-tight);
		color: var(--fg-1);
		text-shadow: 0 2px 24px rgba(0, 0, 0, 0.5);
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.meta {
		margin: 0;
		font-size: 15px;
		color: var(--fg-1);
		text-shadow: 0 1px 12px rgba(0, 0, 0, 0.6);
	}
	.corps {
		display: flex;
		flex-wrap: wrap;
		gap: 32px;
		align-items: flex-start;
	}
	h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 700;
		color: var(--fg-1);
	}
	.etapes {
		flex: 1 1 360px;
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	li {
		display: flex;
		gap: 14px;
		align-items: flex-start;
		font-size: 15px;
		line-height: 1.5;
		color: var(--fg-2);
	}
	.num {
		flex: none;
		width: 28px;
		height: 28px;
		margin-top: -3px;
		border-radius: 999px;
		background: var(--petrol-500);
		color: var(--fg-1);
		display: grid;
		place-items: center;
		font-weight: 700;
		font-size: 13px;
	}
	.fichiers {
		flex: 999 1 820px;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.f-tete {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.f-titre {
		display: flex;
		align-items: baseline;
		gap: 10px;
		font-size: 14px;
		color: var(--fg-3);
	}
	.filtres,
	.tags {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.liste {
		padding: 0;
		overflow: hidden;
	}
	.vide {
		margin: 0;
		padding: 24px 18px;
		color: var(--fg-2);
	}
</style>
