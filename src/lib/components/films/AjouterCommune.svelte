<script lang="ts">
	// « Ajouter un titre » à la Watch list commune : recherche TMDB, puis qui l'a déjà vu
	// et, au choix, la soirée où le regarder. Recherche vide : ce qui traîne dans les watchlists.
	import { goto } from '$app/navigation';
	import Dialog from '#lib/components/Dialog.svelte';
	import Affiche from './Affiche.svelte';
	import { envoyer } from '#lib/actions.ts';
	import { jourCourt } from '#lib/commune.ts';
	import type { TypeTitre } from '#lib/watchlist.ts';
	import type { VueTitre } from '#lib/server/films.ts';

	interface Resultat {
		cle: string;
		titreId?: number;
		tmdbId?: number;
		type: TypeTitre;
		titre: string;
		annee: number | null;
		affiche: string | null;
		meta: string;
	}

	let {
		idees,
		configure,
		dansListe,
		membres,
		soireesLibres,
		onfermer
	}: {
		idees: { titre: VueTitre; cleTmdb: string; source: string }[];
		configure: boolean;
		/** Titres déjà dans la liste commune, par « type:tmdbId ». */
		dansListe: Record<string, number>;
		membres: { id: number; nom: string }[];
		/** Soirées à venir sans titre choisi. */
		soireesLibres: { id: number; date: string }[];
		onfermer: () => void;
	} = $props();

	let q = $state('');
	let resultats = $state<Resultat[]>([]);
	let charge = $state(false);
	let erreur = $state('');
	let choisi = $state<string | null>(null);
	let dejaVu = $state<number[]>([]);
	let soiree = $state<number | null>(null);
	let envoi = $state(false);

	const metaDe = (type: TypeTitre, annee: number | null, original?: string | null) =>
		[type === 'film' ? 'Film' : 'Série', annee, original].filter(Boolean).join(' · ');

	const listeIdees = $derived<Resultat[]>(
		idees.map((i) => ({
			cle: i.cleTmdb,
			titreId: i.titre.id,
			type: i.titre.type,
			titre: i.titre.titre,
			annee: i.titre.annee,
			affiche: i.titre.affiche,
			meta: `${metaDe(i.titre.type, i.titre.annee)} · ${i.source}`
		}))
	);
	const recherche = $derived(q.trim().length >= 2);
	const affichees = $derived(recherche ? resultats : listeIdees);

	let derniere = 0;
	$effect(() => {
		const texte = q.trim();
		if (texte.length < 2 || !configure) {
			resultats = [];
			charge = false;
			erreur = '';
			return;
		}
		charge = true;
		const minuteur = setTimeout(async () => {
			const n = ++derniere;
			try {
				const rep = await fetch(`/films/tmdb?q=${encodeURIComponent(texte)}&type=tout`);
				if (n !== derniere) return;
				if (!rep.ok) {
					erreur = (await rep.json().catch(() => null))?.message ?? 'TMDB ne répond pas.';
					resultats = [];
				} else {
					erreur = '';
					const brut = (await rep.json()) as { tmdbId: number; type: TypeTitre; titre: string; titreOriginal: string | null; annee: number | null; affiche: string | null }[];
					resultats = brut.map((r) => ({
						cle: `${r.type}:${r.tmdbId}`,
						tmdbId: r.tmdbId,
						type: r.type,
						titre: r.titre,
						annee: r.annee,
						affiche: r.affiche,
						meta: metaDe(r.type, r.annee, r.titreOriginal)
					}));
				}
			} catch {
				if (n === derniere) erreur = 'TMDB ne répond pas.';
			} finally {
				if (n === derniere) charge = false;
			}
		}, 300);
		return () => clearTimeout(minuteur);
	});

	function choisir(r: Resultat) {
		const existant = dansListe[r.cle];
		if (existant) {
			onfermer();
			goto(`/films/commune/${existant}`);
			return;
		}
		choisi = choisi === r.cle ? null : r.cle;
		dejaVu = [];
		soiree = null;
	}
	async function ajouter(r: Resultat) {
		envoi = true;
		const ok = await envoyer('?/ajouter', { titreId: r.titreId, tmdbId: r.tmdbId, type: r.type, dejaVu, soiree });
		envoi = false;
		if (ok) onfermer();
	}
	const basculer = (id: number) => (dejaVu = dejaVu.includes(id) ? dejaVu.filter((x) => x !== id) : [...dejaVu, id]);
</script>

