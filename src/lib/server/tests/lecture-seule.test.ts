// Mode lecture seule : ce qu'un visiteur non connecté peut voir, et ce qui lui reste fermé.
import { beforeAll, describe, expect, it } from 'vitest';
import { ouvrirBase, remplacerBase, db, schema } from '../db/index.ts';
import { ouvertAuxVisiteurs } from '../acces.ts';
import * as liste from '../../../routes/jeux/liste/+page.server.ts';
import * as parties from '../../../routes/jeux/parties/+page.server.ts';
import * as quoiFaire from '../../../routes/jeux/quoi-faire/+page.server.ts';
import * as commune from '../../../routes/films/+page.server.ts';
import * as calendrier from '../../../routes/films/calendrier/+page.server.ts';
import type { Membre } from '../db/schema.ts';

let lea: Membre;
const visiteur = { locals: { membre: null } } as never;
const envoi = (champs: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(champs)) f.append(k, v);
	return { request: new Request('http://test/', { method: 'POST', body: f }), locals: { membre: null } } as never;
};
/** Une action refusée lève une erreur 401 de SvelteKit. */
async function statutErreur(promesse: unknown) {
	try {
		await promesse;
		return 200;
	} catch (e) {
		return (e as { status?: number }).status;
	}
}

beforeAll(() => {
	remplacerBase(ouvrirBase(':memory:'));
	const base = db();
	lea = base
		.insert(schema.membres)
		.values({ authentikId: 'a', pseudo: 'lea', nom: 'Léa Martin', email: 'lea@exemple.fr', clePelicanChiffree: 'secret' })
		.returning()
		.get();
	const tom = base.insert(schema.membres).values({ authentikId: 'b', pseudo: 'tom', nom: 'Tom Durand' }).returning().get();
	base.insert(schema.jeux).values({ titre: 'Halo 3' }).run();
	base.insert(schema.jeuxSteam).values({ steamAppId: 10, nom: 'Portal 2' }).run();
	base.insert(schema.possessions).values([{ membreId: lea.id, steamAppId: 10, importeLe: 1 }, { membreId: tom.id, steamAppId: 10, importeLe: 1 }]).run();
	base.insert(schema.envies).values({ membreId: lea.id, steamAppId: 10, date: Date.now() }).run();
});

describe('adresses ouvertes aux visiteurs', () => {
	it('ouvre en lecture les pages publiques', () => {
		for (const c of ['/', '/status', '/jeux', '/jeux/liste', '/jeux/parties', '/jeux/quoi-faire', '/films', '/films/calendrier', '/films/commune/4', '/membres/3/photo', '/sante'])
			expect(ouvertAuxVisiteurs('GET', c), c).toBe(true);
	});
	it('garde fermés le Panel, le Compte et toute écriture', () => {
		for (const c of ['/panel', '/compte', '/jeux/igdb', '/jeux/liste/autre', '/deconnexion', '/films/ma-watchlist', '/films/les-potes', '/films/titre/1', '/films/tmdb', '/films/commune', '/films/commune/4/x', '/fichiers', '/fichiers/minecraft', '/fichiers/nouveau', '/fichiers/telecharger/1', '/fichiers/images/x.png'])
			expect(ouvertAuxVisiteurs('GET', c), c).toBe(false);
		expect(ouvertAuxVisiteurs('POST', '/jeux/liste')).toBe(false);
		expect(ouvertAuxVisiteurs('POST', '/jeux/quoi-faire')).toBe(false);
		expect(ouvertAuxVisiteurs('POST', '/films')).toBe(false);
		expect(ouvertAuxVisiteurs('POST', '/fichiers/envoi')).toBe(false);
	});
	it('laisse un visiteur se connecter', () => {
		expect(ouvertAuxVisiteurs('POST', '/connexion')).toBe(true);
	});
});

describe('pages en lecture seule', () => {
	it('montre les jeux avec le prénom des membres, sans e-mail ni clé', () => {
		const r = liste.load(visiteur);
		expect(r.jeux).toHaveLength(1);
		expect(r.igdbActif).toBe(false);
		expect(r.membres.map((m) => m.nom).sort()).toEqual(['Léa', 'Tom']);
		const texte = JSON.stringify(r);
		for (const secret of ['Martin', 'lea@exemple.fr', 'secret']) expect(texte).not.toContain(secret);
	});
	it('montre les parties', () => {
		expect(parties.load(visiteur).membres).toHaveLength(2);
	});
	it('montre les jeux en commun sans les envies ni le dernier tirage', () => {
		const r = quoiFaire.load(visiteur);
		expect(r.jeux.map((j) => j.nom)).toEqual(['Portal 2']);
		expect(r.envies).toEqual({});
		expect(r.dernier).toBeNull();
	});
	it('garde le nom complet et les envies pour un membre', () => {
		const r = quoiFaire.load({ locals: { membre: lea } } as never);
		expect(r.membres.map((m) => m.nom)).toContain('Léa Martin');
		expect(r.envies[10]).toEqual([lea.id]);
	});
	it('montre la Watch list commune avec les prénoms, sans idées ni e-mail', () => {
		const r = commune.load(visiteur);
		expect(r.moiId).toBeNull();
		expect(r.idees).toEqual([]);
		expect(r.membres.map((m) => m.nom).sort()).toEqual(['Léa', 'Tom']);
		expect(r.lieux).toEqual(['En ligne', 'Chez Léa', 'Chez Tom']);
		const texte = JSON.stringify([r, calendrier.load({ ...(visiteur as object), url: new URL('http://test/films/calendrier') } as never)]);
		for (const secret of ['Martin', 'Durand', 'lea@exemple.fr', 'secret']) expect(texte).not.toContain(secret);
	});
	it('refuse toute action à un visiteur', async () => {
		expect(await statutErreur(liste.actions.supprimer(envoi({ id: '1' })))).toBe(401);
		expect(await statutErreur(parties.actions.enregistrer(envoi({ nom: 'x', jeu: 'y' })))).toBe(401);
		expect(await statutErreur(quoiFaire.actions.envie(envoi({ appid: '10' })))).toBe(401);
		expect(await statutErreur(commune.actions.programmer(envoi({ date: '2099-01-01' })))).toBe(401);
		expect(await statutErreur(commune.actions.voter(envoi({ titreId: '1' })))).toBe(401);
		expect(db().select().from(schema.jeux).all()).toHaveLength(1);
	});
});
