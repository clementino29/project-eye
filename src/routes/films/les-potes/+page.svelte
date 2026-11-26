<script lang="ts">
	// Les potes (prototype « Les potes ») : la liste d'un membre, ses stats face aux tiennes, le fil « Ça bouge ».
	import Avatar from '#lib/components/Avatar.svelte';
	import Lueur from '#lib/components/Lueur.svelte';
	import Affiche from '#lib/components/films/Affiche.svelte';
	import OngletsFilms from '#lib/components/films/OngletsFilms.svelte';
	import StatsWatchlist from '#lib/components/films/StatsWatchlist.svelte';
	import { envoyer } from '#lib/actions.ts';
	import { toasts } from '#lib/toasts.svelte.ts';
	import { artTitre } from '#lib/design/art.ts';
	import { ilYa } from '#lib/libelles.ts';
	import { LIBELLES_WL, ORDRE_WL } from '#lib/watchlist.ts';

	let { data } = $props();
	let envoi = $state<number | null>(null);

	const prenom = (nom: string) => nom.split(' ')[0];
	const choisi = $derived(data.choisi);
	type Entree = (typeof data.liste)[number];
	const meta = (e: Entree) => {
		if (e.statut === 'cours' && e.avancement) return `S${e.avancement.saison} · É${e.avancement.vusSaison} sur ${e.avancement.totalSaison}`;
		if (e.statut === 'vu' && e.note) return `Note : ${e.note}/5`;
		return [e.titre.type === 'film' ? 'Film' : 'Série', e.titre.annee].filter(Boolean).join(' · ');
	};
	const groupes = $derived(
		ORDRE_WL.map((s) => ({ s, l: LIBELLES_WL[s].pl, items: data.liste.filter((e) => e.statut === s) })).filter((g) => g.items.length)
	);
	const compte = (s: string) => data.liste.filter((e) => e.statut === s).length;
	const vedette = $derived(data.liste[0]?.titre);

	async function ajouter(e: Entree) {
		envoi = e.titre.id;
		const ok = await envoyer('/films/ma-watchlist?/ajouter', { titreId: e.titre.id, statut: 'avoir' }, { silencieux: true });
		envoi = null;
		if (ok) toasts.montrer('success', 'Ajouté à ta liste', `${e.titre.titre} · À voir`);
	}
</script>

<svelte:head><title>Les potes · Nohriancons</title></svelte:head>

