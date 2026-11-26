CREATE TABLE `equipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`partie_id` integer NOT NULL,
	`nom` text NOT NULL,
	`couleur` text NOT NULL,
	`ordre` integer DEFAULT 0 NOT NULL,
	`gagnante` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`partie_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `equipes_partie` ON `equipes` (`partie_id`);--> statement-breakpoint
CREATE TABLE `gagnants_partie` (
	`partie_id` integer NOT NULL,
	`membre_id` integer NOT NULL,
	PRIMARY KEY(`partie_id`, `membre_id`),
	FOREIGN KEY (`partie_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`membre_id`) REFERENCES `membres`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Le gagnant unique des parties existantes devient leur premier vainqueur.
INSERT INTO `gagnants_partie` (`partie_id`, `membre_id`) SELECT `id`, `gagnant_id` FROM `parties` WHERE `gagnant_id` IS NOT NULL;--> statement-breakpoint
-- Les clés étrangères sont coupées pendant les migrations (voir ouvrirBase) : recréer
-- la table ne supprime donc ni les participations ni les sessions.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_parties` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`jeu_nom` text NOT NULL,
	`jeu_id` integer,
	`nom` text NOT NULL,
	`statut` text DEFAULT 'en_cours' NOT NULL,
	`tours_max` integer,
	`serveur_id` integer,
	`creee_le` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`jeu_id`) REFERENCES `jeux`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`serveur_id`) REFERENCES `serveurs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_parties`("id", "jeu_nom", "jeu_id", "nom", "statut", "tours_max", "serveur_id", "creee_le") SELECT "id", "jeu_nom", "jeu_id", "nom", "statut", "tours_max", "serveur_id", "creee_le" FROM `parties`;--> statement-breakpoint
DROP TABLE `parties`;--> statement-breakpoint
ALTER TABLE `__new_parties` RENAME TO `parties`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `participations` ADD `equipe_id` integer REFERENCES equipes(id) ON DELETE set null;