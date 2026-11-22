import { urlPhoto } from '#lib/server/membres.ts';

export const load = ({ locals }) => {
	const m = locals.membre;
	return {
		moi: m ? { id: m.id, nom: m.nom, pseudo: m.pseudo, photo: urlPhoto(m), role: m.role } : null
	};
};
