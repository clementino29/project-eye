import { eq } from 'drizzle-orm';
import { db, schema } from './db/index.ts';
import { config } from './config.ts';
import type { Membre } from './db/schema.ts';

export interface ProfilOidc {
	sub: string;
	preferred_username?: string;
	nickname?: string;
	name?: string;
	email?: string;
	groups?: unknown;
}

export type ResultatAcces = { autorise: true; role: 'membre' | 'admin' } | { autorise: false };

/** Le rôle est lu dans les groupes Authentik ; sans groupe du hub, pas d'accès. */
export function accesDepuisGroupes(groupes: unknown): ResultatAcces {
	const liste = Array.isArray(groupes) ? groupes.map(String) : [];
	if (liste.includes(config.authentik.groupeAdmins)) return { autorise: true, role: 'admin' };
	if (liste.includes(config.authentik.groupeMembres)) return { autorise: true, role: 'membre' };
	return { autorise: false };
}

/** Crée ou met à jour le membre à chaque connexion (pseudo, nom, e-mail et rôle viennent d'Authentik). */
export function enregistrerConnexion(profil: ProfilOidc, role: 'membre' | 'admin'): Membre {
	const pseudo = profil.preferred_username || profil.nickname || profil.email?.split('@')[0] || 'membre';
	const valeurs = {
		pseudo,
		nom: profil.name || pseudo,
		email: profil.email ?? null,
		role,
		derniereConnexion: Date.now()
	};
	const [membre] = db()
		.insert(schema.membres)
		.values({ authentikId: profil.sub, ...valeurs })
		.onConflictDoUpdate({ target: schema.membres.authentikId, set: valeurs })
		.returning()
		.all();
	return membre;
}

export function membreParId(id: number): Membre | undefined {
	return db().select().from(schema.membres).where(eq(schema.membres.id, id)).get();
}

/** Ce que les pages ont le droit de voir d'un membre (jamais la clé Pelican). */
export interface MembrePublic {
	id: number;
	pseudo: string;
	nom: string;
	photo: string | null;
	etatSteam: Membre['etatSteam'];
}

export function urlPhoto(m: Pick<Membre, 'id' | 'photo' | 'photoMaj'>) {
	return m.photo ? `/membres/${m.id}/photo?v=${m.photoMaj ?? 0}` : null;
}

export function versPublic(m: Membre): MembrePublic {
	return { id: m.id, pseudo: m.pseudo, nom: m.nom, photo: urlPhoto(m), etatSteam: m.etatSteam };
}

export function tousLesMembres(): MembrePublic[] {
	return db()
		.select()
		.from(schema.membres)
		.orderBy(schema.membres.pseudo)
		.all()
		.map(versPublic);
}
