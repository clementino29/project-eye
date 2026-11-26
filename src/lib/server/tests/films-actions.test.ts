// Watchlist : ajout depuis TMDB, épisodes cochés, statut automatique, note, conseils (base en mémoire).
import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { ouvrirBase, remplacerBase, db, schema } from '../db/index.ts';
import { ClientTmdb, remplacerTmdb } from '../tmdb.ts';
import { fauxTmdb } from './faux-tmdb.ts';
import { actions as actionsListe, load as chargerListe } from '../../../routes/films/ma-watchlist/+page.server.ts';
import { actions as actionsFiche, load as chargerFiche } from '../../../routes/films/titre/[id]/+page.server.ts';
import { load as chargerPotes } from '../../../routes/films/les-potes/+page.server.ts';
import type { Membre } from '../db/schema.ts';

let lea: Membre;
let tom: Membre;
let serieId: number;

const requete = (membre: Membre, champs: Record<string, string | number | (string | number)[]> = {}, id?: number) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(champs)) for (const x of [v].flat()) f.append(k, String(x));
	return {
		request: new Request('http://test/', { method: 'POST', body: f }),
		locals: { membre },
		params: { id: String(id ?? serieId) },
		url: new URL('http://test/')
	} as never;
};
const ligne = (membre: Membre, titreId = serieId) =>
	db()
		.select()
		.from(schema.watchlist)
		.where(and(eq(schema.watchlist.membreId, membre.id), eq(schema.watchlist.titreId, titreId)))
		.get();
const vus = (membre: Membre) =>
	db()
		.select()
		.from(schema.episodesVus)
		.where(eq(schema.episodesVus.membreId, membre.id))
		.all()
		.map((v) => `${v.saison}.${v.episode}`)
		.sort();

beforeAll(() => {
	remplacerBase(ouvrirBase(':memory:'));
	remplacerTmdb(new ClientTmdb('cle', fauxTmdb().fetcher));
	lea = db().insert(schema.membres).values({ authentikId: 'a', pseudo: 'lea', nom: 'Léa Martin' }).returning().get();
	tom = db().insert(schema.membres).values({ authentikId: 'b', pseudo: 'tom', nom: 'Tom Durand' }).returning().get();
});

describe('Ma watchlist', () => {
	it('ajoute une série trouvée sur TMDB et garde sa fiche en cache', async () => {
		const r = (await actionsListe.ajouter(requete(lea, { type: 'serie', tmdbId: 42, statut: 'avoir' }))) as { titreId: number };
		serieId = r.titreId;
		const t = db().select().from(schema.titres).where(eq(schema.titres.id, serieId)).get()!;
		expect(t).toMatchObject({ titre: 'Severance', duree: 50, annee: 2022 });
		expect(JSON.parse(t.saisons)).toHaveLength(2);
		expect(ligne(lea)?.statut).toBe('avoir');
		// Un second ajout du même titre réutilise la fiche.
		await actionsListe.ajouter(requete(tom, { type: 'serie', tmdbId: 42, statut: 'avoir' }));
		expect(db().select().from(schema.titres).all()).toHaveLength(1);
	});

	it('coche les épisodes jusqu’à celui choisi et passe la série en cours', async () => {
		await actionsFiche.episode(requete(lea, { saison: 1, episode: 2, vu: 1 }));
		expect(vus(lea)).toEqual(['1.1', '1.2']);
		expect(ligne(lea)?.statut).toBe('cours');
		// « Épisode vu » coche le suivant ; décocher le 2 retire aussi les suivants de la saison.
		await actionsListe.episodeVu(requete(lea, { titreId: serieId, saison: 1, episode: 3 }));
		expect(vus(lea)).toEqual(['1.1', '1.2', '1.3']);
		await actionsFiche.episode(requete(lea, { saison: 1, episode: 2, vu: 0 }));
		expect(vus(lea)).toEqual(['1.1']);
	});

	it('passe la série en « Vu » quand tout est coché, avec la date de fin', async () => {
		await actionsFiche.saison(requete(lea, { saison: 1 }));
		await actionsFiche.saison(requete(lea, { saison: 2 }));
		expect(ligne(lea)).toMatchObject({ statut: 'vu' });
		expect(ligne(lea)?.finiLe).toBeGreaterThan(0);
		const page = (await chargerListe({ locals: { membre: lea } } as never)) as { stats: { valeur: string }[] };
		expect(page.stats[2].valeur).toBe('5'); // épisodes vus
		expect(page.stats[3].valeur).toBe('1'); // séries terminées
	});

	it('note, publie un avis et conseille le titre à un pote', async () => {
		await actionsFiche.note(requete(lea, { note: 5 }));
		await actionsFiche.avis(requete(lea, { avis: 'Fin de saison de fou' }));
		expect(ligne(lea)).toMatchObject({ note: 5, avis: 'Fin de saison de fou' });
		const r = (await actionsFiche.conseiller(requete(lea, { a: [tom.id, lea.id, 999] }))) as { ok: string };
		expect(r.ok).toBe('Conseillé à Tom');
		expect(db().select().from(schema.conseils).all()).toHaveLength(1);
	});

	it('montre la liste et l’avis de Léa chez les potes de Tom', async () => {
		const fiche = (await chargerFiche(requete(tom))) as { potes: { avis: string | null; statut: string }[]; sansLui: string[] };
		expect(fiche.potes).toMatchObject([{ statut: 'vu', avis: 'Fin de saison de fou' }]);
		expect(fiche.sansLui).toEqual([]);
		const potes = (await chargerPotes(requete(tom))) as { choisi: { id: number }; communs: string[]; fil: { texte: string }[] };
		expect(potes.choisi.id).toBe(lea.id);
		expect(potes.communs).toEqual(['Severance']);
		expect(potes.fil.map((f) => f.texte)).toContain('t\'a conseillé Severance');
	});

	it('retire le titre et ses épisodes cochés', async () => {
		await actionsFiche.retirer(requete(lea));
		expect(ligne(lea)).toBeUndefined();
		expect(vus(lea)).toEqual([]);
		expect(ligne(tom)?.statut).toBe('avoir');
	});

	it('refuse un titre inconnu', async () => {
		const r = (await actionsListe.ajouter(requete(lea, { type: 'film', tmdbId: 1234 }))) as { status: number };
		expect(r.status).toBe(502);
	});
});
