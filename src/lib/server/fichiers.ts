// Fichiers & applis côté serveur : projets, fichiers hébergés ou liens, droits d'ajout.
import { desc, eq, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db, schema } from './db/index.ts';
import type { Fichier, Membre, Projet } from './db/schema.ts';
import { enregistrerImage, ErreurTaille, supprimerStocke } from './stockage.ts';
import { ORDRE_PLATEFORMES, slugifier, type Plateforme } from '../fichiers.ts';
import { exigerMembre } from './garde.ts';

/** Ajouter ou modifier : admins et groupe Authentik des fichiers. */
export const peutDeposer = (m: Pick<Membre, 'role' | 'deposeFichiers'> | null | undefined) => !!m && (m.role === 'admin' || m.deposeFichiers);

export function exigerDeposant(locals: App.Locals) {
	const m = exigerMembre(locals);
	if (!peutDeposer(m)) error(403, 'Réservé aux admins et au groupe des fichiers');
	return m;
}

const lireJson = <T>(brut: string | null | undefined, defaut: T): T => {
	try {
		return brut ? (JSON.parse(brut) as T) : defaut;
	} catch {
		return defaut;
	}
};

const urlImage = (nom: string | null) => (nom ? `/fichiers/images/${nom}` : null);

export function versVueFichier(f: Fichier) {
	return {
		id: f.id,
		projetId: f.projetId,
		nom: f.nom,
		type: f.type,
		version: f.version,
		plateformes: lireJson<Plateforme[]>(f.plateformes, []).filter((p) => ORDRE_PLATEFORMES.includes(p)),
		note: f.note,
		lien: f.lien,
		heberge: !!f.stockage,
		nomOriginal: f.nomOriginal,
		taille: f.taille,
		ajouteLe: f.ajouteLe,
		majLe: f.majLe
	};
}
export type VueFichier = ReturnType<typeof versVueFichier>;

export function versVueProjet(p: Projet, fichiers: Fichier[]) {
	const vues = fichiers.map(versVueFichier).sort((a, b) => b.majLe - a.majLe);
	return {
		id: p.id,
		slug: p.slug,
		nom: p.nom,
		sousTitre: p.sousTitre,
		affichage: p.affichage,
		etapes: lireJson<string[]>(p.etapes, []),
		banniere: urlImage(p.banniere),
		logo: urlImage(p.logo),
		vignette: urlImage(p.vignette),
		fichiers: vues,
		/** Dernière mise à jour d'un fichier. */
		majFichiers: vues[0]?.majLe ?? null
	};
}
export type VueProjet = ReturnType<typeof versVueProjet>;

/** Tous les projets avec leurs fichiers, par ordre de création. */
export function lireProjets() {
	const base = db();
	const projets = base.select().from(schema.projets).orderBy(schema.projets.creeLe, schema.projets.id).all();
	const fichiers = base.select().from(schema.fichiers).all();
	return projets.map((p) =>
		versVueProjet(
			p,
			fichiers.filter((f) => f.projetId === p.id)
		)
	);
}

export const projetParSlug = (slug: string) => db().select().from(schema.projets).where(eq(schema.projets.slug, slug)).get();
export const projetParId = (id: number | null) => (id ? db().select().from(schema.projets).where(eq(schema.projets.id, id)).get() : undefined);
export const fichierParId = (id: number | null) => (id ? db().select().from(schema.fichiers).where(eq(schema.fichiers.id, id)).get() : undefined);

/** Les derniers fichiers ajoutés ou mis à jour, tous projets confondus. */
export function fichiersRecents(max = 5) {
	return db()
		.select()
		.from(schema.fichiers)
		.innerJoin(schema.projets, eq(schema.fichiers.projetId, schema.projets.id))
		.orderBy(desc(schema.fichiers.majLe), desc(schema.fichiers.id))
		.limit(max)
		.all()
		.map((r) => ({ ...versVueFichier(r.fichiers), projet: { nom: r.projets.nom, slug: r.projets.slug } }));
}

