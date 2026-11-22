import { fail } from '@sveltejs/kit';
import { desc, eq, sql } from 'drizzle-orm';
import { config } from '#lib/server/config.ts';
import { chiffrer, dechiffrer } from '#lib/server/crypto.ts';
import { db, schema } from '#lib/server/db/index.ts';
import { exigerMembre } from '#lib/server/garde.ts';
import { urlPhoto } from '#lib/server/membres.ts';
import { ClientPelican, ErreurPelican, masquerCle } from '#lib/server/pelican.ts';
import { ClientSteam, ErreurSteam, completerFiches, lireEntreeSteam, synchroniserMembre } from '#lib/server/steam.ts';

export const load = ({ locals }) => {
	const m = exigerMembre(locals);
	const base = db();
	const total =
		base
			.select({ n: sql<number>`count(*)` })
			.from(schema.possessions)
			.where(eq(schema.possessions.membreId, m.id))
			.get()?.n ?? 0;
	const apercu = base
		.select({ id: schema.jeuxSteam.steamAppId, nom: schema.jeuxSteam.nom })
		.from(schema.possessions)
		.innerJoin(schema.jeuxSteam, eq(schema.jeuxSteam.steamAppId, schema.possessions.steamAppId))
		.where(eq(schema.possessions.membreId, m.id))
		.orderBy(schema.jeuxSteam.nom)
		.limit(5)
		.all();

	let cleMasquee: string | null = null;
	if (m.clePelicanChiffree) {
		try {
			cleMasquee = masquerCle(dechiffrer(m.clePelicanChiffree));
		} catch {
			cleMasquee = '••••••••••••';
		}
	}

	const membres =
		m.role === 'admin'
			? base
					.select()
					.from(schema.membres)
					.orderBy(desc(schema.membres.derniereConnexion))
					.all()
					.map((x) => ({
						id: x.id,
						nom: x.nom,
						pseudo: x.pseudo,
						photo: urlPhoto(x),
						role: x.role,
						etatSteam: x.etatSteam,
						clePelican: !!x.clePelicanChiffree,
						derniereConnexion: x.derniereConnexion
					}))
			: null;

	return {
		profil: { nom: m.nom, pseudo: m.pseudo, email: m.email, photo: urlPhoto(m), role: m.role },
		urlAuthentik: config.authentik.urlProfil ?? null,
		steam: {
			etat: m.etatSteam,
			nom: m.steamNom,
			derniereSync: m.derniereSyncSteam,
			total,
			apercu
		},
		pelican: {
			cle: cleMasquee,
			ajouteeLe: m.clePelicanAjouteeLe,
			urlCles: config.pelican.urlClesApi ?? null
		},
		membres
	};
};

const PHOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export const actions = {
	photo: async ({ request, locals }) => {
		const m = exigerMembre(locals);
		const photo = String((await request.formData()).get('photo') ?? '');
		if (!PHOTO.test(photo) || photo.length > 400_000) {
			return fail(400, { action: 'photo', erreur: 'Image refusée : choisis un JPG, PNG ou WebP de moins de 5 Mo.' });
		}
		db().update(schema.membres).set({ photo, photoMaj: Date.now() }).where(eq(schema.membres.id, m.id)).run();
		return { action: 'photo', ok: 'Photo mise à jour' };
	},

	retirerPhoto: ({ locals }) => {
		const m = exigerMembre(locals);
		db().update(schema.membres).set({ photo: null, photoMaj: Date.now() }).where(eq(schema.membres.id, m.id)).run();
		return { action: 'retirerPhoto', ok: 'Photo retirée' };
	},

	lierSteam: async ({ request, locals }) => {
		const m = exigerMembre(locals);
		const brut = String((await request.formData()).get('profil') ?? '');
		if (!brut.trim()) return fail(400, { action: 'lierSteam', erreur: 'Colle l’URL de ton profil ou ton SteamID64.' });
		const entree = lireEntreeSteam(brut);
		if (!entree) return fail(400, { action: 'lierSteam', erreur: 'Ça ne ressemble ni à une URL Steam ni à un SteamID64.' });
		try {
			const steam = new ClientSteam();
			const steamId = await steam.resoudre(entree);
			const profil = steamId ? await steam.profil(steamId) : null;
			if (!steamId || !profil) {
				return fail(400, { action: 'lierSteam', erreur: 'Profil introuvable. Vérifie l’URL ou le SteamID.' });
			}
			db()
				.update(schema.membres)
				.set({ steamId, steamNom: profil.nom })
				.where(eq(schema.membres.id, m.id))
				.run();
			const r = await synchroniserMembre(m.id, steam);
			void completerFiches(60, steam);
			return { action: 'lierSteam', etat: r.etat, total: r.total };
		} catch (e) {
			return fail(502, { action: 'lierSteam', erreur: e instanceof ErreurSteam ? e.message : 'Steam ne répond pas.' });
		}
	},

	resynchroniser: async ({ locals }) => {
		const m = exigerMembre(locals);
		try {
			const avant = m.etatSteam;
			const r = await synchroniserMembre(m.id);
			void completerFiches();
			return { action: 'resynchroniser', etat: r.etat, total: r.total, etaitPrivee: avant === 'privee' };
		} catch (e) {
			return fail(502, { action: 'resynchroniser', erreur: e instanceof ErreurSteam ? e.message : 'Steam ne répond pas.' });
		}
	},

	delierSteam: ({ locals }) => {
		const m = exigerMembre(locals);
		db().transaction((tx) => {
			tx.delete(schema.possessions).where(eq(schema.possessions.membreId, m.id)).run();
			tx.update(schema.membres)
				.set({ steamId: null, steamNom: null, etatSteam: 'non_liee', derniereSyncSteam: null })
				.where(eq(schema.membres.id, m.id))
				.run();
		});
		return { action: 'delierSteam', ok: 'Steam délié' };
	},

	enregistrerCle: async ({ request, locals }) => {
		const m = exigerMembre(locals);
		const cle = String((await request.formData()).get('cle') ?? '').trim();
		if (!cle) return fail(400, { action: 'enregistrerCle', erreur: 'Colle ta clé API Sakura Panel.' });
		if (/\s/.test(cle) || cle.length < 24 || cle.length > 200) {
			return fail(400, { action: 'enregistrerCle', erreur: 'Ça ne ressemble pas à une clé API Sakura Panel.' });
		}
		try {
			await new ClientPelican(cle).compte();
		} catch (e) {
			const refus = e instanceof ErreurPelican && (e.statut === 401 || e.statut === 403);
			return fail(400, {
				action: 'enregistrerCle',
				erreur: refus
					? 'Sakura Panel a refusé cette clé. Vérifie que c’est une clé client et qu’elle n’a pas été révoquée.'
					: e instanceof Error
						? e.message
						: 'Sakura Panel ne répond pas.'
			});
		}
		const remplace = !!m.clePelicanChiffree;
		db()
			.update(schema.membres)
			.set({ clePelicanChiffree: chiffrer(cle), clePelicanAjouteeLe: Date.now() })
			.where(eq(schema.membres.id, m.id))
			.run();
		return { action: 'enregistrerCle', ok: remplace ? 'Clé Sakura Panel remplacée' : 'Clé Sakura Panel enregistrée' };
	},

	supprimerCle: ({ locals }) => {
		const m = exigerMembre(locals);
		db()
			.update(schema.membres)
			.set({ clePelicanChiffree: null, clePelicanAjouteeLe: null })
			.where(eq(schema.membres.id, m.id))
			.run();
		return { action: 'supprimerCle', ok: 'Clé Sakura Panel supprimée' };
	}
};
