CREATE TABLE `auth_comptes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`compte_id` text NOT NULL,
	`fournisseur` text NOT NULL,
	`membre_id` integer NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expire_le` integer,
	`refresh_token_expire_le` integer,
	`scope` text,
	`mot_de_passe` text,
	`cree_le` integer NOT NULL,
	`maj_le` integer NOT NULL,
	FOREIGN KEY (`membre_id`) REFERENCES `membres`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_comptes_fournisseur` ON `auth_comptes` (`fournisseur`,`compte_id`);--> statement-breakpoint
CREATE INDEX `auth_comptes_membre` ON `auth_comptes` (`membre_id`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token` text NOT NULL,
	`membre_id` integer NOT NULL,
	`expire_le` integer NOT NULL,
	`adresse_ip` text,
	`navigateur` text,
	`cree_le` integer NOT NULL,
	`maj_le` integer NOT NULL,
	FOREIGN KEY (`membre_id`) REFERENCES `membres`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_sessions_token_unique` ON `auth_sessions` (`token`);--> statement-breakpoint
CREATE INDEX `auth_sessions_membre` ON `auth_sessions` (`membre_id`);--> statement-breakpoint
CREATE TABLE `auth_verifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`identifiant` text NOT NULL,
	`valeur` text NOT NULL,
	`expire_le` integer NOT NULL,
	`cree_le` integer NOT NULL,
	`maj_le` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_verifications_identifiant` ON `auth_verifications` (`identifiant`);--> statement-breakpoint
ALTER TABLE `membres` ADD `email_verifie` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `membres` ADD `image_authentik` text;--> statement-breakpoint
ALTER TABLE `membres` ADD `maj_le` integer;--> statement-breakpoint
UPDATE `membres` SET `maj_le` = `cree_le`;--> statement-breakpoint
-- Les membres existants gardent leur identifiant : leur compte Authentik est
-- recopié dans auth_comptes, Better Auth les retrouve à la prochaine connexion.
INSERT INTO `auth_comptes` (`compte_id`, `fournisseur`, `membre_id`, `cree_le`, `maj_le`)
SELECT `authentik_id`, 'authentik', `id`, `cree_le`, unixepoch() * 1000 FROM `membres` WHERE `authentik_id` NOT LIKE 'dev:%';
