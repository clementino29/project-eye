// Panel v2 : console, commandes, sauvegardes, arrêt automatique et charge de la machine.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { ouvrirBase, remplacerBase, db, schema } from '../db/index.ts';
import { chiffrer } from '../crypto.ts';
import { remplacerEnvoiDiscord } from '../discord.ts';
import { ClientPelican, ErreurPelican, nettoyerLigne, permissionsDepuisMeta, SANS_PERMISSION, versServeur } from '../pelican.ts';
import { lireMeminfo, lireStat, pourcentEntre } from '../machine.ts';
import { verifierArretsAuto, type ClientArret } from '../arret-auto.ts';
import { ouvertAuxVisiteurs } from '../acces.ts';
import { actions } from '../../../routes/panel/+page.server.ts';
import { GET as lireConsole } from '../../../routes/panel/console/+server.ts';
import { GET as telecharger } from '../../../routes/panel/sauvegardes/telecharger/+server.ts';
import type { Membre } from '../db/schema.ts';

const CLE = Buffer.alloc(32, 3).toString('base64');
const PANEL = 'https://panel.exemple.fr';
const UUID = '0b6f2c1e-1111-4222-8333-944455556666';
let admin: Membre;
let lea: Membre;
let annonces: string[] = [];

const requete = (m: Membre | null, champs: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(champs)) f.append(k, v);
	return { request: new Request('http://test/', { method: 'POST', body: f }), locals: { membre: m } } as never;
};
const get = (m: Membre | null, chemin: string) => ({ url: new URL(`http://test${chemin}`), locals: { membre: m } }) as never;
async function statut(f: () => unknown) {
	try {
		await f();
		return 200;
	} catch (e) {
		return (e as { status?: number }).status;
	}
}

/** Faux Sakura Panel : permissions par clé, et trace des appels. */
let appels: { url: string; methode: string; corps?: string }[] = [];
let droits: Record<string, string[]> = {};
let refusCommande = 0;
function fauxPanel() {
	vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
		const cle = String((init.headers as Record<string, string>).Authorization).replace('Bearer ', '');
		const chemin = new URL(url).pathname.replace('/api/client', '');
		appels.push({ url: chemin, methode: init.method ?? 'GET', corps: init.body as string | undefined });
		if (/^\/servers\/[^/]+$/.test(chemin)) return Response.json({ attributes: {}, meta: { is_server_owner: false, user_permissions: droits[cle] ?? [] } });
		if (chemin.endsWith('/command')) return new Response(null, { status: refusCommande || 204 });
		if (chemin.endsWith('/backups') && init.method === 'POST')
			return Response.json({ attributes: { uuid: UUID, name: JSON.parse(String(init.body)).name, created_at: '2026-11-26T20:00:00Z', completed_at: null } });
		if (chemin.endsWith('/download')) return Response.json({ attributes: { url: 'https://wings.exemple.fr/download/backup?token=abc' } });
		if (chemin.endsWith('/websocket')) return Response.json({ data: { token: 'jwt', socket: 'wss://wings.exemple.fr/api/servers/x/ws' } });
		return new Response(null, { status: 404 });
	});
}

beforeAll(() => {
	process.env.HUB_ENCRYPTION_KEY = CLE;
	process.env.PELICAN_URL = PANEL;
	remplacerBase(ouvrirBase(':memory:'));
	remplacerEnvoiDiscord(async (_url, init) => {
		annonces.push(JSON.parse(String(init?.body)).embeds[0].title);
		return new Response(null, { status: 204 });
	});
	process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1/x';
	admin = db()
		.insert(schema.membres)
		.values({ authentikId: 'a', pseudo: 'clem', nom: 'Clément', role: 'admin', clePelicanChiffree: chiffrer('cle-admin', CLE) })
		.returning()
		.get();
	lea = db().insert(schema.membres).values({ authentikId: 'b', pseudo: 'lea', nom: 'Léa', clePelicanChiffree: chiffrer('cle-lea', CLE) }).returning().get();
});
beforeEach(() => fauxPanel());
afterEach(() => {
	vi.unstubAllGlobals();
	appels = [];
	droits = {};
	annonces = [];
	refusCommande = 0;
});
afterAll(() => {
	delete process.env.HUB_ENCRYPTION_KEY;
	delete process.env.PELICAN_URL;
	delete process.env.DISCORD_WEBHOOK_URL;
});

