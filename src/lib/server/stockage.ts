// Stockage des fichiers envoyés sur le hub (volume Docker, à côté de la base).
// Les fichiers sont rangés sous un nom aléatoire : le nom d'origine reste dans la base.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { config } from './config.ts';

export class ErreurTaille extends Error {}

const NOM_STOCKE = /^[0-9a-f-]{36}(\.(png|jpg|webp|gif))?$/;

const dossier = (sous = '') => {
	const d = path.join(path.resolve(config.fichiers.dossier), sous);
	fs.mkdirSync(d, { recursive: true });
	return d;
};

/** Chemin d'un fichier stocké (undefined si le nom n'est pas l'un des nôtres). */
export function cheminStocke(nom: string, sous: '' | 'images' = '') {
	if (!NOM_STOCKE.test(nom)) return undefined;
	return path.join(dossier(sous), nom);
}

/**
 * Écrit un flux (le corps d'une requête) sur le disque, sans le garder en mémoire.
 * Au-delà de `max` octets, tout est effacé et ErreurTaille est levée.
 */
export async function enregistrerFlux(flux: ReadableStream<Uint8Array>, max: number) {
	const nom = crypto.randomUUID();
	const temporaire = path.join(dossier('.envois'), nom);
	let taille = 0;
	const compteur = async function* (source: AsyncIterable<Uint8Array>) {
		for await (const morceau of source) {
			taille += morceau.byteLength;
			if (taille > max) throw new ErreurTaille('Fichier trop gros');
			yield morceau;
		}
	};
	try {
		await pipeline(Readable.fromWeb(flux as never), compteur, fs.createWriteStream(temporaire));
		fs.renameSync(temporaire, path.join(dossier(), nom));
	} catch (e) {
		fs.rmSync(temporaire, { force: true });
		throw e;
	}
	return { nom, taille };
}

export function supprimerStocke(nom: string | null | undefined, sous: '' | 'images' = '') {
	const chemin = nom ? cheminStocke(nom, sous) : undefined;
	if (chemin) fs.rmSync(chemin, { force: true });
}

/** Lit un fichier stocké en flux, pour le téléchargement. */
export function lireStocke(nom: string, sous: '' | 'images' = '') {
	const chemin = cheminStocke(nom, sous);
	if (!chemin || !fs.existsSync(chemin)) return undefined;
	const taille = fs.statSync(chemin).size;
	return { taille, flux: () => Readable.toWeb(fs.createReadStream(chemin)) as ReadableStream<Uint8Array> };
}

/** Images des projets (bannière, logo, vignette) : PNG, JPEG, WebP ou GIF, 10 Mo au plus. */
export const IMAGE_MAX = 10 * 1024 * 1024;
const SIGNATURES: [string, string, (o: Uint8Array) => boolean][] = [
	['png', 'image/png', (o) => o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47],
	['jpg', 'image/jpeg', (o) => o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff],
	['gif', 'image/gif', (o) => o[0] === 0x47 && o[1] === 0x49 && o[2] === 0x46],
	['webp', 'image/webp', (o) => String.fromCharCode(...o.slice(0, 4)) === 'RIFF' && String.fromCharCode(...o.slice(8, 12)) === 'WEBP']
];
export const typeImage = (nom: string) => SIGNATURES.find(([ext]) => nom.endsWith(`.${ext}`))?.[1];

/** Enregistre une image envoyée par formulaire ; le type est lu dans les premiers octets, pas dans le nom. */
export async function enregistrerImage(f: File) {
	if (f.size > IMAGE_MAX) throw new ErreurTaille('Image trop grosse (10 Mo au plus).');
	const octets = new Uint8Array(await f.arrayBuffer());
	const sig = SIGNATURES.find(([, , test]) => test(octets));
	if (!sig) throw new TypeError('Image non reconnue : PNG, JPEG, WebP ou GIF.');
	const nom = `${crypto.randomUUID()}.${sig[0]}`;
	fs.writeFileSync(path.join(dossier('images'), nom), octets);
	return nom;
}
