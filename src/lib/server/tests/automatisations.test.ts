// Automatisations : annonces Discord, tâches planifiées, prochaine session d'une partie, ajout d'un jeu par lien Steam.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { ouvrirBase, remplacerBase, db, schema } from '../db/index.ts';
import { config } from '../config.ts';
import { annoncer, annoncerDemarrage, oublierDemarrages, remplacerEnvoiDiscord, sansMiseEnForme } from '../discord.ts';
import { annoncesDuJour, lendemain, verifierTaches, type Tache } from '../taches.ts';
import { lireLienSteam } from '../steam.ts';
import { actions as parties } from '../../../routes/jeux/parties/+page.server.ts';
import { GET as chercherSteam } from '../../../routes/jeux/steam/+server.ts';
import type { Membre } from '../db/schema.ts';

const WEBHOOK = 'https://discord.com/api/webhooks/123456/abc-DEF_789';
let envois: { url: string; corps: { username: string; embeds: { title: string; description?: string; url?: string }[]; allowed_mentions: unknown } }[] = [];
let reponse = 204;
let lea: Membre;
let tom: Membre;

const requete = (m: Membre | null, champs: Record<string, string | string[]>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(champs)) for (const x of [v].flat()) f.append(k, x);
	return { request: new Request('http://test/', { method: 'POST', body: f }), locals: { membre: m } } as never;
};
async function statut(f: () => unknown) {
	try {
		await f();
		return 200;
	} catch (e) {
		return (e as { status?: number }).status;
	}
}

beforeAll(() => {
	process.env.DISCORD_WEBHOOK_URL = WEBHOOK;
	process.env.ORIGIN = 'https://hub.exemple.fr';
	remplacerBase(ouvrirBase(':memory:'));
	remplacerEnvoiDiscord(async (url, init) => {
		envois.push({ url: String(url), corps: JSON.parse(String(init?.body)) });
		return new Response(null, { status: reponse });
	});
	lea = db().insert(schema.membres).values({ authentikId: 'a', pseudo: 'lea', nom: 'Léa Martin' }).returning().get();
	tom = db().insert(schema.membres).values({ authentikId: 'b', pseudo: 'tom', nom: 'Tom Durand' }).returning().get();
});
afterEach(() => {
	envois = [];
	reponse = 204;
	vi.unstubAllGlobals();
});
afterAll(() => {
	delete process.env.DISCORD_WEBHOOK_URL;
	delete process.env.ORIGIN;
});

describe('annonces Discord', () => {
	it('n’accepte qu’une vraie adresse de webhook Discord', () => {
		expect(config.discord.webhook).toBe(WEBHOOK);
		process.env.DISCORD_WEBHOOK_URL = 'https://exemple.fr/api/webhooks/1/x';
		expect(config.discord.webhook).toBeUndefined();
		process.env.DISCORD_WEBHOOK_URL = WEBHOOK;
	});

	it('envoie un embed sans aucune mention possible, avec un lien complet vers le hub', async () => {
		expect(await annoncer({ titre: 'Coucou', texte: 'Salut', lien: '/panel' })).toBe(1);
		expect(envois).toHaveLength(1);
		expect(envois[0].url).toBe(WEBHOOK);
		expect(envois[0].corps).toMatchObject({ username: 'Nohriancons', allowed_mentions: { parse: [] }, embeds: [{ title: 'Coucou', description: 'Salut', url: 'https://hub.exemple.fr/panel' }] });
	});

	it('découpe en messages de 10 annonces, et ne plante pas si Discord refuse', async () => {
		const douze = Array.from({ length: 12 }, (_, i) => ({ titre: `A${i}` }));
		expect(await annoncer(douze)).toBe(12);
		expect(envois.map((e) => e.corps.embeds.length)).toEqual([10, 2]);
		reponse = 400;
		expect(await annoncer({ titre: 'x' })).toBe(0);
	});

	it('neutralise les mentions et la mise en forme dans les noms', () => {
		expect(sansMiseEnForme('@everyone **gras**')).toBe('@​everyone \\*\\*gras\\*\\*');
	});

	it('annonce un serveur démarré une seule fois en dix minutes', async () => {
		oublierDemarrages();
		const t = Date.now();
		expect(await annoncerDemarrage({ id: 'abc', nom: 'Minecraft', jeu: 'Minecraft', par: 'Léa' }, t)).toBe(1);
		expect(await annoncerDemarrage({ id: 'abc', nom: 'Minecraft', par: 'Léa' }, t + 60_000)).toBe(0);
		expect(await annoncerDemarrage({ id: 'abc', nom: 'Minecraft', par: 'Tom' }, t + 11 * 60_000)).toBe(1);
		expect(envois[0].corps.embeds[0]).toMatchObject({ title: '▶️ Minecraft est démarré', description: 'Démarré par Léa depuis le hub, pour jouer à Minecraft.', url: 'https://hub.exemple.fr/panel' });
	});

	it('n’envoie rien sans webhook', async () => {
		delete process.env.DISCORD_WEBHOOK_URL;
		expect(await annoncer({ titre: 'x' })).toBe(0);
		expect(envois).toEqual([]);
		process.env.DISCORD_WEBHOOK_URL = WEBHOOK;
	});
});

