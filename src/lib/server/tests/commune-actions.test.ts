// Watch list commune : ajout, votes (3 max), soirées, « Je viens », épisodes vus ensemble.
import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { ouvrirBase, remplacerBase, db, schema } from '../db/index.ts';
import { ClientTmdb, remplacerTmdb } from '../tmdb.ts';
import { fauxTmdb } from './faux-tmdb.ts';
import { actions, load } from '../../../routes/films/+page.server.ts';
import { actions as actionsFiche, load as chargerFiche } from '../../../routes/films/commune/[id]/+page.server.ts';
import { load as chargerCalendrier } from '../../../routes/films/calendrier/+page.server.ts';
import { cleJour, joursDuMois, moisVoisin } from '../../commune.ts';
import type { Membre } from '../db/schema.ts';

let lea: Membre;
let tom: Membre;
let serieId: number;
let duneId: number;

const dans = (jours: number) => cleJour(new Date(Date.now() + jours * 86400_000));
const requete = (membre: Membre, champs: Record<string, string | number | (string | number)[]> = {}, id?: number, url = 'http://test/') => {
	const f = new FormData();
	for (const [k, v] of Object.entries(champs)) for (const x of [v].flat()) f.append(k, String(x));
	return {
		request: new Request('http://test/', { method: 'POST', body: f }),
		locals: { membre },
		params: { id: String(id ?? serieId) },
		url: new URL(url)
	} as never;
};
type Page = Awaited<ReturnType<typeof load>>;
const page = (m: Membre | null = lea) => load({ locals: { membre: m } } as never) as Page;
const entree = (id: number, m: Membre = lea) => page(m).liste.find((e) => e.titre.id === id)!;
/** Ajoute un titre local (sans passer par TMDB) à la liste commune. */
const titreLocal = async (nom: string, type: 'film' | 'serie' = 'film') => {
	const t = db().insert(schema.titres).values({ tmdbId: Math.floor(Math.random() * 1e6), type, titre: nom }).returning().get();
	await actions.ajouter(requete(lea, { titreId: t.id }));
	return t.id;
};

beforeAll(() => {
	remplacerBase(ouvrirBase(':memory:'));
	remplacerTmdb(new ClientTmdb('cle', fauxTmdb().fetcher));
	lea = db().insert(schema.membres).values({ authentikId: 'a', pseudo: 'lea', nom: 'Léa Martin' }).returning().get();
	tom = db().insert(schema.membres).values({ authentikId: 'b', pseudo: 'tom', nom: 'Tom Durand' }).returning().get();
});

