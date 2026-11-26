// Une base de la v1 (jusqu'à la migration 0003) passe à 0004 sans perdre de données.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { ouvrirBase } from '../db/index.ts';

/** La connexion SQLite sous-jacente, pour écrire en SQL brut. */
const brute = (f: string) => (ouvrirBase(f) as unknown as { $client: Database.Database }).$client;

const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-migration-'));
const ancien = path.join(dossier, 'drizzle-v1');
const fichier = path.join(dossier, 'hub.db');
const avant = process.env.MIGRATIONS_PATH;

afterAll(() => {
	process.env.MIGRATIONS_PATH = avant;
	fs.rmSync(dossier, { recursive: true, force: true });
});

describe('migration 0004 (équipes)', () => {
	it('garde participations, sessions et comptes, et reprend le gagnant', () => {
		// Migrations de la v1 seulement.
		fs.cpSync(path.resolve('drizzle'), ancien, { recursive: true });
		const journal = path.join(ancien, 'meta', '_journal.json');
		const j = JSON.parse(fs.readFileSync(journal, 'utf8'));
		j.entries = j.entries.filter((e: { tag: string }) => e.tag < '0004');
		fs.writeFileSync(journal, JSON.stringify(j));
		process.env.MIGRATIONS_PATH = ancien;
		const v1 = brute(fichier);
		v1.exec(`
			INSERT INTO membres (id, authentik_id, pseudo, nom) VALUES (1, 'a', 'lea', 'Léa'), (2, 'b', 'tom', 'Tom');
			INSERT INTO parties (id, jeu_nom, nom, statut, gagnant_id) VALUES (1, 'Civ VI', 'Pangée', 'terminee', 2), (2, 'Halo', 'Coop', 'en_cours', NULL);
			INSERT INTO participations (partie_id, membre_id) VALUES (1, 1), (1, 2), (2, 1);
			INSERT INTO sessions_partie (partie_id, date, tour_atteint) VALUES (1, '2026-11-20', 40);
			INSERT INTO auth_sessions (token, membre_id, expire_le, cree_le, maj_le) VALUES ('t', 1, 9999999999999, 1, 1);
		`);
		v1.close();

		process.env.MIGRATIONS_PATH = path.resolve('drizzle');
		const v2 = brute(fichier);
		const compte = (table: string) => (v2.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
		expect(compte('parties')).toBe(2);
		expect(compte('participations')).toBe(3);
		expect(compte('sessions_partie')).toBe(1);
		expect(compte('auth_sessions')).toBe(1);
		expect(v2.prepare('SELECT partie_id, membre_id FROM gagnants_partie').all()).toEqual([{ partie_id: 1, membre_id: 2 }]);
		expect(v2.pragma('foreign_key_check')).toEqual([]);
		expect(v2.pragma('foreign_keys', { simple: true })).toBe(1);
		// Copie de sécurité faite avant la migration.
		expect(fs.existsSync(`${fichier}.avant-migration-4.bak`)).toBe(true);
		v2.close();
	});
});
