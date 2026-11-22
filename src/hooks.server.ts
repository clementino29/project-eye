import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { membreDeLaSession } from '#lib/server/sessions.ts';
import { membreParId } from '#lib/server/membres.ts';

/** Pages visibles sans être connecté. */
const PUBLIQUES = [/^\/$/, /^\/connexion(\/|$)/, /^\/auth\//, /^\/sante$/];

export const handle: Handle = async ({ event, resolve }) => {
	const id = membreDeLaSession(event.cookies);
	event.locals.membre = (id !== undefined && membreParId(id)) || null;

	const chemin = event.url.pathname;
	if (!event.locals.membre && !PUBLIQUES.some((r) => r.test(chemin))) {
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
