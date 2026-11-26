// Pastilles vives avec pictogramme : couleur + icône + texte (la couleur seule ne suffit pas).

export interface Pastille {
	l: string;
	c: string;
	encre: string;
	icone: string;
}

const BLEU = { c: '#3d9bff', encre: '#04121f' };
const ORANGE = { c: '#ffb21e', encre: '#2a1a00' };
const VERT = { c: '#2fe39a', encre: '#04241a' };
const ROUGE = { c: '#ff5468', encre: '#2a0509' };
const GRIS = { c: 'var(--night-600)', encre: '#f5f0f2' };

export const PASTILLES_JEU = {
	en_cours: { l: 'En cours', ...BLEU, icone: 'play' },
	en_pause: { l: 'En pause', ...ORANGE, icone: 'pause' },
	a_faire: { l: 'À faire', ...GRIS, icone: 'circle-dashed' },
	termine: { l: 'Terminé', ...VERT, icone: 'check' }
} satisfies Record<string, Pastille>;

export const PASTILLES_PARTIE = {
	en_cours: { l: 'En cours', ...BLEU, icone: 'play' },
	en_pause: { l: 'En pause', ...ORANGE, icone: 'pause' },
	terminee: { l: 'Terminée', ...VERT, icone: 'check' }
} satisfies Record<string, Pastille>;

export const PASTILLES_SERVEUR = {
	running: { l: 'En ligne', ...VERT, icone: 'play' },
	offline: { l: 'Arrêté', ...GRIS, icone: 'square' },
	starting: { l: 'Démarrage', ...BLEU, icone: 'loader-circle' },
	stopping: { l: 'Arrêt en cours', ...ORANGE, icone: 'pause' },
	installation: { l: 'Installation', ...BLEU, icone: 'loader-circle' },
	suspendu: { l: 'Suspendu', ...ROUGE, icone: 'ban' },
	inconnu: { l: 'Inconnu', ...GRIS, icone: 'circle-help' }
} satisfies Record<string, Pastille>;
