import { redirect } from '@sveltejs/kit';
import { fermerSession } from '#lib/server/sessions.ts';

export const load = () => redirect(303, '/');

export const actions = {
	default: ({ cookies }) => {
		fermerSession(cookies);
		redirect(303, '/');
	}
};
