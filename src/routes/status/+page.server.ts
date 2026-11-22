import { exigerMembre } from '#lib/server/garde.ts';
import { lireStatut } from '#lib/server/kuma.ts';

export const load = async ({ locals, depends }) => {
	exigerMembre(locals);
	depends('hub:status');
	try {
		const statut = await lireStatut();
		return { etat: statut ? ('ok' as const) : ('sans_config' as const), statut };
	} catch (e) {
		console.error('[kuma]', e);
		return { etat: 'injoignable' as const, statut: null };
	}
};
