<script lang="ts">
	// Fenêtre « Ajouter un titre » : recherche TMDB (films et séries), puis À voir / En cours / Vu.
	// Recherche vide : les idées de la bande (titres conseillés, puis ceux des listes des potes).
	import Dialog from '#lib/components/Dialog.svelte';
	import StatusPill from '#lib/components/StatusPill.svelte';
	import Affiche from './Affiche.svelte';
	import { envoyer } from '#lib/actions.ts';
	import { toasts } from '#lib/toasts.svelte.ts';
	import { PASTILLES_WATCHLIST } from '#lib/design/pastilles.ts';
	import { LIBELLES_WL, type StatutWl, type TypeTitre } from '#lib/watchlist.ts';
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
		statut: StatutWl | null;
	}

	let {
		idees,
		configure,
		onfermer
	}: { idees: { titre: VueTitre; source: string }[]; configure: boolean; onfermer: () => void } = $props();

	let q = $state('');
	let genre = $state<'tout' | TypeTitre>('tout');
	let resultats = $state<Resultat[]>([]);
	let charge = $state(false);
	let erreur = $state('');
	/** Statuts choisis pendant que la fenêtre est ouverte, par clé de résultat. */
	let ajoutes = $state<Record<string, StatutWl>>({});
	let envoi = $state<string | null>(null);

	const GENRES: [typeof genre, string][] = [
		['tout', 'Tout'],
		['film', 'Films'],
		['serie', 'Séries']
	];
	const STATUTS: StatutWl[] = ['avoir', 'cours', 'vu'];

	const metaDe = (type: TypeTitre, annee: number | null, original?: string | null) =>
		[type === 'film' ? 'Film' : 'Série', annee, original].filter(Boolean).join(' · ');

	const listeIdees = $derived<Resultat[]>(
		idees
			.filter((i) => genre === 'tout' || i.titre.type === genre)
			.map((i) => ({
				cle: `l${i.titre.id}`,
				titreId: i.titre.id,
				type: i.titre.type,
				titre: i.titre.titre,
				annee: i.titre.annee,
				affiche: i.titre.affiche,
				meta: `${metaDe(i.titre.type, i.titre.annee)} · ${i.source}`,
				statut: null
			}))
	);
	const recherche = $derived(q.trim().length >= 2);
	const affichees = $derived(recherche ? resultats : listeIdees);

	let derniere = 0;
	$effect(() => {
		const texte = q.trim();
		const g = genre;
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
				const rep = await fetch(`/films/tmdb?q=${encodeURIComponent(texte)}&type=${g}`);
				if (n !== derniere) return;
				if (!rep.ok) {
					erreur = (await rep.json().catch(() => null))?.message ?? 'TMDB ne répond pas.';
					resultats = [];
				} else {
					erreur = '';
					const brut = (await rep.json()) as {
						tmdbId: number;
						type: TypeTitre;
						titre: string;
						titreOriginal: string | null;
						annee: number | null;
						affiche: string | null;
						statut: StatutWl | null;
					}[];
					resultats = brut.map((r) => ({
						cle: `${r.type}${r.tmdbId}`,
						tmdbId: r.tmdbId,
						type: r.type,
						titre: r.titre,
						annee: r.annee,
						affiche: r.affiche,
						meta: metaDe(r.type, r.annee, r.titreOriginal),
						statut: r.statut
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

	async function ajouter(r: Resultat, statut: StatutWl) {
		envoi = r.cle;
		const ok = await envoyer('/films/ma-watchlist?/ajouter', { titreId: r.titreId, tmdbId: r.tmdbId, type: r.type, statut }, { silencieux: true });
		envoi = null;
		if (ok) {
			ajoutes[r.cle] = statut;
			toasts.montrer('success', 'Ajouté à ta liste', `${r.titre} · ${LIBELLES_WL[statut].l}`);
		}
	}
</script>

<Dialog titre="Ajouter un titre" description="Cherche un film ou une série, puis dis où tu en es." largeur={680} {onfermer}>
	<div class="corps">
		{#if !configure}
			<p class="vide">La recherche de films et de séries n’est pas encore configurée sur le hub (clé TMDB manquante).</p>
		{/if}
		<div class="nh-input grand">
			<i class="icon-search" aria-hidden="true"></i>
			<!-- svelte-ignore a11y_autofocus -->
			<input type="search" bind:value={q} placeholder="Titre d'un film ou d'une série" aria-label="Rechercher un titre" autofocus disabled={!configure} />
		</div>
		<div class="genres" role="group" aria-label="Type">
			{#each GENRES as [v, l] (v)}
				<button type="button" class="nh-tag nh-tag--clickable" class:nh-tag--selected={genre === v} aria-pressed={genre === v} onclick={() => (genre = v)}>{l}</button>
			{/each}
		</div>
		<div class="bloc">
			<span class="etiquette">
				{#if recherche}{charge ? 'Recherche…' : `${resultats.length} résultat${resultats.length > 1 ? 's' : ''}`}{:else}Dans les listes de la bande{/if}
			</span>
			<div class="resultats" aria-live="polite" aria-busy={charge}>
				{#each affichees as r (r.cle)}
					{@const st = ajoutes[r.cle] ?? r.statut}
					<div class="res">
						<Affiche titre={r.titre} image={r.affiche} taille="mini" />
						<span class="txt">
							<span class="nom">{r.titre}</span>
							<span class="meta">{r.meta}</span>
						</span>
						{#if st}
							<StatusPill pastille={{ ...PASTILLES_WATCHLIST[st], l: `${ajoutes[r.cle] ? 'Ajouté' : 'Dans ta liste'} · ${PASTILLES_WATCHLIST[st].l}` }} />
						{:else}
							<span class="choix" role="group" aria-label="Ajouter {r.titre} comme">
								{#each STATUTS as s (s)}
									<button type="button" class="nh-btn nh-btn--outline nh-btn--sm" disabled={envoi === r.cle} onclick={() => ajouter(r, s)}>{LIBELLES_WL[s].l}</button>
								{/each}
							</span>
						{/if}
					</div>
				{:else}
					<p class="vide">
						{#if erreur}{erreur}{:else if recherche && !charge}Aucun titre trouvé. Vérifie l’orthographe ou essaie le titre original.{:else if !recherche}Rien à proposer pour l’instant : cherche un titre.{/if}
					</p>
				{/each}
			</div>
		</div>
		<div class="pied">
			<span class="credit">Infos et affiches fournies par TMDB</span>
			<button type="button" class="nh-btn nh-btn--secondary" onclick={onfermer}>Terminé</button>
		</div>
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
	.genres {
		display: flex;
		gap: 8px;
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
		gap: 2px;
		max-height: 420px;
		overflow-y: auto;
		margin: 0 -8px;
	}
	.res {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 10px 8px;
		border-radius: 12px;
		transition: background 120ms;
	}
	.res:hover {
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
		font-size: 16px;
		font-weight: 500;
		color: var(--fg-1);
	}
	.meta {
		font-size: 13px;
		color: var(--fg-3);
	}
	.choix {
		flex: none;
		display: flex;
		gap: 6px;
	}
	.vide {
		margin: 0;
		padding: 24px 8px;
		font-size: 14px;
		color: var(--fg-3);
	}
	.pied {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--border-subtle);
	}
	.credit {
		font-size: 13px;
		color: var(--fg-3);
	}
	@media (max-width: 559px) {
		.res {
			flex-wrap: wrap;
		}
		.choix {
			width: 100%;
			padding-left: 58px;
		}
	}
</style>
