import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.ts';
import { exigerMembre } from '#lib/server/garde.ts';
import { config } from '#lib/server/config.ts';
import { peutDeposer, projetParSlug, versVueProjet } from '#lib/server/fichiers.ts';

// Page d'un projet : étapes d'installation et fichiers. Réservée aux membres connectés.
export const load = ({ params, locals }) => {
	const moi = exigerMembre(locals);
	const p = projetParSlug(params.slug);
	if (!p) error(404, 'Projet introuvable');
	const fichiers = db().select().from(schema.fichiers).where(eq(schema.fichiers.projetId, p.id)).all();
	return { projet: versVueProjet(p, fichiers), peutDeposer: peutDeposer(moi), tailleMax: config.fichiers.tailleMax };
};
