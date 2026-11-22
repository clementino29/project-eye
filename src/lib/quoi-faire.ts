// Logique de « Quoi faire ? » : jeux en commun entre les présents et roue pondérée par les envies.
// Partagée entre le serveur et le navigateur, sans dépendance.

export interface JeuCommun {
	id: number;
	nom: string;
	court: string;
	mode: 'coop' | 'versus' | 'solo' | null;
	multi: boolean | null;
	max: number | null;
	genres: string | null;
	gratuit: boolean;
	proprietaires: number[];
}

export interface Filtres {
	multi: boolean;
	places: boolean;
}

/** Un jeu passe les filtres ; une information inconnue (fiche Steam pas encore lue) ne l'exclut pas. */
export function passeFiltres(j: JeuCommun, nbPresents: number, f: Filtres) {
	if (f.multi && j.multi === false) return false;
	if (f.places && j.max !== null && j.max < nbPresents) return false;
	return true;
}

/** Jeux que tous les présents possèdent (deux présents au minimum). */
export function jeuxEnCommun(jeux: JeuCommun[], presents: number[], f: Filtres) {
	if (presents.length < 2) return [];
	return jeux.filter((j) => presents.every((p) => j.proprietaires.includes(p)) && passeFiltres(j, presents.length, f));
}

/** Jeux qu'il ne manque qu'à une seule personne (trois présents au minimum). */
export function jeuxPresque(jeux: JeuCommun[], presents: number[], f: Filtres) {
	if (presents.length < 3) return [];
	const res: (JeuCommun & { manquant: number })[] = [];
	for (const j of jeux) {
		const manquants = presents.filter((p) => !j.proprietaires.includes(p));
		if (manquants.length === 1 && passeFiltres(j, presents.length, f)) res.push({ ...j, manquant: manquants[0] });
	}
	return res;
}

export interface Part {
	id: number;
	debut: number;
	angle: number;
	milieu: number;
}

/** Découpe la roue : la part d'un jeu grandit avec le nombre d'envies des présents. */
export function partsDeLaRoue(ids: number[], envies: (id: number) => number, pondere: boolean): Part[] {
	const poids = ids.map((id) => (pondere ? Math.max(envies(id), 0.5) : 1));
	const total = poids.reduce((a, b) => a + b, 0);
	let cumul = 0;
	return ids.map((id, i) => {
		const debut = (cumul / total) * 360;
		const angle = (poids[i] / total) * 360;
		cumul += poids[i];
		return { id, debut, angle, milieu: debut + angle / 2 };
	});
}

/** Tire une part au hasard selon sa taille ; `alea` est un nombre dans [0, 1). */
export function tirer(parts: Part[], alea: number): Part | undefined {
	if (!parts.length) return undefined;
	const r = alea * 360;
	return parts.find((p) => r >= p.debut && r < p.debut + p.angle) ?? parts[parts.length - 1];
}

/** Rotation finale de la roue pour que l'aiguille (en haut) tombe dans la part tirée. */
export function rotationPour(part: Part, rotationActuelle: number, alea: number, tours = 5) {
	const cible = part.debut + part.angle * (0.2 + alea * 0.6);
	const base = rotationActuelle + (360 - (((rotationActuelle % 360) + 360) % 360));
	return base + 360 * tours + ((360 - cible) % 360);
}

export function libelleJoueurs(max: number | null) {
	if (max === null) return 'Places inconnues';
	return max === 1 ? '1 joueur' : `Jusqu'à ${max}`;
}

export const MODES = { coop: 'Coop', versus: 'Versus', solo: 'Solo' } as const;

/** « Léa, Malik et Inès » */
export function listeNoms(noms: string[]) {
	if (noms.length <= 1) return noms.join('');
	return `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`;
}

/** Images publiques du Steam Store (bannière ou petite capsule). */
export const imageSteam = (appid: number, type: 'header' | 'capsule' = 'header') =>
	`https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/${
		type === 'header' ? 'header.jpg' : 'capsule_231x87.jpg'
	}`;
