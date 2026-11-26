// Charge de la machine (le VPS) : processeur, mémoire et disque, lus depuis le conteneur du hub.
// Dans Docker, /proc/stat, /proc/meminfo et /proc/loadavg décrivent la machine entière,
// et le disque est celui qui porte le volume des données.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface ChargeMachine {
	/** Processeur occupé, en %, sur toute la machine. */
	cpuPourcent: number | null;
	coeurs: number;
	/** Charge moyenne sur 1 minute. */
	charge1: number;
	memoire: { totale: number; utilisee: number };
	disque: { total: number; utilise: number } | null;
}

type Echantillon = { actif: number; total: number; t: number };
let precedent: Echantillon | null = null;

/** Lit /proc/stat (ligne « cpu ») : temps actif et total depuis le démarrage. */
export function lireStat(texte: string): Echantillon | null {
	const l = texte.split('\n').find((x) => x.startsWith('cpu '));
	if (!l) return null;
	const v = l.trim().split(/\s+/).slice(1).map(Number);
	if (v.length < 4 || v.some((n) => !Number.isFinite(n))) return null;
	const inactif = v[3] + (v[4] ?? 0);
	const total = v.slice(0, 8).reduce((a, b) => a + b, 0);
	return { actif: total - inactif, total, t: Date.now() };
}

/** Lit /proc/meminfo : mémoire totale et utilisée (totale moins disponible), en octets. */
export function lireMeminfo(texte: string) {
	const ko = (cle: string) => Number(texte.match(new RegExp(`^${cle}:\\s+(\\d+)`, 'm'))?.[1]);
	const totale = ko('MemTotal') * 1024;
	const dispo = ko('MemAvailable') * 1024;
	return Number.isFinite(totale) && Number.isFinite(dispo) ? { totale, utilisee: totale - dispo } : null;
}

export const pourcentEntre = (a: Echantillon, b: Echantillon) => {
	const total = b.total - a.total;
	return total > 0 ? Math.min(100, Math.max(0, ((b.actif - a.actif) / total) * 100)) : null;
};

const lire = (f: string) => {
	try {
		return fs.readFileSync(f, 'utf8');
	} catch {
		return null;
	}
};

const echantillon = () => {
	const stat = lire('/proc/stat');
	return stat ? lireStat(stat) : null;
};

async function cpu(): Promise<number | null> {
	const maintenant = echantillon();
	if (!maintenant) return null;
	// Premier appel, ou échantillon trop ancien : on mesure sur un court instant.
	if (!precedent || maintenant.t - precedent.t > 5 * 60_000) {
		await new Promise((r) => setTimeout(r, 250));
		precedent = echantillon();
		return precedent ? pourcentEntre(maintenant, precedent) : null;
	}
	const p = pourcentEntre(precedent, maintenant);
	precedent = maintenant;
	return p;
}

/** Disque qui porte les données du hub (le volume Docker, donc le disque du VPS). */
function disque(dossier: string) {
	try {
		const s = fs.statfsSync(dossier);
		const total = s.blocks * s.bsize;
		return { total, utilise: total - s.bavail * s.bsize };
	} catch {
		return null;
	}
}

let cache: { valeur: ChargeMachine; expire: number } | null = null;

export async function chargeMachine(dossierDonnees = path.dirname(path.resolve(process.env.DATABASE_PATH ?? './data/hub.db'))): Promise<ChargeMachine> {
	if (cache && cache.expire > Date.now()) return cache.valeur;
	const mem = lireMeminfo(lire('/proc/meminfo') ?? '') ?? { totale: os.totalmem(), utilisee: os.totalmem() - os.freemem() };
	const valeur: ChargeMachine = {
		cpuPourcent: await cpu(),
		coeurs: os.availableParallelism?.() ?? os.cpus().length,
		charge1: os.loadavg()[0],
		memoire: mem,
		disque: disque(dossierDonnees)
	};
	cache = { valeur, expire: Date.now() + 5000 };
	return valeur;
}
