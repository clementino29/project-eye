<script lang="ts">
	// Ma watchlist (prototype « Ma watchlist ») : stats, « Tu en es là », puis la liste filtrable.
	import { page } from '$app/state';
	import Lueur from '#lib/components/Lueur.svelte';
	import StatusPill from '#lib/components/StatusPill.svelte';
	import Affiche from '#lib/components/films/Affiche.svelte';
	import AjouterTitre from '#lib/components/films/AjouterTitre.svelte';
	import OngletsFilms from '#lib/components/films/OngletsFilms.svelte';
	import StatsWatchlist from '#lib/components/films/StatsWatchlist.svelte';
	import { envoyer } from '#lib/actions.ts';
	import { artTitre } from '#lib/design/art.ts';
	import { PASTILLES_WATCHLIST } from '#lib/design/pastilles.ts';
	import { normaliser, type StatutWl, type TypeTitre } from '#lib/watchlist.ts';

	let { data } = $props();

	let onglet = $state<'tout' | StatutWl>('tout');
	let genre = $state<'tout' | TypeTitre>('tout');
	let q = $state('');
	let tri = $state<'recent' | 'titre' | 'annee'>('recent');
	let vue = $state<'affiches' | 'liste'>('affiches');
	let envoi = $state<string | null>(null);
	// « ?ajouter » dans l'adresse ouvre directement la fenêtre (lien depuis une autre page).
	let ajout = $state(page.url.searchParams.has('ajouter'));

	const ONGLETS: ['tout' | StatutWl, string][] = [
		['tout', 'Tout'],
		['cours', 'En cours'],
		['avoir', 'À voir'],
		['vu', 'Vus']
	];
	const GENRES: ['tout' | TypeTitre, string][] = [
		['tout', 'Tout'],
		['film', 'Films'],
		['serie', 'Séries']
	];

	type Entree = (typeof data.liste)[number];
	const meta = (e: Entree) => {
		const a = e.avancement;
		if (e.statut === 'cours' && a) return `S${a.saison} · É${a.vusSaison} sur ${a.totalSaison}`;
		return [e.titre.type === 'film' ? 'Film' : 'Série', e.titre.annee].filter(Boolean).join(' · ');
	};
	const extra = (e: Entree) => {
		if (e.statut === 'cours' && e.avancement) return `${e.avancement.pct} % de la saison`;
		return e.note ? `Ta note : ${e.note}/5` : 'Ajouté par toi';
	};

	const compte = (s: 'tout' | StatutWl) => data.liste.filter((e) => s === 'tout' || e.statut === s).length;
	const elements = $derived.by(() => {
		const r = normaliser(q.trim());
		const l = data.liste.filter(
			(e) => (onglet === 'tout' || e.statut === onglet) && (genre === 'tout' || e.titre.type === genre) && (!r || normaliser(e.titre.titre).includes(r))
		);
		if (tri === 'titre') return [...l].sort((a, b) => a.titre.titre.localeCompare(b.titre.titre, 'fr'));
		if (tri === 'annee') return [...l].sort((a, b) => (b.titre.annee ?? 0) - (a.titre.annee ?? 0));
		return l;
	});
	const enCours = $derived(data.liste.filter((e) => e.statut === 'cours' && e.titre.type === 'serie' && e.avancement));
	const vedette = $derived((enCours[0] ?? data.liste[0])?.titre);

	async function episodeVu(e: Entree) {
		const p = e.avancement?.prochain;
		if (!p) return;
		envoi = String(e.titre.id);
		await envoyer('?/episodeVu', { titreId: e.titre.id, saison: p.saison, episode: p.episode }, { silencieux: true });
		envoi = null;
	}
	function ouvrirAjout(ouvert: boolean) {
		ajout = ouvert;
	}
</script>

<svelte:head><title>Ma watchlist · Nohriancons</title></svelte:head>

