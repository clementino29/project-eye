// Lecture de la configuration. Tous les secrets viennent de variables
// d'environnement (voir .env.example), jamais du code.
import fs from 'node:fs';

let charge = false;

function chargerFichierEnv() {
	if (charge) return;
	charge = true;
	// En développement, on lit le fichier .env s'il existe. En production
	// (Docker), les variables sont fournies par docker compose.
	if (fs.existsSync('.env') && typeof process.loadEnvFile === 'function') {
		try {
			process.loadEnvFile('.env');
		} catch {
			// fichier illisible : on garde l'environnement tel quel
		}
	}
}

function lire(nom: string): string | undefined {
	chargerFichierEnv();
	const v = process.env[nom];
	return v === undefined || v.trim() === '' ? undefined : v.trim();
}

function sansSlashFinal(url: string | undefined) {
	return url?.replace(/\/+$/, '');
}

export const config = {
	get origine() {
		return sansSlashFinal(lire('ORIGIN')) ?? 'http://localhost:5173';
	},
	get cheminBase() {
		return lire('DATABASE_PATH') ?? './data/hub.db';
	},
	get cleChiffrement() {
		return lire('HUB_ENCRYPTION_KEY');
	},
	/** Facultatif : sans lui, le secret de Better Auth est dérivé de HUB_ENCRYPTION_KEY. */
	get betterAuthSecret() {
		return lire('BETTER_AUTH_SECRET');
	},
	/** Connexion de test sans Authentik, seulement en développement. */
	get connexionDev() {
		return lire('DEV_LOGIN') === '1';
	},
	authentik: {
		get issuer() {
			return lire('AUTHENTIK_ISSUER');
		},
		get clientId() {
			return lire('AUTHENTIK_CLIENT_ID');
		},
		get clientSecret() {
			return lire('AUTHENTIK_CLIENT_SECRET');
		},
		get groupeMembres() {
			return lire('AUTHENTIK_MEMBER_GROUP') ?? 'hub-membres';
		},
		get groupeAdmins() {
			return lire('AUTHENTIK_ADMIN_GROUP') ?? 'hub-admins';
		},
		/** Page où chacun modifie son nom, son e-mail et son pseudo. */
		get urlProfil() {
			const explicite = lire('AUTHENTIK_PROFILE_URL');
			if (explicite) return explicite;
			const issuer = lire('AUTHENTIK_ISSUER');
			if (!issuer) return undefined;
			try {
				return new URL('/if/user/#/settings', issuer).toString();
			} catch {
				return undefined;
			}
		},
		get configure() {
			return !!(lire('AUTHENTIK_ISSUER') && lire('AUTHENTIK_CLIENT_ID') && lire('AUTHENTIK_CLIENT_SECRET'));
		}
	},
	steam: {
		get cleApi() {
			return lire('STEAM_API_KEY');
		}
	},
	/** IGDB passe par une application Twitch (https://dev.twitch.tv/console/apps). */
	igdb: {
		get clientId() {
			return lire('IGDB_CLIENT_ID');
		},
		get secret() {
			return lire('IGDB_CLIENT_SECRET');
		},
		get configure() {
			return !!(lire('IGDB_CLIENT_ID') && lire('IGDB_CLIENT_SECRET'));
		}
	},
	pelican: {
		get url() {
			return sansSlashFinal(lire('PELICAN_URL'));
		},
		/** Page « Clés API » de Sakura Panel, pour le lien direct de la page Compte. */
		get urlClesApi() {
			const explicite = lire('PELICAN_API_KEYS_URL');
			if (explicite) return explicite;
			const base = sansSlashFinal(lire('PELICAN_URL'));
			return base ? `${base}/profile?tab=api-keys` : undefined;
		},
		/** Modèle d'adresse d'un serveur dans Pelican ; {id} est remplacé par l'identifiant court. */
		get modeleUrlServeur() {
			const explicite = lire('PELICAN_SERVER_URL_TEMPLATE');
			if (explicite) return explicite;
			const base = sansSlashFinal(lire('PELICAN_URL'));
			return base ? `${base}/server/{id}` : undefined;
		}
	},
	kuma: {
		get url() {
			return sansSlashFinal(lire('KUMA_URL'));
		},
		get slug() {
			return lire('KUMA_STATUS_SLUG');
		}
	}
};