describe('prochaine session d’une partie', () => {
	let partieId: number;
	const partie = () => db().select().from(schema.parties).where(eq(schema.parties.id, partieId)).get()!;

	it('enregistre la date et l’heure, et refuse une date invalide', async () => {
		const r = (await parties.enregistrer(requete(lea, { nom: 'Pangée', jeu: 'Civ VI', joueurs: [String(lea.id), String(tom.id)], statut: 'en_cours', prochaineSession: '2026-12-04', heureSession: '21:30' }))) as { id: number };
		partieId = r.id;
		expect(partie()).toMatchObject({ prochaineSession: '2026-12-04', heureSession: '21:30' });
		const ko = (await parties.enregistrer(requete(lea, { id: String(partieId), nom: 'Pangée', jeu: 'Civ VI', joueurs: String(lea.id), prochaineSession: '2026-02-31' }))) as { status: number };
		expect(ko.status).toBe(400);
	});

	it('l’efface quand la session est ajoutée au journal', async () => {
		await parties.ajouterSession(requete(lea, { partieId: String(partieId), date: '2026-12-01', tourAtteint: '10' }));
		expect(partie().prochaineSession).toBe('2026-12-04');
		await parties.ajouterSession(requete(lea, { partieId: String(partieId), date: '2026-12-04', tourAtteint: '20' }));
		expect(partie()).toMatchObject({ prochaineSession: null, heureSession: null });
	});

	it('l’efface quand la partie est terminée', async () => {
		db().update(schema.parties).set({ prochaineSession: '2026-12-10' }).where(eq(schema.parties.id, partieId)).run();
		await parties.statut(requete(lea, { id: String(partieId), statut: 'terminee' }));
		expect(partie().prochaineSession).toBeNull();
	});
});

