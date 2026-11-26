// Fichiers & applis : types, plateformes et petits utilitaires (partagés entre serveur et pages).

export type TypeFichier = 'appli' | 'mod' | 'config';
export type Plateforme = 'win' | 'mac' | 'linux' | 'android';
export type Affichage = 'logo_titre' | 'logo' | 'titre';

export const TYPES_FICHIER: Record<TypeFichier, { l: string; icone: string }> = {
	appli: { l: 'Appli', icone: 'app-window' },
	mod: { l: 'Mod', icone: 'puzzle' },
	config: { l: 'Config', icone: 'file-cog' }
};
export const PLATEFORMES: Record<Plateforme, string> = { win: 'Windows', mac: 'Mac', linux: 'Linux', android: 'Android' };
export const ORDRE_PLATEFORMES = Object.keys(PLATEFORMES) as Plateforme[];
export const AFFICHAGES: [Affichage, string][] = [
	['logo', 'Logo'],
	['titre', 'Titre'],
	['logo_titre', 'Logo + titre']
];

/** Un fichier est « Nouveau » pendant une semaine. */
export const NOUVEAU_PENDANT = 7 * 24 * 3600_000;

/** 412 Mo, 2,1 Go… */
export function tailleLisible(octets: number | null | undefined) {
	if (octets === null || octets === undefined) return '';
	if (octets < 1024) return `${octets} o`;
	if (octets < 1024 ** 2) return `${Math.round(octets / 1024)} Ko`;
	if (octets < 1024 ** 3) return `${(octets / 1024 ** 2).toFixed(1).replace('.', ',')} Mo`;
	return `${(octets / 1024 ** 3).toFixed(1).replace('.', ',')} Go`;
}

export const plateformesLibelle = (p: Plateforme[]) =>
	p.length === ORDRE_PLATEFORMES.length ? 'Toutes plateformes' : p.length ? ORDRE_PLATEFORMES.filter((x) => p.includes(x)).map((x) => PLATEFORMES[x]).join(', ') : 'Plateforme non précisée';

/** Devine le type et les plateformes d'après le nom du fichier choisi (comme le prototype). */
export function devinerDepuisNom(nom: string): { type?: TypeFichier; plateformes?: Plateforme[] } {
	const ext = (nom.split('.').pop() ?? '').toLowerCase();
	const r: { type?: TypeFichier; plateformes?: Plateforme[] } = {};
	if (['exe', 'dmg', 'apk', 'msi', 'appimage', 'deb', 'pkg', 'rpm'].includes(ext)) r.type = 'appli';
	else if (['zip', 'jar', '7z', 'rar', 'pak'].includes(ext)) r.type = 'mod';
	else if (['cfg', 'txt', 'ini', 'json', 'yml', 'yaml', 'toml', 'conf', 'xml'].includes(ext)) r.type = 'config';
	if (ext === 'exe' || ext === 'msi') r.plateformes = ['win'];
	if (ext === 'dmg' || ext === 'pkg') r.plateformes = ['mac'];
	if (ext === 'apk') r.plateformes = ['android'];
	if (['appimage', 'deb', 'rpm'].includes(ext)) r.plateformes = ['linux'];
	return r;
}

/** « Project Zomboid » → « project-zomboid ». */
export const slugifier = (nom: string) =>
	nom
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60) || 'projet';

/** « il y a 3 j », « hier »… */
export function depuis(ms: number, maintenant = Date.now()) {
	const j = Math.floor((maintenant - ms) / 86400_000);
	if (j <= 0) return 'aujourd’hui';
	if (j === 1) return 'hier';
	if (j < 7) return `il y a ${j} j`;
	if (j < 30) return `il y a ${Math.floor(j / 7)} sem.`;
	if (j < 365) return `il y a ${Math.floor(j / 30)} mois`;
	return `il y a ${Math.floor(j / 365)} an${j >= 730 ? 's' : ''}`;
}
