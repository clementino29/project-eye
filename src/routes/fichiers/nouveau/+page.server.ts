import { fail, redirect } from '@sveltejs/kit';
import { enregistrerProjet, exigerDeposant } from '#lib/server/fichiers.ts';

// Nouveau projet : infos, en-tête et étapes ; les fichiers s'ajoutent ensuite depuis sa page.
export const load = ({ locals }) => {
	exigerDeposant(locals);
	return {};
};

export const actions = {
	enregistrer: async ({ request, locals }) => {
		const moi = exigerDeposant(locals);
		const r = await enregistrerProjet(await request.formData(), moi.id);
		if ('erreur' in r) return fail(400, { erreur: r.erreur });
		redirect(303, `/fichiers/${r.projet.slug}?ajouter`);
	}
};
