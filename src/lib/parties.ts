// Calculs d'affichage des parties (avancement en tours, journal des sessions).

export interface SessionPartie {
	id: number;
	date: string;
	tourAtteint: number;
	note: string | null;
}

export const trierSessions = (s: SessionPartie[]) =>
	[...s].sort((a, b) => a.date.localeCompare(b.date) || a.tourAtteint - b.tourAtteint);

/** L'avancement d'une partie est le plus haut tour atteint. */
export const tourActuel = (s: SessionPartie[]) => s.reduce((m, x) => Math.max(m, x.tourAtteint), 0);

export const derniereSession = (s: SessionPartie[]) => s.reduce((m, x) => (x.date > m ? x.date : m), '');

/** Journal du plus récent au plus ancien, avec les tours gagnés depuis la session précédente. */
export function journal(s: SessionPartie[]) {
	const triees = trierSessions(s);
	return triees
		.map((se, i) => {
			const depuis = i ? triees[i - 1].tourAtteint : 0;
			return {
				...se,
				plage: i ? `Tour ${depuis} → ${se.tourAtteint}` : `Tour 1 → ${se.tourAtteint}`,
				gain: `+${se.tourAtteint - depuis} tours`
			};
		})
		.reverse();
}

export function pourcentage(tour: number, max: number | null) {
	return max ? `${Math.min(100, (tour / max) * 100)}%` : '0%';
}

const enDate = (d: string) => new Date(`${d}T12:00:00`);
export const dateCourte = (d: string) => enDate(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
export const dateLongue = (d: string) =>
	enDate(d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

/** Couleurs des équipes (pastilles vives du design). */
export const COULEURS_EQUIPE = {
	rouge: { l: 'Rouge', c: '#ff5468', encre: '#2a0509' },
	bleu: { l: 'Bleue', c: '#3d9bff', encre: '#04121f' },
	vert: { l: 'Verte', c: '#2fe39a', encre: '#04241a' },
	jaune: { l: 'Jaune', c: '#ffb21e', encre: '#2a1a00' },
	violet: { l: 'Violette', c: '#b07cff', encre: '#16052e' },
	rose: { l: 'Rose', c: '#ff7ac6', encre: '#2e0520' },
	cyan: { l: 'Cyan', c: '#36d6e7', encre: '#032227' },
	orange: { l: 'Orange', c: '#ff8a3d', encre: '#2a1000' }
} as const;
export type CouleurEquipe = keyof typeof COULEURS_EQUIPE;
export const ORDRE_COULEURS = Object.keys(COULEURS_EQUIPE) as CouleurEquipe[];
export const MAX_EQUIPES = ORDRE_COULEURS.length;

export interface EquipePartie {
	id?: number;
	nom: string;
	couleur: CouleurEquipe;
	gagnante: boolean;
	membres: number[];
}

/** « Rouge », « Rouge et Bleue », « Rouge, Bleue et Verte ». */
export function liste(noms: string[]) {
	if (noms.length <= 1) return noms[0] ?? '';
	return `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`;
}

/**
 * Phrase de victoire d'une partie terminée, ou null s'il n'y a pas de vainqueur.
 * En équipes : « Victoire de l'équipe Rouge » ; sinon « Victoire de Léa et Tom ».
 */
export function phraseVictoire(p: { equipes: EquipePartie[]; gagnants: number[] }, prenom: (id: number) => string) {
	if (p.equipes.length) {
		const g = p.equipes.filter((e) => e.gagnante);
		if (!g.length) return null;
		return g.length > 1 ? `Égalité : ${liste(g.map((e) => e.nom))}` : `Victoire de ${g[0].nom}`;
	}
	if (!p.gagnants.length) return null;
	return `${p.gagnants.length > 1 ? 'Égalité : ' : 'Victoire de '}${liste(p.gagnants.map(prenom))}`;
}
