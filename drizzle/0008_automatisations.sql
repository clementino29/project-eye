CREATE TABLE `taches_planifiees` (
	`nom` text PRIMARY KEY NOT NULL,
	`dernier_jour` text NOT NULL,
	`derniere_execution` integer NOT NULL,
	`resultat` text
);
--> statement-breakpoint
ALTER TABLE `parties` ADD `prochaine_session` text;--> statement-breakpoint
ALTER TABLE `parties` ADD `heure_session` text;