import { describe, expect, it } from 'vitest';
import { ClientTmdb, ErreurTmdb, urlAffiche, versFiche } from '../tmdb.ts';
import { fauxTmdb } from './faux-tmdb.ts';

describe('TMDB', () => {
	it('lit une série : saisons sans les épisodes spéciaux, durée d’un épisode', () => {
		const f = versFiche(
			{ id: 1, name: 'X', first_air_date: '2020-01-01', episode_run_time: [0, 42], seasons: [{ season_number: 0, episode_count: 2 }, { season_number: 1, episode_count: 8 }] },
			'serie'
		);
		expect(f).toMatchObject({ titre: 'X', annee: 2020, duree: 42, saisons: [{ numero: 1, nom: 'Saison 1', episodes: 8 }] });
		expect(urlAffiche('/a.jpg')).toBe('https://image.tmdb.org/t/p/w342/a.jpg');
		expect(urlAffiche(null)).toBeNull();
	});

	it('cherche en français, écarte les personnes et passe la clé v3 en paramètre', async () => {
		const { appels, fetcher } = fauxTmdb();
		const r = await new ClientTmdb('cle-v3', fetcher).chercher('  dune  ');
		expect(r.map((x) => [x.type, x.titre, x.annee])).toEqual([
			['film', 'Dune', 2021],
			['serie', 'Severance', 2022]
		]);
		expect(appels[0].url.searchParams.get('api_key')).toBe('cle-v3');
		expect(appels[0].url.searchParams.get('language')).toBe('fr-FR');
		expect(appels[0].url.searchParams.get('query')).toBe('dune');
	});

	it('envoie un jeton v4 en en-tête et lit les épisodes d’une saison', async () => {
		const { appels, fetcher } = fauxTmdb();
		const c = new ClientTmdb('eyJjeton', fetcher);
		expect(await c.saison(42, 1)).toEqual([
			{ numero: 1, nom: 'Un', duree: null },
			{ numero: 2, nom: 'Deux', duree: 52 },
			{ numero: 3, nom: 'Épisode 3', duree: null }
		]);
		expect(appels[0].auth).toBe('Bearer eyJjeton');
		expect(appels[0].url.searchParams.has('api_key')).toBe(false);
		await expect(c.fiche('film', 1234)).rejects.toThrow(ErreurTmdb);
		await expect(new ClientTmdb(undefined, fetcher).chercher('dune')).rejects.toThrow('pas configuré');
	});
});
