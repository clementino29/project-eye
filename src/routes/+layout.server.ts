import { config } from '#lib/server/config.ts';
import { etatGlobalRapide } from '#lib/server/kuma.ts';
import { urlPhoto } from '#lib/server/membres.ts';

export const load = async ({ locals }) => {
	const m = locals.membre;
	return {
		moi: m ? { id: m.id, nom: m.nom, pseudo: m.pseudo, photo: urlPhoto(m), role: m.role } : null,
		// Films & séries : la Watch list commune pour tous, Ma watchlist pour les membres.
		// Fichiers & applis : réservé aux membres (fermé aux visiteurs).
		rubriques: { films: true, filmsCommune: true, fichiers: !!m, planningUrl: config.planningUrl },
		etatStatus: await etatGlobalRapide()
	};
};
