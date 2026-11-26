// Envoi d'un fichier sur le hub : POST /fichiers/envoi?projet=…&nom=…&type=…&plateformes=win,mac
// Le corps de la requête est le fichier lui-même, écrit sur le disque au fil de l'eau
// (sans passer par la mémoire), pour accepter les gros fichiers (2 Go par défaut).
import { error, json } from '@sveltejs/kit';
import { db, schema } from '#lib/server/db/index.ts';
import { config } from '#lib/server/config.ts';
import { champsFichier, exigerDeposant, projetParId, toucherProjets } from '#lib/server/fichiers.ts';
import { enregistrerFlux, ErreurTaille, supprimerStocke } from '#lib/server/stockage.ts';
import { tailleLisible } from '#lib/fichiers.ts';

export const POST = async ({ request, url, locals }) => {
	const moi = exigerDeposant(locals);
	const q = url.searchParams;
	const projet = projetParId(Number(q.get('projet')));
	if (!projet) error(404, 'Projet introuvable.');
	const c = champsFichier((cle) => q.get(cle) ?? '', (q.get('plateformes') ?? '').split(','));
	if ('erreur' in c) error(400, c.erreur);
	const nomOriginal = (q.get('nomFichier') ?? '').replace(/[\\/\0]/g, '_').trim().slice(0, 200) || 'fichier';
	const max = config.fichiers.tailleMax;
	const annoncee = Number(request.headers.get('content-length'));
	if (annoncee > max) error(413, `Fichier trop gros : ${tailleLisible(max)} au plus.`);
	if (!request.body) error(400, 'Fichier vide.');

	let stocke;
	try {
		stocke = await enregistrerFlux(request.body, max);
	} catch (e) {
		if (e instanceof ErreurTaille) error(413, `Fichier trop gros : ${tailleLisible(max)} au plus.`);
		throw e;
	}
	if (!stocke.taille) {
		supprimerStocke(stocke.nom);
		error(400, 'Fichier vide.');
	}
	const typeMime = (request.headers.get('content-type') ?? '').split(';')[0].trim().slice(0, 100) || 'application/octet-stream';
	const ligne = db()
		.insert(schema.fichiers)
		.values({ ...c.valeurs, projetId: projet.id, stockage: stocke.nom, nomOriginal, taille: stocke.taille, typeMime, ajouteParId: moi.id })
		.returning()
		.get();
	toucherProjets([projet.id]);
	return json({ id: ligne.id, ok: `${ligne.nom} ajouté à ${projet.nom}` });
};