describe('permissions Sakura Panel', () => {
	it('distingue lire la console, envoyer une commande et les sauvegardes', () => {
		const p = permissionsDepuisMeta({ user_permissions: ['websocket.connect', 'backup.read', 'backup.download'] });
		expect(p.console).toBe(true);
		expect(p.commande).toBe(false);
		expect(p.sauvegardes).toEqual({ voir: true, creer: false, telecharger: true });
		expect(permissionsDepuisMeta({ user_permissions: ['backup.*'] }).sauvegardes.creer).toBe(true);
		expect(permissionsDepuisMeta({ user_permissions: ['control.*'] }).commande).toBe(true);
		expect(permissionsDepuisMeta(undefined)).toEqual(SANS_PERMISSION);
	});
	it('lit le nombre de sauvegardes autorisées', () => {
		expect(versServeur({ identifier: 'a', uuid: 'u', name: 'X', feature_limits: { backups: 3 } }).sauvegardesMax).toBe(3);
		expect(versServeur({ identifier: 'a', uuid: 'u', name: 'X' }).sauvegardesMax).toBe(0);
	});
});

describe('console', () => {
	it('retire les couleurs ANSI et les caractères de contrôle', () => {
		expect(nettoyerLigne('\u001b[33m[12:00:01 INFO]\u001b[0m: Done (3.2s)!\u0007')).toBe('[12:00:01 INFO]: Done (3.2s)!');
		expect(nettoyerLigne('\u001b[1;31mErreur\u001b[m\ttab')).toBe('Erreur\ttab');
	});

	/** Faux websocket de Wings : vérifie l'origine, l'authentification, puis rejoue l'historique. */
	class FauxSocket {
		static derniere: FauxSocket;
		envoyes: { event: string; args: unknown[] }[] = [];
		onopen?: () => void;
		onmessage?: (m: { data: string }) => void;
		onerror?: () => void;
		constructor(
			public adresse: string,
			public options: { headers: { Origin: string } }
		) {
			FauxSocket.derniere = this;
			setTimeout(() => this.onopen?.(), 0);
		}
		send(texte: string) {
			const m = JSON.parse(texte);
			this.envoyes.push(m);
			const repondre = (event: string, args: unknown[] = []) => setTimeout(() => this.onmessage?.({ data: JSON.stringify({ event, args }) }), 0);
			if (m.event === 'auth') repondre(m.args[0] === 'jwt' ? 'auth success' : 'jwt error');
			if (m.event === 'send logs') {
				repondre('console output', ['\u001b[32m[INFO]\u001b[0m Démarrage']);
				repondre('console output', ['ligne 2\r\nligne 3']);
				repondre('stats', ['{"cpu":3}']);
			}
		}
		close() {}
	}

	it('se connecte au websocket de Wings avec l’origine du panel et garde les dernières lignes', async () => {
		const c = new ClientPelican('cle-lea', PANEL);
		const lignes = await c.console('abcd1234', { attente: 20, Socket: FauxSocket as never });
		expect(lignes).toEqual(['[INFO] Démarrage', 'ligne 2', 'ligne 3']);
		expect(FauxSocket.derniere.adresse).toBe('wss://wings.exemple.fr/api/servers/x/ws');
		expect(FauxSocket.derniere.options.headers.Origin).toBe(PANEL);
		expect(FauxSocket.derniere.envoyes.map((e) => e.event)).toEqual(['auth', 'send logs']);
		expect(await c.console('abcd1234', { attente: 20, max: 1, Socket: FauxSocket as never })).toEqual(['ligne 3']);
	});

	it('signale un jeton refusé par Wings', async () => {
		vi.stubGlobal('fetch', async () => Response.json({ data: { token: 'mauvais', socket: 'wss://w/ws' } }));
		const err = await new ClientPelican('k', PANEL).console('abcd1234', { attente: 20, Socket: FauxSocket as never }).catch((e) => e);
		expect(err).toBeInstanceOf(ErreurPelican);
		expect(err.statut).toBe(403);
	});

	it('n’ouvre la console qu’aux membres qui ont le droit dans Sakura Panel', async () => {
		expect(await statut(() => lireConsole(get(null, '/panel/console?serveur=abcd1234')))).toBe(401);
		expect(await statut(() => lireConsole(get(lea, '/panel/console?serveur=abcd1234')))).toBe(403);
		expect(await statut(() => lireConsole(get(lea, '/panel/console?serveur=../../account')))).toBe(400);
	});

	it('envoie une commande et la note dans le journal', async () => {
		droits = { 'cle-lea': ['control.console'] };
		const r = await actions.commande(requete(lea, { serveur: 'cmd00001', nom: 'Oxycraft', commande: '/say Bonsoir' }));
		expect(r).toEqual({ ok: true, commande: true });
		const appel = appels.find((a) => a.url.endsWith('/command'))!;
		expect(appel.url).toBe('/servers/cmd00001/command');
		expect(JSON.parse(appel.corps!)).toEqual({ command: 'say Bonsoir' });
		const j = db().select().from(schema.actionsServeur).where(eq(schema.actionsServeur.identifiantPelican, 'cmd00001')).get()!;
		expect(j).toMatchObject({ action: 'commande', resultat: 'ok', message: 'say Bonsoir', membreId: lea.id });
	});

	it('refuse une commande sans le droit, sur plusieurs lignes ou vers un serveur éteint', async () => {
		droits = { 'cle-lea': ['websocket.connect'] };
		expect(((await actions.commande(requete(lea, { serveur: 'cmd00002', commande: 'stop' }))) as { status: number }).status).toBe(403);
		expect(((await actions.commande(requete(lea, { serveur: 'cmd00002', commande: 'say a\nop lea' }))) as { status: number }).status).toBe(400);
		expect(appels.some((a) => a.url.endsWith('/command'))).toBe(false);
		droits = { 'cle-lea': ['control.console'] };
		refusCommande = 502;
		const r = (await actions.commande(requete(lea, { serveur: 'cmd00003', commande: 'list' }))) as { status: number; data: { erreur: string } };
		expect(r.data.erreur).toMatch(/démarré/);
	});
});

