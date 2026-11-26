import { fail } from '@sveltejs/kit';
import { exigerMembre, lecteur } from '#lib/server/garde.ts';
import { config } from '#lib/server/config.ts';
import { tousLesMembres } from '#lib/server/membres.ts';
import { entier, ids, texte } from '#lib/server/formulaires.ts';
import { titreDepuisTmdb, titreParId } from '#lib/server/films.ts';
import { ErreurTmdb } from '#lib/server/tmdb.ts';
import {
	ajouterCommune,
	aujourdhui,
	basculerPresence,
	basculerVote,
	caserTitre,
	choisirTitreSoiree,
	donneesCommune,
	entreeCommune,
	ideesCommune,
	programmerSoiree,
	soireeParId,
	supprimerSoiree
} from '#lib/server/commune.ts';
import { estHeure, estJour, jourCourt } from '#lib/commune.ts';

// Watch list commune : lisible sans connexion (prénoms seuls), modifiable par les membres.
export const load = ({ locals }) => {
	const moi = lecteur(locals);
	const membres = tousLesMembres();
	const prenom = (id: number) => (membres.find((m) => m.id === id)?.nom ?? 'un pote').split(' ')[0];
	return {
		...donneesCommune(moi),
		idees: moi ? ideesCommune(prenom) : [],
		tmdbConfigure: config.tmdb.configure
	};
};


/** La soirée passée dans le formulaire. */
const soireeDe = (f: FormData) => soireeParId(entier(f, 'soiree'));

/** Titre de la liste commune passé dans le formulaire (vide : aucun). */
const titreCommunDe = (f: FormData) => {
	const id = entier(f, 'titreId');
	return id && entreeCommune(id) ? titreParId(id) : undefined;
};

export const actions = {
	/** Ajoute un titre (résultat TMDB ou idée) à la liste, avec qui l'a déjà vu et une soirée. */
	ajouter: async ({ request, locals }) => {
		const moi = exigerMembre(locals);
		const f = await request.formData();
		let titre = titreParId(entier(f, 'titreId'));
		if (!titre) {
			const type = texte(f, 'type');
			const tmdbId = entier(f, 'tmdbId');
			if ((type !== 'film' && type !== 'serie') || !tmdbId || tmdbId < 1) return fail(400, { erreur: 'Titre inconnu.' });
			try {
				titre = await titreDepuisTmdb(type, tmdbId);
			} catch (e) {
				return fail(502, { erreur: e instanceof ErreurTmdb ? e.message : 'TMDB ne répond pas.' });
			}
		}
		const membres = tousLesMembres();
		const dejaVu = ids(f, 'dejaVu').filter((id) => membres.some((m) => m.id === id));
		ajouterCommune(moi.id, titre.id, dejaVu);
		const soiree = soireeDe(f);
		if (soiree && !soiree.titreId && soiree.date >= aujourdhui()) choisirTitreSoiree(soiree.id, titre.id);
		return { ok: `${titre.titre} ajouté à la liste`, titreId: titre.id };
	},

	voter: async ({ request, locals }) => {
		const moi = exigerMembre(locals);
		const f = await request.formData();
		const id = entier(f, 'titreId');
		if (!id || !entreeCommune(id)) return fail(404, { erreur: 'Ce titre n’est pas dans la liste.' });
		const r = basculerVote(moi.id, id);
		if (r === 'deja-vu') return fail(400, { erreur: 'Vous l’avez déjà vu ensemble.' });
		return { ok: null, vote: r === 'vote' };
	},

	/** « Je viens » (ou plus). */
	venir: async ({ request, locals }) => {
		const moi = exigerMembre(locals);
		const soiree = soireeDe(await request.formData());
		if (!soiree) return fail(404, { erreur: 'Soirée introuvable.' });
		if (soiree.date < aujourdhui()) return fail(400, { erreur: 'Cette soirée est passée.' });
		return { ok: null, vient: basculerPresence(soiree.id, moi.id) };
	},

	/** Programme une soirée (ou la modifie si `soiree` est donné). */
	programmer: async ({ request, locals }) => {
		const moi = exigerMembre(locals);
		const f = await request.formData();
		const date = texte(f, 'date', 10);
		const heure = texte(f, 'heure', 5) || '21:00';
		const lieu = texte(f, 'lieu', 60) || 'En ligne';
		if (!estJour(date)) return fail(400, { erreur: 'Choisis une date.' });
		if (!estHeure(heure)) return fail(400, { erreur: 'Heure inconnue.' });
		const existante = entier(f, 'soiree') ? soireeDe(f) : undefined;
		if (entier(f, 'soiree') && !existante) return fail(404, { erreur: 'Soirée introuvable.' });
		if (date < aujourdhui() && date !== existante?.date) return fail(400, { erreur: 'Cette date est passée.' });
		const titre = titreCommunDe(f);
		const r = programmerSoiree(moi.id, { date, heure, lieu, titreId: titre?.id ?? null, note: texte(f, 'note', 120) || null }, existante?.id);
		if ('erreur' in r) return fail(400, { erreur: r.erreur });
		return { ok: `${existante ? 'Soirée modifiée' : 'Soirée programmée'} : ${jourCourt(date)}`, soireeId: r.soiree.id };
	},

	/** « Changer de titre » ou une suggestion « Les plus votés du moment ». Vide : à choisir. */
	choisir: async ({ request, locals }) => {
		exigerMembre(locals);
		const f = await request.formData();
		const soiree = soireeDe(f);
		if (!soiree) return fail(404, { erreur: 'Soirée introuvable.' });
		const titre = titreCommunDe(f);
		if (entier(f, 'titreId') && !titre) return fail(404, { erreur: 'Ce titre n’est pas dans la liste.' });
		choisirTitreSoiree(soiree.id, titre?.id ?? null);
		return { ok: titre ? `${titre.titre} choisi pour ${jourCourt(soiree.date)}` : 'Titre à choisir' };
	},

	/** Calendrier : un titre glissé sur une date. */
	caser: async ({ request, locals }) => {
		const moi = exigerMembre(locals);
		const f = await request.formData();
		const date = texte(f, 'date', 10);
		const titre = titreCommunDe(f);
		if (!estJour(date) || date < aujourdhui()) return fail(400, { erreur: 'Cette date est passée.' });
		if (!titre) return fail(404, { erreur: 'Ce titre n’est pas dans la liste.' });
		return { ok: `${titre.titre} : ${jourCourt(date)}`, soireeId: caserTitre(moi.id, date, titre.id) };
	},

	supprimerSoiree: async ({ request, locals }) => {
		exigerMembre(locals);
		const soiree = soireeDe(await request.formData());
		if (!soiree) return fail(404, { erreur: 'Soirée introuvable.' });
		supprimerSoiree(soiree.id);
		return { ok: `Soirée du ${jourCourt(soiree.date)} annulée` };
	}
};
