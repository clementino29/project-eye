// Libellés et couleurs partagés (statuts des jeux et des parties, comme dans le prototype).

export const STATUTS_JEU = {
	en_cours: { l: 'En cours', ton: 'info', c: 'var(--info-fg)' },
	en_pause: { l: 'En pause', ton: 'warning', c: 'var(--warning-fg)' },
	a_faire: { l: 'À faire', ton: 'neutral', c: 'var(--night-600)' },
	termine: { l: 'Terminé', ton: 'success', c: 'var(--success-fg)' }
} as const;
export type StatutJeu = keyof typeof STATUTS_JEU;
export const ORDRE_JEU: StatutJeu[] = ['en_cours', 'en_pause', 'a_faire', 'termine'];

export const STATUTS_PARTIE = {
	en_cours: { l: 'En cours', pl: 'en cours', ton: 'info', c: 'var(--info-fg)' },
	en_pause: { l: 'En pause', pl: 'en pause', ton: 'warning', c: 'var(--warning-fg)' },
	terminee: { l: 'Terminée', pl: 'terminées', ton: 'success', c: 'var(--success-fg)' }
} as const;
export type StatutPartie = keyof typeof STATUTS_PARTIE;
export const ORDRE_PARTIE: StatutPartie[] = ['en_cours', 'en_pause', 'terminee'];

/** « à l'instant », « il y a 5 min », « il y a 2 h », « il y a 3 j » */
export function ilYa(t: number | null | undefined, maintenant = Date.now()) {
	if (!t) return 'jamais';
	const m = Math.round((maintenant - t) / 60000);
	if (m < 1) return "à l'instant";
	if (m < 60) return `il y a ${m} min`;
	const h = Math.round(m / 60);
	if (h < 24) return `il y a ${h} h`;
	return `il y a ${Math.round(h / 24)} j`;
}

export function octets(n: number) {
	if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1).replace('.', ',')} Go`;
	if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} Mo`;
	return `${Math.round(n / 1024)} Ko`;
}
