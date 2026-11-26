// Watch list commune côté serveur : liste partagée, votes, soirées, épisodes vus ensemble.
import { and, eq, gte, inArray, ne } from 'drizzle-orm';
import { db, schema } from './db/index.ts';
import type { Titre } from './db/schema.ts';
import { saisonsDe, versVue, type VueTitre } from './films.ts';
import { avancement, type Avancement, type StatutWl } from '../watchlist.ts';
import { cleJour, VOTES_MAX } from '../commune.ts';
import { tousLesMembres } from './membres.ts';

export const aujourdhui = () => cleJour(new Date());

export interface EntreeCommune {
	titre: VueTitre;
	/** Pour reconnaître un résultat TMDB déjà dans la liste. */
	cleTmdb: string;
	statut: StatutWl;
	proposeParId: number | null;
	ajouteLe: number;
	finiLe: number | null;
	/** Membres qui ont voté (titres pas encore vus seulement). */
	votes: number[];
	/** Membres qui l'ont déjà vu : case « Je l'ai déjà vu » ou « Vu » dans leur watchlist. */
	dejaVu: number[];
	/** Ceux qui l'ont coché à la main (les autres viennent de leur watchlist). */
	dejaVuCoche: number[];
	/** Séries : où en est la bande. */
	avancement: Avancement | null;
}

export const cleTmdb = (t: Pick<Titre, 'type' | 'tmdbId'>) => `${t.type}:${t.tmdbId}`;

/** Toute la liste commune, triée par votes puis par date d'ajout. */
export function lireCommune(titreIds?: number[]): EntreeCommune[] {
	const base = db();
	const lignes = base
		.select()
		.from(schema.listeCommune)
		.innerJoin(schema.titres, eq(schema.listeCommune.titreId, schema.titres.id))
		.where(titreIds ? inArray(schema.listeCommune.titreId, titreIds.length ? titreIds : [-1]) : undefined)
		.all();
	const ids = lignes.map((l) => l.titres.id);
	const dans = <T extends { titreId: number }>(rows: T[]) => {
		const m = new Map<number, T[]>();
		for (const r of rows) m.set(r.titreId, [...(m.get(r.titreId) ?? []), r]);
		return m;
	};
	const parIds = ids.length ? ids : [-1];
	const votes = dans(base.select().from(schema.votesTitre).where(inArray(schema.votesTitre.titreId, parIds)).all());
	const coches = dans(base.select().from(schema.dejaVus).where(inArray(schema.dejaVus.titreId, parIds)).all());
	const watchVus = dans(
		base
			.select({ titreId: schema.watchlist.titreId, membreId: schema.watchlist.membreId })
			.from(schema.watchlist)
			.where(and(inArray(schema.watchlist.titreId, parIds), eq(schema.watchlist.statut, 'vu')))
			.all()
	);
	const episodes = dans(base.select().from(schema.episodesVusEnsemble).where(inArray(schema.episodesVusEnsemble.titreId, parIds)).all());

	return lignes
		.map(({ liste_commune: l, titres: t }) => {
			const vue = versVue(t);
			const coche = (coches.get(t.id) ?? []).map((r) => r.membreId);
			return {
				titre: vue,
				cleTmdb: cleTmdb(t),
				statut: l.statut,
				proposeParId: l.proposeParId,
				ajouteLe: l.ajouteLe,
				finiLe: l.finiLe,
				votes: (votes.get(t.id) ?? []).sort((a, b) => a.creeLe - b.creeLe).map((v) => v.membreId),
				dejaVu: [...new Set([...coche, ...(watchVus.get(t.id) ?? []).map((r) => r.membreId)])],
				dejaVuCoche: coche,
				avancement: t.type === 'serie' ? avancement(vue.saisons, episodes.get(t.id) ?? []) : null
			};
		})
		.sort((a, b) => b.votes.length - a.votes.length || a.ajouteLe - b.ajouteLe);
}

