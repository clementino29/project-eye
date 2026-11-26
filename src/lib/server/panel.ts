// Accès d'un membre aux serveurs de Sakura Panel, partagé par la page Panel et ses routes
// (console, sauvegardes) : le hub utilise la clé du membre et vérifie ses permissions Pelican
// avant d'appeler, pour donner un message clair plutôt qu'un refus brut du panel.
import { error } from '@sveltejs/kit';
import { dechiffrer } from './crypto.ts';
import { exigerMembre } from './garde.ts';
import { ClientPelican, ErreurPelican, type Permissions } from './pelican.ts';
import type { Membre } from './db/schema.ts';

// Cache des permissions (une minute) : elles changent rarement et coûtent un appel par serveur.
const cachePermissions = new Map<string, { valeur: Permissions; expire: number }>();

/** Client Pelican du membre, ou null s'il n'a pas de clé. Lève une erreur si la clé est illisible. */
export function clientDe(m: Membre) {
	if (!m.clePelicanChiffree) return null;
	return new ClientPelican(dechiffrer(m.clePelicanChiffree));
}

export async function permissions(client: ClientPelican, membreId: number, id: string) {
	const cle = `${membreId}:${id}`;
	const c = cachePermissions.get(cle);
	if (c && c.expire > Date.now()) return c.valeur;
	const valeur = await client.permissions(id);
	cachePermissions.set(cle, { valeur, expire: Date.now() + 60_000 });
	return valeur;
}

/** Les identifiants Pelican sont courts (8 caractères) ou des UUID. */
export const identifiantValide = (id: string) => /^[A-Za-z0-9-]{1,64}$/.test(id);

/**
 * Pour les routes du Panel : membre connecté, client Pelican et permission vérifiée.
 * Lève une erreur HTTP lisible sinon.
 */
export async function accesServeur(locals: App.Locals, id: string, autorise: (p: Permissions) => boolean) {
	const m = exigerMembre(locals);
	if (!identifiantValide(id)) error(400, 'Serveur inconnu.');
	let client: ClientPelican | null;
	try {
		client = clientDe(m);
	} catch {
		client = null;
	}
	if (!client) error(400, 'Ajoute d’abord ta clé Sakura Panel dans ton compte.');
	let p: Permissions;
	try {
		p = await permissions(client, m.id, id);
	} catch (e) {
		erreurPelican(e);
	}
	if (!autorise(p)) error(403, 'Tu n’as pas cette permission dans Sakura Panel.');
	return { m, client };
}

/** Transforme une erreur du panel en réponse HTTP (502 quand le panel n'est pas joignable). */
export function erreurPelican(e: unknown): never {
	if (e instanceof ErreurPelican) error(e.statut === 401 || e.statut === 403 ? 403 : e.statut === 504 ? 504 : 502, e.message);
	throw e;
}
