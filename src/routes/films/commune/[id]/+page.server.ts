import { error, fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.ts';
import { exigerMembre, lecteur } from '#lib/server/garde.ts';
import { entier, parmi, texte } from '#lib/server/formulaires.ts';
import { episodesSaison, titreAJour, titreParId } from '#lib/server/films.ts';
import { definirDejaVu, definirStatutCommun, donneesCommune, entreeCommune, regarderJusqua, retirerCommune } from '#lib/server/commune.ts';
import { ORDRE_WL } from '#lib/watchlist.ts';

// Fiche d'un titre de la Watch list commune : lisible sans connexion, modifiable par les membres.
export const load = async ({ params, url, locals }) => {
	const moi = lecteur(locals);
	const trouve = titreParId(Number(params.id));
	if (!trouve || !entreeCommune(trouve.id)) error(404, 'Ce titre n’est pas dans la Watch list commune');
	const t = await titreAJour(trouve);
	const commun = donneesCommune(moi);
	const entree = commun.liste.find((e) => e.titre.id === t.id)!;
	const saisons = entree.titre.saisons;

	// Saison affichée : celle demandée, sinon celle du prochain épisode à voir ensemble.
	const demandee = Number(url.searchParams.get('saison'));
	const saison = saisons.find((s) => s.numero === demandee)?.numero ?? entree.avancement?.saison ?? saisons[0]?.numero ?? null;
	const episodes = t.type === 'serie' && saison ? await episodesSaison(t, saison) : [];
	const vus = new Set(
		db()
			.select()
			.from(schema.episodesVusEnsemble)
			.where(and(eq(schema.episodesVusEnsemble.titreId, t.id), eq(schema.episodesVusEnsemble.saison, saison ?? 0)))
			.all()
			.map((v) => v.episode)
	);
	const maLigne = moi
		? db()
				.select({ statut: schema.watchlist.statut })
				.from(schema.watchlist)
				.where(and(eq(schema.watchlist.membreId, moi.id), eq(schema.watchlist.titreId, t.id)))
				.get()
		: undefined;
	return {
		...commun,
		entree,
		saison,
		episodes: episodes.map((e) => ({ numero: e.numero, nom: e.nom, vu: vus.has(e.numero) })),
		maWatchlist: maLigne?.statut ?? null
	};
};

const titreDe = (params: { id: string }) => {
	const t = titreParId(Number(params.id));
	if (!t || !entreeCommune(t.id)) error(404, 'Ce titre n’est pas dans la Watch list commune');
	return t;
};

export const actions = {
	statut: async ({ request, locals, params }) => {
		exigerMembre(locals);
		const t = titreDe(params);
		const statut = parmi(texte(await request.formData(), 'statut'), ORDRE_WL);
		if (!statut || (statut === 'cours' && t.type === 'film')) return fail(400, { erreur: 'Statut inconnu.' });
		definirStatutCommun(t, statut);
		return { ok: statut === 'vu' ? 'Vu ensemble, bravo la bande' : null };
	},

	/** Touche un épisode : vu ensemble, avec tous ceux d'avant (0 : rien vu dans la saison). */
	episode: async ({ request, locals, params }) => {
		exigerMembre(locals);
		const t = titreDe(params);
		const f = await request.formData();
		const saison = entier(f, 'saison');
		const episode = entier(f, 'episode');
		if (saison === null || episode === null || !regarderJusqua(t, saison, episode)) return fail(400, { erreur: 'Épisode inconnu.' });
		return { ok: entreeCommune(t.id)?.statut === 'vu' ? 'Série terminée, bravo la bande' : null };
	},

	/** « Je l'ai déjà vu ». */
	dejaVu: async ({ request, locals, params }) => {
		const moi = exigerMembre(locals);
		const t = titreDe(params);
		definirDejaVu(moi.id, t.id, texte(await request.formData(), 'vu') === '1');
		return { ok: null };
	},

	retirer: async ({ locals, params }) => {
		exigerMembre(locals);
		const t = titreDe(params);
		retirerCommune(t.id);
		redirect(303, '/films');
	}
};
