import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import { config } from '#lib/server/config.ts';
import { auth, cheminSur, COOKIE_DEV, FOURNISSEUR } from '#lib/server/auth.ts';
import { enregistrerMembreDev } from '#lib/server/membres.ts';

const ERREURS: Record<string, string> = {
	groupe: 'Ton compte Authentik n’a pas accès au hub. Demande à un admin de t’ajouter au groupe du hub.',
	echec: 'La connexion avec Authentik n’a pas abouti. Réessaie.',
	config: 'La connexion n’est pas encore configurée sur ce serveur.'
};

export const load = ({ locals, url }) => {
	const retour = cheminSur(url.searchParams.get('retour'));
	if (locals.membre) redirect(303, retour);
	// « erreur » vient du hub, « error » de Better Auth (retour d'Authentik).
	const code = url.searchParams.get('erreur') ?? url.searchParams.get('error');
	return {
		retour,
		erreur: code ? (ERREURS[code] ?? ERREURS.echec) : null,
		authentikPret: config.authentik.configure,
		connexionDev: dev && config.connexionDev
	};
};

export const actions = {
	authentik: async ({ request }) => {
		const form = await request.formData();
		const retour = cheminSur(String(form.get('retour') ?? '/'));
		if (!config.authentik.configure) return fail(500, { erreur: ERREURS.config });
		let destination: string;
		try {
			// Better Auth prépare l'état et le PKCE (cookies posés par sveltekitCookies).
			const reponse = await auth().api.signInSocial({
				body: {
					provider: FOURNISSEUR,
					callbackURL: retour,
					errorCallbackURL: `/connexion?retour=${encodeURIComponent(retour)}`,
					disableRedirect: true
				},
				headers: request.headers
			});
			if (!reponse.url) throw new Error('Pas d’adresse de connexion');
			destination = reponse.url;
		} catch (e) {
			console.error('[auth] connexion Authentik impossible :', e);
			return fail(502, { erreur: ERREURS.echec });
		}
		// Kit 3 refuse les redirections vers un autre site sans liste d'origines autorisées.
		redirect(303, destination, { external: [new URL(destination).origin] });
	},
	// Connexion de test, seulement avec `npm run dev` et DEV_LOGIN=1.
	dev: async ({ request, cookies }) => {
		if (!dev || !config.connexionDev) return fail(404);
		const form = await request.formData();
		const pseudo = String(form.get('pseudo') ?? '').trim().toLowerCase() || 'testeur';
		const membre = enregistrerMembreDev(pseudo, form.get('admin') === 'on' ? 'admin' : 'membre');
		cookies.set(COOKIE_DEV, String(membre.id), { path: '/', httpOnly: true, sameSite: 'lax', secure: false });
		redirect(303, cheminSur(String(form.get('retour') ?? '/')));
	}
};
