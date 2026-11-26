import { lecteur } from '#lib/server/garde.ts';
import { donneesCommune } from '#lib/server/commune.ts';
import { cleMois, dateDe, estMois } from '#lib/commune.ts';

// Calendrier des soirées : lisible sans connexion. Les actions passent par /films.
export const load = ({ url, locals }) => {
	const commun = donneesCommune(lecteur(locals));
	const demande = url.searchParams.get('mois') ?? '';
	return { ...commun, mois: estMois(demande) ? demande : cleMois(dateDe(commun.aujourdhui)) };
};
