import { error, fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.ts';
import { exigerMembre } from '#lib/server/garde.ts';
import { tousLesMembres } from '#lib/server/membres.ts';
import { entier, ids, parmi, texte } from '#lib/server/formulaires.ts';
import { cocherEpisodes, definirStatut, episodesSaison, episodesVusDe, saisonsDe, titreAJour, titreParId, versVue } from '#lib/server/films.ts';
import { avancement, ORDRE_WL } from '#lib/watchlist.ts';

// Fiche d'un film ou d'une série : réservée aux membres connectés.
export const load = async ({ params, url, locals }) => {
	const moi = exigerMembre(locals);
	const trouve = titreParId(Number(params.id));
	if (!trouve) error(404, 'Titre introuvable');
	const t = await titreAJour(trouve);
	const vue = versVue(t);
	const base = db();
	const lignes = base.select().from(schema.watchlist).where(eq(schema.watchlist.titreId, t.id)).all();
	const membres = tousLesMembres();
	const vus = episodesVusDe(
		membres.map((m) => m.id),
		[t.id]
	);
	const avDe = (id: number) => (t.type === 'serie' ? avancement(vue.saisons, vus.get(id)?.get(t.id) ?? []) : null);
	const mienne = lignes.find((l) => l.membreId === moi.id) ?? null;
	const monAv = avDe(moi.id);

	// Saison affichée : celle demandée, sinon celle du prochain épisode.
	const demandee = Number(url.searchParams.get('saison'));
	const saison = vue.saisons.find((s) => s.numero === demandee)?.numero ?? monAv?.saison ?? vue.saisons[0]?.numero ?? null;
	const episodes = saison ? await episodesSaison(t, saison) : [];
	const cochés = new Set((vus.get(moi.id)?.get(t.id) ?? []).filter((v) => v.saison === saison).map((v) => v.episode));

	const autres = membres.filter((m) => m.id !== moi.id);
	return {
		titre: vue,
		moi: mienne ? { statut: mienne.statut, note: mienne.note, avis: mienne.avis } : null,
		saison,
		episodes: episodes.map((e) => ({ ...e, vu: cochés.has(e.numero) })),
		potes: autres
			.map((m) => {
				const l = lignes.find((x) => x.membreId === m.id);
				return l ? { membre: m, statut: l.statut, note: l.note, avis: l.avis, ajouteLe: l.ajouteLe, avancement: avDe(m.id) } : null;
			})
			.filter((p) => p !== null),
		sansLui: autres.filter((m) => !lignes.some((l) => l.membreId === m.id)).map((m) => m.nom.split(' ')[0]),
		membres: autres.map((m) => ({ id: m.id, nom: m.nom, photo: m.photo }))
	};
};

const titreDe = async (params: { id: string }) => {
	const t = titreParId(Number(params.id));
	if (!t) error(404, 'Titre introuvable');
	return t;
};
const ligneDe = (membreId: number, titreId: number) =>
	db()
		.select()
		.from(schema.watchlist)
		.where(and(eq(schema.watchlist.membreId, membreId), eq(schema.watchlist.titreId, titreId)))
		.get();

export const actions = {
	statut: async ({ request, locals, params }) => {
		const moi = exigerMembre(locals);
		const t = await titreDe(params);
		const statut = parmi(texte(await request.formData(), 'statut'), ORDRE_WL);
		if (!statut) return fail(400, { erreur: 'Statut inconnu.' });
		definirStatut(moi.id, t.id, statut);
		return { ok: null };
	},

	/** Note de 1 à 5 (0 l'efface). Noter un titre absent de la liste l'ajoute en « Vu ». */
	note: async ({ request, locals, params }) => {
		const moi = exigerMembre(locals);
		const t = await titreDe(params);
		const n = entier(await request.formData(), 'note');
		if (n === null || n < 0 || n > 5) return fail(400, { erreur: 'Note de 1 à 5.' });
		if (!ligneDe(moi.id, t.id)) definirStatut(moi.id, t.id, 'vu');
		db()
			.update(schema.watchlist)
			.set({ note: n || null, majLe: Date.now() })
			.where(and(eq(schema.watchlist.membreId, moi.id), eq(schema.watchlist.titreId, t.id)))
			.run();
		return { ok: null };
	},

	avis: async ({ request, locals, params }) => {
		const moi = exigerMembre(locals);
		const t = await titreDe(params);
		if (!ligneDe(moi.id, t.id)) return fail(400, { erreur: 'Ajoute d’abord le titre à ta liste.' });
		const avis = texte(await request.formData(), 'avis', 500);
		db()
			.update(schema.watchlist)
			.set({ avis: avis || null, majLe: Date.now() })
			.where(and(eq(schema.watchlist.membreId, moi.id), eq(schema.watchlist.titreId, t.id)))
			.run();
		return { ok: avis ? 'Avis publié' : 'Avis retiré' };
	},

	retirer: async ({ locals, params }) => {
		const moi = exigerMembre(locals);
		const t = await titreDe(params);
		db().transaction((tx) => {
			tx.delete(schema.watchlist).where(and(eq(schema.watchlist.membreId, moi.id), eq(schema.watchlist.titreId, t.id))).run();
			tx.delete(schema.episodesVus).where(and(eq(schema.episodesVus.membreId, moi.id), eq(schema.episodesVus.titreId, t.id))).run();
		});
		return { ok: 'Retiré de ta liste' };
	},

	/** Coche ou décoche un épisode (et ceux d'avant ou d'après, comme dans le prototype). */
	episode: async ({ request, locals, params }) => {
		const moi = exigerMembre(locals);
		const t = await titreDe(params);
		const f = await request.formData();
		const saison = entier(f, 'saison');
		const episode = entier(f, 'episode');
		if (t.type !== 'serie' || !saison || !episode) return fail(400, { erreur: 'Épisode inconnu.' });
		if (!cocherEpisodes(moi.id, t, saison, episode, texte(f, 'vu') === '1')) return fail(400, { erreur: 'Épisode inconnu.' });
		return { ok: null };
	},

	/** « Toute la saison est vue ». */
	saison: async ({ request, locals, params }) => {
		const moi = exigerMembre(locals);
		const t = await titreDe(params);
		const numero = entier(await request.formData(), 'saison');
		const s = saisonsDe(t).find((x) => x.numero === numero);
		if (t.type !== 'serie' || !s) return fail(400, { erreur: 'Saison inconnue.' });
		cocherEpisodes(moi.id, t, s.numero, s.episodes, true);
		return { ok: `Saison ${s.numero} vue` };
	},

	conseiller: async ({ request, locals, params }) => {
		const moi = exigerMembre(locals);
		const t = await titreDe(params);
		const f = await request.formData();
		const membres = tousLesMembres();
		const pour = ids(f, 'a').filter((id) => id !== moi.id && membres.some((m) => m.id === id));
		if (!pour.length) return fail(400, { erreur: 'Choisis au moins un pote.' });
		const message = texte(f, 'message', 300) || null;
		db().transaction((tx) => {
			for (const aId of pour) tx.insert(schema.conseils).values({ deId: moi.id, aId, titreId: t.id, message }).run();
		});
		const noms = pour.map((id) => membres.find((m) => m.id === id)!.nom.split(' ')[0]);
		return { ok: `Conseillé à ${noms.length > 1 ? `${noms.slice(0, -1).join(', ')} et ${noms.at(-1)}` : noms[0]}` };
	}
};
