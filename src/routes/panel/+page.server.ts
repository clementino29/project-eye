import { fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { DELAIS_ARRET_AUTO } from '#lib/server/arret-auto.ts';
import { db, schema } from '#lib/server/db/index.ts';
import { exigerAdmin, exigerMembre } from '#lib/server/garde.ts';
import { annoncerDemarrage } from '#lib/server/discord.ts';
import { joueursConnectes } from '#lib/server/joueurs.ts';
import { chargeMachine } from '#lib/server/machine.ts';
import { clientDe, identifiantValide, permissions } from '#lib/server/panel.ts';
import {
	ClientPelican,
	ErreurPelican,
	SANS_PERMISSION,
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
	const machine = await chargeMachine().catch(() => null);

	let client: ClientPelican | null = null;
	try {
		client = clientDe(m);
	} catch {
		return { etat: 'cle_illisible' as const, serveurs: [], journal, jeux, machine };
	}
	if (!client) return { etat: 'sans_cle' as const, serveurs: [], journal, jeux, machine };

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
			jeux,
			machine
		};
	}

	const reglages = new Map(base.select().from(schema.serveurs).all().map((s) => [s.identifiantPelican, s]));
	const titres = new Map(jeux.map((j) => [j.id, j.titre]));

	const serveurs = await Promise.all(
		liste.map(async (s) => {
			const r = reglages.get(s.identifiant);
			const [res, perms] = await Promise.all([
				client.ressources(s.identifiant).catch((): RessourcesServeur | null => null),
				permissions(client, m.id, s.identifiant).catch((): Permissions => SANS_PERMISSION)
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
				sauvegardesMax: s.sauvegardesMax,
				arretAutoMinutes: r?.arretAutoMinutes ?? null,
				// Depuis quand il tourne sans personne, seulement si l'arrêt automatique veille dessus.
				videDepuis: r?.arretAutoMinutes && res?.etat === 'running' ? (r.videDepuis ?? null) : null,
				joueurs,
				permissions: perms,
				urlPelican: urlServeurPelican(s.identifiant)
			};
		})
	);
	serveurs.sort((a, b) => Number(b.etat === 'running') - Number(a.etat === 'running') || a.nom.localeCompare(b.nom, 'fr'));
	return { etat: 'ok' as const, serveurs, journal, jeux, machine };
};

/** Serveur, nom affiché et client Pelican du membre, lus dans le formulaire. */
function preparer(m: Membre, f: FormData) {
	const id = String(f.get('serveur') ?? '');
	const nom = String(f.get('nom') ?? id).slice(0, 100);
	if (!identifiantValide(id)) return { erreur: fail(400, { erreur: 'Serveur inconnu.' }) };
	let client: ClientPelican | null;
	try {
		client = clientDe(m);
	} catch {
		client = null;
	}
	if (!client) return { erreur: fail(400, { erreur: 'Ajoute d’abord ta clé Sakura Panel dans ton compte.' }) };
	const noter = (action: (typeof schema.actionsServeur.$inferInsert)['action'], resultat: 'ok' | 'erreur', message: string | null) =>
		db()
			.insert(schema.actionsServeur)
			.values({ identifiantPelican: id, nomServeur: nom, membreId: m.id, action, resultat, message, date: Date.now() })
			.run();
	return { id, nom, client, noter };
}

const REFUS = 'Tu n’as pas cette permission dans Sakura Panel.';
const messageDe = (e: unknown) => (e instanceof Error ? e.message : 'Erreur inconnue');

