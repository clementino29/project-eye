// Watch list commune : votes, soirées et dates (partagés entre serveur et pages).

/** Chaque membre a 3 votes à répartir sur les titres pas encore vus ensemble. */
export const VOTES_MAX = 3;

/** Heures proposées pour une soirée (HH:MM). */
export const HEURES = ['18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00', '22:30', '23:00'];

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const MOIS_LONGS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

const deux = (n: number) => String(n).padStart(2, '0');

/** Jour au format AAAA-MM-JJ, dans le fuseau local (Europe/Paris sur le serveur). */
export const cleJour = (d: Date) => `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
export const dateDe = (cle: string) => {
	const [a, m, j] = cle.split('-').map(Number);
	return new Date(a, m - 1, j);
};
export const estJour = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && cleJour(dateDe(v)) === v;
export const estHeure = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** « vendredi 28 nov. » */
export const jourLong = (cle: string) => {
	const d = dateDe(cle);
	return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
};
/** « ven. 28 nov. » */
export const jourCourt = (cle: string) => {
	const d = dateDe(cle);
	return `${JOURS_COURTS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
};
/** « 21 h », « 20 h 30 » */
export const heureLisible = (h: string) => {
	const [hh, mm] = h.split(':');
	return mm === '00' ? `${Number(hh)} h` : `${Number(hh)} h ${mm}`;
};
export const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Mois au format AAAA-MM. */
export const cleMois = (d: Date) => `${d.getFullYear()}-${deux(d.getMonth() + 1)}`;
export const estMois = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** Cases du calendrier d'un mois, du lundi au dimanche (semaines complètes). */
export function joursDuMois(mois: string) {
	const [a, m] = mois.split('-').map(Number);
	const premier = new Date(a, m - 1, 1);
	const decalage = (premier.getDay() + 6) % 7;
	const nbJours = new Date(a, m, 0).getDate();
	const semaines = Math.ceil((decalage + nbJours) / 7);
	return Array.from({ length: semaines * 7 }, (_, i) => {
		const d = new Date(a, m - 1, 1 - decalage + i);
		return { cle: cleJour(d), numero: d.getDate(), dansLeMois: d.getMonth() === m - 1 };
	});
}
export function moisVoisin(mois: string, delta: number) {
	const [a, m] = mois.split('-').map(Number);
	return cleMois(new Date(a, m - 1 + delta, 1));
}
export function libelleMois(mois: string) {
	const [a, m] = mois.split('-').map(Number);
	return `${MOIS_LONGS[m - 1]} ${a}`;
}

/** « Léa », « Léa et Tom », « Léa, Tom et Inès » */
export const enumerer = (noms: string[]) => (noms.length > 1 ? `${noms.slice(0, -1).join(', ')} et ${noms.at(-1)}` : (noms[0] ?? ''));
export const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) => `${n} ${n > 1 ? motPluriel : mot}`;
