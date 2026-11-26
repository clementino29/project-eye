// Mode lecture seule : ce qu'un visiteur non connecté peut ouvrir.
// Les pages ouvertes masquent aussi leurs boutons, et chaque action exige un membre côté serveur.

/** Pages ouvertes aux visiteurs non connectés, en lecture seule (GET seulement). */
const LECTURE_SEULE = [
	/^\/$/,
	/^\/sante$/,
	/^\/status$/,
	/^\/jeux(\/(liste|parties|quoi-faire))?\/?$/,
	// Watch list commune, son calendrier et ses fiches (Ma watchlist et Les potes restent fermés).
	/^\/films(\/(calendrier|commune\/\d+))?\/?$/,
	/^\/membres\/\d+\/photo$/
];
/** La connexion est la seule page où un visiteur peut aussi envoyer un formulaire. */
const CONNEXION = /^\/connexion(\/|$)/;

/** Un visiteur peut-il ouvrir cette adresse ? (Le Panel, le Compte, etc. restent fermés.) */
export function ouvertAuxVisiteurs(methode: string, chemin: string) {
	if (CONNEXION.test(chemin)) return true;
	const lecture = methode === 'GET' || methode === 'HEAD';
	return lecture && LECTURE_SEULE.some((r) => r.test(chemin));
}
