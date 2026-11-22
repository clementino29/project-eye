import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.ts';
import { config } from '../config.ts';

export type Db = BetterSQLite3Database<typeof schema>;

/** Ouvre une base SQLite et applique les migrations du dossier drizzle/. */
export function ouvrirBase(fichier: string): Db {
	if (fichier !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(fichier)), { recursive: true });
	const sqlite = new Database(fichier);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	sqlite.pragma('busy_timeout = 5000');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: dossierMigrations() });
	return db;
}

function dossierMigrations() {
	// En production le dossier est copié à côté du build ; en dev, à la racine.
	const candidats = [process.env.MIGRATIONS_PATH, path.resolve('drizzle')].filter(Boolean) as string[];
	return candidats.find((d) => fs.existsSync(d)) ?? 'drizzle';
}

let instance: Db | undefined;

export function db(): Db {
	instance ??= ouvrirBase(config.cheminBase);
	return instance;
}

/** Pour les tests : remplace la base partagée. */
export function remplacerBase(nouvelle: Db) {
	instance = nouvelle;
}

export { schema };
