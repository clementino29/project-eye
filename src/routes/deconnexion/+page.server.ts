import { redirect } from '@sveltejs/kit';
import { auth, COOKIE_DEV } from '#lib/server/auth.ts';

export const load = () => redirect(303, '/');

export const actions = {
	default: async ({ request, cookies }) => {
		try {
			// Supprime la session en base ; sveltekitCookies efface le cookie.
			await auth().api.signOut({ headers: request.headers });
		} catch {
			// pas de session : rien à fermer
		}
		cookies.delete(COOKIE_DEV, { path: '/' });
		redirect(303, '/');
	}
};