/** Adresse libre pour un nouveau projet : « minecraft », puis « minecraft-2 »… */
export function slugLibre(nom: string, sauf?: number) {
	const base = slugifier(nom);
	const pris = new Set(
		db()
			.select({ slug: schema.projets.slug, id: schema.projets.id })
			.from(schema.projets)
			.all()
			.filter((r) => r.id !== sauf)
			.map((r) => r.slug)
	);
	// « nouveau » est une page du hub.
	pris.add('nouveau');
	pris.add('images');
	pris.add('envoi');
	pris.add('telecharger');
	if (!pris.has(base)) return base;
	for (let n = 2; ; n++) if (!pris.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Supprime un projet, ses fichiers et ses images (sur le disque aussi). */
export function supprimerProjet(p: Projet) {
	const base = db();
	const fichiers = base.select().from(schema.fichiers).where(eq(schema.fichiers.projetId, p.id)).all();
	base.delete(schema.projets).where(eq(schema.projets.id, p.id)).run();
	for (const f of fichiers) supprimerStocke(f.stockage);
	for (const img of [p.banniere, p.logo, p.vignette]) supprimerStocke(img, 'images');
}

export function supprimerFichier(f: Fichier) {
	db().delete(schema.fichiers).where(eq(schema.fichiers.id, f.id)).run();
	supprimerStocke(f.stockage);
	toucherProjets([f.projetId]);
}

export function toucherProjets(ids: number[]) {
	if (ids.length) db().update(schema.projets).set({ majLe: Date.now() }).where(inArray(schema.projets.id, ids)).run();
}

/** Lit et vérifie les champs communs d'un fichier (formulaire ou paramètres d'envoi). */
export function champsFichier(lire: (cle: string) => string, plateformes: string[]) {
	const nom = lire('nom').trim().slice(0, 120);
	const type = lire('type');
	const plats = [...new Set(plateformes)].filter((p): p is Plateforme => ORDRE_PLATEFORMES.includes(p as Plateforme));
	if (!nom) return { erreur: 'Donne un nom au fichier.' } as const;
	if (type !== 'appli' && type !== 'mod' && type !== 'config') return { erreur: 'Type inconnu.' } as const;
	if (!plats.length) return { erreur: 'Choisis au moins une plateforme.' } as const;
	return {
		valeurs: {
			nom,
			type,
			version: lire('version').trim().slice(0, 40) || null,
			plateformes: JSON.stringify(ORDRE_PLATEFORMES.filter((p) => plats.includes(p))),
			note: lire('note').trim().slice(0, 300) || null
		}
	} as const;
}

/** N'accepte que des liens http(s). */
export const lienValide = (v: string) => (/^https?:\/\/[^\s"'<>]+$/i.test(v.trim()) ? v.trim().slice(0, 500) : null);

/**
 * Crée ou modifie un projet depuis le formulaire « Nouveau projet » / « Modifier » :
 * nom, sous-titre, affichage, étapes, et images (bannière, logo, vignette) à remplacer ou retirer.
 */
export async function enregistrerProjet(f: FormData, moiId: number, existant?: Projet) {
	const nom = String(f.get('nom') ?? '').trim().slice(0, 80);
	if (!nom) return { erreur: 'Donne un nom au projet.' } as const;
	const brut = String(f.get('affichage') ?? '');
	const affichage: Projet['affichage'] = brut === 'logo' || brut === 'titre' ? brut : 'logo_titre';
	const etapes = f
		.getAll('etape')
		.map((e) => String(e).trim().slice(0, 400))
		.filter(Boolean)
		.slice(0, 30);
	const images: Partial<Record<'banniere' | 'logo' | 'vignette', string | null>> = {};
	const anciennes: string[] = [];
	const nouvelles: string[] = [];
	try {
		for (const cle of ['banniere', 'logo', 'vignette'] as const) {
			const fichier = f.get(cle);
			if (fichier instanceof File && fichier.size > 0) {
				const n = await enregistrerImage(fichier);
				nouvelles.push(n);
				images[cle] = n;
			} else if (f.get(`retirer_${cle}`) === '1') images[cle] = null;
			if (cle in images && existant?.[cle]) anciennes.push(existant[cle]!);
		}
	} catch (e) {
		for (const n of nouvelles) supprimerStocke(n, 'images');
		if (e instanceof ErreurTaille || e instanceof TypeError) return { erreur: e.message } as const;
		throw e;
	}
	const valeurs = {
		nom,
		sousTitre: String(f.get('sousTitre') ?? '').trim().slice(0, 140) || null,
		affichage,
		etapes: JSON.stringify(etapes),
		...images,
		majLe: Date.now()
	};
	const base = db();
	const projet = existant
		? base.update(schema.projets).set(valeurs).where(eq(schema.projets.id, existant.id)).returning().get()
		: base
				.insert(schema.projets)
				.values({ ...valeurs, slug: slugLibre(nom), creeParId: moiId })
				.returning()
				.get();
	for (const n of anciennes) supprimerStocke(n, 'images');
	return { projet } as const;
}
