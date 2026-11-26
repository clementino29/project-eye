// Libellés et couleurs partagés (statuts des jeux et des parties, couleurs vives des pastilles du design).

export const STATUTS_JEU = {
	en_cours: { l: 'En cours', ton: 'info', c: '#3d9bff' },
	en_pause: { l: 'En pause', ton: 'warning', c: '#ffb21e' },
	a_faire: { l: 'À faire', ton: 'neutral', c: 'var(--night-600)' },
	termine: { l: 'Terminé', ton: 'success', c: '#2fe39a' }
} as const;
export type StatutJeu = keyof typeof STATUTS_JEU;
export const ORDRE_JEU: StatutJeu[] = ['en_cours', 'en_pause', 'a_faire', 'termine'];

export const STATUTS_PARTIE = {
	en_cours: { l: 'En cours', pl: 'en cours', ton: 'info', c: '#3d9bff' },
	en_pause: { l: 'En pause', pl: 'en pause', ton: 'warning', c: '#ffb21e' },
	terminee: { l: 'Terminée', pl: 'terminées', ton: 'success', c: '#2fe39a' }
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

/** État global des services (bannière de la page Status, pastille du menu). */
export type EtatGlobal = 'ok' | 'degrade' | 'panne';

/** Au-delà de ce temps de réponse (ms), un service en ligne est affiché « Lent ». */
export const PING_LENT = 1000;

/** Affichage d'un service d'Uptime Kuma : pastille pleine, couleur des battements, effet sur l'état global. */
export const VUES_SERVICE = {
	en_ligne: { l: 'En ligne', c: '#2fe39a', encre: '#04241a', icone: 'check', global: 'ok' },
	lent: { l: 'Lent', c: '#ffb21e', encre: '#2a1a00', icone: 'snail', global: 'degrade' },
	en_attente: { l: 'En attente', c: '#ffb21e', encre: '#2a1a00', icone: 'clock', global: 'degrade' },
	maintenance: { l: 'Maintenance', c: '#3d9bff', encre: '#04121f', icone: 'wrench', global: 'degrade' },
	hors_ligne: { l: 'Hors ligne', c: '#ff5468', encre: '#2a0509', icone: 'x', global: 'panne' },
	inconnu: { l: 'Inconnu', c: 'var(--night-600)', encre: '#f5f0f2', icone: 'circle-help', global: 'ok' }
} as const satisfies Record<string, { l: string; c: string; encre: string; icone: string; global: EtatGlobal }>;
export type VueService = keyof typeof VUES_SERVICE;

/** `etat` : état lu dans Uptime Kuma (en_ligne, en_panne, en_attente, maintenance, inconnu). */
export function vueService(etat: string, ping: number | null = null): VueService {
	if (etat === 'en_panne') return 'hors_ligne';
	if (etat === 'en_ligne') return ping !== null && ping > PING_LENT ? 'lent' : 'en_ligne';
	if (etat === 'en_attente' || etat === 'maintenance') return etat;
	return 'inconnu';
}
