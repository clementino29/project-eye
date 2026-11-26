// Fichiers & applis : droits, projets, envoi en flux, liens, téléchargement et nettoyage du disque.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ouvrirBase, remplacerBase, db, schema } from '../db/index.ts';
import { lireTaille } from '../config.ts';
import { peutDeposer, projetParSlug, slugLibre } from '../fichiers.ts';
import { devinerDepuisNom, plateformesLibelle, slugifier, tailleLisible } from '../../fichiers.ts';
import * as accueil from '../../../routes/fichiers/+page.server.ts';
import * as nouveau from '../../../routes/fichiers/nouveau/+page.server.ts';
import * as modifier from '../../../routes/fichiers/[slug]/modifier/+page.server.ts';
import * as fiche from '../../../routes/fichiers/[slug]/+page.server.ts';
import { POST as envoyer } from '../../../routes/fichiers/envoi/+server.ts';
import { GET as telecharger } from '../../../routes/fichiers/telecharger/[id]/+server.ts';
import type { Membre } from '../db/schema.ts';

let dossier: string;
let admin: Membre;
let deposant: Membre;
let membre: Membre;
let projetId: number;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const formulaire = (champs: Record<string, string | string[] | File>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(champs)) for (const x of [v].flat()) f.append(k, x);
	return f;
};
const action = (m: Membre | null, champs: Record<string, string | string[] | File> = {}, params: Record<string, string> = {}) =>
	({ request: new Request('http://test/', { method: 'POST', body: formulaire(champs) }), locals: { membre: m }, params, url: new URL('http://test/') }) as never;

/** Statut HTTP d'une erreur SvelteKit (200 si rien n'est levé). Accepte une fonction, pour les erreurs levées tout de suite. */
async function statut(promesse: unknown) {
	try {
		await (typeof promesse === 'function' ? promesse() : promesse);
		return 200;
	} catch (e) {
		return (e as { status?: number }).status;
	}
}
async function redirection(promesse: unknown) {
	try {
		await (typeof promesse === 'function' ? promesse() : promesse);
	} catch (e) {
		return (e as { location?: string }).location;
	}
}

/** POST /fichiers/envoi avec le fichier en corps de requête, en flux. */
const envoi = (m: Membre | null, contenu: Uint8Array, q: Record<string, string>) => {
	const url = new URL('http://test/fichiers/envoi');
	for (const [k, v] of Object.entries(q)) url.searchParams.set(k, v);
	const corps = new ReadableStream<Uint8Array>({
		start(c) {
			// En morceaux, comme un vrai envoi.
			for (let i = 0; i < contenu.length; i += 4) c.enqueue(contenu.slice(i, i + 4));
			c.close();
		}
	});
	const request = new Request(url, { method: 'POST', body: corps, duplex: 'half', headers: { 'content-type': 'application/zip' } } as RequestInit);
	return envoyer({ request, url, locals: { membre: m } } as never);
};
const fichiersSurDisque = () => fs.readdirSync(dossier).filter((n) => !n.startsWith('.') && n !== 'images');

beforeAll(() => {
	dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-fichiers-'));
	process.env.FICHIERS_PATH = dossier;
	process.env.FICHIERS_TAILLE_MAX = '64';
	remplacerBase(ouvrirBase(':memory:'));
	const base = db();
	admin = base.insert(schema.membres).values({ authentikId: 'a', pseudo: 'clem', nom: 'Clem', role: 'admin' }).returning().get();
	deposant = base.insert(schema.membres).values({ authentikId: 'b', pseudo: 'lea', nom: 'Léa', deposeFichiers: true }).returning().get();
	membre = base.insert(schema.membres).values({ authentikId: 'c', pseudo: 'tom', nom: 'Tom' }).returning().get();
});
afterAll(() => {
	fs.rmSync(dossier, { recursive: true, force: true });
	delete process.env.FICHIERS_PATH;
	delete process.env.FICHIERS_TAILLE_MAX;
});