{#if vedette}<Lueur jaquette={{ art: artTitre(vedette.titre), image: vedette.affiche }} />{:else}<Lueur />{/if}

<main class="nh-page" style="gap:32px">
	<header class="col">
		<span class="surtitre">Films &amp; séries</span>
		<h1>Les potes</h1>
		<p class="intro">Pique des idées dans les listes de la bande.</p>
	</header>

	<OngletsFilms actif="potes" />

	{#if !data.potes.length}
		<div class="nh-card vide"><p>Personne d’autre n’a encore de compte sur le hub.</p></div>
	{:else}
		<div class="corps">
			<aside class="cote">
				<nav class="nh-card amis" aria-label="Choisir un pote">
					{#each data.potes as p (p.id)}
						<a href="?pote={p.id}" data-sveltekit-noscroll data-sveltekit-replacestate class="ami" class:on={p.id === choisi?.id} aria-current={p.id === choisi?.id ? 'true' : undefined}>
							<Avatar nom={p.nom} src={p.photo} taille={36} />
							<span class="a-txt"><span class="a-nom">{prenom(p.nom)}</span><span class="a-res">{p.total ? `${p.cours} en cours · ${p.avoir} à voir` : 'Liste vide'}</span></span>
						</a>
					{/each}
				</nav>

				<section class="nh-card fil" aria-labelledby="fil-titre">
					<h2 id="fil-titre">Ça bouge</h2>
					{#if data.fil.length}
						<ul>
							{#each data.fil as f, i (i)}
								<li>
									<a href="/films/titre/{f.titreId}"><strong>{f.qui}</strong> {f.texte}</a>
									<span class="quand">{ilYa(f.date)}</span>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="quand">Rien de neuf pour l’instant.</p>
					{/if}
				</section>
			</aside>

			{#if choisi}
				<section class="liste" aria-label="La liste de {prenom(choisi.nom)}">
					<div class="nh-card nh-card--brand bandeau">
						<span class="b-avatar"><Avatar nom={choisi.nom} src={choisi.photo} taille={64} /></span>
						<div class="b-txt">
							<h2 class="b-titre">La liste de {prenom(choisi.nom)}</h2>
							<span class="b-nom">{choisi.nom}</span>
						</div>
						<div class="b-chiffres">
							{#each [['cours', 'en cours'], ['avoir', 'à voir'], ['vu', 'vus']] as [s, l] (s)}
								<div><span class="b-n">{compte(s)}</span><span class="b-l">{l}</span></div>
							{/each}
						</div>
					</div>

					<StatsWatchlist titre="Les stats de {prenom(choisi.nom)}" tuiles={data.stats} moi={data.mesStats} />

					{#if data.communs.length}
						<div class="communs">
							<h3 class="surtitre gris">{data.communs.length} titre{data.communs.length > 1 ? 's' : ''} en commun avec toi</h3>
							<div class="tags">{#each data.communs as c (c)}<span class="nh-tag">{c}</span>{/each}</div>
						</div>
					{/if}

					{#each groupes as g (g.s)}
						<div class="groupe">
							<h3 class="g-titre">{g.l} <span class="nh-tabs__count">{g.items.length}</span></h3>
							<div class="grille">
								{#each g.items as e (e.titre.id)}
									<div class="carte">
										<a href="/films/titre/{e.titre.id}" class="c-lien" aria-label="Voir la fiche de {e.titre.titre}">
											<Affiche titre={e.titre.titre} annee={e.titre.annee} image={e.titre.affiche} taille="potes" />
										</a>
										<div class="c-bas">
											<span class="c-txt"><a href="/films/titre/{e.titre.id}" class="c-nom">{e.titre.titre}</a><span class="c-meta">{meta(e)}</span></span>
											{#if e.mien}
												<span class="deja" role="img" aria-label="Déjà dans ta liste" title="Déjà dans ta liste"><i class="icon-check" aria-hidden="true"></i></span>
											{:else}
												<button type="button" class="nh-btn nh-btn--outline nh-btn--sm nh-iconbtn" aria-label="Ajouter {e.titre.titre} à ma liste" title="Ajouter à ma liste (à voir)" disabled={envoi === e.titre.id} onclick={() => ajouter(e)}><i class="icon-plus" aria-hidden="true"></i></button>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{:else}
						<div class="nh-card vide"><p>{prenom(choisi.nom)} n’a encore rien dans sa liste.</p></div>
					{/each}
				</section>
			{/if}
		</div>
	{/if}
</main>

<style>
	.col {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.surtitre {
		margin: 0;
		font: var(--type-overline);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--fg-brand);
	}
	.surtitre.gris {
		color: var(--fg-3);
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
	.corps {
		display: flex;
		flex-wrap: wrap;
		gap: 32px;
		align-items: flex-start;
	}
	.cote {
		flex: 1 1 260px;
		max-width: 320px;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.amis {
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.ami {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 12px;
		border-radius: 12px;
		color: var(--fg-1);
		text-decoration: none;
		transition: background 120ms;
	}
	.ami:hover {
		background: var(--surface-2);
		text-decoration: none;
	}
	.ami.on {
		background: var(--surface-accent-soft);
	}
	.a-txt {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.a-nom {
		font-weight: 500;
	}
	.a-res {
		font-size: 13px;
		color: var(--fg-3);
	}
	.fil {
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.fil h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 700;
		color: var(--fg-1);
	}
	.fil ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.fil li {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.fil a {
		font-size: 14px;
		color: var(--fg-2);
		text-decoration: none;
	}
	.fil a:hover strong {
		text-decoration: underline;
	}
	.fil strong {
		color: var(--fg-1);
		font-weight: 500;
	}
	.quand {
		margin: 0;
		font-size: 13px;
		color: var(--fg-3);
	}
	.liste {
		flex: 999 1 640px;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 28px;
	}
	.bandeau {
		padding: 24px;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 20px;
	}
	.b-avatar {
		display: inline-flex;
		border-radius: 50%;
		box-shadow: 0 0 0 3px var(--petrol-500);
	}
	.b-txt {
		flex: 1 1 240px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.b-titre {
		margin: 0;
		font-size: 28px;
		line-height: 1.3;
		font-weight: 700;
		color: var(--fg-1);
	}
	.b-nom,
	.b-l {
		font-size: 14px;
		color: var(--ink-100);
	}
	.b-l {
		font-size: 13px;
	}
	.b-chiffres {
		display: flex;
		gap: 24px;
	}
	.b-chiffres div {
		display: flex;
		flex-direction: column;
	}
	.b-n {
		font-size: 28px;
		font-weight: 700;
		color: var(--fg-1);
	}
	.communs {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.groupe {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.g-titre {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 22px;
		line-height: 1.3;
		font-weight: 700;
		color: var(--fg-1);
	}
	.grille {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 24px 16px;
	}
	.carte {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}
	.c-lien {
		text-decoration: none;
	}
	.c-bas {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}
	.c-txt {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.c-nom {
		font-size: 15px;
		font-weight: 500;
		color: var(--fg-1);
		line-height: 1.3;
		text-decoration: none;
	}
	.c-meta {
		font-size: 13px;
		color: var(--fg-3);
	}
	.deja {
		flex: none;
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		border-radius: 999px;
		background: var(--success-bg);
		color: var(--success-fg);
	}
	.vide {
		padding: 32px 24px;
		text-align: center;
		color: var(--fg-3);
	}
	.vide p {
		margin: 0;
	}
	@media (max-width: 819px) {
		.cote {
			max-width: none;
		}
	}
	@media (max-width: 559px) {
		.grille {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
