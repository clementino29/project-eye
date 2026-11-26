import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.ts';
import { enregistrerProjet, exigerDeposant, projetParSlug, supprimerProjet, versVueProjet } from '#lib/server/fichiers.ts';

// Modifier un projet (infos, en-tête, étapes) ou le supprimer.
export const load = ({ params, locals }) => {
	exigerDeposant(locals);
	const p = projetParSlug(params.slug);
	if (!p) error(404, 'Projet introuvable');
	const fichiers = db().select().from(schema.fichiers).where(eq(schema.fichiers.projetId, p.id)).all();
	return { projet: versVueProjet(p, fichiers) };
};

export const actions = {
	enregistrer: async ({ request, locals, params }) => {
		const moi = exigerDeposant(locals);
		const p = projetParSlug(params.slug);
		if (!p) error(404, 'Projet introuvable');
		const r = await enregistrerProjet(await request.formData(), moi.id, p);
		if ('erreur' in r) return fail(400, { erreur: r.erreur });
		redirect(303, `/fichiers/${r.projet.slug}`);
	},
	supprimer: async ({ locals, params }) => {
		exigerDeposant(locals);
		const p = projetParSlug(params.slug);
		if (!p) error(404, 'Projet introuvable');
		supprimerProjet(p);
		redirect(303, '/fichiers');
	}
};
