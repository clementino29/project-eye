import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.ts';
import { exigerMembre } from '#lib/server/garde.ts';
import { config } from '#lib/server/config.ts';
import { entier } from '#lib/server/formulaires.ts';
import {
	champsFichier,
	exigerDeposant,
	fichierParId,
	fichiersRecents,
	lienValide,
	lireProjets,
	peutDeposer,
	projetParId,
	supprimerFichier,
	toucherProjets
} from '#lib/server/fichiers.ts';

// Fichiers & applis : réservé aux membres connectés (fermé en lecture seule).
export const load = ({ locals }) => {
	const moi = exigerMembre(locals);
	return { projets: lireProjets(), recents: fichiersRecents(), peutDeposer: peutDeposer(moi), tailleMax: config.fichiers.tailleMax };
};

const lireChamps = (f: FormData) => champsFichier((c) => String(f.get(c) ?? ''), f.getAll('plateforme').map(String));

export const actions = {
	/** Ajoute un lien externe (site officiel, Workshop…) à un projet. */
	lien: async ({ request, locals }) => {
		const moi = exigerDeposant(locals);
		const f = await request.formData();
		const projet = projetParId(entier(f, 'projet'));
		if (!projet) return fail(404, { erreur: 'Projet introuvable.' });
		const lien = lienValide(String(f.get('lien') ?? ''));
		if (!lien) return fail(400, { erreur: 'Adresse invalide : elle doit commencer par https://' });
		const c = lireChamps(f);
		if ('erreur' in c) return fail(400, { erreur: c.erreur });
		db()
			.insert(schema.fichiers)
			.values({ ...c.valeurs, projetId: projet.id, lien, ajouteParId: moi.id })
			.run();
		toucherProjets([projet.id]);
		return { ok: `${c.valeurs.nom} ajouté à ${projet.nom}` };
	},

	/** Modifie les infos d'un fichier (nom, type, version, plateformes, note, lien). */
	modifier: async ({ request, locals }) => {
		exigerDeposant(locals);
		const f = await request.formData();
		const fichier = fichierParId(entier(f, 'id'));
		if (!fichier) return fail(404, { erreur: 'Fichier introuvable.' });
		const c = lireChamps(f);
		if ('erreur' in c) return fail(400, { erreur: c.erreur });
		let lien = fichier.lien;
		if (fichier.lien) {
			lien = lienValide(String(f.get('lien') ?? ''));
			if (!lien) return fail(400, { erreur: 'Adresse invalide : elle doit commencer par https://' });
		}
		db()
			.update(schema.fichiers)
			.set({ ...c.valeurs, lien, majLe: Date.now() })
			.where(eq(schema.fichiers.id, fichier.id))
			.run();
		toucherProjets([fichier.projetId]);
		return { ok: 'Fichier modifié' };
	},

	supprimer: async ({ request, locals }) => {
		exigerDeposant(locals);
		const fichier = fichierParId(entier(await request.formData(), 'id'));
		if (!fichier) return fail(404, { erreur: 'Fichier introuvable.' });
		supprimerFichier(fichier);
		return { ok: `${fichier.nom} supprimé` };
	}
};
