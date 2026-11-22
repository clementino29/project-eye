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
