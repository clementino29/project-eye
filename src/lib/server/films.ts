// Films & séries côté serveur : cache des fiches TMDB, watchlist et épisodes vus.
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from './db/index.ts';
import type { Titre } from './db/schema.ts';
import { tmdb, urlAffiche, type EpisodeTmdb, type TypeTitre } from './tmdb.ts';
import { avancement, type Avancement, type EpisodeVu, type SaisonInfo, type StatutWl } from '../watchlist.ts';

/** Une fiche est relue chez TMDB au plus une fois par semaine (nouvelles saisons, affiche…). */
const FRAICHEUR = 7 * 24 * 3600_000;

const lireJson = <T>(brut: string | null | undefined, defaut: T): T => {
	try {
		return brut ? (JSON.parse(brut) as T) : defaut;
	} catch {
		return defaut;
	}
};

export const saisonsDe = (t: Pick<Titre, 'saisons'>) => lireJson<SaisonInfo[]>(t.saisons, []);

/** Ce que les pages reçoivent d'un titre. */
export function versVue(t: Titre) {
	return {
		id: t.id,
		type: t.type,
		titre: t.titre,
		titreOriginal: t.titreOriginal,
		annee: t.annee,
		affiche: urlAffiche(t.affiche),
		grandeAffiche: urlAffiche(t.affiche, 'w780'),
		resume: t.resume,
		genres: lireJson<string[]>(t.genres, []),
		duree: t.duree,
		saisons: saisonsDe(t)
	};
}
export type VueTitre = ReturnType<typeof versVue>;

/** Fiche locale d'un titre TMDB, créée ou rafraîchie au besoin. */
export async function titreDepuisTmdb(type: TypeTitre, tmdbId: number): Promise<Titre> {
	const base = db();
	const existant = base
		.select()
		.from(schema.titres)
		.where(and(eq(schema.titres.type, type), eq(schema.titres.tmdbId, tmdbId)))
		.get();
	if (existant && Date.now() - existant.majLe < FRAICHEUR) return existant;
	let f;
	try {
		f = await tmdb().fiche(type, tmdbId);
	} catch (e) {
		if (existant) return existant; // TMDB injoignable : on garde l'ancienne fiche
		throw e;
	}
	const valeurs = {
		titre: f.titre,
		titreOriginal: f.titreOriginal,
		annee: f.annee,
		affiche: f.affiche,
		resume: f.resume,
		genres: JSON.stringify(f.genres),
		duree: f.duree,
		saisons: JSON.stringify(f.saisons),
		majLe: Date.now()
	};
	return base
		.insert(schema.titres)
		.values({ type, tmdbId, ...valeurs })
		.onConflictDoUpdate({ target: [schema.titres.type, schema.titres.tmdbId], set: valeurs })
		.returning()
		.get();
}

/** Rafraîchit une fiche trop ancienne sans bloquer la page si TMDB ne répond pas. */
export async function titreAJour(t: Titre): Promise<Titre> {
	if (Date.now() - t.majLe < FRAICHEUR) return t;
	return titreDepuisTmdb(t.type, t.tmdbId).catch(() => t);
}

/** Épisodes d'une saison (cache local), avec des noms génériques si TMDB ne répond pas. */
export async function episodesSaison(t: Titre, numero: number): Promise<EpisodeTmdb[]> {
	const base = db();
	const saison = saisonsDe(t).find((s) => s.numero === numero);
	if (!saison) return [];
	const enCache = base
		.select()
		.from(schema.saisonsTitre)
		.where(and(eq(schema.saisonsTitre.titreId, t.id), eq(schema.saisonsTitre.numero, numero)))
		.get();
	if (enCache && Date.now() - enCache.majLe < FRAICHEUR) return lireJson<EpisodeTmdb[]>(enCache.episodes, []);
	try {
		const episodes = (await tmdb().saison(t.tmdbId, numero)).filter((e) => e.numero >= 1);
		const valeurs = { episodes: JSON.stringify(episodes), majLe: Date.now() };
		base
			.insert(schema.saisonsTitre)
			.values({ titreId: t.id, numero, ...valeurs })
			.onConflictDoUpdate({ target: [schema.saisonsTitre.titreId, schema.saisonsTitre.numero], set: valeurs })
			.run();
		return episodes;
	} catch {
		if (enCache) return lireJson<EpisodeTmdb[]>(enCache.episodes, []);
		return Array.from({ length: saison.episodes }, (_, i) => ({ numero: i + 1, nom: `Épisode ${i + 1}`, duree: null }));
	}
}

