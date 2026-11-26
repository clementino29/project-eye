// Images des projets (bannière, logo, vignette), pour les membres connectés.
import { error } from '@sveltejs/kit';
import { exigerMembre } from '#lib/server/garde.ts';
import { lireStocke, typeImage } from '#lib/server/stockage.ts';

export const GET = ({ params, locals }) => {
	exigerMembre(locals);
	const type = typeImage(params.nom);
	const stocke = type ? lireStocke(params.nom, 'images') : undefined;
	if (!type || !stocke) error(404, 'Image introuvable');
	// Le nom change à chaque nouvelle image : elle peut rester en cache.
	return new Response(stocke.flux(), {
		headers: { 'Content-Type': type, 'Content-Length': String(stocke.taille), 'Cache-Control': 'private, max-age=31536000, immutable' }
	});
};
