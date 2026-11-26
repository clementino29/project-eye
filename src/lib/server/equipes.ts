// Parties en équipes : lecture et contrôle de la répartition envoyée par le formulaire.
import { MAX_EQUIPES, ORDRE_COULEURS, type EquipePartie } from '../parties.ts';

/**
 * Lit les équipes envoyées en JSON : [{ nom, couleur, gagnante, membres }].
 * Renvoie une erreur lisible si la répartition ne tient pas.
 */
export function lireEquipes(brut: string, joueurs: number[]): { equipes: EquipePartie[] } | { erreur: string } {
	if (!brut) return { equipes: [] };
	let donnees: unknown;
	try {
		donnees = JSON.parse(brut);
	} catch {
		return { erreur: 'Équipes illisibles.' };
	}
	if (!Array.isArray(donnees)) return { erreur: 'Équipes illisibles.' };
	if (!donnees.length) return { equipes: [] };
	if (donnees.length < 2) return { erreur: 'Il faut au moins deux équipes.' };
	if (donnees.length > MAX_EQUIPES) return { erreur: `${MAX_EQUIPES} équipes au plus.` };
	const vus = new Set<number>();
	const equipes: EquipePartie[] = [];
	for (const [i, e] of donnees.entries()) {
		const o = (e ?? {}) as Record<string, unknown>;
		const nom = String(o.nom ?? '').trim().slice(0, 40) || `Équipe ${i + 1}`;
		const couleur = ORDRE_COULEURS.includes(o.couleur as never) ? (o.couleur as EquipePartie['couleur']) : ORDRE_COULEURS[i];
		const membres = [...new Set((Array.isArray(o.membres) ? o.membres : []).map(Number))].filter((id) => joueurs.includes(id));
		for (const id of membres) {
			if (vus.has(id)) return { erreur: 'Un joueur ne peut être que dans une équipe.' };
			vus.add(id);
		}
		equipes.push({ nom, couleur, gagnante: o.gagnante === true, membres });
	}
	if (joueurs.some((id) => !vus.has(id))) return { erreur: 'Place chaque joueur dans une équipe.' };
	return { equipes };
}
