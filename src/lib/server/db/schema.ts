// Modèle de données du hub (voir le cahier des charges, section « Modèle de données »).
// Les données Steam (jeux_steam, possessions, envies) restent séparées des jeux
// que le groupe suit à la main (jeux).
import { sql } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

const maintenant = sql`(unixepoch() * 1000)`;

export const membres = sqliteTable('membres', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	/** Identifiant OIDC « sub » donné par Authentik (aussi dans auth_comptes). */
	authentikId: text('authentik_id').notNull().unique(),
	pseudo: text('pseudo').notNull(),
	/** Nom affiché (champ « name » de Better Auth). */
	nom: text('nom').notNull(),
	email: text('email'),
	/** Champ « emailVerified » de Better Auth (repris d'Authentik). */
	emailVerifie: integer('email_verifie', { mode: 'boolean' }).notNull().default(false),
	/** Image envoyée par Authentik (champ « image » de Better Auth), distincte de la photo du hub. */
	imageAuthentik: text('image_authentik'),
	/** Photo recadrée, en data URL JPEG (320 × 320). */
	photo: text('photo'),
	photoMaj: integer('photo_maj'),
	pseudoDiscord: text('pseudo_discord'),
	steamId: text('steam_id'),
	steamNom: text('steam_nom'),
	etatSteam: text('etat_steam', { enum: ['liee', 'privee', 'non_liee'] })
		.notNull()
		.default('non_liee'),
	derniereSyncSteam: integer('derniere_sync_steam'),
	clePelicanChiffree: text('cle_pelican_chiffree'),
	clePelicanAjouteeLe: integer('cle_pelican_ajoutee_le'),
	role: text('role', { enum: ['membre', 'admin'] }).notNull().default('membre'),
	/** En millisecondes, comme avant : seul le type TypeScript change (Date). */
	creeLe: integer('cree_le', { mode: 'timestamp_ms' }).notNull().default(maintenant),
	majLe: integer('maj_le', { mode: 'timestamp_ms' }),
	derniereConnexion: integer('derniere_connexion')
});

// Tables de Better Auth (session, account, verification). Les identifiants sont
// des entiers auto-incrémentés, comme ceux des membres (generateId: "serial").
// Les clés TypeScript suivent les noms de champs de Better Auth.

/** Sessions de connexion au hub. */
export const authSessions = sqliteTable(
	'auth_sessions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		token: text('token').notNull().unique(),
		userId: integer('membre_id')
			.notNull()
			.references(() => membres.id, { onDelete: 'cascade' }),
		expiresAt: integer('expire_le', { mode: 'timestamp_ms' }).notNull(),
		ipAddress: text('adresse_ip'),
		userAgent: text('navigateur'),
		createdAt: integer('cree_le', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('maj_le', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => [index('auth_sessions_membre').on(t.userId)]
);

/** Comptes liés à un membre : ici, son compte Authentik. */
export const authComptes = sqliteTable(
	'auth_comptes',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		/** « sub » chez le fournisseur. */
		accountId: text('compte_id').notNull(),
		providerId: text('fournisseur').notNull(),
		userId: integer('membre_id')
			.notNull()
			.references(() => membres.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: integer('access_token_expire_le', { mode: 'timestamp_ms' }),
		refreshTokenExpiresAt: integer('refresh_token_expire_le', { mode: 'timestamp_ms' }),
		scope: text('scope'),
		password: text('mot_de_passe'),
		createdAt: integer('cree_le', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('maj_le', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => [
		uniqueIndex('auth_comptes_fournisseur').on(t.providerId, t.accountId),
		index('auth_comptes_membre').on(t.userId)
	]
);

/** Valeurs temporaires de Better Auth (état OAuth, etc.). */
export const authVerifications = sqliteTable(
	'auth_verifications',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		identifier: text('identifiant').notNull(),
		value: text('valeur').notNull(),
		expiresAt: integer('expire_le', { mode: 'timestamp_ms' }).notNull(),
		createdAt: integer('cree_le', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('maj_le', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => [index('auth_verifications_identifiant').on(t.identifier)]
);

export const jeux = sqliteTable('jeux', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	titre: text('titre').notNull(),
	serie: text('serie'),
	image: text('image'),
	statut: text('statut', { enum: ['a_faire', 'en_cours', 'en_pause', 'termine'] })
		.notNull()
		.default('a_faire'),
	steamAppId: integer('steam_app_id'),
	/** Fiche IGDB d'où viennent le titre, la série et l'image (vide = saisi à la main). */
	igdbId: integer('igdb_id'),
	ajouteLe: integer('ajoute_le').notNull().default(maintenant)
});

export const joueursJeu = sqliteTable(
	'joueurs_jeu',
	{
		jeuId: integer('jeu_id')
			.notNull()
			.references(() => jeux.id, { onDelete: 'cascade' }),
		membreId: integer('membre_id')
			.notNull()
			.references(() => membres.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.jeuId, t.membreId] })]
);

export const parties = sqliteTable('parties', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	/** Nom du jeu, saisi librement avec suggestions (comme dans le prototype). */
	jeuNom: text('jeu_nom').notNull(),
	jeuId: integer('jeu_id').references(() => jeux.id, { onDelete: 'set null' }),
	nom: text('nom').notNull(),
	statut: text('statut', { enum: ['en_cours', 'en_pause', 'terminee'] })
		.notNull()
		.default('en_cours'),
	/** Vide = sans limite de tours. */
	toursMax: integer('tours_max'),
	serveurId: integer('serveur_id').references(() => serveurs.id, { onDelete: 'set null' }),
	creeeLe: integer('creee_le').notNull().default(maintenant)
});

/** Équipes d'une partie « en équipes ». Une partie sans équipe se joue chacun pour soi. */
export const equipes = sqliteTable(
	'equipes',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		partieId: integer('partie_id')
			.notNull()
			.references(() => parties.id, { onDelete: 'cascade' }),
		nom: text('nom').notNull(),
		/** Clé de couleur (voir COULEURS_EQUIPE). */
		couleur: text('couleur').notNull(),
		ordre: integer('ordre').notNull().default(0),
		/** Équipe victorieuse (plusieurs possibles : égalité). */
		gagnante: integer('gagnante', { mode: 'boolean' }).notNull().default(false)
	},
	(t) => [index('equipes_partie').on(t.partieId)]
);

export const participations = sqliteTable(
	'participations',
	{
		partieId: integer('partie_id')
			.notNull()
			.references(() => parties.id, { onDelete: 'cascade' }),
		membreId: integer('membre_id')
			.notNull()
			.references(() => membres.id, { onDelete: 'cascade' }),
		equipeId: integer('equipe_id').references(() => equipes.id, { onDelete: 'set null' })
	},
	(t) => [primaryKey({ columns: [t.partieId, t.membreId] })]
);

/** Vainqueurs d'une partie chacun pour soi (plusieurs possibles : égalité). */
export const gagnantsPartie = sqliteTable(
	'gagnants_partie',
	{
		partieId: integer('partie_id')
			.notNull()
			.references(() => parties.id, { onDelete: 'cascade' }),
		membreId: integer('membre_id')
			.notNull()
			.references(() => membres.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.partieId, t.membreId] })]
);

