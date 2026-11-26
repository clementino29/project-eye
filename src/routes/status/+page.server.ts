import { lireStatut } from '#lib/server/kuma.ts';

// Lisible sans connexion : Uptime Kuma publie déjà cette page de statut.
export const load = async ({ depends }) => {
	depends('hub:status');
	try {
		const statut = await lireStatut();
		return { etat: statut ? ('ok' as const) : ('sans_config' as const), statut };
	} catch (e) {
		console.error('[kuma]', e);
		return { etat: 'injoignable' as const, statut: null };
	}
};
