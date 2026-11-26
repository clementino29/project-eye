// Téléchargement d'un fichier hébergé (membres connectés seulement : la page reste fermée aux visiteurs).
import { error, redirect } from '@sveltejs/kit';
import { exigerMembre } from '#lib/server/garde.ts';
import { fichierParId } from '#lib/server/fichiers.ts';
import { lireStocke } from '#lib/server/stockage.ts';

/** Nom de fichier pour l'en-tête Content-Disposition (ASCII de secours + UTF-8). */
const disposition = (nom: string) => {
	const ascii = nom.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '_') || 'fichier';
	return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nom)}`;
};

export const GET = ({ params, locals }) => {
	exigerMembre(locals);
	const f = fichierParId(Number(params.id));
	if (!f) error(404, 'Fichier introuvable');
	// Lien externe vérifié à l'ajout (http ou https seulement).
	if (f.lien) redirect(302, f.lien, { external: true });
	const stocke = f.stockage ? lireStocke(f.stockage) : undefined;
	if (!stocke) error(404, 'Ce fichier n’est plus sur le hub');
	return new Response(stocke.flux(), {
		headers: {
			'Content-Type': f.typeMime || 'application/octet-stream',
			'Content-Length': String(stocke.taille),
			'Content-Disposition': disposition(f.nomOriginal || f.nom),
			'Cache-Control': 'private, no-store'
		}
	});
};
