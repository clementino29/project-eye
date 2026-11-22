import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import { config } from '#lib/server/config.ts';
import { cheminSur, preparerConnexion } from '#lib/server/oidc.ts';
import { enregistrerConnexion } from '#lib/server/membres.ts';
import { ouvrirSession } from '#lib/server/sessions.ts';

const COOKIE_OIDC = 'nh_oidc';

const ERREURS: Record<string, string> = {
	groupe: 'Ton compte Authentik n’a pas accès au hub. Demande à un admin de t’ajouter au groupe du hub.',
	echec: 'La connexion avec Authentik n’a pas abouti. Réessaie.',
	config: 'La connexion n’est pas encore configurée sur ce serveur.'
};

export const load = ({ locals, url }) => {
	const retour = cheminSur(url.searchParams.get('retour'));
	if (locals.membre) redirect(303, retour);
	const code = url.searchParams.get('erreur');
	return {
		retour,
		erreur: code ? (ERREURS[code] ?? ERREURS.echec) : null,
		authentikPret: config.authentik.configure,
		connexionDev: dev && config.connexionDev
	};
};

export const actions = {
	authentik: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const retour = cheminSur(String(form.get('retour') ?? '/'));
		if (!config.authentik.configure) return fail(500, { erreur: ERREURS.config });
		const { url: destination, etat } = await preparerConnexion(retour);
		cookies.set(COOKIE_OIDC, JSON.stringify(etat), {
			path: '/auth',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			maxAge: 600
		});
		// Kit 3 refuse les redirections vers un autre site sans liste d'origines autorisées.
		redirect(303, destination.toString(), { external: [new URL(config.authentik.issuer!).origin] });
	},
	// Connexion de test, seulement avec `npm run dev` et DEV_LOGIN=1.
	dev: async ({ request, cookies, url }) => {
		if (!dev || !config.connexionDev) return fail(404);
		const form = await request.formData();
		const pseudo = String(form.get('pseudo') ?? '').trim() || 'testeur';
		const admin = form.get('admin') === 'on';
		const membre = enregistrerConnexion(
			{ sub: `dev:${pseudo}`, preferred_username: pseudo, name: pseudo[0].toUpperCase() + pseudo.slice(1), email: `${pseudo}@exemple.fr` },
			admin ? 'admin' : 'membre'
		);
		ouvrirSession(cookies, membre.id, url.protocol === 'https:');
		redirect(303, cheminSur(String(form.get('retour') ?? '/')));
	}
};
