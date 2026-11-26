// Films et séries depuis l'API TMDB (titres en français, affiches, saisons et épisodes).
// La clé peut être une clé d'API v3 (paramètre api_key) ou un jeton de lecture v4 (en-tête Bearer).
import { config } from './config.ts';

type Fetch = typeof fetch;

export type TypeTitre = 'film' | 'serie';

export interface ResultatTmdb {
	tmdbId: number;
	type: TypeTitre;
	titre: string;
	titreOriginal: string | null;
	annee: number | null;
	affiche: string | null;
}

export interface SaisonTmdb {
	numero: number;
	nom: string;
	episodes: number;
}

export interface FicheTmdb extends ResultatTmdb {
	resume: string | null;
	genres: string[];
	/** Minutes : durée du film, ou d'un épisode pour une série. */
	duree: number | null;
	saisons: SaisonTmdb[];
}

export interface EpisodeTmdb {
	numero: number;
	nom: string;
	duree: number | null;
}

const BASE = 'https://api.themoviedb.org/3';

/** Adresse d'une affiche TMDB (largeur 342 px par défaut, 780 px pour la fiche). */
export const urlAffiche = (chemin: string | null | undefined, largeur: 'w185' | 'w342' | 'w780' = 'w342') =>
	chemin ? `https://image.tmdb.org/t/p/${largeur}${chemin}` : null;

const annee = (date?: string | null) => {
	const a = Number.parseInt((date ?? '').slice(0, 4), 10);
	return Number.isFinite(a) && a > 0 ? a : null;
};
const texte = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

interface Brut {
	id: number;
	media_type?: string;
	title?: string;
	name?: string;
	original_title?: string;
	original_name?: string;
	release_date?: string;
	first_air_date?: string;
	poster_path?: string | null;
	overview?: string;
	genres?: { name: string }[];
	runtime?: number | null;
	episode_run_time?: number[];
	last_episode_to_air?: { runtime?: number | null } | null;
	seasons?: { season_number: number; name?: string; episode_count?: number }[];
}

export function versResultat(r: Brut, type: TypeTitre): ResultatTmdb {
	const titre = texte(type === 'film' ? r.title : r.name) ?? texte(type === 'film' ? r.original_title : r.original_name) ?? 'Sans titre';
	const original = texte(type === 'film' ? r.original_title : r.original_name);
	return {
		tmdbId: r.id,
		type,
		titre,
		titreOriginal: original && original !== titre ? original : null,
		annee: annee(type === 'film' ? r.release_date : r.first_air_date),
		affiche: texte(r.poster_path)
	};
}

export function versFiche(r: Brut, type: TypeTitre): FicheTmdb {
	const dureeSerie = r.episode_run_time?.find((d) => d > 0) ?? r.last_episode_to_air?.runtime ?? null;
	return {
		...versResultat(r, type),
		resume: texte(r.overview),
		genres: (r.genres ?? []).map((g) => g.name).filter(Boolean),
		duree: (type === 'film' ? r.runtime : dureeSerie) || null,
		// La saison 0 (épisodes spéciaux) ne compte pas dans l'avancement.
		saisons:
			type === 'serie'
				? (r.seasons ?? [])
						.filter((s) => s.season_number > 0 && (s.episode_count ?? 0) > 0)
						.map((s) => ({ numero: s.season_number, nom: texte(s.name) ?? `Saison ${s.season_number}`, episodes: s.episode_count! }))
						.sort((a, b) => a.numero - b.numero)
				: []
	};
}

export class ErreurTmdb extends Error {}

export class ClientTmdb {
	private cache = new Map<string, { valeur: ResultatTmdb[]; expire: number }>();

	constructor(
		private cle = config.tmdb.cle,
		private fetcher: Fetch = fetch
	) {}

	private async lire<T>(chemin: string, params: Record<string, string> = {}): Promise<T> {
		if (!this.cle) throw new ErreurTmdb('TMDB n’est pas configuré.');
		const url = new URL(BASE + chemin);
		url.searchParams.set('language', 'fr-FR');
		for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
		const headers: Record<string, string> = { Accept: 'application/json' };
		// Un jeton v4 est un JWT (eyJ…) ; sinon c'est une clé v3.
		if (this.cle.startsWith('eyJ')) headers.Authorization = `Bearer ${this.cle}`;
		else url.searchParams.set('api_key', this.cle);
		const rep = await this.fetcher(url, { headers, signal: AbortSignal.timeout(8000) }).catch(() => null);
		if (!rep) throw new ErreurTmdb('TMDB ne répond pas.');
		if (rep.status === 401) throw new ErreurTmdb('TMDB refuse la clé d’API.');
		if (rep.status === 404) throw new ErreurTmdb('Titre introuvable chez TMDB.');
		if (!rep.ok) throw new ErreurTmdb(`TMDB a répondu ${rep.status}.`);
		return (await rep.json()) as T;
	}

	/** Recherche de films et de séries (8 résultats au plus). */
	async chercher(brut: string, type: TypeTitre | 'tout' = 'tout'): Promise<ResultatTmdb[]> {
		const q = brut.replace(/\s+/g, ' ').trim().slice(0, 80);
		if (q.length < 2) return [];
		const cle = `${type}:${q.toLowerCase()}`;
		const enCache = this.cache.get(cle);
		if (enCache && enCache.expire > Date.now()) return enCache.valeur;
		const chemin = type === 'film' ? '/search/movie' : type === 'serie' ? '/search/tv' : '/search/multi';
		const { results = [] } = await this.lire<{ results?: Brut[] }>(chemin, { query: q, include_adult: 'false' });
		const valeur = results
			.map((r) => {
				const t: TypeTitre | null = type !== 'tout' ? type : r.media_type === 'movie' ? 'film' : r.media_type === 'tv' ? 'serie' : null;
				return t ? versResultat(r, t) : null;
			})
			.filter((r): r is ResultatTmdb => r !== null)
			.slice(0, 8);
		if (this.cache.size > 200) this.cache.clear();
		this.cache.set(cle, { valeur, expire: Date.now() + 10 * 60_000 });
		return valeur;
	}

	async fiche(type: TypeTitre, tmdbId: number): Promise<FicheTmdb> {
		return versFiche(await this.lire<Brut>(`/${type === 'film' ? 'movie' : 'tv'}/${tmdbId}`), type);
	}

	async saison(tmdbId: number, numero: number): Promise<EpisodeTmdb[]> {
		const r = await this.lire<{ episodes?: { episode_number: number; name?: string; runtime?: number | null }[] }>(
			`/tv/${tmdbId}/season/${numero}`
		);
		return (r.episodes ?? [])
			.map((e) => ({ numero: e.episode_number, nom: texte(e.name) ?? `Épisode ${e.episode_number}`, duree: e.runtime || null }))
			.sort((a, b) => a.numero - b.numero);
	}
}

let partage: ClientTmdb | undefined;
/** Client partagé (garde le cache des recherches entre les requêtes). */
export const tmdb = () => (partage ??= new ClientTmdb());
/** Pour les tests : remplace le client partagé. */
export const remplacerTmdb = (client: ClientTmdb) => {
	partage = client;
};