<Dialog titre="Ajouter un titre" description="Cherche un film ou une série, on récupère l'affiche et les infos." largeur={640} {onfermer}>
	<div class="corps">
		{#if !configure}
			<p class="vide">La recherche de films et de séries n’est pas encore configurée sur le hub (clé TMDB manquante).</p>
		{/if}
		<div class="nh-input grand">
			<i class="icon-search" aria-hidden="true"></i>
			<!-- svelte-ignore a11y_autofocus -->
			<input type="search" bind:value={q} placeholder="Titre du film ou de la série" aria-label="Rechercher un titre" autofocus disabled={!configure} />
		</div>
		<div class="bloc">
			<span class="etiquette">
				{#if recherche}{charge ? 'Recherche…' : `${resultats.length} résultat${resultats.length > 1 ? 's' : ''}`}{:else}Suggestions{/if}
			</span>
			<div class="resultats" aria-live="polite" aria-busy={charge}>
				{#each affichees as r (r.cle)}
					{@const deja = !!dansListe[r.cle]}
					<div class="res" class:ouvert={choisi === r.cle}>
						<button type="button" class="ligne" aria-expanded={deja ? undefined : choisi === r.cle} onclick={() => choisir(r)}>
							<Affiche titre={r.titre} image={r.affiche} taille="mini" />
							<span class="txt"><span class="nom">{r.titre}</span><span class="meta">{r.meta}</span></span>
							{#if deja}<span class="nh-badge nh-badge--neutral">Déjà dans la liste</span>{:else}<i class="icon-chevron-{choisi === r.cle ? 'up' : 'down'} fleche" aria-hidden="true"></i>{/if}
						</button>
						{#if choisi === r.cle}
							<div class="details">
								<div class="groupe">
									<span class="nh-field__label">Déjà vu par</span>
									<div class="tags">
										{#each membres as m (m.id)}
											{@const on = dejaVu.includes(m.id)}
											<button type="button" class="nh-tag nh-tag--clickable" class:nh-tag--selected={on} aria-pressed={on} onclick={() => basculer(m.id)}>{m.nom.split(' ')[0]}</button>
										{/each}
									</div>
								</div>
								{#if soireesLibres.length}
									<div class="groupe">
										<span class="nh-field__label">Le mettre à une soirée</span>
										<div class="tags">
											<button type="button" class="nh-tag nh-tag--clickable" class:nh-tag--selected={soiree === null} aria-pressed={soiree === null} onclick={() => (soiree = null)}>Plus tard</button>
											{#each soireesLibres as s (s.id)}
												<button type="button" class="nh-tag nh-tag--clickable" class:nh-tag--selected={soiree === s.id} aria-pressed={soiree === s.id} onclick={() => (soiree = s.id)}>{jourCourt(s.date)}</button>
											{/each}
										</div>
									</div>
								{/if}
								<button type="button" class="nh-btn nh-btn--primary nh-btn--block" disabled={envoi} onclick={() => ajouter(r)}><i class="icon-plus" aria-hidden="true"></i>Ajouter à la liste</button>
							</div>
						{/if}
					</div>
				{:else}
					<p class="vide">
						{#if erreur}{erreur}{:else if recherche && !charge}Rien trouvé pour « {q.trim()} ». Vérifie l’orthographe ou essaie le titre original.{:else if !recherche}Cherche un titre pour l’ajouter.{/if}
					</p>
				{/each}
			</div>
		</div>
		<div class="pied"><span class="credit">Infos et affiches fournies par TMDB</span></div>
	</div>
</Dialog>

<style>
	.corps {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.grand {
		height: 48px;
	}
	.grand input {
		font-size: 16px;
	}
	.bloc {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.etiquette {
		font: var(--type-overline);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--fg-3);
	}
	.resultats {
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-height: 440px;
		overflow-y: auto;
		margin: 0 -8px;
		padding: 0 8px;
	}
	.res {
		border-radius: 12px;
		border: 1px solid transparent;
	}
	.res.ouvert {
		background: var(--surface-3);
		border-color: var(--border-default);
	}
	.ligne {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 8px;
		border: none;
		border-radius: 12px;
		background: none;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}
	.ligne:hover {
		background: var(--surface-3);
	}
	.txt {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.nom {
		font-size: 15px;
		font-weight: 500;
		color: var(--fg-1);
	}
	.meta {
		font-size: 13px;
		color: var(--fg-3);
	}
	.fleche {
		color: var(--fg-3);
		font-size: 16px;
	}
	.details {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 4px 12px 14px;
	}
	.groupe {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.vide {
		margin: 0;
		padding: 24px 8px;
		font-size: 14px;
		color: var(--fg-3);
	}
	.pied {
		padding-top: 12px;
		border-top: 1px solid var(--border-subtle);
	}
	.credit {
		font-size: 13px;
		color: var(--fg-3);
	}
</style>