{#if vedette}<Lueur jaquette={{ art: artTitre(vedette.titre), image: vedette.affiche }} />{:else}<Lueur />{/if}

<main class="nh-page" style="gap:32px">
	<header class="ligne">
		<div class="col">
			<span class="surtitre">Films &amp; séries</span>
			<h1>Ma watchlist</h1>
			<p class="intro">Ce que tu regardes, ce que tu as vu, ce qui t'attend.</p>
		</div>
		<button type="button" class="nh-btn nh-btn--primary nh-btn--lg" onclick={() => ouvrirAjout(true)}><i class="icon-plus" aria-hidden="true"></i>Ajouter un titre</button>
	</header>

	<OngletsFilms actif="moi" />

	<StatsWatchlist titre="Tes stats" tuiles={data.stats} />

	{#if enCours.length && (onglet === 'tout' || onglet === 'cours') && !q.trim()}
		<section class="bloc" aria-labelledby="resume-titre">
			<h2 id="resume-titre">Tu en es là</h2>
			<div class="resume">
				{#each enCours as e (e.titre.id)}
					{@const a = e.avancement!}
					<div class="nh-card r-carte">
						<a href="/films/titre/{e.titre.id}" aria-label="Voir la fiche de {e.titre.titre}" class="r-affiche"><Affiche titre={e.titre.titre} image={e.titre.affiche} taille="resume" /></a>
						<div class="r-corps">
							<a href="/films/titre/{e.titre.id}" class="r-nom">{e.titre.titre}</a>
							<span class="r-av">Saison {a.saison} · épisode {a.vusSaison} sur {a.totalSaison}</span>
							<div class="barre" role="progressbar" aria-label="Progression de la saison" aria-valuemin="0" aria-valuemax="100" aria-valuenow={a.pct}><span style:width="{a.pct}%"></span></div>
							<div class="r-pied">
								<span class="r-suivant">{a.prochain ? `Prochain : S${a.prochain.saison} É${a.prochain.episode}` : 'Série terminée'}</span>
								<button type="button" class="nh-btn nh-btn--outline nh-btn--sm" disabled={!a.prochain || envoi === String(e.titre.id)} onclick={() => episodeVu(e)}><i class="icon-check" aria-hidden="true"></i>Épisode vu</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<section class="bloc" aria-label="Ma liste complète" style="gap:20px">
		<div class="filtres">
			<div class="nh-tabs" role="tablist" aria-label="Statut">
				{#each ONGLETS as [v, l] (v)}
					<button type="button" role="tab" aria-selected={onglet === v} class="nh-tabs__tab" class:nh-tabs__tab--active={onglet === v} onclick={() => (onglet = v)}>{l} <span class="nh-tabs__count">{compte(v)}</span></button>
				{/each}
			</div>
			<div class="genres" role="group" aria-label="Type">
				{#each GENRES as [v, l] (v)}
					<button type="button" class="nh-tag nh-tag--clickable" class:nh-tag--selected={genre === v} aria-pressed={genre === v} onclick={() => (genre = v)}>{l}</button>
				{/each}
			</div>
			<div class="espace"></div>
			<div class="nh-input" style="width:240px;max-width:100%"><i class="icon-search" aria-hidden="true"></i><input type="search" bind:value={q} placeholder="Filtrer ma liste" aria-label="Filtrer ma liste" /></div>
			<div class="nh-input" style="width:180px">
				<select bind:value={tri} aria-label="Trier par">
					<option value="recent">Ajout récent</option>
					<option value="titre">Titre A → Z</option>
					<option value="annee">Année</option>
				</select>
				<i class="icon-chevron-down" aria-hidden="true"></i>
			</div>
			<div class="vues" role="group" aria-label="Affichage">
				<button type="button" class="nh-btn nh-btn--ghost nh-btn--sm nh-iconbtn" class:on={vue === 'affiches'} aria-label="Affiches" aria-pressed={vue === 'affiches'} onclick={() => (vue = 'affiches')}><i class="icon-layout-grid" aria-hidden="true"></i></button>
				<button type="button" class="nh-btn nh-btn--ghost nh-btn--sm nh-iconbtn" class:on={vue === 'liste'} aria-label="Liste" aria-pressed={vue === 'liste'} onclick={() => (vue = 'liste')}><i class="icon-list" aria-hidden="true"></i></button>
			</div>
		</div>

		{#if !elements.length}
			<div class="nh-card vide">
				<p class="v-titre">{data.liste.length ? 'Rien ici pour l’instant.' : 'Ta liste est vide.'}</p>
				<p class="v-txt">{data.liste.length ? 'Change de filtre ou ajoute un titre à ta liste.' : 'Ajoute un film ou une série pour commencer.'}</p>
				<button type="button" class="nh-btn nh-btn--outline" onclick={() => ouvrirAjout(true)}>Ajouter un titre</button>
			</div>
		{:else if vue === 'affiches'}
			<div class="grille">
				{#each elements as e (e.titre.id)}
					<a href="/films/titre/{e.titre.id}" class="carte">
						<div class="c-affiche">
							<Affiche titre={e.titre.titre} annee={e.titre.annee} image={e.titre.affiche}>
								<span class="c-statut"><StatusPill pastille={PASTILLES_WATCHLIST[e.statut]} /></span>
								<i class="c-type icon-{e.titre.type === 'film' ? 'film' : 'tv'}" role="img" aria-label={e.titre.type === 'film' ? 'Film' : 'Série'}></i>
							</Affiche>
						</div>
						<span class="c-nom">{e.titre.titre}</span>
						<span class="c-meta">{meta(e)}</span>
						{#if e.statut === 'cours' && e.avancement}<div class="barre fine"><span style:width="{e.avancement.pct}%"></span></div>{/if}
					</a>
				{/each}
			</div>
		{:else}
			<div class="nh-card lignes">
				{#each elements as e (e.titre.id)}
					<a href="/films/titre/{e.titre.id}" class="l-ligne">
						<Affiche titre={e.titre.titre} image={e.titre.affiche} taille="mini" />
						<span class="l-txt"><span class="l-nom">{e.titre.titre}</span><span class="c-meta">{meta(e)}</span></span>
						<span class="l-extra">{extra(e)}</span>
						<StatusPill pastille={PASTILLES_WATCHLIST[e.statut]} />
					</a>
				{/each}
			</div>
		{/if}
	</section>
</main>

{#if ajout}<AjouterTitre idees={data.idees} configure={data.tmdbConfigure} onfermer={() => ouvrirAjout(false)} />{/if}

<style>
	.ligne {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16px;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.surtitre {
		font: var(--type-overline);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--fg-brand);
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
	.bloc {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	h2 {
		margin: 0;
		font-size: 22px;
		line-height: 1.3;
		font-weight: 700;
		color: var(--fg-1);
	}
	.resume {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr));
		gap: 16px;
	}
	.r-carte {
		display: flex;
		gap: 16px;
		padding: 16px;
		align-items: stretch;
	}
	.r-affiche {
		flex: none;
		text-decoration: none;
	}
	.r-corps {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.r-nom {
		font-size: 16px;
		font-weight: 700;
		color: var(--fg-1);
		text-decoration: none;
	}
	.r-av {
		font-size: 14px;
		color: var(--fg-3);
	}
	.barre {
		height: 6px;
		border-radius: 999px;
		background: var(--surface-3);
		overflow: hidden;
		margin-top: 2px;
	}
	.barre span {
		display: block;
		height: 100%;
		background: var(--apricot-300);
		border-radius: 999px;
		transition: width 180ms var(--ease-out);
	}
	.barre.fine {
		height: 4px;
		margin-top: 4px;
	}
	.r-pied {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-top: auto;
	}
	.r-suivant {
		font-size: 13px;
		color: var(--fg-2);
	}
	.filtres {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 16px;
	}
	.genres {
		display: flex;
		gap: 8px;
	}
	.filtres .nh-tabs {
		max-width: 100%;
		overflow-x: auto;
	}
	.filtres .nh-tabs__tab {
		white-space: nowrap;
	}
	.espace {
		flex: 1 1 200px;
	}
	.vues {
		display: inline-flex;
		gap: 2px;
		padding: 4px;
		border-radius: 999px;
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
	}
	.vues .on {
		background: var(--surface-3);
		color: var(--fg-1);
	}
	.grille {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
		gap: 28px 20px;
	}
	.carte {
		display: flex;
		flex-direction: column;
		gap: 4px;
		color: inherit;
		text-decoration: none;
		min-width: 0;
	}
	.c-affiche {
		margin-bottom: 6px;
		transition: transform 180ms var(--ease-out);
	}
	.carte:hover .c-affiche {
		transform: translateY(-3px);
	}
	.c-statut {
		position: absolute;
		top: 10px;
		left: 10px;
		z-index: 1;
		border-radius: 999px;
		background: var(--night-900);
	}
	.c-type {
		position: absolute;
		top: 12px;
		right: 12px;
		z-index: 1;
		font-size: 16px;
		color: rgba(245, 240, 242, 0.85);
		text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
	}
	.c-nom {
		font-size: 15px;
		font-weight: 500;
		color: var(--fg-1);
		line-height: 1.3;
	}
	.c-meta {
		font-size: 13px;
		color: var(--fg-3);
	}
	.lignes {
		display: flex;
		flex-direction: column;
		padding: 8px;
	}
	.l-ligne {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 10px 12px;
		border-radius: 12px;
		color: inherit;
		text-decoration: none;
		transition: background 120ms;
	}
	.l-ligne:hover {
		background: var(--surface-2);
	}
	.l-txt {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.l-nom {
		font-size: 16px;
		font-weight: 500;
		color: var(--fg-1);
	}
	.l-extra {
		flex: none;
		width: 160px;
		font-size: 13px;
		color: var(--fg-2);
	}
	.vide {
		padding: 48px 24px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		text-align: center;
	}
	.v-titre {
		margin: 0;
		font-size: 18px;
		font-weight: 500;
		color: var(--fg-1);
	}
	.v-txt {
		margin: 0;
		font-size: 14px;
		color: var(--fg-3);
	}
	@media (max-width: 559px) {
		.grille {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 20px 12px;
		}
		.l-extra {
			display: none;
		}
	}
</style>
