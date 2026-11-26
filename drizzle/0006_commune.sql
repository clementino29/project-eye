CREATE TABLE `deja_vus` (
	`membre_id` integer NOT NULL,
	`titre_id` integer NOT NULL,
	PRIMARY KEY(`membre_id`, `titre_id`),
	FOREIGN KEY (`membre_id`) REFERENCES `membres`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`titre_id`) REFERENCES `liste_commune`(`titre_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `episodes_vus_ensemble` (
	`titre_id` integer NOT NULL,
	`saison` integer NOT NULL,
	`episode` integer NOT NULL,
	`vu_le` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`titre_id`, `saison`, `episode`),
	FOREIGN KEY (`titre_id`) REFERENCES `liste_commune`(`titre_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `liste_commune` (
	`titre_id` integer PRIMARY KEY NOT NULL,
	`propose_par_id` integer,
	`statut` text DEFAULT 'avoir' NOT NULL,
	`ajoute_le` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`fini_le` integer,
	FOREIGN KEY (`titre_id`) REFERENCES `titres`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`propose_par_id`) REFERENCES `membres`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `liste_commune_statut` ON `liste_commune` (`statut`);--> statement-breakpoint
CREATE TABLE `presences_soiree` (
	`soiree_id` integer NOT NULL,
	`membre_id` integer NOT NULL,
	`cree_le` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`soiree_id`, `membre_id`),
	FOREIGN KEY (`soiree_id`) REFERENCES `soirees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`membre_id`) REFERENCES `membres`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `soirees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`heure` text DEFAULT '21:00' NOT NULL,
	`lieu` text DEFAULT 'En ligne' NOT NULL,
	`titre_id` integer,
	`note` text,
	`cree_par_id` integer,
	`cree_le` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`titre_id`) REFERENCES `titres`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`cree_par_id`) REFERENCES `membres`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `soirees_date` ON `soirees` (`date`);--> statement-breakpoint
CREATE TABLE `votes_titre` (
	`membre_id` integer NOT NULL,
	`titre_id` integer NOT NULL,
	`cree_le` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`membre_id`, `titre_id`),
	FOREIGN KEY (`membre_id`) REFERENCES `membres`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`titre_id`) REFERENCES `liste_commune`(`titre_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `votes_titre_titre` ON `votes_titre` (`titre_id`);