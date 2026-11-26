// Sauvegardes d'un serveur : GET /panel/sauvegardes?serveur=abcd1234
// Réservé aux membres qui ont la permission « backup.read » dans Sakura Panel.
import { json } from '@sveltejs/kit';
import { accesServeur, erreurPelican } from '#lib/server/panel.ts';

export const GET = async ({ url, locals }) => {
	const id = url.searchParams.get('serveur') ?? '';
	const { client } = await accesServeur(locals, id, (p) => p.sauvegardes.voir);
	try {
		return json({ sauvegardes: await client.sauvegardes(id) }, { headers: { 'cache-control': 'no-store' } });
	} catch (e) {
		erreurPelican(e);
	}
};
