CREATE TABLE `actions_serveur` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`identifiant_pelican` text NOT NULL,
	`nom_serveur` text NOT NULL,
	`membre_id` integer,
	`action` text NOT NULL,
	`resultat` text NOT NULL,
	`message` text,
	`date` integer NOT NULL,
	FOREIGN KEY (`membre_id`) REFERENCES `membres`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `actions_serveur_date` ON `actions_serveur` (`date`);--> statement-breakpoint
CREATE TABLE `envies` (
	`membre_id` integer NOT NULL,
	`steam_app_id` integer NOT NULL,
	`date` integer NOT NULL,
	PRIMARY KEY(`membre_id`, `steam_app_id`),
	FOREIGN KEY (`membre_id`) REFERENCES `membres`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `jeux` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`titre` text NOT NULL,
	`serie` text,
	`image` text,
	`statut` text DEFAULT 'a_faire' NOT NULL,
	`steam_app_id` integer,
	`ajoute_le` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jeux_steam` (
	`steam_app_id` integer PRIMARY KEY NOT NULL,
	`nom` text NOT NULL,
	`nom_court` text,
	`mode` text,
	`multijoueur` integer,
	`joueurs_max` integer,
	`genres` text,
	`gratuit` integer DEFAULT false NOT NULL,
	`details_le` integer
);
--> statement-breakpoint
CREATE TABLE `joueurs_jeu` (
	`jeu_id` integer NOT NULL,
	`membre_id` integer NOT NULL,
	PRIMARY KEY(`jeu_id`, `membre_id`),
	FOREIGN KEY (`jeu_id`) REFERENCES `jeux`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`membre_id`) REFERENCES `membres`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `membres` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`authentik_id` text NOT NULL,
	`pseudo` text NOT NULL,
	`nom` text NOT NULL,
	`email` text,
	`photo` text,
	`photo_maj` integer,
	`pseudo_discord` text,
	`steam_id` text,
	`steam_nom` text,
	`etat_steam` text DEFAULT 'non_liee' NOT NULL,
	`derniere_sync_steam` integer,
	`cle_pelican_chiffree` text,
	`cle_pelican_ajoutee_le` integer,
	`role` text DEFAULT 'membre' NOT NULL,
	`cree_le` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`derniere_connexion` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membres_authentik_id_unique` ON `membres` (`authentik_id`);--> statement-breakpoint
CREATE TABLE `participations` (
	`partie_id` integer NOT NULL,
	`membre_id` integer NOT NULL,
	PRIMARY KEY(`partie_id`, `membre_id`),
	FOREIGN KEY (`partie_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`membre_id`) REFERENCES `membres`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `parties` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`jeu_nom` text NOT NULL,
	`jeu_id` integer,
	`nom` text NOT NULL,
	`statut` text DEFAULT 'en_cours' NOT NULL,
	`tours_max` integer,
	`gagnant_id` integer,
	`serveur_id` integer,
	`creee_le` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`jeu_id`) REFERENCES `jeux`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`gagnant_id`) REFERENCES `membres`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`serveur_id`) REFERENCES `serveurs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `possessions` (
	`membre_id` integer NOT NULL,
	`steam_app_id` integer NOT NULL,
	`importe_le` integer NOT NULL,
	PRIMARY KEY(`membre_id`, `steam_app_id`),
	FOREIGN KEY (`membre_id`) REFERENCES `membres`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `possessions_app` ON `possessions` (`steam_app_id`);--> statement-breakpoint
CREATE TABLE `serveurs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`identifiant_pelican` text NOT NULL,
	`nom` text,
	`jeu_id` integer,
	`adresse_connexion` text,
	`gamedig_type` text,
	FOREIGN KEY (`jeu_id`) REFERENCES `jeux`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `serveurs_identifiant_pelican_unique` ON `serveurs` (`identifiant_pelican`);--> statement-breakpoint
CREATE TABLE `sessions_partie` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`partie_id` integer NOT NULL,
	`date` text NOT NULL,
	`tour_atteint` integer NOT NULL,
	`note` text,
	FOREIGN KEY (`partie_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_partie_partie` ON `sessions_partie` (`partie_id`);--> statement-breakpoint
CREATE TABLE `sessions_web` (
	`id` text PRIMARY KEY NOT NULL,
	`membre_id` integer NOT NULL,
	`expire_le` integer NOT NULL,
	FOREIGN KEY (`membre_id`) REFERENCES `membres`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tirages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` integer NOT NULL,
	`lance_par` integer,
	`joueurs_presents` text NOT NULL,
	`steam_app_id_tire` integer NOT NULL,
	`valide` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`lance_par`) REFERENCES `membres`(`id`) ON UPDATE no action ON DELETE set null
);
