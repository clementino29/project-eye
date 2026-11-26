// Parcours complet de connexion Better Auth + Authentik, avec un faux Authentik
// (fetch simulé) et une base qui part de l'état de la v1 (migrations 0000 et 0001).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ouvrirBase, remplacerBase, db, schema } from '../db/index.ts';
import { auth, reinitialiserAuth } from '../auth.ts';

const ISSUER = 'https://auth.test/application/o/hub/';
const HUB = 'https://hub.test';
let dossier: string;
let fichier: string;
let ancienId: number;

// Faux Authentik : découverte, JWKS, jeton et userinfo.
let profilCourant: Record<string, unknown> = {};
let derniereDemandeJeton: URLSearchParams | undefined;
let nonceAttendu = '';

async function fauxAuthentik() {
	const { publicKey, privateKey } = await generateKeyPair('RS256');
	const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
	const json = (corps: unknown) =>
		new Response(JSON.stringify(corps), { status: 200, headers: { 'content-type': 'application/json' } });
	return vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url);
		if (url.pathname.endsWith('/.well-known/openid-configuration')) {
			return json({
				issuer: ISSUER,
				authorization_endpoint: 'https://auth.test/application/o/authorize/',
				token_endpoint: 'https://auth.test/application/o/token/',
				userinfo_endpoint: 'https://auth.test/application/o/userinfo/',
				jwks_uri: 'https://auth.test/application/o/hub/jwks/',
				id_token_signing_alg_values_supported: ['RS256']
			});
		}
		if (url.pathname.endsWith('/jwks/')) return json({ keys: [jwk] });
		if (url.pathname.endsWith('/token/')) {
			const corps = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams(String(init?.body ?? ''));
			derniereDemandeJeton = corps;
			const idToken = await new SignJWT({ ...profilCourant, nonce: nonceAttendu })
				.setProtectedHeader({ alg: 'RS256', kid: 'k1' })
				.setIssuer(ISSUER)
				.setAudience('client-hub')
				.setSubject(String(profilCourant.sub))
				.setIssuedAt()
				.setExpirationTime('5m')
				.sign(privateKey);
			return json({ access_token: 'acces', token_type: 'Bearer', expires_in: 300, id_token: idToken, scope: 'openid profile email' });
		}
		if (url.pathname.endsWith('/userinfo/')) return json(profilCourant);
		return new Response('inconnu', { status: 404 });
	});
}

/** Cookies « nom=valeur » à renvoyer, tirés des Set-Cookie d'une réponse. */
function cookiesDe(headers: Headers) {
	return headers
		.getSetCookie()
		.map((c) => c.split(';')[0])
		.filter((c) => !c.endsWith('='))
		.join('; ');
}

/** Démarre la connexion, puis revient d'Authentik comme le ferait le navigateur. */
async function seConnecter(profil: Record<string, unknown>) {
	profilCourant = profil;
	const debut = await auth().api.signInSocial({
		body: { provider: 'authentik', callbackURL: '/jeux', errorCallbackURL: '/connexion', disableRedirect: true },
		headers: new Headers({ origin: HUB }),
		returnHeaders: true
	});
	const urlAuthentik = new URL(debut.response.url!);
	expect(urlAuthentik.searchParams.get('redirect_uri')).toBe(`${HUB}/auth/callback`);
	expect(urlAuthentik.searchParams.get('code_challenge_method')).toBe('S256');
	nonceAttendu = urlAuthentik.searchParams.get('nonce') ?? '';
	const etat = urlAuthentik.searchParams.get('state')!;
	const retour = await auth().handler(
		new Request(`${HUB}/api/auth/callback/authentik?code=code-test&state=${encodeURIComponent(etat)}`, {
			headers: { cookie: cookiesDe(debut.headers) }
		})
	);
	return retour;
}

