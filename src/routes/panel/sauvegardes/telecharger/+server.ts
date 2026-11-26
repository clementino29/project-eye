// Téléchargement d'une sauvegarde : GET /panel/sauvegardes/telecharger?serveur=abcd1234&uuid=…
// Sakura Panel donne un lien signé, valable quelques minutes, vers Wings : on y renvoie le navigateur.
import { error, redirect } from '@sveltejs/kit';
import { accesServeur, erreurPelican } from '#lib/server/panel.ts';

export const GET = async ({ url, locals }) => {
	const id = url.searchParams.get('serveur') ?? '';
	const uuid = url.searchParams.get('uuid') ?? '';
	if (!/^[0-9a-f-]{36}$/i.test(uuid)) error(400, 'Sauvegarde inconnue.');
	const { client } = await accesServeur(locals, id, (p) => p.sauvegardes.telecharger);
	let lien: string;
	try {
		lien = await client.lienSauvegarde(id, uuid);
	} catch (e) {
		erreurPelican(e);
	}
	if (!/^https?:\/\//.test(lien)) error(502, 'Sakura Panel a donné un lien inattendu.');
	redirect(302, lien, { external: true });
};
