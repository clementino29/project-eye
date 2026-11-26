// Films & séries : statuts, avancement dans une série et stats (partagés entre serveur et pages).

export type StatutWl = 'avoir' | 'cours' | 'vu';
export type TypeTitre = 'film' | 'serie';
export const ORDRE_WL: StatutWl[] = ['cours', 'avoir', 'vu'];
export const LIBELLES_WL: Record<StatutWl, { l: string; pl: string }> = {
	cours: { l: 'En cours', pl: 'En cours' },
	avoir: { l: 'À voir', pl: 'À voir' },
	vu: { l: 'Vu', pl: 'Vus' }
};

export interface SaisonInfo {
	numero: number;
	nom: string;
	episodes: number;
}
export interface EpisodeVu {
	saison: number;
	episode: number;
}

export interface Avancement {
	/** Saison affichée : celle du prochain épisode, ou la dernière si tout est vu. */
	saison: number;
	vusSaison: number;
	totalSaison: number;
	pct: number;
	prochain: EpisodeVu | null;
	vusTotal: number;
	total: number;
}

/** Où en est un membre dans une série, d'après les épisodes cochés. */
export function avancement(saisons: SaisonInfo[], vus: EpisodeVu[]): Avancement | null {
	if (!saisons.length) return null;
	const cles = new Set(vus.map((v) => `${v.saison}:${v.episode}`));
	let prochain: EpisodeVu | null = null;
	let vusTotal = 0;
	let total = 0;
	for (const s of saisons) {
		for (let e = 1; e <= s.episodes; e++) {
			total++;
			if (cles.has(`${s.numero}:${e}`)) vusTotal++;
			else prochain ??= { saison: s.numero, episode: e };
		}
	}
	const saison = saisons.find((s) => s.numero === prochain?.saison) ?? saisons[saisons.length - 1];
	let vusSaison = 0;
	for (let e = 1; e <= saison.episodes; e++) if (cles.has(`${saison.numero}:${e}`)) vusSaison++;
	return {
		saison: saison.numero,
		vusSaison,
		totalSaison: saison.episodes,
		pct: Math.round((vusSaison / saison.episodes) * 100),
		prochain,
		vusTotal,
		total
	};
}

export interface EntreeStats {
	type: TypeTitre;
	statut: StatutWl;
	/** Minutes : film, ou épisode d'une série. */
	duree: number | null;
	/** Séries : nombre d'épisodes en tout et nombre d'épisodes cochés. */
	totalEpisodes: number;
	episodesVus: number;
}

export interface TuileStats {
	icone: string;
	libelle: string;
	valeur: string;
	sous: string;
	/** Part des séries dans le temps total (barre), en %. */
	barre: number | null;
	indice: string;
}

const heures = (min: number) => Math.round(min / 60);

/** Les quatre cartes « Tes stats » : temps devant l'écran, films vus, épisodes vus, séries terminées. */
export function statsWatchlist(entrees: EntreeStats[]): TuileStats[] {
	let films = 0;
	let minFilms = 0;
	let episodes = 0;
	let minSeries = 0;
	let finies = 0;
	let enCours = 0;
	for (const e of entrees) {
		if (e.type === 'film') {
			if (e.statut === 'vu') {
				films++;
				minFilms += e.duree ?? 0;
			}
			continue;
		}
		// Une série marquée « Vu » compte tous ses épisodes, même sans les avoir cochés un par un.
		const n = e.statut === 'vu' ? Math.max(e.totalEpisodes, e.episodesVus) : e.episodesVus;
		if (e.statut === 'vu') finies++;
		else if (e.statut === 'cours') enCours++;
		episodes += n;
		minSeries += n * (e.duree ?? 0);
	}
	const total = minFilms + minSeries;
	const jours = Math.floor(total / 1440);
	const moyenne = films ? Math.round(minFilms / films) : 0;
	const series = finies + enCours;
	return [
		{
			icone: 'clock',
			libelle: 'Temps devant l’écran',
			valeur: `${heures(total)} h`,
			sous: `${heures(minSeries)} h de séries · ${heures(minFilms)} h de films`,
			barre: total ? Math.round((minSeries / total) * 100) : 0,
			indice: jours ? `Soit ${jours} j et ${Math.round((total % 1440) / 60)} h` : ''
		},
		{
			icone: 'film',
			libelle: 'Films vus',
			valeur: String(films),
			sous: films ? `Durée moyenne : ${Math.floor(moyenne / 60)} h ${String(moyenne % 60).padStart(2, '0')}` : 'Aucun pour l’instant',
			barre: null,
			indice: ''
		},
		{
			icone: 'tv',
			libelle: 'Épisodes vus',
			valeur: String(episodes),
			sous: `Sur ${series} série${series > 1 ? 's' : ''}`,
			barre: null,
			indice: ''
		},
		{ icone: 'trophy', libelle: 'Séries terminées', valeur: String(finies), sous: `${enCours} en cours`, barre: null, indice: '' }
	];
}

/** Recherche sans accents ni majuscules. */
export const normaliser = (s: string) =>
	s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase();
