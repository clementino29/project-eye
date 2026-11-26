import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { dev } from '$app/env';
import { auth, COOKIE_DEV, FOURNISSEUR } from '#lib/server/auth.ts';
import { ouvertAuxVisiteurs } from '#lib/server/acces.ts';
import { config } from '#lib/server/config.ts';
import { membreParId } from '#lib/server/membres.ts';

/** Taille maximale d'une requête, sauf l'envoi de fichiers (qui a sa propre limite).
 *  Le formulaire d'un projet peut porter trois images de 10 Mo. */
const CORPS_MAX = 40 * 1024 * 1024;

export const handle: Handle = async ({ event, resolve }) => {
	const chemin = event.url.pathname;

	// BODY_SIZE_LIMIT est levé dans l'image Docker pour laisser passer les gros fichiers
	// vers /fichiers/envoi : les autres requêtes gardent une limite raisonnable.
	// Un corps envoyé « en morceaux » n'annonce pas sa taille : il est refusé, sauf pour l'envoi de fichiers.
	if (chemin !== '/fichiers/envoi') {
		if (event.request.headers.has('transfer-encoding')) return new Response('Taille de la requête requise', { status: 411 });
		if (Number(event.request.headers.get('content-length')) > CORPS_MAX) return new Response('Requête trop grosse', { status: 413 });
	}

	// Retour d'Authentik : l'adresse déclarée dans Authentik depuis la v1 est gardée,
	// et renvoyée vers la route de Better Auth.
	if (chemin === '/auth/callback') {
		const cible = new URL(event.request.url);
		cible.pathname = `/api/auth/callback/${FOURNISSEUR}`;
		return auth().handler(new Request(cible, event.request));
	}
	if (chemin.startsWith('/api/auth/')) return auth().handler(event.request);

	const session = await auth().api.getSession({ headers: event.request.headers });
	event.locals.membre = (session && membreParId(Number(session.user.id))) || null;
	if (!event.locals.membre && dev && config.connexionDev) {
		const id = Number(event.cookies.get(COOKIE_DEV));
		if (id) event.locals.membre = membreParId(id) ?? null;
	}

	if (!event.locals.membre && !ouvertAuxVisiteurs(event.request.method, chemin)) {
		if (event.request.method !== 'GET') {
			return new Response('Connexion requise', { status: 401 });
		}
		redirect(303, `/connexion?retour=${encodeURIComponent(chemin + event.url.search)}`);
	}

	const reponse = await resolve(event);
	reponse.headers.set('X-Frame-Options', 'DENY');
	reponse.headers.set('X-Content-Type-Options', 'nosniff');
	reponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	return reponse;
};