export const actions = {
	alimentation: async ({ request, locals }) => {
		const m = exigerMembre(locals);
		const f = await request.formData();
		const signal = String(f.get('signal') ?? '') as Signal;
		if (!(signal in ACTIONS)) return fail(400, { erreur: 'Action inconnue.' });
		const c = preparer(m, f);
		if (c.erreur) return c.erreur;
		const { id, nom, client, noter } = c;
		try {
			const p = await permissions(client, m.id, id);
			const autorise = signal === 'start' ? p.demarrer : signal === 'stop' ? p.arreter : p.redemarrer;
			if (!autorise) {
				noter(ACTIONS[signal], 'erreur', 'Refusé : pas la permission dans Sakura Panel');
				return fail(403, { erreur: REFUS });
			}
			await client.alimentation(id, signal);
			noter(ACTIONS[signal], 'ok', null);
			// Démarré à la main : l'arrêt automatique repart de zéro.
			db().update(schema.serveurs).set({ videDepuis: null }).where(eq(schema.serveurs.identifiantPelican, id)).run();
			// Annonce Discord (sans attendre, ni bloquer en cas d'échec). Le nom et le jeu viennent des réglages du hub.
			if (signal === 'start') {
				const local = db()
					.select({ nom: schema.serveurs.nom, jeu: schema.jeux.titre })
					.from(schema.serveurs)
					.leftJoin(schema.jeux, eq(schema.jeux.id, schema.serveurs.jeuId))
					.where(eq(schema.serveurs.identifiantPelican, id))
					.get();
				void annoncerDemarrage({ id, nom: local?.nom || nom, jeu: local?.jeu, par: m.nom.trim().split(/\s+/)[0] || m.pseudo });
			}
			return { ok: true, signal, nom };
		} catch (e) {
			noter(ACTIONS[signal], 'erreur', messageDe(e));
			return fail(502, { erreur: messageDe(e) });
		}
	},

	/** Commande envoyée à la console du serveur (permission « control.console »). */
	commande: async ({ request, locals }) => {
		const m = exigerMembre(locals);
		const f = await request.formData();
		const commande = String(f.get('commande') ?? '').trim().replace(/^\//, '');
		if (!commande) return fail(400, { erreur: 'Écris une commande.' });
		if (commande.length > 500 || /[\r\n]/.test(commande)) return fail(400, { erreur: 'Une seule ligne, 500 caractères au plus.' });
		const c = preparer(m, f);
		if (c.erreur) return c.erreur;
		const { id, client, noter } = c;
		// Le journal garde le début de la commande, pour savoir qui a fait quoi.
		const trace = commande.length > 80 ? `${commande.slice(0, 80)}…` : commande;
		try {
			const p = await permissions(client, m.id, id);
			if (!p.commande) return fail(403, { erreur: REFUS });
			await client.commande(id, commande);
			noter('commande', 'ok', trace);
			return { ok: true, commande: true };
		} catch (e) {
			// Pelican répond 502 quand le serveur est éteint.
			const message = e instanceof ErreurPelican && e.statut === 502 ? 'Le serveur doit être démarré pour recevoir une commande.' : messageDe(e);
			noter('commande', 'erreur', `${trace} : ${message}`.slice(0, 300));
			return fail(502, { erreur: message });
		}
	},

	/** Nouvelle sauvegarde (permission « backup.create »), dans la limite fixée par Sakura Panel. */
	sauvegarder: async ({ request, locals }) => {
		const m = exigerMembre(locals);
		const f = await request.formData();
		const c = preparer(m, f);
		if (c.erreur) return c.erreur;
		const { id, client, noter } = c;
		const nomSauvegarde = String(f.get('nomSauvegarde') ?? '').trim().slice(0, 120) ||
			`Depuis le hub, ${new Date().toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
		try {
			const p = await permissions(client, m.id, id);
			if (!p.sauvegardes.creer) return fail(403, { erreur: REFUS });
			const s = await client.creerSauvegarde(id, nomSauvegarde);
			noter('sauvegarde', 'ok', nomSauvegarde);
			return { ok: true, sauvegarde: s };
		} catch (e) {
			// 400 : la limite de sauvegardes du serveur est atteinte ; 429 : une sauvegarde est déjà en cours.
			const message =
				e instanceof ErreurPelican && e.statut === 400
					? 'Plus de place : supprime une ancienne sauvegarde dans Sakura Panel.'
					: e instanceof ErreurPelican && e.statut === 429
						? 'Une sauvegarde est déjà en cours, ou la dernière est trop récente. Réessaie dans quelques minutes.'
						: messageDe(e);
			noter('sauvegarde', 'erreur', message);
			return fail(502, { erreur: message });
		}
	},

	reglages: async ({ request, locals }) => {
		const admin = exigerAdmin(locals);
		const f = await request.formData();
		const identifiantPelican = String(f.get('serveur') ?? '');
		if (!identifiantValide(identifiantPelican)) return fail(400, { erreur: 'Serveur inconnu.' });
		const texte = (k: string, max = 120) => String(f.get(k) ?? '').trim().slice(0, max) || null;
		const jeuId = Number(f.get('jeuId')) || null;
		const gamedigType = texte('gamedigType', 40);
		if (gamedigType && !/^[a-z0-9_-]+$/.test(gamedigType)) {
			return fail(400, { erreur: 'Le type GameDig ne contient que des lettres minuscules, chiffres, - et _.' });
		}
		const minutes = Number(f.get('arretAuto')) || null;
		if (minutes && !(DELAIS_ARRET_AUTO as readonly number[]).includes(minutes)) return fail(400, { erreur: 'Délai d’arrêt inconnu.' });
		if (minutes && !gamedigType) {
			return fail(400, { erreur: 'L’arrêt automatique a besoin du type GameDig, pour savoir si quelqu’un joue.' });
		}
		if (minutes && !admin.clePelicanChiffree) {
			return fail(400, { erreur: 'L’arrêt automatique utilise ta clé Sakura Panel : ajoute-la d’abord dans ton compte.' });
		}
		const valeurs = {
			nom: texte('nom'),
			adresseConnexion: texte('adresse'),
			gamedigType,
			jeuId,
			arretAutoMinutes: minutes,
			// Le dernier admin qui enregistre un arrêt automatique prête sa clé pour arrêter.
			arretAutoParId: minutes ? admin.id : null,
			...(minutes ? {} : { videDepuis: null })
		};
		db()
			.insert(schema.serveurs)
			.values({ identifiantPelican, ...valeurs })
			.onConflictDoUpdate({ target: schema.serveurs.identifiantPelican, set: valeurs })
			.run();
		return { ok: true, reglages: true };
	}
};
