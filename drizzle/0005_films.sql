CREATE TABLE `conseils` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`de_id` integer NOT NULL,
	`a_id` integer NOT NULL,
	`titre_id` integer NOT NULL,
	`message` text,
	`cree_le` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`de_id`) REFERENCES `membres`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`a_id`) REFERENCES `membres`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`titre_id`) REFERENCES `titres`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conseils_destinataire` ON `conseils` (`a_id`);--> statement-breakpoint
CREATE TABLE `episodes_vus` (
	`membre_id` integer NOT NULL,
	`titre_id` integer NOT NULL,
	`saison` integer NOT NULL,
	`episode` integer NOT NULL,
	`vu_le` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`membre_id`, `titre_id`, `saison`, `episode`),
	FOREIGN KEY (`membre_id`) REFERENCES `membres`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`titre_id`) REFERENCES `titres`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `saisons_titre` (
	`titre_id` integer NOT NULL,
	`numero` integer NOT NULL,
	`episodes` text NOT NULL,
	`maj_le` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`titre_id`, `numero`),
	FOREIGN KEY (`titre_id`) REFERENCES `titres`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `titres` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tmdb_id` integer NOT NULL,
	`type` text NOT NULL,
	`titre` text NOT NULL,
	`titre_original` text,
	`annee` integer,
	`affiche` text,
	`resume` text,
	`genres` text DEFAULT '[]' NOT NULL,
	`duree` integer,
	`saisons` text DEFAULT '[]' NOT NULL,
	`maj_le` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `titres_tmdb` ON `titres` (`type`,`tmdb_id`);--> statement-breakpoint
CREATE TABLE `watchlist` (
	`membre_id` integer NOT NULL,
	`titre_id` integer NOT NULL,
	`statut` text DEFAULT 'avoir' NOT NULL,
	`note` integer,
	`avis` text,
	`ajoute_le` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`fini_le` integer,
	`maj_le` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`membre_id`, `titre_id`),
	FOREIGN KEY (`membre_id`) REFERENCES `membres`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`titre_id`) REFERENCES `titres`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `watchlist_titre` ON `watchlist` (`titre_id`);