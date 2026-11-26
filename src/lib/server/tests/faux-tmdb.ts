// Faux serveur TMDB pour les tests (réponses fixes selon le chemin).
/** Faux TMDB : répond selon le chemin et garde les adresses et en-têtes reçus. */
export function fauxTmdb() {
	const appels: { url: URL; auth?: string }[] = [];
	const fetcher = (async (url: URL, init: RequestInit) => {
		appels.push({ url, auth: (init.headers as Record<string, string>).Authorization });
		const p = url.pathname.replace('/3', '');
		if (p === '/search/multi')
			return Response.json({
				results: [
					{ id: 7, media_type: 'movie', title: 'Dune', original_title: 'Dune', release_date: '2021-09-15', poster_path: '/dune.jpg' },
					{ id: 99, media_type: 'person', name: 'Denis Villeneuve' },
					{ id: 42, media_type: 'tv', name: 'Severance', original_name: 'Severance', first_air_date: '2022-02-17', poster_path: null }
				]
			});
		if (p === '/movie/7')
			return Response.json({ id: 7, title: 'Dune', original_title: 'Dune', release_date: '2021-09-15', runtime: 155, genres: [{ name: 'Science-Fiction' }], overview: 'Arrakis.' });
		if (p === '/tv/42')
			return Response.json({
				id: 42,
				name: 'Severance',
				first_air_date: '2022-02-17',
				episode_run_time: [],
				last_episode_to_air: { runtime: 50 },
				genres: [{ name: 'Drame' }],
				seasons: [
					{ season_number: 0, name: 'Épisodes spéciaux', episode_count: 3 },
					{ season_number: 1, name: 'Saison 1', episode_count: 3 },
					{ season_number: 2, name: 'Saison 2', episode_count: 2 }
				]
			});
		if (p === '/tv/42/season/1')
			return Response.json({ episodes: [{ episode_number: 2, name: 'Deux', runtime: 52 }, { episode_number: 1, name: 'Un' }, { episode_number: 3, name: '' }] });
		return new Response('{}', { status: 404 });
	}) as unknown as typeof fetch;
	return { appels, fetcher };
}
