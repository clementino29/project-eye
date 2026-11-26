import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.ts';
import { exigerMembre } from '#lib/server/garde.ts';
import { tousLesMembres } from '#lib/server/membres.ts';
import { listesDe, type EntreeListe } from '#lib/server/films.ts';
import { statsWatchlist } from '#lib/watchlist.ts';

const pourStats = (l: EntreeListe[]) =>
	statsWatchlist(l.map((e) => ({ type: e.titre.type, statut: e.statut, duree: e.titre.duree, totalEpisodes: e.totalEpisodes, episodesVus: e.episodesVus })));

// Les potes : les listes des autres membres et le fil « Ça bouge ». Réservé aux membres connectés.
export const load = ({ url, locals }) => {
	const moi = exigerMembre(locals);
	const membres = tousLesMembres();
	const autres = membres.filter((m) => m.id !== moi.id);
	const listes = listesDe(membres.map((m) => m.id));
	const mienne = listes.get(moi.id) ?? [];
	const prenom = (id: number) => (membres.find((m) => m.id === id)?.nom ?? 'Un pote').split(' ')[0];

	const potes = autres.map((m) => {
		const l = listes.get(m.id) ?? [];
		return { id: m.id, nom: m.nom, photo: m.photo, cours: l.filter((e) => e.statut === 'cours').length, avoir: l.filter((e) => e.statut === 'avoir').length, total: l.length };
	});
	// Pote affiché : celui demandé, sinon le premier qui a une liste.
	const demande = Number(url.searchParams.get('pote'));
	const choisi = potes.find((p) => p.id === demande) ?? potes.find((p) => p.total) ?? potes[0] ?? null;
	const sienne = choisi ? (listes.get(choisi.id) ?? []) : [];
	const miens = new Set(mienne.map((e) => e.titre.id));

	// « Ça bouge » : ajouts et titres finis par les autres, conseils reçus.
	type Evenement = { date: number; qui: string; texte: string; titreId: number };
	const fil: Evenement[] = [];
	for (const p of autres)
		for (const e of listes.get(p.id) ?? []) {
			fil.push({ date: e.ajouteLe, qui: prenom(p.id), texte: `a ajouté ${e.titre.titre}${e.statut === 'avoir' ? ' à voir' : ''}`, titreId: e.titre.id });
			if (e.statut === 'vu' && e.finiLe && e.finiLe - e.ajouteLe > 60_000)
				fil.push({ date: e.finiLe, qui: prenom(p.id), texte: `a fini ${e.titre.titre}`, titreId: e.titre.id });
		}
	const conseils = db()
		.select()
		.from(schema.conseils)
		.innerJoin(schema.titres, eq(schema.conseils.titreId, schema.titres.id))
		.where(eq(schema.conseils.aId, moi.id))
		.all();
	for (const { conseils: c, titres: t } of conseils)
		fil.push({ date: c.creeLe, qui: prenom(c.deId), texte: `t'a conseillé ${t.titre}${c.message ? ` : « ${c.message} »` : ''}`, titreId: t.id });
	fil.sort((a, b) => b.date - a.date);

	return {
		potes,
		choisi,
		liste: sienne.map((e) => ({ ...e, mien: miens.has(e.titre.id) })),
		communs: sienne.filter((e) => miens.has(e.titre.id)).map((e) => e.titre.titre),
		stats: pourStats(sienne),
		mesStats: pourStats(mienne),
		fil: fil.slice(0, 8)
	};
};