/** Épisodes cochés par des membres, regroupés par membre puis par titre. */
export function episodesVusDe(membreIds: number[], titreIds?: number[]) {
	const res = new Map<number, Map<number, EpisodeVu[]>>();
	if (!membreIds.length) return res;
	const conditions = [inArray(schema.episodesVus.membreId, membreIds)];
	if (titreIds) conditions.push(inArray(schema.episodesVus.titreId, titreIds.length ? titreIds : [-1]));
	for (const v of db().select().from(schema.episodesVus).where(and(...conditions)).all()) {
		const parMembre = res.get(v.membreId) ?? new Map<number, EpisodeVu[]>();
		res.set(v.membreId, parMembre);
		const liste = parMembre.get(v.titreId) ?? [];
		parMembre.set(v.titreId, liste);
		liste.push({ saison: v.saison, episode: v.episode });
	}
	return res;
}

export interface EntreeListe {
	titre: VueTitre;
	statut: StatutWl;
	note: number | null;
	avis: string | null;
	ajouteLe: number;
	finiLe: number | null;
	avancement: Avancement | null;
	/** Pour les stats : épisodes en tout et épisodes cochés. */
	totalEpisodes: number;
	episodesVus: number;
}

/** Watchlists de plusieurs membres (titres et avancement), par membre. */
export function listesDe(membreIds: number[]): Map<number, EntreeListe[]> {
	const res = new Map<number, EntreeListe[]>(membreIds.map((id) => [id, []]));
	if (!membreIds.length) return res;
	const lignes = db()
		.select()
		.from(schema.watchlist)
		.innerJoin(schema.titres, eq(schema.watchlist.titreId, schema.titres.id))
		.where(inArray(schema.watchlist.membreId, membreIds))
		.all();
	const vus = episodesVusDe(membreIds);
	for (const { watchlist: w, titres: t } of lignes) {
		const vue = versVue(t);
		const cochés = vus.get(w.membreId)?.get(t.id) ?? [];
		const av = t.type === 'serie' ? avancement(vue.saisons, cochés) : null;
		res.get(w.membreId)!.push({
			titre: vue,
			statut: w.statut,
			note: w.note,
			avis: w.avis,
			ajouteLe: w.ajouteLe,
			finiLe: w.finiLe,
			avancement: av,
			totalEpisodes: av?.total ?? 0,
			episodesVus: av?.vusTotal ?? 0
		});
	}
	for (const l of res.values()) l.sort((a, b) => b.ajouteLe - a.ajouteLe);
	return res;
}

/** Ajoute un titre à la liste d'un membre, ou change son statut. */
export function definirStatut(membreId: number, titreId: number, statut: StatutWl) {
	const maintenant = Date.now();
	db()
		.insert(schema.watchlist)
		.values({ membreId, titreId, statut, ajouteLe: maintenant, majLe: maintenant, finiLe: statut === 'vu' ? maintenant : null })
		.onConflictDoUpdate({
			target: [schema.watchlist.membreId, schema.watchlist.titreId],
			set: { statut, majLe: maintenant, finiLe: statut === 'vu' ? maintenant : null }
		})
		.run();
}

