import { fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.ts';
import { exigerMembre, lecteur } from '#lib/server/garde.ts';
import { tousLesMembres } from '#lib/server/membres.ts';
import { entier, ids, parmi, texte } from '#lib/server/formulaires.ts';
import { ORDRE_PARTIE } from '#lib/libelles.ts';
import { tourActuel, type EquipePartie } from '#lib/parties.ts';
import { lireEquipes } from '#lib/server/equipes.ts';

// Lisible sans connexion (lecture seule) ; toutes les actions demandent un membre.
export const load = ({ locals }) => {
	const moi = lecteur(locals);
	const base = db();
	const participations = base.select().from(schema.participations).all();
	const equipes = base.select().from(schema.equipes).orderBy(schema.equipes.ordre, schema.equipes.id).all();
	const gagnants = base.select().from(schema.gagnantsPartie).all();
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
			joueurs: participations.filter((x) => x.partieId === p.id).map((x) => x.membreId),
			equipes: equipes
				.filter((e) => e.partieId === p.id)
				.map(
					(e): EquipePartie => ({
						id: e.id,
						nom: e.nom,
						couleur: e.couleur as EquipePartie['couleur'],
						gagnante: e.gagnante,
						membres: participations.filter((x) => x.equipeId === e.id).map((x) => x.membreId)
					})
				),
			gagnants: gagnants.filter((g) => g.partieId === p.id).map((g) => g.membreId),
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
		const lues = lireEquipes(texte(f, 'equipes', 20_000), joueurs);
		if ('erreur' in lues) return fail(400, { erreur: lues.erreur });
		const terminee = statut === 'terminee';
		// Vainqueurs : des équipes gagnantes en équipes, sinon des joueurs (plusieurs = égalité).
		const equipes = lues.equipes.map((e) => ({ ...e, gagnante: terminee && e.gagnante }));
		const gagnants = terminee && !equipes.length ? ids(f, 'gagnants').filter((g) => joueurs.includes(g)) : [];
		const id = entier(f, 'id');
		const base = db();
		// Relie la partie au jeu de la liste quand le nom correspond.
		const jeu = base.select({ id: schema.jeux.id }).from(schema.jeux).where(eq(schema.jeux.titre, jeuNom)).get();
		const valeurs = {
			nom,
			jeuNom,
			jeuId: jeu?.id ?? null,
			statut,
			toursMax: max && max > 0 ? max : null
		};
		let partieId = id;
		base.transaction((tx) => {
			if (partieId) tx.update(schema.parties).set(valeurs).where(eq(schema.parties.id, partieId)).run();
			else partieId = tx.insert(schema.parties).values(valeurs).returning({ id: schema.parties.id }).get().id;
			tx.delete(schema.participations).where(eq(schema.participations.partieId, partieId)).run();
			tx.delete(schema.equipes).where(eq(schema.equipes.partieId, partieId)).run();
			tx.delete(schema.gagnantsPartie).where(eq(schema.gagnantsPartie.partieId, partieId)).run();
			const equipeDe = new Map<number, number>();
			equipes.forEach((e, ordre) => {
				const equipeId = tx
					.insert(schema.equipes)
					.values({ partieId: partieId!, nom: e.nom, couleur: e.couleur, ordre, gagnante: e.gagnante })
					.returning({ id: schema.equipes.id })
					.get().id;
				for (const m of e.membres) equipeDe.set(m, equipeId);
			});
			for (const membreId of joueurs)
				tx.insert(schema.participations).values({ partieId, membreId, equipeId: equipeDe.get(membreId) ?? null }).onConflictDoNothing().run();
			for (const membreId of gagnants) tx.insert(schema.gagnantsPartie).values({ partieId, membreId }).run();
		});
		return { ok: id ? 'Partie modifiée' : 'Partie créée', id: partieId };
	},

	statut: async ({ request, locals }) => {
		exigerMembre(locals);
		const f = await request.formData();
		const id = entier(f, 'id');
		const statut = parmi(texte(f, 'statut'), ORDRE_PARTIE);
		if (!id || !statut) return fail(400, { erreur: 'Statut inconnu.' });
		db().transaction((tx) => {
			tx.update(schema.parties).set({ statut }).where(eq(schema.parties.id, id)).run();
			// Une partie qui reprend n'a plus de vainqueur.
			if (statut !== 'terminee') {
				tx.delete(schema.gagnantsPartie).where(eq(schema.gagnantsPartie.partieId, id)).run();
				tx.update(schema.equipes).set({ gagnante: false }).where(eq(schema.equipes.partieId, id)).run();
			}
		});
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
