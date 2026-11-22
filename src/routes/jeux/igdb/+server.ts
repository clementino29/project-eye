// Recherche IGDB pour la fenêtre « Ajouter un jeu » : GET /jeux/igdb?q=halo
import { error, json } from '@sveltejs/kit';
import { exigerMembre } from '#lib/server/garde.ts';
import { config } from '#lib/server/config.ts';
import { ErreurIgdb, igdb } from '#lib/server/igdb.ts';

export const GET = async ({ url, locals }) => {
	exigerMembre(locals);
	if (!config.igdb.configure) error(503, 'IGDB n’est pas configuré.');
	try {
		return json(await igdb().chercher(url.searchParams.get('q') ?? ''));
	} catch (e) {
		if (e instanceof ErreurIgdb) error(502, e.message);
		throw e;
	}
};
