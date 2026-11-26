// Recherche TMDB pour la fenêtre « Ajouter un titre » : GET /films/tmdb?q=dune&type=film
import { error, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { exigerMembre } from '#lib/server/garde.ts';
import { config } from '#lib/server/config.ts';
import { db, schema } from '#lib/server/db/index.ts';
import { ErreurTmdb, tmdb, urlAffiche } from '#lib/server/tmdb.ts';

export const GET = async ({ url, locals }) => {
	const moi = exigerMembre(locals);
	if (!config.tmdb.configure) error(503, 'TMDB n’est pas configuré.');
	const t = url.searchParams.get('type');
	const type = t === 'film' || t === 'serie' ? t : 'tout';
	try {
		const resultats = await tmdb().chercher(url.searchParams.get('q') ?? '', type);
		const base = db();
		// Indique les titres déjà dans ma liste.
		return json(
			resultats.map((r) => {
				const local = base
					.select({ statut: schema.watchlist.statut })
					.from(schema.titres)
					.innerJoin(schema.watchlist, and(eq(schema.watchlist.titreId, schema.titres.id), eq(schema.watchlist.membreId, moi.id)))
					.where(and(eq(schema.titres.type, r.type), eq(schema.titres.tmdbId, r.tmdbId)))
					.get();
				return { ...r, affiche: urlAffiche(r.affiche, 'w185'), statut: local?.statut ?? null };
			})
		);
	} catch (e) {
		if (e instanceof ErreurTmdb) error(502, e.message);
		throw e;
	}
};
