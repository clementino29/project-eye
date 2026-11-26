// Dernières lignes de la console d'un serveur : GET /panel/console?serveur=abcd1234
// Réservé aux membres qui ont la permission « websocket.connect » dans Sakura Panel.
import { json } from '@sveltejs/kit';
import { accesServeur, erreurPelican } from '#lib/server/panel.ts';

export const GET = async ({ url, locals }) => {
	const id = url.searchParams.get('serveur') ?? '';
	const { client } = await accesServeur(locals, id, (p) => p.console);
	try {
		return json({ lignes: await client.console(id), le: Date.now() }, { headers: { 'cache-control': 'no-store' } });
	} catch (e) {
		erreurPelican(e);
	}
};