describe('sauvegardes', () => {
	it('crée une sauvegarde avec le droit de Sakura Panel', async () => {
		droits = { 'cle-lea': ['backup.create'] };
		const r = (await actions.sauvegarder(requete(lea, { serveur: 'sav00001', nom: 'Oxycraft', nomSauvegarde: 'Avant la 1.22' }))) as { sauvegarde: { nom: string; termineeLe: null } };
		expect(r.sauvegarde).toMatchObject({ nom: 'Avant la 1.22', termineeLe: null });
		expect(db().select().from(schema.actionsServeur).where(eq(schema.actionsServeur.identifiantPelican, 'sav00001')).get()).toMatchObject({ action: 'sauvegarde', resultat: 'ok' });
		droits = {};
		expect(((await actions.sauvegarder(requete(lea, { serveur: 'sav00002' }))) as { status: number }).status).toBe(403);
	});

	it('renvoie vers le lien signé de Wings pour télécharger', async () => {
		droits = { 'cle-lea': ['backup.download'] };
		const r = await telecharger(get(lea, `/panel/sauvegardes/telecharger?serveur=sav00003&uuid=${UUID}`)).catch((e: { status: number; location: string }) => e);
		expect(r).toMatchObject({ status: 302, location: 'https://wings.exemple.fr/download/backup?token=abc' });
		expect(await statut(() => telecharger(get(lea, '/panel/sauvegardes/telecharger?serveur=sav00003&uuid=pas-un-uuid')))).toBe(400);
		droits = { 'cle-lea': ['backup.read'] };
		expect(await statut(() => telecharger(get(lea, `/panel/sauvegardes/telecharger?serveur=sav00004&uuid=${UUID}`)))).toBe(403);
	});

	it('trie les sauvegardes de la plus récente à la plus ancienne', async () => {
		vi.stubGlobal('fetch', async () =>
			Response.json({
				data: [
					{ attributes: { uuid: '1', name: 'Vieille', is_successful: true, bytes: 10, created_at: '2026-11-01T10:00:00Z', completed_at: '2026-11-01T10:01:00Z' } },
					{ attributes: { uuid: '2', name: 'Récente', created_at: '2026-11-20T10:00:00Z', completed_at: null } }
				]
			})
		);
		const l = await new ClientPelican('k', PANEL).sauvegardes('abcd1234');
		expect(l.map((s) => s.nom)).toEqual(['Récente', 'Vieille']);
		expect(l[1]).toMatchObject({ reussie: true, octets: 10 });
		expect(l[0].termineeLe).toBeNull();
	});
});