describe('outils', () => {
	it('lit les tailles avec ou sans unité', () => {
		expect(lireTaille('2G')).toBe(2 * 1024 ** 3);
		expect(lireTaille('500M')).toBe(500 * 1024 ** 2);
		expect(lireTaille('1,5 Go')).toBe(1.5 * 1024 ** 3);
		expect(lireTaille('1048576')).toBe(1048576);
		expect(lireTaille('beaucoup')).toBeUndefined();
		expect(tailleLisible(412 * 1024 ** 2)).toBe('412,0 Mo');
	});
	it('devine le type et la plateforme d’après le nom', () => {
		expect(devinerDepuisNom('Installer.EXE')).toEqual({ type: 'appli', plateformes: ['win'] });
		expect(devinerDepuisNom('modpack.zip')).toEqual({ type: 'mod' });
		expect(devinerDepuisNom('options.txt')).toEqual({ type: 'config' });
		expect(devinerDepuisNom('jeu.apk')).toEqual({ type: 'appli', plateformes: ['android'] });
		expect(plateformesLibelle(['mac', 'win'])).toBe('Windows, Mac');
		expect(plateformesLibelle(['win', 'mac', 'linux', 'android'])).toBe('Toutes plateformes');
	});
	it('donne des adresses lisibles, sans prendre celles du hub', () => {
		expect(slugifier('Pokémon : Écarlate !')).toBe('pokemon-ecarlate');
		expect(slugLibre('Nouveau')).toBe('nouveau-2');
		expect(slugLibre('Envoi')).toBe('envoi-2');
	});
	it('réserve le dépôt aux admins et au groupe des fichiers', () => {
		expect([admin, deposant, membre, null].map(peutDeposer)).toEqual([true, true, false, false]);
	});
});

describe('projets', () => {
	it('refuse la création à un membre sans le droit', async () => {
		expect(await statut(nouveau.actions.enregistrer(action(membre, { nom: 'Minecraft' })))).toBe(403);
		expect(await statut(nouveau.actions.enregistrer(action(null, { nom: 'Minecraft' })))).toBe(401);
		expect(await statut(() => nouveau.load({ locals: { membre } } as never))).toBe(403);
	});
	it('crée un projet avec ses étapes et sa bannière, puis ouvre l’ajout', async () => {
		const banniere = new File([PNG], 'fond.png', { type: 'image/png' });
		const r = await redirection(nouveau.actions.enregistrer(action(deposant, { nom: 'Minecraft', sousTitre: 'Java 1.21', affichage: 'titre', etape: ['Installe Java', '', 'Lance le jeu'], banniere })));
		expect(r).toBe('/fichiers/minecraft?ajouter');
		const p = projetParSlug('minecraft')!;
		projetId = p.id;
		expect(p).toMatchObject({ nom: 'Minecraft', sousTitre: 'Java 1.21', affichage: 'titre', etapes: '["Installe Java","Lance le jeu"]', creeParId: deposant.id });
		expect(p.banniere).toMatch(/^[0-9a-f-]{36}\.png$/);
		expect(fs.existsSync(path.join(dossier, 'images', p.banniere!))).toBe(true);
		// Un deuxième projet du même nom prend une autre adresse.
		expect(slugLibre('Minecraft')).toBe('minecraft-2');
	});
	it('refuse une image qui n’en est pas une', async () => {
		const faux = new File([new TextEncoder().encode('<script>')], 'x.png', { type: 'image/png' });
		expect(await nouveau.actions.enregistrer(action(admin, { nom: 'Autre', logo: faux }))).toMatchObject({ status: 400, data: { erreur: expect.stringContaining('Image non reconnue') } });
		expect(projetParSlug('autre')).toBeUndefined();
	});
	it('retire la bannière et efface l’ancienne image', async () => {
		const ancienne = projetParSlug('minecraft')!.banniere!;
		const r = await redirection(modifier.actions.enregistrer(action(admin, { nom: 'Minecraft', affichage: 'logo_titre', retirer_banniere: '1', etape: 'Installe Java' }, { slug: 'minecraft' })));
		expect(r).toBe('/fichiers/minecraft');
		expect(projetParSlug('minecraft')).toMatchObject({ banniere: null, affichage: 'logo_titre', etapes: '["Installe Java"]' });
		expect(fs.existsSync(path.join(dossier, 'images', ancienne))).toBe(false);
	});
});

