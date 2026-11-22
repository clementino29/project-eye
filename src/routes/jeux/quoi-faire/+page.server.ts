import { fail } from '@sveltejs/kit';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.ts';
import { config } from '#lib/server/config.ts';
import { exigerMembre } from '#lib/server/garde.ts';
import { tousLesMembres } from '#lib/server/membres.ts';
import { entier, ids, parmi, texte } from '#lib/server/formulaires.ts';
import { completerFiches, synchroniserTout } from '#lib/server/steam.ts';
import type { JeuCommun } from '#lib/quoi-faire.ts';

export const load = ({ locals }) => {
	exigerMembre(locals);
	const base = db();

	// Jeux possédés par au moins deux membres : les seuls qui peuvent être « en commun ».
	const partages = base
		.select({ id: schema.possessions.steamAppId })
		.from(schema.possessions)
		.groupBy(schema.possessions.steamAppId)
		.having(sql`count(*) >= 2`)
		.all()
		.map((x) => x.id);

	const fiches = partages.length
		? base.select().from(schema.jeuxSteam).where(inArray(schema.jeuxSteam.steamAppId, partages)).all()
		: [];
	const possessions = partages.length
		? base.select().from(schema.possessions).where(inArray(schema.possessions.steamAppId, partages)).all()
		: [];
	const proprietaires = new Map<number, number[]>();
	for (const p of possessions) proprietaires.set(p.steamAppId, [...(proprietaires.get(p.steamAppId) ?? []), p.membreId]);

	const jeux: JeuCommun[] = fiches
		.map((f) => ({
			id: f.steamAppId,
			nom: f.nom,
			court: f.nomCourt || f.nom,
			mode: f.mode,
			multi: f.multijoueur,
			max: f.joueursMax,
			genres: f.genres,
			gratuit: f.gratuit,
			proprietaires: proprietaires.get(f.steamAppId) ?? []
		}))
		.sort((a, b) => b.proprietaires.length - a.proprietaires.length || a.nom.localeCompare(b.nom, 'fr'));

	const envies: Record<number, number[]> = {};
	for (const e of base.select().from(schema.envies).all()) (envies[e.steamAppId] ??= []).push(e.membreId);

	const dernier = base
		.select({ appid: schema.tirages.steamAppIdTire, date: schema.tirages.date })
		.from(schema.tirages)
		.where(eq(schema.tirages.valide, true))
		.orderBy(desc(schema.tirages.date))
		.get();

	const derniereSync = base
		.select({ t: sql<number | null>`max(${schema.membres.derniereSyncSteam})` })
		.from(schema.membres)
		.get()?.t;

	const ficheManquantes = fiches.filter((f) => !f.detailsLe).length;
	// Lit en arrière-plan les fiches Steam qui manquent (mode, multijoueur, genres).
	if (ficheManquantes && config.steam.cleApi) void completerFiches();

	return {
		membres: tousLesMembres(),
		jeux,
		envies,
		dernier: dernier ? { nom: fiches.find((f) => f.steamAppId === dernier.appid)?.nom ?? `Jeu ${dernier.appid}`, date: dernier.date } : null,
		derniereSync: derniereSync ?? null,
		ficheManquantes,
		steamConfigure: !!config.steam.cleApi
	};
};

export const actions = {
	envie: async ({ request, locals }) => {
		const moi = exigerMembre(locals);
		const appid = entier(await request.formData(), 'appid');
		if (!appid) return fail(400, { erreur: 'Jeu inconnu.' });
		const base = db();
		const cle = and(eq(schema.envies.membreId, moi.id), eq(schema.envies.steamAppId, appid));
		const deja = base.select().from(schema.envies).where(cle).get();
		if (deja) base.delete(schema.envies).where(cle).run();
		else base.insert(schema.envies).values({ membreId: moi.id, steamAppId: appid, date: Date.now() }).run();
		return { ok: null, envie: !deja };
	},

	synchroniser: async ({ locals }) => {
		exigerMembre(locals);
		if (!config.steam.cleApi) return fail(503, { erreur: 'STEAM_API_KEY n’est pas configurée.' });
		const r = await synchroniserTout();
		if (r.erreurs) return { ok: `Bibliothèques à jour, sauf ${r.erreurs} sur ${r.membres}` };
		return { ok: r.membres ? 'Bibliothèques à jour' : 'Personne n’a encore lié Steam' };
	},

	valider: async ({ request, locals }) => {
		const moi = exigerMembre(locals);
		const f = await request.formData();
		const appid = entier(f, 'appid');
		const presents = ids(f, 'joueurs');
		if (!appid || presents.length < 2) return fail(400, { erreur: 'Tirage incomplet.' });
		db()
			.insert(schema.tirages)
			.values({ date: Date.now(), lancePar: moi.id, joueursPresents: JSON.stringify(presents), steamAppIdTire: appid, valide: true })
			.run();
		return { ok: null };
	},

	/** Corrige une fiche à la main : Steam ne donne pas le nombre de places. */
	fiche: async ({ request, locals }) => {
		exigerMembre(locals);
		const f = await request.formData();
		const appid = entier(f, 'appid');
		if (!appid) return fail(400, { erreur: 'Jeu inconnu.' });
		const max = entier(f, 'joueursMax');
		const mode = parmi(texte(f, 'mode'), ['coop', 'versus', 'solo'] as const);
		db()
			.update(schema.jeuxSteam)
			.set({
				joueursMax: max && max > 0 ? Math.min(max, 999) : null,
				mode,
				...(mode ? { multijoueur: mode !== 'solo' } : {}),
				nomCourt: texte(f, 'court', 40) || null
			})
			.where(eq(schema.jeuxSteam.steamAppId, appid))
			.run();
		return { ok: 'Fiche corrigée' };
	}
};
