CREATE TABLE `fichiers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projet_id` integer NOT NULL,
	`nom` text NOT NULL,
	`type` text DEFAULT 'appli' NOT NULL,
	`version` text,
	`plateformes` text DEFAULT '[]' NOT NULL,
	`note` text,
	`lien` text,
	`stockage` text,
	`nom_original` text,
	`taille` integer,
	`type_mime` text,
	`ajoute_par_id` integer,
	`ajoute_le` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`maj_le` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`projet_id`) REFERENCES `projets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ajoute_par_id`) REFERENCES `membres`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `fichiers_projet` ON `fichiers` (`projet_id`);--> statement-breakpoint
CREATE TABLE `projets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`nom` text NOT NULL,
	`sous_titre` text,
	`affichage` text DEFAULT 'logo_titre' NOT NULL,
	`etapes` text DEFAULT '[]' NOT NULL,
	`banniere` text,
	`logo` text,
	`vignette` text,
	`cree_par_id` integer,
	`cree_le` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`maj_le` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`cree_par_id`) REFERENCES `membres`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projets_slug_unique` ON `projets` (`slug`);--> statement-breakpoint
ALTER TABLE `membres` ADD `depose_fichiers` integer DEFAULT false NOT NULL;