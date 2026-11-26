ALTER TABLE `serveurs` ADD `arret_auto_minutes` integer;--> statement-breakpoint
ALTER TABLE `serveurs` ADD `arret_auto_par_id` integer REFERENCES membres(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `serveurs` ADD `vide_depuis` integer;