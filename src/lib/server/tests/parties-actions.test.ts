// Vérifie les actions de la page Parties sur une base SQLite en mémoire (migrations comprises).
import { beforeAll, describe, expect, it } from 'vitest';
import { ouvrirBase, remplacerBase, db, schema } from '../db/index.ts';
import { actions } from '../../../routes/jeux/parties/+page.server.ts';
import type { Membre } from '../db/schema.ts';

let moi: Membre;
const requete = (champs: Record<string, string | string[]>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(champs)) for (const x of [v].flat()) f.append(k, x);
	return { request: new Request('http://test/', { method: 'POST', body: f }), locals: { membre: moi } } as never;
};

beforeAll(() => {
	remplacerBase(ouvrirBase(':memory:'));
	moi = db().insert(schema.membres).values({ authentikId: 'a', pseudo: 'lea', nom: 'Léa' }).returning().get();
});

describe('actions des parties', () => {
	it('crée une partie avec ses joueurs et ignore un gagnant tant qu’elle n’est pas terminée', async () => {
		const r = (await actions.enregistrer(requete({ nom: 'Pangée', jeu: 'Civ VI', joueurs: [String(moi.id)], statut: 'en_cours', gagnantId: String(moi.id) }))) as { id: number };
		const p = db().select().from(schema.parties).get()!;
		expect(p).toMatchObject({ id: r.id, nom: 'Pangée', jeuNom: 'Civ VI', gagnantId: null, toursMax: null });
		expect(db().select().from(schema.participations).all()).toHaveLength(1);
	});

	it('refuse une session qui ne fait pas avancer la partie', async () => {
		const partieId = db().select().from(schema.parties).get()!.id;
		const ok = await actions.ajouterSession(requete({ partieId: String(partieId), date: '2026-11-20', tourAtteint: '40' }));
		expect(ok).toEqual({ ok: 'Session ajoutée' });
		const ko = (await actions.ajouterSession(requete({ partieId: String(partieId), date: '2026-11-21', tourAtteint: '40' }))) as { status: number };
		expect(ko.status).toBe(400);
	});

	it('supprime les sessions avec la partie', async () => {
		const partieId = db().select().from(schema.parties).get()!.id;
		await actions.supprimer(requete({ id: String(partieId) }));
		expect(db().select().from(schema.sessionsPartie).all()).toHaveLength(0);
	});
});
