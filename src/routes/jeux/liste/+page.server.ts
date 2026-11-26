import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.ts';
import { exigerMembre, lecteur } from '#lib/server/garde.ts';
import { tousLesMembres } from '#lib/server/membres.ts';
import { config } from '#lib/server/config.ts';
import { entier, ids, parmi, texte, urlImage } from '#lib/server/formulaires.ts';
import { ORDRE_JEU } from '#lib/libelles.ts';

// Lisible sans connexion (lecture seule) ; toutes les actions demandent un membre.
export const load = ({ locals }) => {
	const moi = lecteur(locals);
	const base = db();
	const joueurs = base.select().from(schema.joueursJeu).all();
	const jeux = base
		.select()
		.from(schema.jeux)
		.all()
		.map((j) => ({
			id: j.id,
			titre: j.titre,
			serie: j.serie ?? '',
			image: j.image ?? '',
			statut: j.statut,
			igdbId: j.igdbId,
			steamAppId: j.steamAppId,
			ajouteLe: j.ajouteLe,
			joueurs: joueurs.filter((x) => x.jeuId === j.id).map((x) => x.membreId)
		}));
	return { jeux, membres: tousLesMembres({ visiteur: !moi }), igdbActif: !!moi && config.igdb.configure };
};

function lireJeu(f: FormData) {
	const titre = texte(f, 'titre', 120);
	if (!titre) return null;
	return {
		titre,
		serie: texte(f, 'serie', 80) || null,
		image: urlImage(texte(f, 'image', 500)),
		statut: parmi(texte(f, 'statut'), ORDRE_JEU) ?? 'a_faire',
		igdbId: entier(f, 'igdbId'),
		steamAppId: entier(f, 'steamAppId')
	};
}

export const actions = {
	enregistrer: async ({ request, locals }) => {
		exigerMembre(locals);
		const f = await request.formData();
		const valeurs = lireJeu(f);
		if (!valeurs) return fail(400, { erreur: 'Donne un titre au jeu.' });
		const id = entier(f, 'id');
		const joueurs = ids(f, 'joueurs');
		db().transaction((tx) => {
			let jeuId = id;
			if (jeuId) tx.update(schema.jeux).set(valeurs).where(eq(schema.jeux.id, jeuId)).run();
			else jeuId = tx.insert(schema.jeux).values(valeurs).returning({ id: schema.jeux.id }).get().id;
			tx.delete(schema.joueursJeu).where(eq(schema.joueursJeu.jeuId, jeuId)).run();
			for (const membreId of joueurs) tx.insert(schema.joueursJeu).values({ jeuId, membreId }).onConflictDoNothing().run();
		});
		return { ok: id ? 'Jeu modifié' : 'Jeu ajouté' };
	},

	statut: async ({ request, locals }) => {
		exigerMembre(locals);
		const f = await request.formData();
		const id = entier(f, 'id');
		const statut = parmi(texte(f, 'statut'), ORDRE_JEU);
		if (!id || !statut) return fail(400, { erreur: 'Statut inconnu.' });
		db().update(schema.jeux).set({ statut }).where(eq(schema.jeux.id, id)).run();
		return { ok: null };
	},

	supprimer: async ({ request, locals }) => {
		exigerMembre(locals);
		const id = entier(await request.formData(), 'id');
		if (!id) return fail(400, { erreur: 'Jeu inconnu.' });
		db().delete(schema.jeux).where(eq(schema.jeux.id, id)).run();
		return { ok: 'Jeu supprimé' };
	}
};
