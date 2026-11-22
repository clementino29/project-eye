// Chiffrement des clés API Pelican des membres (AES-256-GCM).
// La clé de chiffrement (HUB_ENCRYPTION_KEY) reste hors de la base.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from './config.ts';

const VERSION = 'v1';

function cle(brute = config.cleChiffrement): Buffer {
	if (!brute) {
		throw new Error(
			'HUB_ENCRYPTION_KEY manque : génère-la avec « openssl rand -base64 32 » et ajoute-la à l’environnement.'
		);
	}
	const buf = Buffer.from(brute, 'base64');
	if (buf.length !== 32) throw new Error('HUB_ENCRYPTION_KEY doit faire 32 octets encodés en base64.');
	return buf;
}

export function chiffrer(texte: string, cleBrute?: string): string {
	const iv = randomBytes(12);
	const c = createCipheriv('aes-256-gcm', cle(cleBrute), iv);
	const donnees = Buffer.concat([c.update(texte, 'utf8'), c.final()]);
	const tag = c.getAuthTag();
	return [VERSION, iv.toString('base64'), tag.toString('base64'), donnees.toString('base64')].join(':');
}

export function dechiffrer(paquet: string, cleBrute?: string): string {
	const [version, iv, tag, donnees] = paquet.split(':');
	if (version !== VERSION || !iv || !tag || !donnees) throw new Error('Format de clé chiffrée inconnu.');
	const d = createDecipheriv('aes-256-gcm', cle(cleBrute), Buffer.from(iv, 'base64'));
	d.setAuthTag(Buffer.from(tag, 'base64'));
	return Buffer.concat([d.update(Buffer.from(donnees, 'base64')), d.final()]).toString('utf8');
}

export function hacher(texte: string): string {
	return createHash('sha256').update(texte).digest('hex');
}

export function jetonAleatoire(octets = 32): string {
	return randomBytes(octets).toString('base64url');
}
