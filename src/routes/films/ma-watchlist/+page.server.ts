import { fail } from '@sveltejs/kit';
import { exigerMembre } from '#lib/server/garde.ts';
import { config } from '#lib/server/config.ts';
import { tousLesMembres } from '#lib/server/membres.ts';
import { entier, parmi, texte } from '#lib/server/formulaires.ts';
import { cocherEpisodes, definirStatut, idees, listesDe, titreDepuisTmdb, titreParId } from '#lib/server/films.ts';
import { ErreurTmdb } from '#lib/server/tmdb.ts';
import { ORDRE_WL, statsWatchlist } from '#lib/watchlist.ts';

// Ma watchlist : réservée aux membres connectés (fermée en lecture seule).
export const load = ({ locals }) => {
	const moi = exigerMembre(locals);
	const membres = tousLesMembres();
	const prenom = (id: number) => (membres.find((m) => m.id === id)?.nom ?? 'un pote').split(' ')[0];
	const liste = listesDe([moi.id]).get(moi.id) ?? [];
	return {
		liste,
		stats: statsWatchlist(liste.map((e) => ({ type: e.titre.type, statut: e.statut, duree: e.titre.duree, totalEpisodes: e.totalEpisodes, episodesVus: e.episodesVus }))),
		idees: idees(moi.id, prenom),
		tmdbConfigure: config.tmdb.configure
	};
};

export const actions = {
	/** Ajoute un résultat de recherche TMDB (ou change son statut s'il est déjà là). */
	ajouter: async ({ request, locals }) => {
		const moi = exigerMembre(locals);
		const f = await request.formData();
		const statut = parmi(texte(f, 'statut'), ORDRE_WL) ?? 'avoir';
		const type = parmi(texte(f, 'type'), ['film', 'serie'] as const);
		const tmdbId = entier(f, 'tmdbId');
		let titre = titreParId(entier(f, 'titreId'));
		if (!titre) {
			if (!type || !tmdbId || tmdbId < 1) return fail(400, { erreur: 'Titre inconnu.' });
			try {
				titre = await titreDepuisTmdb(type, tmdbId);
			} catch (e) {
				return fail(502, { erreur: e instanceof ErreurTmdb ? e.message : 'TMDB ne répond pas.' });
			}
		}
		definirStatut(moi.id, titre.id, statut);
		return { ok: null, titreId: titre.id, titre: titre.titre };
	},

	/** « Épisode vu » sur la carte « Tu en es là » : coche le prochain épisode. */
	episodeVu: async ({ request, locals }) => {
		const moi = exigerMembre(locals);
		const f = await request.formData();
		const titre = titreParId(entier(f, 'titreId'));
		const saison = entier(f, 'saison');
		const episode = entier(f, 'episode');
		if (!titre || titre.type !== 'serie' || !saison || !episode) return fail(400, { erreur: 'Épisode inconnu.' });
		if (!cocherEpisodes(moi.id, titre, saison, episode, true)) return fail(400, { erreur: 'Épisode inconnu.' });
		return { ok: null };
	}
};