export function entreeCommune(titreId: number) {
	return db().select().from(schema.listeCommune).where(eq(schema.listeCommune.titreId, titreId)).get();
}

export interface VueSoiree {
	id: number;
	date: string;
	heure: string;
	lieu: string;
	titreId: number | null;
	note: string | null;
	viennent: number[];
}

/** Toutes les soirées (passées et à venir), dans l'ordre des dates. */
export function lireSoirees(): VueSoiree[] {
	const base = db();
	const presences = base.select().from(schema.presencesSoiree).all();
	return base
		.select()
		.from(schema.soirees)
		.orderBy(schema.soirees.date)
		.all()
		.map((s) => ({
			id: s.id,
			date: s.date,
			heure: s.heure,
			lieu: s.lieu,
			titreId: s.titreId,
			note: s.note,
			viennent: presences
				.filter((p) => p.soireeId === s.id)
				.sort((a, b) => a.creeLe - b.creeLe)
				.map((p) => p.membreId)
		}));
}

/** Ajoute un titre à la liste commune (ou le laisse s'il y est déjà). */
export function ajouterCommune(moiId: number, titreId: number, dejaVuPar: number[] = []) {
	const base = db();
	base.transaction((tx) => {
		tx.insert(schema.listeCommune).values({ titreId, proposeParId: moiId }).onConflictDoNothing().run();
		for (const membreId of dejaVuPar) tx.insert(schema.dejaVus).values({ membreId, titreId }).onConflictDoNothing().run();
	});
}

export function retirerCommune(titreId: number) {
	const base = db();
	base.transaction((tx) => {
		// Les soirées à venir prévues sur ce titre redeviennent « Titre à choisir ».
		tx.update(schema.soirees).set({ titreId: null }).where(and(eq(schema.soirees.titreId, titreId), gte(schema.soirees.date, aujourdhui()))).run();
		tx.delete(schema.listeCommune).where(eq(schema.listeCommune.titreId, titreId)).run();
	});
}

export type ResultatVote = 'vote' | 'retire' | 'plus-de-votes' | 'deja-vu';

/** Vote (ou retire son vote) pour un titre ; 3 votes au plus parmi les titres pas encore vus. */
export function basculerVote(moiId: number, titreId: number): ResultatVote {
	const base = db();
	return base.transaction((tx) => {
		const entree = tx.select().from(schema.listeCommune).where(eq(schema.listeCommune.titreId, titreId)).get();
		if (!entree || entree.statut === 'vu') return 'deja-vu';
		const condition = and(eq(schema.votesTitre.membreId, moiId), eq(schema.votesTitre.titreId, titreId));
		if (tx.select().from(schema.votesTitre).where(condition).get()) {
			tx.delete(schema.votesTitre).where(condition).run();
			return 'retire';
		}
		const utilises = tx
			.select({ titreId: schema.votesTitre.titreId })
			.from(schema.votesTitre)
			.innerJoin(schema.listeCommune, eq(schema.votesTitre.titreId, schema.listeCommune.titreId))
			.where(and(eq(schema.votesTitre.membreId, moiId), ne(schema.listeCommune.statut, 'vu')))
			.all().length;
		if (utilises >= VOTES_MAX) return 'plus-de-votes';
		tx.insert(schema.votesTitre).values({ membreId: moiId, titreId }).run();
		return 'vote';
	});
}

/** Change le statut commun ; « Vu » libère les votes, et pour une série coche ou efface les épisodes. */
export function definirStatutCommun(t: Titre, statut: StatutWl) {
	const base = db();
	base.transaction((tx) => {
		const fini = statut === 'vu' ? Date.now() : null;
		tx.update(schema.listeCommune).set({ statut, finiLe: fini }).where(eq(schema.listeCommune.titreId, t.id)).run();
		if (statut === 'vu') tx.delete(schema.votesTitre).where(eq(schema.votesTitre.titreId, t.id)).run();
		if (t.type !== 'serie') return;
		if (statut === 'avoir') tx.delete(schema.episodesVusEnsemble).where(eq(schema.episodesVusEnsemble.titreId, t.id)).run();
		if (statut === 'vu')
			for (const s of saisonsDe(t))
				for (let e = 1; e <= s.episodes; e++)
					tx.insert(schema.episodesVusEnsemble).values({ titreId: t.id, saison: s.numero, episode: e }).onConflictDoNothing().run();
	});
}

