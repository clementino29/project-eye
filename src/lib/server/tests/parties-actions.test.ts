// Vérifie les actions de la page Parties sur une base SQLite en mémoire (migrations comprises).
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ouvrirBase, remplacerBase, db, schema } from '../db/index.ts';
import { actions } from '../../../routes/jeux/parties/+page.server.ts';
import type { Membre } from '../db/schema.ts';

let moi: Membre;
let tom: Membre;
const gagnantsDe = (id: number) =>
	db().select().from(schema.gagnantsPartie).where(eq(schema.gagnantsPartie.partieId, id)).all().map((g) => g.membreId).sort();
const requete = (champs: Record<string, string | string[]>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(champs)) for (const x of [v].flat()) f.append(k, x);
	return { request: new Request('http://test/', { method: 'POST', body: f }), locals: { membre: moi } } as never;
};

beforeAll(() => {
	remplacerBase(ouvrirBase(':memory:'));
	moi = db().insert(schema.membres).values({ authentikId: 'a', pseudo: 'lea', nom: 'Léa' }).returning().get();
	tom = db().insert(schema.membres).values({ authentikId: 'b', pseudo: 'tom', nom: 'Tom' }).returning().get();
});

describe('actions des parties', () => {
	it('crée une partie avec ses joueurs et ignore un gagnant tant qu’elle n’est pas terminée', async () => {
		const r = (await actions.enregistrer(requete({ nom: 'Pangée', jeu: 'Civ VI', joueurs: [String(moi.id)], statut: 'en_cours', gagnants: String(moi.id) }))) as { id: number };
		const p = db().select().from(schema.parties).get()!;
		expect(p).toMatchObject({ id: r.id, nom: 'Pangée', jeuNom: 'Civ VI', toursMax: null });
		expect(db().select().from(schema.participations).all()).toHaveLength(1);
		expect(db().select().from(schema.gagnantsPartie).all()).toHaveLength(0);
	});

	it('refuse une session qui ne fait pas avancer la partie', async () => {
		const partieId = db().select().from(schema.parties).get()!.id;
		const ok = await actions.ajouterSession(requete({ partieId: String(partieId), date: '2026-11-20', tourAtteint: '40' }));
		expect(ok).toEqual({ ok: 'Session ajoutée' });
		const ko = (await actions.ajouterSession(requete({ partieId: String(partieId), date: '2026-11-21', tourAtteint: '40' }))) as { status: number };
		expect(ko.status).toBe(400);
	});

	it('garde plusieurs vainqueurs (égalité) quand la partie est terminée', async () => {
		const { id } = (await actions.enregistrer(
			requete({ nom: 'Duel', jeu: 'Halo', joueurs: [String(moi.id), String(tom.id)], statut: 'terminee', gagnants: [String(moi.id), String(tom.id)] })
		)) as { id: number };
		expect(gagnantsDe(id)).toEqual([moi.id, tom.id].sort());
		await actions.statut(requete({ id: String(id), statut: 'en_cours' }));
		expect(gagnantsDe(id)).toEqual([]);
	});

	it('enregistre les équipes et l’équipe gagnante', async () => {
		const equipes = JSON.stringify([
			{ nom: 'Rouges', couleur: 'rouge', gagnante: true, membres: [moi.id] },
			{ nom: '', couleur: 'inconnue', gagnante: false, membres: [tom.id] }
		]);
		const { id } = (await actions.enregistrer(
			requete({ nom: 'Équipes', jeu: 'Halo', joueurs: [String(moi.id), String(tom.id)], statut: 'terminee', equipes, gagnants: String(moi.id) })
		)) as { id: number };
		const lues = db().select().from(schema.equipes).where(eq(schema.equipes.partieId, id)).orderBy(schema.equipes.ordre).all();
		expect(lues.map((e) => [e.nom, e.couleur, e.gagnante])).toEqual([['Rouges', 'rouge', true], ['Équipe 2', 'bleu', false]]);
		const parts = db().select().from(schema.participations).where(eq(schema.participations.partieId, id)).all();
		expect(parts.find((x) => x.membreId === tom.id)?.equipeId).toBe(lues[1].id);
		// En équipes, les vainqueurs sont les équipes : pas de gagnant individuel.
		expect(gagnantsDe(id)).toEqual([]);
		await actions.statut(requete({ id: String(id), statut: 'en_pause' }));
		expect(db().select().from(schema.equipes).where(eq(schema.equipes.partieId, id)).all().some((e) => e.gagnante)).toBe(false);
	});

	it('refuse un joueur sans équipe', async () => {
		const equipes = JSON.stringify([
			{ nom: 'A', couleur: 'rouge', membres: [moi.id] },
			{ nom: 'B', couleur: 'bleu', membres: [] }
		]);
		const r = (await actions.enregistrer(requete({ nom: 'X', jeu: 'Halo', joueurs: [String(moi.id), String(tom.id)], equipes }))) as { status: number };
		expect(r.status).toBe(400);
	});

	it('supprime les sessions avec la partie', async () => {
		const partieId = db().select().from(schema.parties).get()!.id;
		await actions.supprimer(requete({ id: String(partieId) }));
		expect(db().select().from(schema.sessionsPartie).all()).toHaveLength(0);
	});

	it('supprime les équipes et les vainqueurs avec la partie', async () => {
		for (const p of db().select().from(schema.parties).all()) await actions.supprimer(requete({ id: String(p.id) }));
		expect(db().select().from(schema.equipes).all()).toHaveLength(0);
		expect(db().select().from(schema.gagnantsPartie).all()).toHaveLength(0);
	});
});
