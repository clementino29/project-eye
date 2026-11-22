import { error } from '@sveltejs/kit';
import type { Membre } from './db/schema.ts';

export function exigerMembre(locals: App.Locals): Membre {
	if (!locals.membre) error(401, 'Connexion requise');
	return locals.membre;
}

export function exigerAdmin(locals: App.Locals): Membre {
	const m = exigerMembre(locals);
	if (m.role !== 'admin') error(403, 'Réservé aux admins');
	return m;
}
