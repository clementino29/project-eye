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
	const dossier = dossierMigrations();
	if (fichier !== ':memory:') copierAvantMigration(sqlite, fichier, dossier);
	// Les migrations tournent dans une transaction, où PRAGMA foreign_keys n'a pas d'effet :
	// on coupe les clés étrangères avant, sinon recréer une table (SQLite) effacerait en
	// cascade les lignes qui la référencent. On vérifie l'intégrité juste après.
	sqlite.pragma('foreign_keys = OFF');
	try {
		migrate(db, { migrationsFolder: dossier });
	} finally {
		sqlite.pragma('foreign_keys = ON');
	}
	const erreurs = sqlite.pragma('foreign_key_check') as unknown[];
	if (erreurs.length) console.warn(`[base] ${erreurs.length} lien(s) cassé(s) après migration`, erreurs.slice(0, 5));
	return db;
}

/**
 * Si des migrations attendent, copie d'abord la base à côté d'elle
 * (hub.db.avant-migration-<n>.bak), pour pouvoir revenir en arrière.
 */
function copierAvantMigration(sqlite: Database.Database, fichier: string, dossier: string) {
	let attendues = 0;
	try {
		const journal = JSON.parse(fs.readFileSync(path.join(dossier, 'meta', '_journal.json'), 'utf8')) as { entries: unknown[] };
		attendues = journal.entries.length;
	} catch {
		return;
	}
	const table = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'").get();
	if (!table) return; // base neuve : rien à protéger
	const { n } = sqlite.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get() as { n: number };
	if (n >= attendues) return;
	const copie = `${path.resolve(fichier)}.avant-migration-${n}.bak`;
	if (fs.existsSync(copie)) return;
	sqlite.prepare('VACUUM INTO ?').run(copie);
	console.info(`[base] copie de sécurité avant migration : ${copie}`);
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
