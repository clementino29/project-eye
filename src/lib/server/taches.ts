// Tâches planifiées du hub, à l'heure de Paris (TZ du conteneur) :
// - la nuit, l'actualisation de toutes les bibliothèques Steam ;
// - en fin d'après-midi, l'annonce sur Discord de ce qui est prévu le lendemain.
// Chaque tâche tourne une fois par jour, dès que son heure est passée : si le hub
// était arrêté à ce moment, elle tourne à son redémarrage. Le dernier passage est
// gardé dans la base, pour ne pas la relancer après un redémarrage.
import { and, eq, inArray, ne } from 'drizzle-orm';
import { config } from './config.ts';
import { db, schema } from './db/index.ts';
import { annoncer, COULEURS, sansMiseEnForme, type Annonce } from './discord.ts';
import { synchroniserTout } from './steam.ts';
import { verifierArretsAuto } from './arret-auto.ts';
import { cleJour, dateDe, enumerer, heureLisible, jourLong, majuscule, pluriel } from '../commune.ts';

export interface Tache {
	nom: string;
	heure: () => number;
	lancer: (jour: string) => Promise<string>;
}

const prenom = (nom: string) => nom.trim().split(/\s+/)[0] || 'Quelqu’un';

/** Lendemain d'un jour AAAA-MM-JJ. */
export function lendemain(jour: string) {
	const d = dateDe(jour);
	d.setDate(d.getDate() + 1);
	return cleJour(d);
}

/** Ce qui est prévu tel jour : soirées de la Watch list commune et sessions de parties. */
export function annoncesDuJour(jour: string): Annonce[] {
	const base = db();
	const quand = (heure: string | null) => `${majuscule(jourLong(jour))}${heure ? ` à ${heureLisible(heure)}` : ''}`;
	const annonces: Annonce[] = [];

	const soirees = base
		.select({ id: schema.soirees.id, heure: schema.soirees.heure, lieu: schema.soirees.lieu, note: schema.soirees.note, titre: schema.titres.titre })
		.from(schema.soirees)
		.leftJoin(schema.titres, eq(schema.titres.id, schema.soirees.titreId))
		.where(eq(schema.soirees.date, jour))
		.all();
	for (const s of soirees) {
		const venus = base
			.select({ nom: schema.membres.nom })
			.from(schema.presencesSoiree)
			.innerJoin(schema.membres, eq(schema.membres.id, schema.presencesSoiree.membreId))
			.where(eq(schema.presencesSoiree.soireeId, s.id))
			.all()
			.map((m) => sansMiseEnForme(prenom(m.nom)));
		annonces.push({
			titre: `🍿 Soirée film demain${s.titre ? ` : ${sansMiseEnForme(s.titre)}` : ''}`,
			texte: [`${quand(s.heure)} · ${sansMiseEnForme(s.lieu)}`, s.note ? sansMiseEnForme(s.note) : null, venus.length ? `${pluriel(venus.length, 'personne vient', 'personnes viennent')} : ${enumerer(venus)}.` : 'Personne n’a encore dit « Je viens ».']
				.filter(Boolean)
				.join('\n'),
			lien: '/films',
			couleur: COULEURS.soiree
		});
	}

	const parties = base
		.select()
		.from(schema.parties)
		.where(and(eq(schema.parties.prochaineSession, jour), ne(schema.parties.statut, 'terminee')))
		.all();
	if (parties.length) {
		const joueurs = base
			.select({ partieId: schema.participations.partieId, nom: schema.membres.nom })
			.from(schema.participations)
			.innerJoin(schema.membres, eq(schema.membres.id, schema.participations.membreId))
			.where(inArray(schema.participations.partieId, parties.map((p) => p.id)))
			.all();
		for (const p of parties) {
			const noms = joueurs.filter((j) => j.partieId === p.id).map((j) => sansMiseEnForme(prenom(j.nom)));
			annonces.push({
				titre: `🎲 Session demain : ${sansMiseEnForme(p.nom)}`,
				texte: [`${sansMiseEnForme(p.jeuNom)} · ${quand(p.heureSession)}`, noms.length ? `Avec ${enumerer(noms)}.` : null].filter(Boolean).join('\n'),
				lien: '/jeux/parties',
				couleur: COULEURS.partie
			});
		}
	}
	return annonces;
}

export const TACHES: Tache[] = [
	{
		nom: 'synchro-steam',
		heure: () => config.taches.heureSteam,
		async lancer() {
			const r = await synchroniserTout();
			return `${pluriel(r.membres, 'bibliothèque')} relue${r.membres > 1 ? 's' : ''}${r.erreurs ? `, ${pluriel(r.erreurs, 'erreur')}` : ''}`;
		}
	},
	{
		nom: 'annonces-demain',
		heure: () => config.taches.heureAnnonces,
		async lancer(jour) {
			const annonces = annoncesDuJour(lendemain(jour));
			if (!annonces.length) return 'rien de prévu demain';
			if (!config.discord.webhook) return `${pluriel(annonces.length, 'annonce')} sans webhook Discord`;
			const n = await annoncer(annonces);
			return `${n} sur ${pluriel(annonces.length, 'annonce')} envoyée${n > 1 ? 's' : ''}`;
		}
	}
];

/** Lance les tâches dont l'heure est passée et qui n'ont pas encore tourné ce jour-là. */
export async function verifierTaches(maintenant = new Date(), taches = TACHES) {
	const jour = cleJour(maintenant);
	const lancees: string[] = [];
	for (const t of taches) {
		if (maintenant.getHours() < t.heure()) continue;
		const base = db();
		const dernier = base.select().from(schema.tachesPlanifiees).where(eq(schema.tachesPlanifiees.nom, t.nom)).get();
		if (dernier && dernier.dernierJour >= jour) continue;
		// Noté avant de lancer : une tâche qui plante ne repart pas en boucle toutes les minutes.
		const valeurs = { dernierJour: jour, derniereExecution: maintenant.getTime(), resultat: 'en cours' };
		base.insert(schema.tachesPlanifiees).values({ nom: t.nom, ...valeurs }).onConflictDoUpdate({ target: schema.tachesPlanifiees.nom, set: valeurs }).run();
		let resultat: string;
		try {
			resultat = await t.lancer(jour);
		} catch (e) {
			resultat = `erreur : ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
		}
		base.update(schema.tachesPlanifiees).set({ resultat }).where(eq(schema.tachesPlanifiees.nom, t.nom)).run();
		console.log(`[taches] ${t.nom} : ${resultat}`);
		lancees.push(t.nom);
	}
	return lancees;
}

let minuteur: ReturnType<typeof setInterval> | undefined;
let enCours = false;
let tours = 0;

/**
 * Vérifie les tâches du jour toutes les minutes, et l'arrêt automatique des serveurs
 * une minute sur deux (appelé une fois, au démarrage du hub).
 */
export function demarrerTaches() {
	if (minuteur) return;
	const tour = async () => {
		if (enCours) return;
		enCours = true;
		try {
			await verifierTaches();
		} catch (e) {
			console.error('[taches]', e);
		}
		try {
			if (tours++ % 2 === 0) await verifierArretsAuto();
		} catch (e) {
			console.error('[arret-auto]', e);
		} finally {
			enCours = false;
		}
	};
	minuteur = setInterval(tour, 60_000);
	minuteur.unref?.();
	setTimeout(tour, 15_000).unref?.();
}

/** Dernier passage de chaque tâche, pour l'afficher (page Compte des admins, Quoi faire ?). */
export function derniersPassages() {
	return db().select().from(schema.tachesPlanifiees).all();
}
