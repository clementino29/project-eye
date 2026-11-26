// Jaquettes dessinées : un dégradé et une icône tirés du nom, quand il n'y a pas d'image.
// Teintes et icônes fixées pour les jeux, séries et serveurs connus de la bande.

export const hueOf = (nom: string) => {
	let h = 0;
	for (const ch of (nom ?? '').toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 9973;
	return h;
};

const ICONES = ['gamepad-2', 'swords', 'rocket', 'ghost', 'crosshair', 'castle', 'skull', 'flame', 'map', 'trophy', 'sword', 'shield'];

/** Jeux et séries connus (nom en minuscules, préfixe accepté) : [teinte, icône]. */
const JEUX_CONNUS: [string, number, string][] = [
	['halo', 145, 'crosshair'],
	['borderlands', 38, 'skull'],
	['monster hunter', 20, 'swords'],
	['stardew valley', 105, 'sprout'],
	['civilization', 45, 'landmark'],
	['endless space', 235, 'orbit'],
	['deep rock galactic', 32, 'pickaxe'],
	['lethal company', 355, 'skull'],
	['among us', 340, 'rocket'],
	['golf with your friends', 130, 'flag'],
	['brawlhalla', 265, 'swords'],
	['phasmophobia', 185, 'ghost'],
	['terraria', 95, 'tree-pine'],
	['valheim', 210, 'axe'],
	['gang beasts', 18, 'party-popper'],
	['it takes two', 318, 'heart-handshake'],
	['portal', 200, 'orbit'],
	['hades', 5, 'flame'],
	['overcooked', 42, 'chef-hat'],
	['stumble guys', 285, 'trophy']
];

/** Serveurs du Panel connus, par identifiant court Pelican : [teinte, icône]. */
const SERVEURS_CONNUS: Record<string, [number, string]> = {
	'6c10bf3a': [28, 'factory'],
	'2c2904a7': [350, 'circle-dot'],
	'05135d01': [120, 'pickaxe'],
	'0d845c63': [195, 'paw-print'],
	ee4ae045: [75, 'biohazard']
};

export interface Art {
	hue: number;
	icon: string;
	/** Dégradé 135° de la jaquette. */
	grad: string;
	/** Couleur unie, sous le dégradé (fond flou). */
	solid: string;
}

export function artOf(nom: string, connu?: [number, string]): Art {
	const h = hueOf(nom);
	const hue = connu ? connu[0] : h % 360;
	const icon = connu ? connu[1] : ICONES[h % ICONES.length];
	return {
		hue,
		icon,
		grad: `linear-gradient(135deg, hsl(${hue},70%,40%) 0%, hsl(${(hue + 35) % 360},65%,20%) 100%)`,
		solid: `hsl(${hue},60%,30%)`
	};
}

/** Jaquette d'un jeu ou d'une série, avec les teintes connues. */
export function artJeu(nom: string): Art {
	const n = (nom ?? '').trim().toLowerCase();
	const connu = JEUX_CONNUS.find(([cle]) => n.startsWith(cle));
	return artOf(nom, connu ? [connu[1], connu[2]] : undefined);
}

/** Jaquette d'un serveur du Panel (par identifiant court, sinon par nom). */
export function artServeur(identifiant: string, nom: string): Art {
	return artOf(nom, SERVEURS_CONNUS[identifiant]);
}

/** Affiche de film ou de série : dégradé 160°. */
export function posterOf(titre: string) {
	const h = hueOf(titre) % 360;
	return `linear-gradient(160deg, hsl(${h},62%,38%) 0%, hsl(${(h + 35) % 360},60%,18%) 100%)`;
}

/** Fond d'une jaquette : l'image par-dessus le dégradé (une image bloquée laisse le dégradé). */
export function fondImage(art: Art, image?: string | null) {
	return image ? `url(${JSON.stringify(image)}), ${art.grad}` : art.grad;
}

/** Lueur neutre du haut de page (Accueil, Fichiers, pages sans visuel). */
export const LUEUR_NEUTRE =
	'radial-gradient(65% 85% at 12% 0%, rgba(53,106,140,.75) 0%, rgba(35,76,103,.38) 45%, rgba(11,21,28,0) 82%), radial-gradient(45% 60% at 88% 16%, rgba(244,178,122,.30) 0%, rgba(244,178,122,.10) 45%, rgba(11,21,28,0) 75%), radial-gradient(80% 50% at 55% 0%, rgba(147,188,214,.14) 0%, rgba(11,21,28,0) 72%)';