describe('fichiers', () => {
	let fichierId: number;

	it('envoie un fichier en flux et l’écrit sur le disque', async () => {
		const contenu = new TextEncoder().encode('PK contenu du modpack');
		const r = await envoi(deposant, contenu, { projet: String(projetId), nom: 'Modpack', type: 'mod', version: '1.2', plateformes: 'mac,win,inconnue', nomFichier: '../modpack été.zip' });
		expect(r.status).toBe(200);
		fichierId = ((await r.json()) as { id: number }).id;
		const f = db().select().from(schema.fichiers).all()[0];
		expect(f).toMatchObject({ nom: 'Modpack', type: 'mod', version: '1.2', plateformes: '["win","mac"]', nomOriginal: '.._modpack été.zip', taille: contenu.length, typeMime: 'application/zip' });
		expect(fs.readFileSync(path.join(dossier, f.stockage!), 'utf8')).toBe('PK contenu du modpack');
	});
	it('refuse un fichier trop gros sans rien garder', async () => {
		const avant = fichiersSurDisque();
		const gros = new Uint8Array(100).fill(65);
		expect(await statut(envoi(admin, gros, { projet: String(projetId), nom: 'Gros', type: 'appli', plateformes: 'win' }))).toBe(413);
		expect(fichiersSurDisque()).toEqual(avant);
		expect(fs.readdirSync(path.join(dossier, '.envois'))).toEqual([]);
	});
	it('refuse l’envoi à un membre sans le droit, ou sans plateforme', async () => {
		const un = new Uint8Array([1]);
		expect(await statut(envoi(membre, un, { projet: String(projetId), nom: 'X', type: 'mod', plateformes: 'win' }))).toBe(403);
		expect(await statut(envoi(admin, un, { projet: String(projetId), nom: 'X', type: 'mod', plateformes: '' }))).toBe(400);
		expect(await statut(envoi(admin, un, { projet: '999', nom: 'X', type: 'mod', plateformes: 'win' }))).toBe(404);
	});
	it('ajoute un lien externe en https seulement', async () => {
		expect(await accueil.actions.lien(action(admin, { projet: String(projetId), nom: 'Site', type: 'appli', plateforme: ['win'], lien: 'javascript:alert(1)' }))).toMatchObject({ status: 400 });
		expect(await accueil.actions.lien(action(admin, { projet: String(projetId), nom: 'Launcher', type: 'appli', plateforme: ['win', 'linux'], lien: 'https://exemple.fr/launcher' }))).toEqual({ ok: 'Launcher ajouté à Minecraft' });
		expect(await statut(accueil.actions.lien(action(membre, { projet: String(projetId), nom: 'X', type: 'appli', plateforme: 'win', lien: 'https://x.fr' })))).toBe(403);
	});
	it('télécharge le fichier sous son nom d’origine, et redirige un lien', async () => {
		const r = await telecharger({ params: { id: String(fichierId) }, locals: { membre } } as never);
		expect(r.headers.get('content-disposition')).toBe(`attachment; filename=".._modpack ete.zip"; filename*=UTF-8''.._modpack%20%C3%A9t%C3%A9.zip`);
		expect(await r.text()).toBe('PK contenu du modpack');
		const lien = db().select().from(schema.fichiers).all().find((f) => f.lien)!;
		expect(await redirection(() => telecharger({ params: { id: String(lien.id) }, locals: { membre } } as never))).toBe('https://exemple.fr/launcher');
		expect(await statut(() => telecharger({ params: { id: String(fichierId) }, locals: { membre: null } } as never))).toBe(401);
	});
	it('montre les projets et les fichiers récents aux membres', () => {
		const d = accueil.load({ locals: { membre } } as never);
		expect(d.peutDeposer).toBe(false);
		expect(d.projets.map((p) => [p.nom, p.fichiers.length])).toEqual([['Minecraft', 2]]);
		expect(d.recents.map((f) => f.nom).sort()).toEqual(['Launcher', 'Modpack']);
		const p = fiche.load({ params: { slug: 'minecraft' }, locals: { membre: deposant } } as never);
		expect(p.peutDeposer).toBe(true);
		expect(p.projet.etapes).toEqual(['Installe Java']);
	});
	it('modifie puis supprime un fichier, sur le disque aussi', async () => {
		expect(await accueil.actions.modifier(action(admin, { id: String(fichierId), nom: 'Modpack été', type: 'mod', version: '1.3', plateforme: 'linux' }))).toEqual({ ok: 'Fichier modifié' });
		const f = db().select().from(schema.fichiers).all().find((x) => x.id === fichierId)!;
		expect(f).toMatchObject({ nom: 'Modpack été', version: '1.3', plateformes: '["linux"]' });
		expect(await accueil.actions.supprimer(action(admin, { id: String(fichierId) }))).toEqual({ ok: 'Modpack été supprimé' });
		expect(fs.existsSync(path.join(dossier, f.stockage!))).toBe(false);
	});
	it('supprime un projet avec ses fichiers', async () => {
		await envoi(admin, new Uint8Array([1, 2, 3]), { projet: String(projetId), nom: 'Config', type: 'config', plateformes: 'win' });
		expect(fichiersSurDisque()).toHaveLength(1);
		expect(await redirection(modifier.actions.supprimer(action(admin, {}, { slug: 'minecraft' })))).toBe('/fichiers');
		expect(db().select().from(schema.projets).all()).toEqual([]);
		expect(db().select().from(schema.fichiers).all()).toEqual([]);
		expect(fichiersSurDisque()).toEqual([]);
	});
});