describe('Watch list commune', () => {
	it('ajoute des titres trouvés sur TMDB, avec qui les a déjà vus', async () => {
		const r = (await actions.ajouter(requete(lea, { type: 'serie', tmdbId: 42, dejaVu: [tom.id, 999] }))) as { ok: string; titreId: number };
		serieId = r.titreId;
		expect(r.ok).toBe('Severance ajouté à la liste');
		duneId = ((await actions.ajouter(requete(tom, { type: 'film', tmdbId: 7 }))) as { titreId: number }).titreId;
		const e = entree(serieId);
		expect(e).toMatchObject({ statut: 'avoir', proposeParId: lea.id, dejaVu: [tom.id], cleTmdb: 'serie:42' });
		// Un titre « Vu » dans une watchlist compte aussi comme déjà vu.
		db().insert(schema.watchlist).values({ membreId: lea.id, titreId: duneId, statut: 'vu' }).run();
		expect(entree(duneId).dejaVu).toEqual([lea.id]);
		expect(entree(duneId).dejaVuCoche).toEqual([]);
	});

	it('suggère les titres des watchlists qui ne sont pas encore dans la liste', async () => {
		const autre = db().insert(schema.titres).values({ tmdbId: 5, type: 'film', titre: 'Aftersun' }).returning().get();
		db().insert(schema.watchlist).values([{ membreId: tom.id, titreId: autre.id, statut: 'avoir' }, { membreId: lea.id, titreId: serieId, statut: 'avoir' }]).run();
		expect(page().idees.map((i) => [i.titre.titre, i.source])).toEqual([['Aftersun', 'dans la watchlist de Tom']]);
	});

	it('limite chacun à 3 votes, et le plus voté passe en tête', async () => {
		const autres = [await titreLocal('Arcane', 'serie'), await titreLocal('Fallout', 'serie')];
		await actions.voter(requete(lea, { titreId: duneId }));
		await actions.voter(requete(tom, { titreId: duneId }));
		await actions.voter(requete(lea, { titreId: autres[0] }));
		await actions.voter(requete(lea, { titreId: autres[1] }));
		const refus = (await actions.voter(requete(lea, { titreId: serieId }))) as { status: number; data: { erreur: string } };
		expect(refus.status).toBe(400);
		expect(refus.data.erreur).toContain('3 votes');
		expect(page().votesUtilises).toBe(3);
		expect(page().liste[0].titre.titre).toBe('Dune');
		// Retirer un vote le rend.
		expect(await actions.voter(requete(lea, { titreId: autres[1] }))).toMatchObject({ vote: false });
		expect(await actions.voter(requete(lea, { titreId: serieId }))).toMatchObject({ vote: true });
	});

	it('programme une soirée, une seule par date, et gère « Je viens »', async () => {
		const date = dans(3);
		const r = (await actions.programmer(requete(lea, { date, heure: '20:30', lieu: 'Chez Léa', titreId: duneId }))) as { soireeId: number; ok: string };
		expect(r.ok).toMatch(/^Soirée programmée/);
		let s = page().soirees.find((x) => x.id === r.soireeId)!;
		expect(s).toMatchObject({ date, heure: '20:30', lieu: 'Chez Léa', titreId: duneId, viennent: [lea.id] });
		// Même date : la soirée existante est mise à jour, pas doublée.
		await actions.programmer(requete(tom, { date, heure: '21:00', lieu: 'En ligne', note: 'Version longue' }));
		expect(page().soirees).toHaveLength(1);
		s = page().soirees[0];
		expect(s).toMatchObject({ heure: '21:00', titreId: null, note: 'Version longue', viennent: [lea.id] });
		expect(await actions.venir(requete(tom, { soiree: s.id }))).toMatchObject({ vient: true });
		expect(await actions.venir(requete(lea, { soiree: s.id }))).toMatchObject({ vient: false });
		expect(page().soirees[0].viennent).toEqual([tom.id]);
		// Choisir un titre, puis le laisser à choisir.
		await actions.choisir(requete(lea, { soiree: s.id, titreId: serieId }));
		expect(page().soirees[0].titreId).toBe(serieId);
		await actions.choisir(requete(lea, { soiree: s.id, titreId: '' }));
		expect(page().soirees[0].titreId).toBeNull();
	});

	it('refuse une date passée ou une date déjà prise en modification', async () => {
		expect(await actions.programmer(requete(lea, { date: dans(-2) }))).toMatchObject({ status: 400 });
		expect(await actions.programmer(requete(lea, { date: '2026-02-30' }))).toMatchObject({ status: 400 });
		const autre = (await actions.programmer(requete(lea, { date: dans(10) }))) as { soireeId: number };
		const r = (await actions.programmer(requete(lea, { soiree: autre.soireeId, date: dans(3) }))) as { data: { erreur: string } };
		expect(r.data.erreur).toBe('Il y a déjà une soirée ce jour-là.');
		await actions.supprimerSoiree(requete(lea, { soiree: autre.soireeId }));
		expect(page().soirees).toHaveLength(1);
	});

	it('case un titre glissé sur une date du calendrier', async () => {
		const date = dans(5);
		await actions.caser(requete(tom, { date, titreId: duneId }));
		const s = page().soirees.find((x) => x.date === date)!;
		expect(s).toMatchObject({ titreId: duneId, heure: '21:00', viennent: [tom.id] });
		await actions.caser(requete(tom, { date, titreId: serieId }));
		expect(page().soirees.find((x) => x.date === date)?.titreId).toBe(serieId);
		const cal = chargerCalendrier({ locals: { membre: tom }, url: new URL(`http://test/?mois=${date.slice(0, 7)}`) } as never);
		expect(cal.mois).toBe(date.slice(0, 7));
		expect(chargerCalendrier({ locals: { membre: null }, url: new URL('http://test/?mois=n-importe') } as never).mois).toBe(cleJour(new Date()).slice(0, 7));
	});

	it('marque les épisodes vus ensemble jusqu’à celui touché, saisons d’avant comprises', async () => {
		await actionsFiche.episode(requete(lea, { saison: 2, episode: 1 }));
		let e = entree(serieId);
		expect(e.statut).toBe('cours');
		expect(e.avancement).toMatchObject({ vusTotal: 4, prochain: { saison: 2, episode: 2 } });
		// Revenir en arrière retire les épisodes d'après.
		await actionsFiche.episode(requete(lea, { saison: 1, episode: 2 }));
		expect(entree(serieId).avancement?.vusTotal).toBe(2);
		const fiche = (await chargerFiche(requete(tom, {}, serieId, 'http://test/?saison=1'))) as { episodes: { vu: boolean }[]; saison: number };
		expect(fiche.saison).toBe(1);
		expect(fiche.episodes.map((x) => x.vu)).toEqual([true, true, false]);
		// Tout voir : « Vu », et les votes du titre sont rendus.
		await actionsFiche.episode(requete(lea, { saison: 2, episode: 2 }));
		e = entree(serieId);
		expect(e.statut).toBe('vu');
		expect(e.finiLe).toBeGreaterThan(0);
		expect(e.votes).toEqual([]);
		expect(page().votesUtilises).toBe(2);
		expect(await actions.voter(requete(lea, { titreId: serieId }))).toMatchObject({ status: 400 });
		// Repasser « À voir » efface les épisodes.
		await actionsFiche.statut(requete(lea, { statut: 'avoir' }));
		expect(entree(serieId).avancement?.vusTotal).toBe(0);
	});

	it('coche « Je l’ai déjà vu » et retire un titre de la liste', async () => {
		await actionsFiche.dejaVu(requete(lea, { vu: 1 }));
		expect(entree(serieId).dejaVu.sort()).toEqual([lea.id, tom.id].sort());
		await actionsFiche.dejaVu(requete(lea, { vu: 0 }));
		expect(entree(serieId).dejaVu).toEqual([tom.id]);
		// Le film ne peut pas être « En cours ».
		expect(await actionsFiche.statut(requete(lea, { statut: 'cours' }, duneId))).toMatchObject({ status: 400 });
		await expect(actionsFiche.retirer(requete(lea, {}, serieId))).rejects.toMatchObject({ status: 303, location: '/films' });
		expect(page().liste.find((x) => x.titre.id === serieId)).toBeUndefined();
		// La soirée à venir prévue sur ce titre redevient « à choisir ».
		expect(page().soirees.every((s) => s.titreId !== serieId)).toBe(true);
		expect(db().select().from(schema.episodesVusEnsemble).where(eq(schema.episodesVusEnsemble.titreId, serieId)).all()).toEqual([]);
		await expect(chargerFiche(requete(lea, {}, serieId))).rejects.toMatchObject({ status: 404 });
	});
});

describe('calendrier', () => {
	it('découpe un mois en semaines du lundi au dimanche', () => {
		const j = joursDuMois('2026-11');
		expect(j).toHaveLength(42); // le 1er novembre 2026 est un dimanche
		expect(j[0]).toMatchObject({ cle: '2026-10-26', dansLeMois: false });
		expect(j[6]).toMatchObject({ cle: '2026-11-01', numero: 1, dansLeMois: true });
		expect(moisVoisin('2026-01', -1)).toBe('2025-12');
		expect(moisVoisin('2026-12', 1)).toBe('2027-01');
	});
});