describe('réglage de l’arrêt automatique', () => {
	it('exige le type GameDig et un délai connu, et retient l’admin qui le règle', async () => {
		const ko = (await actions.reglages(requete(admin, { serveur: 'auto0001', arretAuto: '30' }))) as { status: number };
		expect(ko.status).toBe(400);
		expect(((await actions.reglages(requete(admin, { serveur: 'auto0001', arretAuto: '7', gamedigType: 'minecraft' }))) as { status: number }).status).toBe(400);
		await actions.reglages(requete(admin, { serveur: 'auto0001', arretAuto: '30', gamedigType: 'minecraft' }));
		const s = db().select().from(schema.serveurs).where(eq(schema.serveurs.identifiantPelican, 'auto0001')).get()!;
		expect(s).toMatchObject({ arretAutoMinutes: 30, arretAutoParId: admin.id });
		await actions.reglages(requete(admin, { serveur: 'auto0001', arretAuto: '', gamedigType: 'minecraft' }));
		expect(db().select().from(schema.serveurs).where(eq(schema.serveurs.identifiantPelican, 'auto0001')).get()).toMatchObject({ arretAutoMinutes: null, arretAutoParId: null });
	});
	it('reste réservé aux admins', async () => {
		expect(await statut(() => actions.reglages(requete(lea, { serveur: 'auto0001', arretAuto: '30', gamedigType: 'minecraft' })))).toBe(403);
	});
});