/**
 * Coche (ou décoche) un épisode comme dans la fiche : cocher l'épisode 6 coche aussi 1 à 5,
 * décocher l'épisode 6 décoche aussi les suivants de la saison. Puis met le statut à jour :
 * « En cours » dès un épisode vu, « Vu » quand toute la série est cochée.
 */
export function cocherEpisodes(membreId: number, t: Titre, saison: number, episode: number, vu: boolean) {
	const s = saisonsDe(t).find((x) => x.numero === saison);
	if (!s || episode < 1 || episode > s.episodes) return false;
	const base = db();
	base.transaction((tx) => {
		const condition = and(
			eq(schema.episodesVus.membreId, membreId),
			eq(schema.episodesVus.titreId, t.id),
			eq(schema.episodesVus.saison, saison)
		);
		if (vu) {
			for (let e = 1; e <= episode; e++)
				tx.insert(schema.episodesVus).values({ membreId, titreId: t.id, saison, episode: e }).onConflictDoNothing().run();
		} else {
			const aRetirer = Array.from({ length: s.episodes - episode + 1 }, (_, i) => episode + i);
			tx.delete(schema.episodesVus).where(and(condition, inArray(schema.episodesVus.episode, aRetirer))).run();
		}
	});
	majStatutSerie(membreId, t);
	return true;
}

/** Statut d'une série d'après les épisodes cochés. */
export function majStatutSerie(membreId: number, t: Titre) {
	const base = db();
	const cochés = episodesVusDe([membreId], [t.id]).get(membreId)?.get(t.id) ?? [];
	const av = avancement(saisonsDe(t), cochés);
	const ligne = base
		.select()
		.from(schema.watchlist)
		.where(and(eq(schema.watchlist.membreId, membreId), eq(schema.watchlist.titreId, t.id)))
		.get();
	if (!av) return;
	if (av.total && av.vusTotal === av.total) {
		if (ligne?.statut !== 'vu') definirStatut(membreId, t.id, 'vu');
	} else if (av.vusTotal > 0) {
		if (ligne?.statut !== 'cours') definirStatut(membreId, t.id, 'cours');
	}
}

/** Titre local par identifiant (404 si absent). */
export function titreParId(id: number | null) {
	if (!id) return undefined;
	return db().select().from(schema.titres).where(eq(schema.titres.id, id)).get();
}

/**
 * Idées pour « Ajouter un titre » quand la recherche est vide : les titres conseillés au membre,
 * puis ceux des listes des autres qu'il n'a pas encore.
 */
export function idees(moiId: number, prenom: (id: number) => string, max = 12) {
	const base = db();
	const miens = new Set(
		base.select({ id: schema.watchlist.titreId }).from(schema.watchlist).where(eq(schema.watchlist.membreId, moiId)).all().map((r) => r.id)
	);
	const res = new Map<number, { titre: VueTitre; source: string }>();
	const conseilles = base
		.select()
		.from(schema.conseils)
		.innerJoin(schema.titres, eq(schema.conseils.titreId, schema.titres.id))
		.where(eq(schema.conseils.aId, moiId))
		.all()
		.sort((a, b) => b.conseils.creeLe - a.conseils.creeLe);
	for (const { conseils: c, titres: t } of conseilles)
		if (!miens.has(t.id) && !res.has(t.id)) res.set(t.id, { titre: versVue(t), source: `conseillé par ${prenom(c.deId)}` });
	const autres = base
		.select()
		.from(schema.watchlist)
		.innerJoin(schema.titres, eq(schema.watchlist.titreId, schema.titres.id))
		.all()
		.filter((r) => r.watchlist.membreId !== moiId)
		.sort((a, b) => b.watchlist.ajouteLe - a.watchlist.ajouteLe);
	for (const { watchlist: w, titres: t } of autres)
		if (!miens.has(t.id) && !res.has(t.id)) res.set(t.id, { titre: versVue(t), source: `dans la liste de ${prenom(w.membreId)}` });
	return [...res.values()].slice(0, max);
}
