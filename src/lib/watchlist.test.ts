import { describe, expect, it } from 'vitest';
import { avancement, statsWatchlist } from './watchlist.ts';

const SAISONS = [
	{ numero: 1, nom: 'Saison 1', episodes: 3 },
	{ numero: 2, nom: 'Saison 2', episodes: 4 }
];

describe('avancement dans une série', () => {
	it('trouve le prochain épisode et la saison en cours', () => {
		const vus = [1, 2, 3].map((episode) => ({ saison: 1, episode })).concat([{ saison: 2, episode: 1 }]);
		expect(avancement(SAISONS, vus)).toEqual({ saison: 2, vusSaison: 1, totalSaison: 4, pct: 25, prochain: { saison: 2, episode: 2 }, vusTotal: 4, total: 7 });
		expect(avancement(SAISONS, [])?.prochain).toEqual({ saison: 1, episode: 1 });
		expect(avancement([], [])).toBeNull();
	});
	it('reste sur la dernière saison quand tout est vu', () => {
		const tout = SAISONS.flatMap((s) => Array.from({ length: s.episodes }, (_, i) => ({ saison: s.numero, episode: i + 1 })));
		expect(avancement(SAISONS, tout)).toMatchObject({ saison: 2, pct: 100, prochain: null, vusTotal: 7 });
	});
});

describe('stats de la watchlist', () => {
	it('compte le temps, les films, les épisodes et les séries', () => {
		const [temps, films, episodes, series] = statsWatchlist([
			{ type: 'film', statut: 'vu', duree: 150, totalEpisodes: 0, episodesVus: 0 },
			{ type: 'film', statut: 'avoir', duree: 120, totalEpisodes: 0, episodesVus: 0 },
			// Série vue sans épisodes cochés : tous ses épisodes comptent.
			{ type: 'serie', statut: 'vu', duree: 50, totalEpisodes: 20, episodesVus: 0 },
			{ type: 'serie', statut: 'cours', duree: 30, totalEpisodes: 10, episodesVus: 4 }
		]);
		expect(temps).toMatchObject({ valeur: '21 h', sous: '19 h de séries · 3 h de films', barre: 88, indice: '' });
		expect(films).toMatchObject({ valeur: '1', sous: 'Durée moyenne : 2 h 30' });
		expect(episodes).toMatchObject({ valeur: '24', sous: 'Sur 2 séries' });
		expect(series).toMatchObject({ valeur: '1', sous: '1 en cours' });
		expect(statsWatchlist([])[1].sous).toBe('Aucun pour l’instant');
	});
});