describe('arrêt automatique', () => {
	let etat: 'running' | 'offline' = 'running';
	let joueurs: number | null = 0;
	let arrets: string[] = [];
	let cles: string[] = [];
	let echecArret = false;
	const client = (cle: string): ClientArret => {
		cles.push(cle);
		return {
			serveurs: async () => [{ identifiant: 'vide0001', nom: 'Oxycraft (Pelican)', adresse: 'mc.exemple.fr:25565' }],
			ressources: async () => ({ etat }),
			alimentation: async (id) => {
				if (echecArret) throw new ErreurPelican('Sakura Panel refuse cette clé ou cette action.', 403);
				arrets.push(id);
			}
		};
	};
	const adresses: string[] = [];
	const dep = { client, joueurs: async (_t: string, a: string) => (adresses.push(a), joueurs === null ? null : { connectes: joueurs }) };
	const T0 = Date.UTC(2026, 10, 26, 20, 0);
	const min = (n: number) => T0 + n * 60_000;
	const ligne = () => db().select().from(schema.serveurs).where(eq(schema.serveurs.identifiantPelican, 'vide0001')).get()!;

	beforeAll(() => {
		const jeu = db().insert(schema.jeux).values({ titre: 'Minecraft' }).returning().get();
		db().insert(schema.serveurs).values({ identifiantPelican: 'vide0001', nom: 'Oxycraft', jeuId: jeu.id, gamedigType: 'minecraft', arretAutoMinutes: 30, arretAutoParId: admin.id }).run();
		// Sans type GameDig, le serveur n'est jamais regardé.
		db().insert(schema.serveurs).values({ identifiantPelican: 'sans0001', arretAutoMinutes: 30, arretAutoParId: admin.id }).run();
	});
	beforeEach(() => {
		arrets = [];
		cles = [];
	});

	it('note quand le serveur se vide, et l’arrête une fois le délai passé', async () => {
		expect(await verifierArretsAuto(min(0), dep)).toEqual([{ identifiant: 'vide0001', issue: 'vide' }]);
		expect(ligne().videDepuis).toBe(min(0));
		expect(cles).toEqual(['cle-admin']);
		expect(adresses.at(-1)).toBe('mc.exemple.fr:25565');
		await verifierArretsAuto(min(29), dep);
		expect(arrets).toEqual([]);
		expect((await verifierArretsAuto(min(31), dep))[0].issue).toBe('arrete');
		expect(arrets).toEqual(['vide0001']);
		expect(ligne().videDepuis).toBeNull();
		const j = db().select().from(schema.actionsServeur).where(eq(schema.actionsServeur.action, 'arret_auto')).get()!;
		expect(j).toMatchObject({ nomServeur: 'Oxycraft', membreId: null, resultat: 'ok', message: 'Personne depuis 31 min' });
		await new Promise((r) => setTimeout(r, 0));
		expect(annonces).toEqual(['⏹️ Oxycraft est arrêté']);
	});

	it('repart de zéro quand quelqu’un se connecte, et ne décide rien si le jeu ne répond pas', async () => {
		await verifierArretsAuto(min(40), dep);
		expect(ligne().videDepuis).toBe(min(40));
		joueurs = 2;
		expect((await verifierArretsAuto(min(60), dep))[0].issue).toBe('occupe');
		expect(ligne().videDepuis).toBeNull();
		joueurs = 0;
		await verifierArretsAuto(min(62), dep);
		joueurs = null;
		expect((await verifierArretsAuto(min(200), dep))[0].issue).toBe('inconnu');
		expect(arrets).toEqual([]);
		expect(ligne().videDepuis).toBe(min(62));
		joueurs = 0;
	});

	it('oublie l’heure quand le serveur est éteint', async () => {
		etat = 'offline';
		expect((await verifierArretsAuto(min(300), dep))[0].issue).toBe('eteint');
		expect(ligne().videDepuis).toBeNull();
		etat = 'running';
	});

	it('note un arrêt refusé une seule fois par délai', async () => {
		echecArret = true;
		await verifierArretsAuto(min(400), dep);
		expect((await verifierArretsAuto(min(431), dep))[0].issue).toBe('erreur');
		await verifierArretsAuto(min(433), dep);
		const erreurs = db().select().from(schema.actionsServeur).where(eq(schema.actionsServeur.resultat, 'erreur')).all().filter((a) => a.action === 'arret_auto');
		expect(erreurs).toHaveLength(1);
		expect(ligne().videDepuis).toBe(min(431));
		echecArret = false;
	});

	it('attend un admin qui a encore sa clé', async () => {
		db().update(schema.membres).set({ role: 'membre' }).where(eq(schema.membres.id, admin.id)).run();
		expect((await verifierArretsAuto(min(500), dep))[0].issue).toBe('sans_cle');
		expect(cles).toEqual([]);
		db().update(schema.membres).set({ role: 'admin' }).where(eq(schema.membres.id, admin.id)).run();
	});
});

describe('charge de la machine', () => {
	it('lit /proc/stat et calcule le processeur occupé entre deux mesures', () => {
		const a = lireStat('cpu  100 0 100 700 100 0 0 0 0 0\ncpu0 1 2 3 4\n')!;
		const b = lireStat('cpu  200 0 200 1300 300 0 0 0 0 0\n')!;
		expect(a).toMatchObject({ actif: 200, total: 1000 });
		expect(pourcentEntre(a, b)).toBe(20);
		expect(pourcentEntre(a, a)).toBeNull();
		expect(lireStat('rien')).toBeNull();
	});
	it('lit /proc/meminfo (mémoire disponible, pas seulement libre)', () => {
		const m = lireMeminfo('MemTotal:       24000000 kB\nMemFree:         1000000 kB\nMemAvailable:   18000000 kB\n');
		expect(m).toEqual({ totale: 24000000 * 1024, utilisee: 6000000 * 1024 });
		expect(lireMeminfo('')).toBeNull();
	});
});

describe('lecture seule', () => {
	it('garde la console et les sauvegardes fermées aux visiteurs', () => {
		for (const c of ['/panel', '/panel/console', '/panel/sauvegardes', '/panel/sauvegardes/telecharger']) expect(ouvertAuxVisiteurs('GET', c)).toBe(false);
	});
});