/**
 * « Vous en êtes là » : marque vus ensemble tous les épisodes jusqu'à celui-ci (saisons
 * d'avant comprises) et retire ceux d'après. Épisode 0 : rien de vu dans cette saison.
 * Le statut suit : « En cours » dès un épisode, « Vu » quand tout est vu.
 */
export function regarderJusqua(t: Titre, saison: number, episode: number) {
	const saisons = saisonsDe(t);
	const s = saisons.find((x) => x.numero === saison);
	if (t.type !== 'serie' || !s || episode < 0 || episode > s.episodes) return false;
	const base = db();
	const vus: { saison: number; episode: number }[] = [];
	for (const x of saisons) {
		if (x.numero > saison) break;
		const fin = x.numero === saison ? episode : x.episodes;
		for (let e = 1; e <= fin; e++) vus.push({ saison: x.numero, episode: e });
	}
	base.transaction((tx) => {
		tx.delete(schema.episodesVusEnsemble).where(eq(schema.episodesVusEnsemble.titreId, t.id)).run();
		for (const v of vus) tx.insert(schema.episodesVusEnsemble).values({ titreId: t.id, ...v }).run();
	});
	const total = saisons.reduce((n, x) => n + x.episodes, 0);
	const statut: StatutWl = total && vus.length === total ? 'vu' : vus.length ? 'cours' : 'avoir';
	if (entreeCommune(t.id)?.statut !== statut) definirStatutCommun(t, statut);
	return true;
}

/** « Je l'ai déjà vu » (case à cocher). */
export function definirDejaVu(moiId: number, titreId: number, vu: boolean) {
	const condition = and(eq(schema.dejaVus.membreId, moiId), eq(schema.dejaVus.titreId, titreId));
	if (vu) db().insert(schema.dejaVus).values({ membreId: moiId, titreId }).onConflictDoNothing().run();
	else db().delete(schema.dejaVus).where(condition).run();
}

export interface ChampsSoiree {
	date: string;
	heure: string;
	lieu: string;
	titreId: number | null;
	note: string | null;
}

/**
 * Programme une soirée. Une seule soirée par date : si la date est prise, on met à jour
 * celle-ci. `id` : modification d'une soirée existante (qui peut changer de date).
 * Celui qui programme vient d'office.
 */
export function programmerSoiree(moiId: number, champs: ChampsSoiree, id?: number) {
	const base = db();
	return base.transaction((tx) => {
		const memeDate = tx.select().from(schema.soirees).where(eq(schema.soirees.date, champs.date)).get();
		if (id) {
			if (memeDate && memeDate.id !== id) return { erreur: 'Il y a déjà une soirée ce jour-là.' } as const;
			const maj = tx.update(schema.soirees).set(champs).where(eq(schema.soirees.id, id)).returning().get();
			return maj ? ({ soiree: maj } as const) : ({ erreur: 'Soirée introuvable.' } as const);
		}
		const soiree = memeDate
			? tx.update(schema.soirees).set(champs).where(eq(schema.soirees.id, memeDate.id)).returning().get()
			: tx.insert(schema.soirees).values({ ...champs, creeParId: moiId }).returning().get();
		if (!memeDate) tx.insert(schema.presencesSoiree).values({ soireeId: soiree.id, membreId: moiId }).onConflictDoNothing().run();
		return { soiree } as const;
	});
}

