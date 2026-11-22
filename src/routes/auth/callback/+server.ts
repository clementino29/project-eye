import { redirect } from '@sveltejs/kit';
import { config } from '#lib/server/config.ts';
import { cheminSur, terminerConnexion, type EtatConnexion } from '#lib/server/oidc.ts';
import { accesDepuisGroupes, enregistrerConnexion } from '#lib/server/membres.ts';
import { ouvrirSession } from '#lib/server/sessions.ts';

const COOKIE_OIDC = 'nh_oidc';

export const GET = async ({ url, cookies }) => {
	const brut = cookies.get(COOKIE_OIDC);
	cookies.delete(COOKIE_OIDC, { path: '/auth' });
	if (!brut) redirect(303, '/connexion?erreur=echec');

	let profil: Awaited<ReturnType<typeof terminerConnexion>>;
	let etat: EtatConnexion;
	try {
		etat = JSON.parse(brut) as EtatConnexion;
		// L'URL publique (derrière le proxy) fait foi pour vérifier la redirection.
		const courante = new URL(`${config.origine}${url.pathname}${url.search}`);
		profil = await terminerConnexion(courante, etat);
	} catch (e) {
		console.error('[auth] échec du retour Authentik :', e);
		redirect(303, '/connexion?erreur=echec');
	}

	const acces = accesDepuisGroupes(profil.groups);
	if (!acces.autorise) redirect(303, '/connexion?erreur=groupe');

	const membre = enregistrerConnexion(profil, acces.role);
	ouvrirSession(cookies, membre.id, config.origine.startsWith('https:'));
	redirect(303, cheminSur(etat.retour));
};
