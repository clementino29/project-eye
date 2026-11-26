// Connexion par le serveur Authentik du groupe, avec Better Auth (fournisseur
// OpenID Connect générique, code + PKCE). La table « membres » sert de table
// des utilisateurs de Better Auth : les identifiants des membres ne changent pas.
import crypto from 'node:crypto';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { eq } from 'drizzle-orm';
import { db, schema } from './db/index.ts';
import { config } from './config.ts';

export const FOURNISSEUR = 'authentik';
/** Cookie de la connexion de test (DEV_LOGIN=1 avec `npm run dev` uniquement). */
export const COOKIE_DEV = 'nh_dev';

/** N'accepte qu'un chemin interne comme destination après connexion. */
export function cheminSur(retour: string | null | undefined) {
	if (!retour || !retour.startsWith('/') || retour.startsWith('//') || retour.startsWith('/\\')) return '/';
	return retour;
}

/** La requête en cours, ou rien hors d'une requête (tests, tâches de fond). */
function evenementCourant() {
	try {
		return getRequestEvent();
	} catch {
		return undefined as unknown as ReturnType<typeof getRequestEvent>;
	}
}
const DUREE_SESSION = 30 * 24 * 3600;

export type ResultatAcces = { autorise: true; role: 'membre' | 'admin' } | { autorise: false };

/** Le rôle est lu dans les groupes Authentik ; sans groupe du hub, pas d'accès. */
export function accesDepuisGroupes(groupes: unknown): ResultatAcces {
	const liste = Array.isArray(groupes) ? groupes.map(String) : [];
	if (liste.includes(config.authentik.groupeAdmins)) return { autorise: true, role: 'admin' };
	if (liste.includes(config.authentik.groupeMembres)) return { autorise: true, role: 'membre' };
	return { autorise: false };
}

export interface ProfilOidc {
	sub?: unknown;
	preferred_username?: unknown;
	nickname?: unknown;
	name?: unknown;
	email?: unknown;
	email_verified?: unknown;
	groups?: unknown;
	[cle: string]: unknown;
}

const texte = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** Ce que le hub garde d'un profil Authentik (pseudo, nom, e-mail, rôle). */
export function profilVersMembre(profil: ProfilOidc) {
	const sub = String(profil.sub ?? '');
	const email = texte(profil.email);
	const pseudo = texte(profil.preferred_username) ?? texte(profil.nickname) ?? email?.split('@')[0] ?? 'membre';
	const acces = accesDepuisGroupes(profil.groups);
	return {
		authentikId: sub,
		pseudo,
		name: texte(profil.name) ?? pseudo,
		// Better Auth exige une adresse : sans e-mail chez Authentik, on en fabrique une qui ne sert à rien d'autre.
		email: (email ?? `${sub}@authentik.invalid`).toLowerCase(),
		emailVerified: profil.email_verified === true || profil.email_verified === 'true',
		role: acces.autorise ? acces.role : undefined,
		deposeFichiers: Array.isArray(profil.groups) && profil.groups.map(String).includes(config.authentik.groupeFichiers)
	};
}

/**
 * Secret de Better Auth (signature des cookies). Sans BETTER_AUTH_SECRET, il est
 * dérivé de HUB_ENCRYPTION_KEY : le déploiement n'a pas besoin d'une variable de plus.
 */
function secret() {
	if (config.betterAuthSecret) return config.betterAuthSecret;
	const cle = config.cleChiffrement;
	if (cle) return crypto.createHmac('sha256', cle).update('nohriancons/better-auth').digest('base64url');
	if (process.env.NODE_ENV === 'production') throw new Error('Renseigne HUB_ENCRYPTION_KEY (ou BETTER_AUTH_SECRET).');
	return 'secret-de-developpement-nohriancons-a-ne-pas-utiliser';
}

