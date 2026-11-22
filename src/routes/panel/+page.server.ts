import { fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { dechiffrer } from '#lib/server/crypto.ts';
import { db, schema } from '#lib/server/db/index.ts';
import { exigerAdmin, exigerMembre } from '#lib/server/garde.ts';
import { joueursConnectes } from '#lib/server/joueurs.ts';
import {
	ClientPelican,
	ErreurPelican,
	urlServeurPelican,
	type Permissions,
	type RessourcesServeur,
	type Signal
} from '#lib/server/pelican.ts';
import type { Membre } from '#lib/server/db/schema.ts';

const ACTIONS: Record<Signal, 'demarrer' | 'arreter' | 'redemarrer'> = {
	start: 'demarrer',
	stop: 'arreter',
	restart: 'redemarrer'
};

// Cache des permissions (une minute) : elles changent rarement et coûtent un appel par serveur.
const cachePermissions = new Map<string, { valeur: Permissions; expire: number }>();

function clientDe(m: Membre) {
	if (!m.clePelicanChiffree) return null;
	return new ClientPelican(dechiffrer(m.clePelicanChiffree));
}

async function permissions(client: ClientPelican, membreId: number, id: string) {
	const cle = `${membreId}:${id}`;
	const c = cachePermissions.get(cle);
	if (c && c.expire > Date.now()) return c.valeur;
	const valeur = await client.permissions(id);
	cachePermissions.set(cle, { valeur, expire: Date.now() + 60_000 });
	return valeur;
}

export const load = async ({ locals, depends }) => {
	depends('hub:panel');
	const m = exigerMembre(locals);
	const base = db();
	const journal = base
		.select({
			id: schema.actionsServeur.id,
			serveur: schema.actionsServeur.nomServeur,
			action: schema.actionsServeur.action,
			resultat: schema.actionsServeur.resultat,
			message: schema.actionsServeur.message,
			date: schema.actionsServeur.date,
			qui: schema.membres.nom
		})
		.from(schema.actionsServeur)
		.leftJoin(schema.membres, eq(schema.membres.id, schema.actionsServeur.membreId))
		.orderBy(desc(schema.actionsServeur.date))
		.limit(20)
		.all();
	const jeux = base.select({ id: schema.jeux.id, titre: schema.jeux.titre }).from(schema.jeux).orderBy(schema.jeux.titre).all();

	let client: ClientPelican | null = null;
	try {
		client = clientDe(m);
	} catch {
		return { etat: 'cle_illisible' as const, serveurs: [], journal, jeux };
	}
	if (!client) return { etat: 'sans_cle' as const, serveurs: [], journal, jeux };

	let liste;
	try {
		liste = await client.serveurs();
	} catch (e) {
		const refus = e instanceof ErreurPelican && (e.statut === 401 || e.statut === 403);
		return {
			etat: refus ? ('cle_refusee' as const) : ('injoignable' as const),
			message: e instanceof Error ? e.message : '',
			serveurs: [],
			journal,
			jeux
		};
	}

	const reglages = new Map(base.select().from(schema.serveurs).all().map((s) => [s.identifiantPelican, s]));
	const titres = new Map(jeux.map((j) => [j.id, j.titre]));

	const serveurs = await Promise.all(
		liste.map(async (s) => {
			const r = reglages.get(s.identifiant);
			const [res, perms] = await Promise.all([
				client.ressources(s.identifiant).catch((): RessourcesServeur | null => null),
				permissions(client, m.id, s.identifiant).catch(
					(): Permissions => ({ demarrer: false, arreter: false, redemarrer: false })
				)
			]);
			const adresse = r?.adresseConnexion || s.adresse;
			const joueurs =
				res?.etat === 'running' && r?.gamedigType && adresse ? await joueursConnectes(r.gamedigType, adresse) : null;
			return {
				identifiant: s.identifiant,
				nom: r?.nom || s.nom,
				description: s.description,
				jeu: r?.jeuId ? (titres.get(r.jeuId) ?? null) : null,
				jeuId: r?.jeuId ?? null,
				adresse,
				adresseDefaut: s.adresse,
				gamedigType: r?.gamedigType ?? null,
				nomLocal: r?.nom ?? null,
				etat: s.suspendu ? ('suspendu' as const) : s.enInstallation ? ('installation' as const) : (res?.etat ?? 'inconnu'),
				ressources: res,
				limites: s.limites,
				joueurs,
				permissions: perms,
				urlPelican: urlServeurPelican(s.identifiant)
			};
		})
	);
	serveurs.sort((a, b) => Number(b.etat === 'running') - Number(a.etat === 'running') || a.nom.localeCompare(b.nom, 'fr'));
	return { etat: 'ok' as const, serveurs, journal, jeux };
};

export const actions = {
	alimentation: async ({ request, locals }) => {
		const m = exigerMembre(locals);
		const f = await request.formData();
		const id = String(f.get('serveur') ?? '');
		const signal = String(f.get('signal') ?? '') as Signal;
		const nom = String(f.get('nom') ?? id).slice(0, 100);
		if (!id || !(signal in ACTIONS)) return fail(400, { erreur: 'Action inconnue.' });
		let client: ClientPelican | null;
		try {
			client = clientDe(m);
		} catch {
			client = null;
		}
		if (!client) return fail(400, { erreur: 'Ajoute d’abord ta clé Sakura Panel dans ton compte.' });

		const noter = (resultat: 'ok' | 'erreur', message: string | null) =>
			db()
				.insert(schema.actionsServeur)
				.values({ identifiantPelican: id, nomServeur: nom, membreId: m.id, action: ACTIONS[signal], resultat, message, date: Date.now() })
				.run();
		try {
			const p = await permissions(client, m.id, id);
			const autorise = signal === 'start' ? p.demarrer : signal === 'stop' ? p.arreter : p.redemarrer;
			if (!autorise) {
				noter('erreur', 'Refusé : pas la permission dans Sakura Panel');
				return fail(403, { erreur: 'Tu n’as pas cette permission dans Sakura Panel.' });
			}
			await client.alimentation(id, signal);
			noter('ok', null);
			return { ok: true, signal, nom };
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Erreur inconnue';
			noter('erreur', message);
			return fail(502, { erreur: message });
		}
	},

	reglages: async ({ request, locals }) => {
		exigerAdmin(locals);
		const f = await request.formData();
		const identifiantPelican = String(f.get('serveur') ?? '');
		if (!identifiantPelican) return fail(400, { erreur: 'Serveur inconnu.' });
		const texte = (k: string, max = 120) => String(f.get(k) ?? '').trim().slice(0, max) || null;
		const jeuId = Number(f.get('jeuId')) || null;
		const gamedigType = texte('gamedigType', 40);
		if (gamedigType && !/^[a-z0-9_-]+$/.test(gamedigType)) {
			return fail(400, { erreur: 'Le type GameDig ne contient que des lettres minuscules, chiffres, - et _.' });
		}
		const valeurs = { nom: texte('nom'), adresseConnexion: texte('adresse'), gamedigType, jeuId };
		db()
			.insert(schema.serveurs)
			.values({ identifiantPelican, ...valeurs })
			.onConflictDoUpdate({ target: schema.serveurs.identifiantPelican, set: valeurs })
			.run();
		return { ok: true, reglages: true };
	}
};