describe('tâches planifiées', () => {
	it('prépare les annonces du lendemain : soirée film et sessions de parties', () => {
		expect(lendemain('2026-12-31')).toBe('2027-01-01');
		const titre = db().insert(schema.titres).values({ tmdbId: 1, type: 'film', titre: 'Dune' }).returning().get();
		const soiree = db().insert(schema.soirees).values({ date: '2026-12-05', heure: '21:00', lieu: 'Chez Inès', titreId: titre.id }).returning().get();
		db().insert(schema.presencesSoiree).values([{ soireeId: soiree.id, membreId: lea.id }, { soireeId: soiree.id, membreId: tom.id }]).run();
		const p = (nom: string, statut: 'en_cours' | 'terminee') => db().insert(schema.parties).values({ nom, jeuNom: 'Civ VI', statut, prochaineSession: '2026-12-05', heureSession: '20:30' }).returning().get();
		const enCours = p('Pangée 2', 'en_cours');
		p('Vieille partie', 'terminee');
		db().insert(schema.participations).values({ partieId: enCours.id, membreId: tom.id }).run();

		const a = annoncesDuJour('2026-12-05');
		expect(a.map((x) => x.titre)).toEqual(['🍿 Soirée film demain : Dune', '🎲 Session demain : Pangée 2']);
		expect(a[0].texte).toBe('Samedi 5 déc. à 21 h · Chez Inès\n2 personnes viennent : Léa et Tom.');
		expect(a[1].texte).toBe('Civ VI · Samedi 5 déc. à 20 h 30\nAvec Tom.');
		// Seuls les prénoms partent sur Discord.
		expect(JSON.stringify(a)).not.toMatch(/Martin|Durand/);
		expect(annoncesDuJour('2026-12-06')).toEqual([]);
	});

	it('lance une tâche une fois par jour, dès que son heure est passée', async () => {
		const lancer = vi.fn(async () => 'fait');
		const t: Tache[] = [{ nom: 'essai', heure: () => 5, lancer }];
		expect(await verifierTaches(new Date(2026, 11, 4, 4, 59), t)).toEqual([]);
		expect(await verifierTaches(new Date(2026, 11, 4, 5, 0), t)).toEqual(['essai']);
		expect(await verifierTaches(new Date(2026, 11, 4, 23, 0), t)).toEqual([]);
		// Le hub était arrêté à 5 h le lendemain : la tâche tourne à son retour.
		expect(await verifierTaches(new Date(2026, 11, 5, 14, 0), t)).toEqual(['essai']);
		expect(lancer).toHaveBeenCalledTimes(2);
		expect(lancer).toHaveBeenLastCalledWith('2026-12-05');
		expect(db().select().from(schema.tachesPlanifiees).where(eq(schema.tachesPlanifiees.nom, 'essai')).get()).toMatchObject({ dernierJour: '2026-12-05', resultat: 'fait' });
	});

	it('note l’erreur d’une tâche sans la relancer en boucle', async () => {
		const lancer = vi.fn(async () => {
			throw new Error('Steam en panne');
		});
		const t: Tache[] = [{ nom: 'panne', heure: () => 0, lancer }];
		await verifierTaches(new Date(2026, 11, 4, 1), t);
		await verifierTaches(new Date(2026, 11, 4, 2), t);
		expect(lancer).toHaveBeenCalledTimes(1);
		expect(db().select().from(schema.tachesPlanifiees).where(eq(schema.tachesPlanifiees.nom, 'panne')).get()?.resultat).toBe('erreur : Steam en panne');
	});

	it('envoie les annonces de la veille sur Discord', async () => {
		const [annonces] = (await import('../taches.ts')).TACHES.filter((t) => t.nom === 'annonces-demain');
		expect(await annonces.lancer('2026-12-04')).toBe('2 sur 2 annonces envoyées');
		expect(envois[0].corps.embeds.map((e) => e.title)).toEqual(['🍿 Soirée film demain : Dune', '🎲 Session demain : Pangée 2']);
		expect(await annonces.lancer('2026-12-10')).toBe('rien de prévu demain');
	});
});

describe('ajout d’un jeu par lien Steam', () => {
	it('lit les liens du Store, de la communauté, steam:// et un simple numéro', () => {
		expect(lireLienSteam('https://store.steampowered.com/app/1145360/Hades/')).toBe(1145360);
		expect(lireLienSteam('store.steampowered.com/app/620?l=french')).toBe(620);
		expect(lireLienSteam('https://steamcommunity.com/app/892970')).toBe(892970);
		expect(lireLienSteam('steam://run/570')).toBe(570);
		expect(lireLienSteam('  413150 ')).toBe(413150);
		expect(lireLienSteam('https://store.steampowered.com/bundle/123/')).toBeNull();
		expect(lireLienSteam('https://evil.example/app/1/')).toBeNull();
	});

	it('remplit le titre et la bannière depuis le Steam Store', async () => {
		const fetcher = vi.fn(async () => Response.json({ '1145360': { success: true, data: { name: 'Hades', categories: [{ id: 2 }], genres: [{ id: '1', description: 'Action' }] } } }));
		vi.stubGlobal('fetch', fetcher);
		const url = new URL('http://test/jeux/steam?lien=https://store.steampowered.com/app/1145360/Hades/');
		const r = await chercherSteam({ url, locals: { membre: lea } } as never);
		expect(await r.json()).toEqual({ appid: 1145360, titre: 'Hades', image: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/1145360/header.jpg' });
		expect(String((fetcher.mock.calls[0] as unknown[])[0])).toContain('appids=1145360');
		expect(db().select().from(schema.jeuxSteam).where(eq(schema.jeuxSteam.steamAppId, 1145360)).get()).toMatchObject({ nom: 'Hades', mode: 'solo', genres: 'Action' });
	});

	it('refuse un lien qui n’est pas un jeu Steam, et les visiteurs', async () => {
		expect(await statut(() => chercherSteam({ url: new URL('http://test/jeux/steam?lien=bonjour'), locals: { membre: lea } } as never))).toBe(400);
		expect(await statut(() => chercherSteam({ url: new URL('http://test/jeux/steam?lien=620'), locals: { membre: null } } as never))).toBe(401);
	});
});
