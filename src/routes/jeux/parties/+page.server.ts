import { fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.ts';
import { exigerMembre, lecteur } from '#lib/server/garde.ts';
import { tousLesMembres } from '#lib/server/membres.ts';
import { entier, ids, parmi, texte } from '#lib/server/formulaires.ts';
import { ORDRE_PARTIE } from '#lib/libelles.ts';
import { tourActuel } from '#lib/parties.ts';

// Lisible sans connexion (lecture seule) ; toutes les actions demandent un membre.
export const load = ({ locals }) => {
	const moi = lecteur(locals);
	const base = db();
	const participations = base.select().from(schema.participations).all();
	const sessions = base.select().from(schema.sessionsPartie).all();
	// Image du jeu (liste des jeux) pour les vignettes et le fond flou.
	const images = new Map<number, string>();
	for (const j of base.select({ id: schema.jeux.id, image: schema.jeux.image }).from(schema.jeux).all()) if (j.image) images.set(j.id, j.image);
	const parties = base
		.select()
		.from(schema.parties)
		.all()
		.map((p) => ({
			id: p.id,
			nom: p.nom,
			jeu: p.jeuNom,
			image: (p.jeuId && images.get(p.jeuId)) || null,
			statut: p.statut,
			toursMax: p.toursMax,
			gagnantId: p.gagnantId,
			joueurs: participations.filter((x) => x.partieId === p.id).map((x) => x.membreId),
			sessions: sessions
				.filter((s) => s.partieId === p.id)
				.map((s) => ({ id: s.id, date: s.date, tourAtteint: s.tourAtteint, note: s.note }))
		}));
	// Suggestions pour le champ « Jeu » : les jeux de la liste et ceux déjà utilisés.
	const titres = base.select({ titre: schema.jeux.titre }).from(schema.jeux).all().map((j) => j.titre);
	const nomsJeux = [...new Set([...titres, ...parties.map((p) => p.jeu)])].sort((a, b) => a.localeCompare(b, 'fr'));
	return { parties, membres: tousLesMembres({ visiteur: !moi }), nomsJeux };
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const actions = {
	enregistrer: async ({ request, locals }) => {
		exigerMembre(locals);
		const f = await request.formData();
		const nom = texte(f, 'nom', 120);
		const jeuNom = texte(f, 'jeu', 120);
		const joueurs = ids(f, 'joueurs');
		if (!nom || !jeuNom) return fail(400, { erreur: 'Donne un nom à la partie et choisis un jeu.' });
		if (!joueurs.length) return fail(400, { erreur: 'Choisis au moins un joueur.' });
		const statut = parmi(texte(f, 'statut'), ORDRE_PARTIE) ?? 'en_cours';
		const max = entier(f, 'toursMax');
		const gagnant = entier(f, 'gagnantId');
		const id = entier(f, 'id');
		const base = db();
		// Relie la partie au jeu de la liste quand le nom correspond.
		const jeu = base.select({ id: schema.jeux.id }).from(schema.jeux).where(eq(schema.jeux.titre, jeuNom)).get();
		const valeurs = {
			nom,
			jeuNom,
			jeuId: jeu?.id ?? null,
			statut,
			toursMax: max && max > 0 ? max : null,
			gagnantId: statut === 'terminee' && gagnant && joueurs.includes(gagnant) ? gagnant : null
		};
		let partieId = id;
		base.transaction((tx) => {
			if (partieId) tx.update(schema.parties).set(valeurs).where(eq(schema.parties.id, partieId)).run();
			else partieId = tx.insert(schema.parties).values(valeurs).returning({ id: schema.parties.id }).get().id;
			tx.delete(schema.participations).where(eq(schema.participations.partieId, partieId)).run();
			for (const membreId of joueurs)
				tx.insert(schema.participations).values({ partieId, membreId }).onConflictDoNothing().run();
		});
		return { ok: id ? 'Partie modifiée' : 'Partie créée', id: partieId };
	},

	statut: async ({ request, locals }) => {
		exigerMembre(locals);
		const f = await request.formData();
		const id = entier(f, 'id');
		const statut = parmi(texte(f, 'statut'), ORDRE_PARTIE);
		if (!id || !statut) return fail(400, { erreur: 'Statut inconnu.' });
		const maj = statut === 'terminee' ? { statut } : { statut, gagnantId: null };
		db().update(schema.parties).set(maj).where(eq(schema.parties.id, id)).run();
		return { ok: null };
	},

	supprimer: async ({ request, locals }) => {
		exigerMembre(locals);
		const id = entier(await request.formData(), 'id');
		if (!id) return fail(400, { erreur: 'Partie inconnue.' });
		db().delete(schema.parties).where(eq(schema.parties.id, id)).run();
		return { ok: 'Partie supprimée' };
	},

	ajouterSession: async ({ request, locals }) => {
		exigerMembre(locals);
		const f = await request.formData();
		const partieId = entier(f, 'partieId');
		const date = texte(f, 'date', 10);
		const tour = entier(f, 'tourAtteint');
		if (!partieId || !DATE.test(date) || !tour || tour < 1)
			return fail(400, { erreur: 'Indique une date et le tour atteint.' });
		const base = db();
		if (!base.select({ id: schema.parties.id }).from(schema.parties).where(eq(schema.parties.id, partieId)).get())
			return fail(404, { erreur: 'Partie introuvable.' });
		const actuel = tourActuel(
			base.select().from(schema.sessionsPartie).where(eq(schema.sessionsPartie.partieId, partieId)).all()
		);
		if (tour <= actuel) return fail(400, { erreur: `La partie est déjà au tour ${actuel}.` });
		base
			.insert(schema.sessionsPartie)
			.values({ partieId, date, tourAtteint: tour, note: texte(f, 'note', 500) || null })
			.run();
		return { ok: 'Session ajoutée' };
	},

	supprimerSession: async ({ request, locals }) => {
		exigerMembre(locals);
		const f = await request.formData();
		const id = entier(f, 'id');
		const partieId = entier(f, 'partieId');
		if (!id || !partieId) return fail(400, { erreur: 'Session inconnue.' });
		db()
			.delete(schema.sessionsPartie)
			.where(and(eq(schema.sessionsPartie.id, id), eq(schema.sessionsPartie.partieId, partieId)))
			.run();
		return { ok: 'Session supprimée' };
	}
};