export const sessionsPartie = sqliteTable(
	'sessions_partie',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		partieId: integer('partie_id')
			.notNull()
			.references(() => parties.id, { onDelete: 'cascade' }),
		/** Date au format AAAA-MM-JJ. */
		date: text('date').notNull(),
		tourAtteint: integer('tour_atteint').notNull(),
		note: text('note')
	},
	(t) => [index('sessions_partie_partie').on(t.partieId)]
);

/** Fiche Steam en cache, commune à tous. */
export const jeuxSteam = sqliteTable('jeux_steam', {
	steamAppId: integer('steam_app_id').primaryKey(),
	nom: text('nom').notNull(),
	nomCourt: text('nom_court'),
	mode: text('mode', { enum: ['coop', 'versus', 'solo'] }),
	multijoueur: integer('multijoueur', { mode: 'boolean' }),
	/** Vide = inconnu (Steam ne le donne pas, il se règle à la main). */
	joueursMax: integer('joueurs_max'),
	/** Genres séparés par « · ». */
	genres: text('genres'),
	gratuit: integer('gratuit', { mode: 'boolean' }).notNull().default(false),
	/** Date de la dernière lecture de la fiche sur le Steam Store (vide = jamais). */
	detailsLe: integer('details_le')
});

export const possessions = sqliteTable(
	'possessions',
	{
		membreId: integer('membre_id')
			.notNull()
			.references(() => membres.id, { onDelete: 'cascade' }),
		steamAppId: integer('steam_app_id').notNull(),
		importeLe: integer('importe_le').notNull()
	},
	(t) => [primaryKey({ columns: [t.membreId, t.steamAppId] }), index('possessions_app').on(t.steamAppId)]
);

export const envies = sqliteTable(
	'envies',
	{
		membreId: integer('membre_id')
			.notNull()
			.references(() => membres.id, { onDelete: 'cascade' }),
		steamAppId: integer('steam_app_id').notNull(),
		date: integer('date').notNull()
	},
	(t) => [primaryKey({ columns: [t.membreId, t.steamAppId] })]
);

export const tirages = sqliteTable('tirages', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	date: integer('date').notNull(),
	lancePar: integer('lance_par').references(() => membres.id, { onDelete: 'set null' }),
	/** Identifiants des membres présents, en JSON. */
	joueursPresents: text('joueurs_presents').notNull(),
	steamAppIdTire: integer('steam_app_id_tire').notNull(),
	valide: integer('valide', { mode: 'boolean' }).notNull().default(false)
});

/**
 * Réglages locaux d'un serveur Pelican. Les droits viennent de Pelican :
 * cette table ne sert qu'à l'affichage (jeu lié, adresse, sonde GameDig).
 */
export const serveurs = sqliteTable('serveurs', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	identifiantPelican: text('identifiant_pelican').notNull().unique(),
	nom: text('nom'),
	jeuId: integer('jeu_id').references(() => jeux.id, { onDelete: 'set null' }),
	adresseConnexion: text('adresse_connexion'),
	/** Type de jeu GameDig (ex. « minecraft », « valheim ») pour lister les joueurs connectés. */
	gamedigType: text('gamedig_type')
});

/** Journal d'audit des actions serveur faites depuis le hub. Jamais modifié. */
export const actionsServeur = sqliteTable(
	'actions_serveur',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		identifiantPelican: text('identifiant_pelican').notNull(),
		nomServeur: text('nom_serveur').notNull(),
		membreId: integer('membre_id').references(() => membres.id, { onDelete: 'set null' }),
		action: text('action', {
			enum: ['demarrer', 'arreter', 'redemarrer', 'commande', 'sauvegarde']
		}).notNull(),
		resultat: text('resultat', { enum: ['ok', 'erreur'] }).notNull(),
		message: text('message'),
		date: integer('date').notNull()
	},
	(t) => [index('actions_serveur_date').on(t.date)]
);

export type Membre = typeof membres.$inferSelect;
export type JeuSteam = typeof jeuxSteam.$inferSelect;
