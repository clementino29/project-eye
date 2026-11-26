<script lang="ts">
	// Fichiers & applis (prototype « Fichiers ») : les jeux et projets, puis les fichiers mis à jour récemment.
	import Lueur from '#lib/components/Lueur.svelte';
	import AjouterFichier from '#lib/components/fichiers/AjouterFichier.svelte';
	import LigneFichier from '#lib/components/fichiers/LigneFichier.svelte';
	import { artOf } from '#lib/design/art.ts';
	import { depuis, plateformesLibelle, tailleLisible } from '#lib/fichiers.ts';
	import { normaliser } from '#lib/watchlist.ts';
	import { pluriel } from '#lib/commune.ts';

	let { data } = $props();
	let q = $state('');
	let ajout = $state(false);

	const r = $derived(normaliser(q.trim()));
	const tuiles = $derived(data.projets.filter((p) => !r || normaliser(p.nom).includes(r) || p.fichiers.some((f) => normaliser(f.nom).includes(r))));
	const recents = $derived(data.recents.filter((f) => !r || normaliser(f.nom).includes(r) || normaliser(f.projet.nom).includes(r)));
</script>

<svelte:head><title>Fichiers & applis · Nohriancons</title></svelte:head>

<Lueur />

<main class="nh-page" style="gap:40px">
	<header class="tete">
		<div class="col">
			<h1>Fichiers &amp; applis</h1>
			<p class="intro">Tout ce qu'il faut installer pour jouer avec la bande.</p>
		</div>
		<div class="nh-input recherche"><i class="icon-search" aria-hidden="true"></i><input type="search" bind:value={q} placeholder="Rechercher un jeu, un fichier…" aria-label="Rechercher un jeu ou un fichier" /></div>
		{#if data.peutDeposer && data.projets.length}
			<button type="button" class="nh-btn nh-btn--primary nh-btn--lg" onclick={() => (ajout = true)}><i class="icon-plus" aria-hidden="true"></i>Ajouter un fichier</button>
		{/if}
	</header>

	<section class="bloc" aria-labelledby="projets-titre">
		<h2 class="surtitre" id="projets-titre">Jeux &amp; projets</h2>
		<div class="grille">
			{#each tuiles as p (p.id)}
				{@const art = artOf(p.nom)}
				<a href="/fichiers/{p.slug}" class="nh-card nh-card--interactive tuile">
					<div class="vignette" style:background={art.grad}>
						<i class="icon-{art.icon} filigrane" aria-hidden="true"></i>
						<span class="v-nom" aria-hidden="true">{p.nom}</span>
						{#if p.vignette}<img src={p.vignette} alt="" loading="lazy" />{/if}
					</div>
					<div class="t-pied">
						<span class="t-nom">{p.nom}<i class="icon-arrow-up-right" aria-hidden="true"></i></span>
						<span class="t-meta">{pluriel(p.fichiers.length, 'fichier')}{p.majFichiers ? ` · màj ${depuis(p.majFichiers)}` : ''}</span>
					</div>
				</a>
			{/each}
			{#if data.peutDeposer && !r}
				<a href="/fichiers/nouveau" class="nouveau">
					<span class="n-icone"><i class="icon-plus" aria-hidden="true"></i></span>
					<span>Nouveau projet</span>
				</a>
			{/if}
		</div>
		{#if r && !tuiles.length}
			<p class="vide">Rien ne correspond à « {q.trim()} ». Essaie un autre mot.</p>
		{:else if !data.projets.length && !data.peutDeposer}
			<p class="vide">Aucun projet pour l’instant. Les admins les ajouteront ici.</p>
		{/if}
	</section>

	{#if recents.length}
		<section class="bloc" aria-labelledby="recents-titre">
			<h2 class="surtitre" id="recents-titre">Mis à jour récemment</h2>
			<div class="nh-card liste">
				{#each recents as f (f.id)}
					<LigneFichier {f} meta="{f.projet.nom} · {f.lien ? 'lien externe' : tailleLisible(f.taille)} · {plateformesLibelle(f.plateformes)}" quand={depuis(f.majLe)} />
				{/each}
			</div>
		</section>
	{/if}
</main>

{#if ajout}
	<AjouterFichier projets={data.projets.map((p) => ({ id: p.id, nom: p.nom }))} tailleMax={data.tailleMax} onfermer={() => (ajout = false)} />
{/if}

<style>
	.tete {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 16px;
	}
	.col {
		flex: 1;
		min-width: 240px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	h1 {
		font: var(--type-h1);
		letter-spacing: var(--tracking-tight);
	}
	.intro {
		margin: 0;
		font-size: 16px;
		color: var(--fg-2);
	}
	.recherche {
		width: 280px;
		max-width: 100%;
		height: 44px;
	}
	.bloc {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.surtitre {
		margin: 0;
		font: var(--type-overline);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--fg-2);
	}
	.grille {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
		gap: clamp(16px, 1.4vw, 24px);
	}
	.tuile {
		padding: 0;
		overflow: hidden;
		color: inherit;
		text-decoration: none;
	}
	.vignette {
		position: relative;
		aspect-ratio: 16 / 9;
		overflow: hidden;
	}
	.filigrane {
		position: absolute;
		right: -8px;
		top: 50%;
		transform: translateY(-50%) rotate(-12deg);
		font-size: 120px;
		line-height: 1;
		color: rgba(255, 255, 255, 0.2);
	}
	.v-nom {
		position: absolute;
		left: 18px;
		bottom: 14px;
		max-width: 72%;
		font-weight: 800;
		font-size: 24px;
		line-height: 1.1;
		letter-spacing: -0.02em;
		color: #fff;
		text-shadow: 0 1px 10px rgba(0, 0, 0, 0.35);
	}
	.vignette img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.t-pied {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 14px 18px 16px;
	}
	.t-nom {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		font-weight: 700;
		font-size: 18px;
		color: var(--fg-1);
	}
	.t-nom i {
		color: var(--fg-3);
		font-size: 16px;
	}
	.t-meta {
		font-size: 13px;
		color: var(--fg-3);
	}
	.nouveau {
		min-height: 220px;
		border: 1.5px dashed var(--border-default);
		border-radius: 16px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		color: var(--fg-2);
		font-weight: 500;
		font-size: 15px;
		text-decoration: none;
		transition: all 120ms var(--ease-out);
	}
	.nouveau:hover {
		border-color: var(--apricot-300);
		color: var(--fg-1);
		background: var(--surface-1);
	}
	.n-icone {
		width: 44px;
		height: 44px;
		border-radius: 12px;
		background: var(--petrol-500);
		display: grid;
		place-items: center;
		color: var(--apricot-300);
		font-size: 22px;
	}
	.liste {
		padding: 0;
		overflow: hidden;
	}
	.vide {
		margin: 0;
		color: var(--fg-2);
	}
</style>