/** Glisser un titre sur une date du calendrier : crée la soirée ou lui donne ce titre. */
export function caserTitre(moiId: number, date: string, titreId: number) {
	const existante = db().select().from(schema.soirees).where(eq(schema.soirees.date, date)).get();
	if (existante) {
		db().update(schema.soirees).set({ titreId }).where(eq(schema.soirees.id, existante.id)).run();
		return existante.id;
	}
	return programmerSoiree(moiId, { date, heure: '21:00', lieu: 'En ligne', titreId, note: null }).soiree!.id;
}

export function soireeParId(id: number | null) {
	if (!id) return undefined;
	return db().select().from(schema.soirees).where(eq(schema.soirees.id, id)).get();
}

export function choisirTitreSoiree(soireeId: number, titreId: number | null) {
	db().update(schema.soirees).set({ titreId }).where(eq(schema.soirees.id, soireeId)).run();
}

/** « Je viens » : ajoute ou retire sa présence. Renvoie true si le membre vient. */
export function basculerPresence(soireeId: number, moiId: number) {
	const base = db();
	const condition = and(eq(schema.presencesSoiree.soireeId, soireeId), eq(schema.presencesSoiree.membreId, moiId));
	if (base.select().from(schema.presencesSoiree).where(condition).get()) {
		base.delete(schema.presencesSoiree).where(condition).run();
		return false;
	}
	base.insert(schema.presencesSoiree).values({ soireeId, membreId: moiId }).run();
	return true;
}

export function supprimerSoiree(id: number) {
	db().delete(schema.soirees).where(eq(schema.soirees.id, id)).run();
}

/**
 * Idées pour « Ajouter un titre » quand la recherche est vide : ce qui traîne dans les
 * watchlists (À voir, En cours) et pas encore dans la liste commune, le plus partagé d'abord.
 */
export function ideesCommune(prenom: (id: number) => string, max = 8) {
	const base = db();
	const deja = new Set(base.select({ id: schema.listeCommune.titreId }).from(schema.listeCommune).all().map((r) => r.id));
	const lignes = base
		.select()
		.from(schema.watchlist)
		.innerJoin(schema.titres, eq(schema.watchlist.titreId, schema.titres.id))
		.where(ne(schema.watchlist.statut, 'vu'))
		.all();
	const parTitre = new Map<number, { titre: Titre; membres: number[]; recent: number }>();
	for (const { watchlist: w, titres: t } of lignes) {
		if (deja.has(t.id)) continue;
		const e = parTitre.get(t.id) ?? { titre: t, membres: [], recent: 0 };
		e.membres.push(w.membreId);
		e.recent = Math.max(e.recent, w.ajouteLe);
		parTitre.set(t.id, e);
	}
	return [...parTitre.values()]
		.sort((a, b) => b.membres.length - a.membres.length || b.recent - a.recent)
		.slice(0, max)
		.map((e) => {
			const noms = e.membres.map(prenom);
			const source = noms.length > 2 ? `dans ${noms.length} watchlists` : `dans la watchlist de ${noms.join(' et ')}`;
			return { titre: versVue(e.titre), cleTmdb: cleTmdb(e.titre), source };
		});
}

/** Ce que les pages de la Watch list commune reçoivent toutes (visiteurs : prénoms seuls). */
export function donneesCommune(moi: { id: number } | null) {
	const membres = tousLesMembres({ visiteur: !moi });
	const liste = lireCommune();
	const votesUtilises = moi ? liste.filter((e) => e.statut !== 'vu' && e.votes.includes(moi.id)).length : 0;
	return {
		moiId: moi?.id ?? null,
		membres: membres.map((m) => ({ id: m.id, nom: m.nom, photo: m.photo })),
		/** « En ligne », puis « Chez <prénom> » pour chaque membre. */
		lieux: ['En ligne', ...membres.map((m) => `Chez ${m.nom.split(' ')[0]}`)],
		liste,
		soirees: lireSoirees(),
		aujourdhui: aujourdhui(),
		votesUtilises
	};
}