beforeAll(async () => {
	vi.stubGlobal('fetch', await fauxAuthentik());
	process.env.ORIGIN = HUB;
	process.env.AUTHENTIK_ISSUER = ISSUER;
	process.env.AUTHENTIK_CLIENT_ID = 'client-hub';
	process.env.AUTHENTIK_CLIENT_SECRET = 'secret-hub';
	process.env.AUTHENTIK_MEMBER_GROUP = 'nohriancons';
	process.env.AUTHENTIK_ADMIN_GROUP = 'authentik Admins';
	process.env.HUB_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

	// Base de la v1 : seulement les deux premières migrations, avec un membre existant.
	dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-auth-'));
	fichier = path.join(dossier, 'hub.db');
	const v1 = path.join(dossier, 'drizzle-v1');
	fs.mkdirSync(path.join(v1, 'meta'), { recursive: true });
	const journal = JSON.parse(fs.readFileSync('drizzle/meta/_journal.json', 'utf8'));
	journal.entries = journal.entries.slice(0, 2);
	fs.writeFileSync(path.join(v1, 'meta', '_journal.json'), JSON.stringify(journal));
	for (const e of journal.entries) fs.copyFileSync(`drizzle/${e.tag}.sql`, path.join(v1, `${e.tag}.sql`));
	const brute = new Database(fichier);
	migrate(drizzle(brute), { migrationsFolder: v1 });
	brute
		.prepare("INSERT INTO membres (authentik_id, pseudo, nom, email, role, cle_pelican_chiffree) VALUES ('sub-clement', 'clem', 'Clément', 'clem@exemple.fr', 'membre', 'cle')")
		.run();
	brute.prepare("INSERT INTO jeux (titre) VALUES ('Halo 3')").run();
	brute.prepare('INSERT INTO joueurs_jeu (jeu_id, membre_id) VALUES (1, 1)').run();
	brute.close();

	// Ouverture normale : copie de sécurité puis migrations de la v2.
	remplacerBase(ouvrirBase(fichier));
	reinitialiserAuth();
	ancienId = db().select().from(schema.membres).get()!.id;
});

afterAll(() => {
	vi.unstubAllGlobals();
	fs.rmSync(dossier, { recursive: true, force: true });
});

describe('migration vers Better Auth', () => {
	it('copie la base avant de migrer et relie le membre existant à son compte Authentik', () => {
		expect(fs.readdirSync(dossier).some((f) => f.startsWith('hub.db.avant-migration-2'))).toBe(true);
		const compte = db().select().from(schema.authComptes).get();
		expect(compte).toMatchObject({ accountId: 'sub-clement', providerId: 'authentik', userId: ancienId });
	});
});

describe('connexion par Authentik', () => {
	it('retrouve le membre existant (même identifiant, données gardées) et met à jour son rôle', async () => {
		const r = await seConnecter({
			sub: 'sub-clement',
			preferred_username: 'clement',
			name: 'Clément N.',
			email: 'clem@exemple.fr',
			email_verified: true,
			groups: ['nohriancons', 'authentik Admins']
		});
		expect(r.status).toBe(302);
		expect(r.headers.get('location')).toBe('/jeux');
		expect(derniereDemandeJeton?.get('redirect_uri')).toBe(`${HUB}/auth/callback`);
		expect(derniereDemandeJeton?.get('code_verifier')).toBeTruthy();

		const membres = db().select().from(schema.membres).all();
		expect(membres).toHaveLength(1);
		expect(membres[0]).toMatchObject({ id: ancienId, pseudo: 'clement', nom: 'Clément N.', role: 'admin', clePelicanChiffree: 'cle' });
		expect(membres[0].derniereConnexion).toBeGreaterThan(0);
		expect(db().select().from(schema.joueursJeu).all()).toEqual([{ jeuId: 1, membreId: ancienId }]);

		const session = await auth().api.getSession({ headers: new Headers({ cookie: cookiesDe(r.headers) }) });
		expect(Number(session?.user.id)).toBe(ancienId);
	});

	it('crée un nouveau membre du groupe à sa première connexion', async () => {
		const r = await seConnecter({ sub: 'sub-julie', preferred_username: 'julie', name: 'Julie', email: 'julie@exemple.fr', groups: ['nohriancons'] });
		expect(r.headers.get('location')).toBe('/jeux');
		const julie = db().select().from(schema.membres).where(eq(schema.membres.authentikId, 'sub-julie')).get();
		expect(julie).toMatchObject({ pseudo: 'julie', role: 'membre', email: 'julie@exemple.fr' });
	});

	it('refuse un compte sans groupe du hub, sans rien créer', async () => {
		const avant = db().select().from(schema.membres).all().length;
		const r = await seConnecter({ sub: 'sub-intrus', preferred_username: 'intrus', email: 'intrus@exemple.fr', groups: ['autre'] });
		expect(r.headers.get('location')).toMatch(/^\/connexion\?error=groupe/);
		expect(db().select().from(schema.membres).all()).toHaveLength(avant);
	});

	it('retire l’accès à un membre sorti du groupe', async () => {
		const r = await seConnecter({ sub: 'sub-julie', preferred_username: 'julie', email: 'julie@exemple.fr', groups: [] });
		expect(r.headers.get('location')).toMatch(/error=groupe/);
	});

	it('ferme les routes qui laisseraient un membre changer son rôle', async () => {
		const r = await auth().handler(
			new Request(`${HUB}/api/auth/update-user`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin: HUB },
				body: JSON.stringify({ role: 'admin' })
			})
		);
		expect(r.status).toBe(404);
	});
});
