// Ajout d'un jeu par son lien Steam : GET /jeux/steam?lien=https://store.steampowered.com/app/1145360/Hades/
// Renvoie le titre (Steam Store, en français) et la bannière Steam ; la fenêtre « Ajouter un jeu » les remplit.
import { error, json } from '@sveltejs/kit';
import { db, schema } from '#lib/server/db/index.ts';
import { exigerMembre } from '#lib/server/garde.ts';
import { analyserFiche, ClientSteam, lireLienSteam, nomCourt } from '#lib/server/steam.ts';
import { imageSteam } from '#lib/quoi-faire.ts';

export const GET = async ({ url, locals }) => {
	exigerMembre(locals);
	const appid = lireLienSteam(url.searchParams.get('lien') ?? '');
	if (!appid) error(400, 'Ce n’est pas un lien vers un jeu Steam.');
	const fiche = await new ClientSteam().fiche(appid);
	if (!fiche) error(404, 'Jeu introuvable sur Steam (ou Steam ne répond pas).');
	// La fiche sert aussi à « Quoi faire ? » : on la garde au passage.
	const valeurs = { ...analyserFiche(fiche), detailsLe: Date.now() };
	db()
		.insert(schema.jeuxSteam)
		.values({ steamAppId: appid, nom: fiche.name, nomCourt: nomCourt(fiche.name), ...valeurs })
		.onConflictDoUpdate({ target: schema.jeuxSteam.steamAppId, set: valeurs })
		.run();
	return json({ appid, titre: fiche.name, image: imageSteam(appid, 'header') });
};
