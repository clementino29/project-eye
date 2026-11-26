// Arrêt automatique des serveurs de jeu restés sans joueur.
// Un admin règle un délai par serveur (Panel, Réglages) ; toutes les deux minutes, le hub
// demande l'état du serveur à Sakura Panel et le nombre de joueurs au jeu (GameDig).
// Dès que personne n'est connecté, il note l'heure ; si personne ne revient pendant le délai,
// il arrête le serveur avec la clé Sakura Panel de l'admin qui a fait le réglage, puis le note
// dans le journal des actions et l'annonce sur Discord.
import { and, eq, isNotNull } from 'drizzle-orm';
import { dechiffrer } from './crypto.ts';
import { db, schema } from './db/index.ts';
import { annoncer, COULEURS, sansMiseEnForme } from './discord.ts';
import { joueursConnectes } from './joueurs.ts';
import { ClientPelican, type RessourcesServeur, type ServeurPelican, type Signal } from './pelican.ts';

export const DELAIS_ARRET_AUTO = [15, 30, 60, 120] as const;

export interface ClientArret {
	serveurs(): Promise<Pick<ServeurPelican, 'identifiant' | 'nom' | 'adresse'>[]>;
	ressources(identifiant: string): Promise<Pick<RessourcesServeur, 'etat'>>;
	alimentation(identifiant: string, signal: Signal): Promise<void>;
}

export interface DependancesArret {
	client: (cle: string) => ClientArret;
	joueurs: (type: string, adresse: string) => Promise<{ connectes: number } | null>;
}

const PAR_DEFAUT: DependancesArret = {
	client: (cle) => new ClientPelican(cle),
	joueurs: joueursConnectes
};

export type Bilan = { identifiant: string; issue: 'occupe' | 'vide' | 'arrete' | 'eteint' | 'inconnu' | 'erreur' | 'sans_cle' };

const enMinutes = (ms: number) => Math.floor(ms / 60_000);

/** Un tour de vérification sur tous les serveurs qui ont un délai d'arrêt automatique. */
export async function verifierArretsAuto(maintenant = Date.now(), dep: DependancesArret = PAR_DEFAUT): Promise<Bilan[]> {
	const base = db();
	const reglages = base
		.select({
			id: schema.serveurs.id,
			identifiant: schema.serveurs.identifiantPelican,
			nom: schema.serveurs.nom,
			jeu: schema.jeux.titre,
			adresse: schema.serveurs.adresseConnexion,
			gamedigType: schema.serveurs.gamedigType,
			minutes: schema.serveurs.arretAutoMinutes,
			videDepuis: schema.serveurs.videDepuis,
			cle: schema.membres.clePelicanChiffree,
			role: schema.membres.role
		})
		.from(schema.serveurs)
		.leftJoin(schema.membres, eq(schema.membres.id, schema.serveurs.arretAutoParId))
		.leftJoin(schema.jeux, eq(schema.jeux.id, schema.serveurs.jeuId))
		.where(and(isNotNull(schema.serveurs.arretAutoMinutes), isNotNull(schema.serveurs.gamedigType)))
		.all();

	const noterVide = (id: number, valeur: number | null) =>
		base.update(schema.serveurs).set({ videDepuis: valeur }).where(eq(schema.serveurs.id, id)).run();

	// Une seule liste des serveurs par clé, pour l'adresse par défaut et le nom Sakura Panel.
	const listes = new Map<string, Promise<Map<string, Pick<ServeurPelican, 'identifiant' | 'nom' | 'adresse'>>>>();
	const bilans: Bilan[] = [];

	for (const r of reglages) {
		const b = (issue: Bilan['issue']) => bilans.push({ identifiant: r.identifiant, issue });
		// Seul un admin qui a encore sa clé peut arrêter : sinon le réglage attend un autre admin.
		if (!r.cle || r.role !== 'admin' || !r.minutes || !r.gamedigType) {
			b('sans_cle');
			continue;
		}
		let client: ClientArret;
		let cle: string;
		try {
			cle = dechiffrer(r.cle);
			client = dep.client(cle);
		} catch {
			b('sans_cle');
			continue;
		}

		const etat = await client.ressources(r.identifiant).then((x) => x.etat, () => null);
		if (etat === null) {
			b('inconnu');
			continue;
		}
		if (etat !== 'running') {
			if (r.videDepuis !== null) noterVide(r.id, null);
			b('eteint');
			continue;
		}

		if (!listes.has(cle)) {
			listes.set(cle, client.serveurs().then((l) => new Map(l.map((s) => [s.identifiant, s])), () => new Map()));
		}
		const pelican = (await listes.get(cle)!).get(r.identifiant);
		const adresse = r.adresse || pelican?.adresse;
		const joueurs = adresse ? await dep.joueurs(r.gamedigType, adresse) : null;
		// Le jeu ne répond pas (il démarre encore, ou le type GameDig est faux) : on ne décide rien.
		if (!joueurs) {
			b('inconnu');
			continue;
		}
		if (joueurs.connectes > 0) {
			if (r.videDepuis !== null) noterVide(r.id, null);
			b('occupe');
			continue;
		}
		if (r.videDepuis === null) {
			noterVide(r.id, maintenant);
			b('vide');
			continue;
		}
		if (maintenant - r.videDepuis < r.minutes * 60_000) {
			b('vide');
			continue;
		}

		const nom = (r.nom || pelican?.nom || r.identifiant).slice(0, 100);
		const vide = enMinutes(maintenant - r.videDepuis);
		const noter = (resultat: 'ok' | 'erreur', message: string) =>
			base
				.insert(schema.actionsServeur)
				.values({ identifiantPelican: r.identifiant, nomServeur: nom, membreId: null, action: 'arret_auto', resultat, message, date: maintenant })
				.run();
		try {
			await client.alimentation(r.identifiant, 'stop');
		} catch (e) {
			noter('erreur', `Arrêt impossible : ${e instanceof Error ? e.message : 'erreur inconnue'}`.slice(0, 300));
			// On repart pour un délai complet, pour ne pas remplir le journal toutes les deux minutes.
			noterVide(r.id, maintenant);
			b('erreur');
			continue;
		}
		noterVide(r.id, null);
		noter('ok', `Personne depuis ${vide} min`);
		void annoncer({
			titre: `⏹️ ${sansMiseEnForme(nom)} est arrêté`,
			texte: `Personne n’y était connecté depuis ${vide} minutes${r.jeu ? ` (${sansMiseEnForme(r.jeu)})` : ''}. Il se relance depuis le hub.`,
			lien: '/panel',
			couleur: COULEURS.arret
		});
		b('arrete');
	}
	return bilans;
}