function creerAuth() {
	const { issuer, clientId, clientSecret } = config.authentik;
	const fournisseurs = issuer && clientId && clientSecret
		? [
				{
					providerId: FOURNISSEUR,
					name: 'Authentik',
					discoveryUrl: new URL('.well-known/openid-configuration', issuer.endsWith('/') ? issuer : `${issuer}/`).toString(),
					clientId,
					clientSecret,
					scopes: ['openid', 'profile', 'email'],
					pkce: true,
					// L'adresse de retour reste celle déclarée dans Authentik depuis la v1.
					redirectURI: `${config.origine}/auth/callback`,
					// Pseudo, nom, e-mail et rôle sont relus à chaque connexion.
					overrideUserInfo: true,
					mapProfileToUser: (profil: ProfilOidc) => profilVersMembre(profil)
				}
			]
		: [];

	return betterAuth({
		appName: 'Nohriancons',
		baseURL: config.origine,
		basePath: '/api/auth',
		secret: secret(),
		trustedOrigins: [config.origine],
		// Erreurs de connexion (état expiré, refus d'Authentik…) : retour à la page de connexion.
		onAPIError: { errorURL: `${config.origine}/connexion` },
		database: drizzleAdapter(db(), {
			provider: 'sqlite',
			schema: {
				membres: schema.membres,
				authSessions: schema.authSessions,
				authComptes: schema.authComptes,
				authVerifications: schema.authVerifications
			}
		}),
		// Pas de mot de passe : seul Authentik connecte au hub.
		emailAndPassword: { enabled: false },
		// Routes de Better Auth inutiles ici. Les fermer empêche notamment un membre
		// de changer lui-même son rôle ou son pseudo par /update-user.
		disabledPaths: [
			'/sign-up/email',
			'/sign-in/email',
			'/update-user',
			'/change-email',
			'/change-password',
			'/set-password',
			'/delete-user',
			'/link-social',
			'/unlink-account',
			'/request-password-reset',
			'/reset-password',
			'/verify-email',
			'/send-verification-email',
			'/update-session',
			'/list-accounts',
			'/account-info',
			'/get-access-token',
			'/refresh-token'
		],
		user: {
			modelName: 'membres',
			fields: {
				name: 'nom',
				image: 'imageAuthentik',
				emailVerified: 'emailVerifie',
				createdAt: 'creeLe',
				updatedAt: 'majLe'
			},
			additionalFields: {
				authentikId: { type: 'string', required: false, input: true },
				pseudo: { type: 'string', required: false, input: true },
				role: { type: 'string', required: false, input: true },
				deposeFichiers: { type: 'boolean', required: false, input: true }
			},
			// Refuse la connexion sans groupe du hub (nouveau membre comme ancien).
			validateUserInfo: ({ user }) => {
				const role = (user as { role?: unknown }).role;
				return role === 'membre' || role === 'admin' ? undefined : { error: 'groupe' };
			}
		},
		session: {
			modelName: 'authSessions',
			expiresIn: DUREE_SESSION,
			updateAge: 24 * 3600
		},
		account: {
			modelName: 'authComptes',
			// Le hub ne se sert pas des jetons d'Authentik après la connexion.
			updateAccountOnSignIn: true,
			accountLinking: { enabled: false }
		},
		verification: { modelName: 'authVerifications' },
		advanced: {
			cookiePrefix: 'nh',
			database: { generateId: 'serial' }
		},
		databaseHooks: {
			session: {
				create: {
					after: async (session) => {
						db()
							.update(schema.membres)
							.set({ derniereConnexion: Date.now() })
							.where(eq(schema.membres.id, Number(session.userId)))
							.run();
					}
				}
			}
		},
		telemetry: { enabled: false },
		// sveltekitCookies doit rester le dernier : il recopie les cookies de Better Auth dans la réponse de SvelteKit.
		plugins: [genericOAuth({ config: fournisseurs }), sveltekitCookies(evenementCourant)]
	});
}

export type Auth = ReturnType<typeof creerAuth>;
let instance: Auth | undefined;

export function auth(): Auth {
	instance ??= creerAuth();
	return instance;
}

/** Pour les tests : recrée Better Auth (après remplacerBase ou un changement de configuration). */
export function reinitialiserAuth() {
	instance = undefined;
}
