import { eq } from 'drizzle-orm';
import { db, schema } from './db/index.ts';
import type { Membre } from './db/schema.ts';

/** Connexion de test (DEV_LOGIN) : crée ou met à jour un membre fictif. */
export function enregistrerMembreDev(pseudo: string, role: 'membre' | 'admin'): Membre {
	const valeurs = {
		pseudo,
		nom: pseudo[0].toUpperCase() + pseudo.slice(1),
		email: `${pseudo}@exemple.fr`,
		role,
		derniereConnexion: Date.now()
	};
	return db()
		.insert(schema.membres)
		.values({ authentikId: `dev:${pseudo}`, ...valeurs })
		.onConflictDoUpdate({ target: schema.membres.authentikId, set: valeurs })
		.returning()
		.get();
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

/** Pour un visiteur non connecté : le prénom seul, sans pseudo ni nom de famille. */
export function versVisiteur(m: Membre): MembrePublic {
	const prenom = m.nom.trim().split(/\s+/)[0] || 'Membre';
	return { id: m.id, pseudo: prenom.toLowerCase(), nom: prenom, photo: urlPhoto(m), etatSteam: m.etatSteam };
}

/** Membres affichés sur une page ; `visiteur` réduit chacun à son prénom (mode lecture seule). */
export function tousLesMembres({ visiteur = false } = {}): MembrePublic[] {
	return db()
		.select()
		.from(schema.membres)
		.orderBy(schema.membres.pseudo)
		.all()
		.map(visiteur ? versVisiteur : versPublic);
}
