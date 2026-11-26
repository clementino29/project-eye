// Bibliothèques Steam : Steam Web API (profil, jeux possédés) et Steam Store (fiche d'un jeu).
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { config } from './config.ts';
import { db, schema } from './db/index.ts';

type Fetch = typeof fetch;

const STEAMID64 = /^7656119\d{10}$/;

export type EntreeSteam = { type: 'id64'; valeur: string } | { type: 'pseudo'; valeur: string };

/** Lit une URL de profil Steam ou un SteamID64 (comme dans le prototype de la page Compte). */
export function lireEntreeSteam(brut: string): EntreeSteam | null {
	const v = brut.trim();
	if (STEAMID64.test(v)) return { type: 'id64', valeur: v };
	const m = v.match(
		/^(?:https?:\/\/)?(?:www\.)?steamcommunity\.com\/(id|profiles)\/([A-Za-z0-9_-]{2,64})\/?(?:[?#].*)?$/
	);
	if (!m) return null;
	if (m[1] === 'profiles') return STEAMID64.test(m[2]) ? { type: 'id64', valeur: m[2] } : null;
	return { type: 'pseudo', valeur: m[2] };
}

export class ErreurSteam extends Error {}

export class ClientSteam {
	constructor(
		private cle = config.steam.cleApi,
		private fetcher: Fetch = fetch
	) {}

	private async api<T>(chemin: string, params: Record<string, string>): Promise<T> {
		if (!this.cle) throw new ErreurSteam('STEAM_API_KEY n’est pas configurée.');
		const url = new URL(`https://api.steampowered.com/${chemin}`);
		url.searchParams.set('key', this.cle);
		for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
		let rep: Response;
		try {
			rep = await this.fetcher(url, { signal: AbortSignal.timeout(10000) });
		} catch {
			throw new ErreurSteam('Steam ne répond pas. Réessaie dans un moment.');
		}
		if (!rep.ok) throw new ErreurSteam(`Steam a répondu ${rep.status}.`);
		return (await rep.json()) as T;
	}

	async resoudre(entree: EntreeSteam): Promise<string | null> {
		if (entree.type === 'id64') return entree.valeur;
		const r = await this.api<{ response: { success: number; steamid?: string } }>(
			'ISteamUser/ResolveVanityURL/v1/',
			{ vanityurl: entree.valeur }
		);
		return r.response.success === 1 && r.response.steamid ? r.response.steamid : null;
	}

	async profil(steamId: string): Promise<{ nom: string; public: boolean } | null> {
		const r = await this.api<{
			response: { players: { personaname: string; communityvisibilitystate: number }[] };
		}>('ISteamUser/GetPlayerSummaries/v2/', { steamids: steamId });
		const p = r.response.players[0];
		return p ? { nom: p.personaname, public: p.communityvisibilitystate === 3 } : null;
	}

	/** Renvoie null si la bibliothèque est privée (« Détails des jeux » non public). */
	async jeuxPossedes(steamId: string): Promise<{ appid: number; name: string }[] | null> {
		const r = await this.api<{ response: { game_count?: number; games?: { appid: number; name: string }[] } }>(
			'IPlayerService/GetOwnedGames/v1/',
			{ steamid: steamId, include_appinfo: '1', include_played_free_games: '1' }
		);
		if (r.response.game_count === undefined) return null;
		return r.response.games ?? [];
	}

	async fiche(appid: number): Promise<FicheStore | null> {
		const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&l=french&cc=fr&filters=basic,categories,genres`;
		let rep: Response;
		try {
			rep = await this.fetcher(url, { signal: AbortSignal.timeout(10000) });
		} catch {
			return null;
		}
		if (!rep.ok) return null;
		const json = (await rep.json()) as Record<string, { success: boolean; data?: FicheStore }>;
		const e = json[String(appid)];
		return e?.success && e.data ? e.data : null;
	}
}

export interface FicheStore {
	name: string;
	is_free?: boolean;
	categories?: { id: number; description: string }[];
	genres?: { id: string; description: string }[];
}

// Catégories du Steam Store.
const COOP = [9, 38, 39, 48];
const VERSUS = [49, 36, 37, 47];
const MULTI = [1, 20, 24, 27, ...COOP, ...VERSUS];

export function analyserFiche(f: FicheStore) {
	const cats = new Set((f.categories ?? []).map((c) => c.id));
	const coop = COOP.some((c) => cats.has(c));
	const versus = VERSUS.some((c) => cats.has(c));
	const multijoueur = MULTI.some((c) => cats.has(c));
	return {
		mode: coop ? 'coop' : versus || multijoueur ? 'versus' : 'solo',
		multijoueur,
		gratuit: !!f.is_free,
		genres:
			(f.genres ?? [])
				.map((g) => g.description)
				.slice(0, 3)
				.join(' · ') || null
	} as const;
}

/** Nom court pour la roue : avant les deux-points, sinon tronqué. */
export function nomCourt(nom: string) {
	const avant = nom.split(/\s*[:–—-]\s+/)[0].trim();
	const base = avant.length >= 3 ? avant : nom;
	return base.length > 16 ? base.slice(0, 15).trimEnd() + '…' : base;
}

/** Importe la bibliothèque d'un membre. */
export async function synchroniserMembre(membreId: number, steam = new ClientSteam()) {
	const m = db().select().from(schema.membres).where(eq(schema.membres.id, membreId)).get();
	if (!m?.steamId) return { etat: 'non_liee' as const, total: 0 };
	const jeux = await steam.jeuxPossedes(m.steamId);
	const now = Date.now();
	if (jeux === null) {
		db()
			.update(schema.membres)
			.set({ etatSteam: 'privee', derniereSyncSteam: now })
			.where(eq(schema.membres.id, membreId))
			.run();
		return { etat: 'privee' as const, total: 0 };
	}
	db().transaction((tx) => {
		for (const j of jeux) {
			tx.insert(schema.jeuxSteam)
				.values({ steamAppId: j.appid, nom: j.name, nomCourt: nomCourt(j.name) })
				.onConflictDoUpdate({ target: schema.jeuxSteam.steamAppId, set: { nom: j.name } })
				.run();
		}
		tx.delete(schema.possessions).where(eq(schema.possessions.membreId, membreId)).run();
		for (const j of jeux) {
			tx.insert(schema.possessions).values({ membreId, steamAppId: j.appid, importeLe: now }).run();
		}
		tx.update(schema.membres)
			.set({ etatSteam: 'liee', derniereSyncSteam: now })
			.where(eq(schema.membres.id, membreId))
			.run();
	});
	return { etat: 'liee' as const, total: jeux.length };
}

let ficheEnCours: Promise<void> | null = null;

/**
 * Complète en arrière-plan les fiches Steam (mode, genres, gratuit) des jeux
 * possédés par au moins deux membres. Le Steam Store limite le débit : on en lit
 * au plus `max` par passage, une à la fois.
 */
export function completerFiches(max = 60, steam = new ClientSteam()) {
	ficheEnCours ??= (async () => {
		try {
			const aLire = db()
				.select({ id: schema.possessions.steamAppId })
				.from(schema.possessions)
				.innerJoin(schema.jeuxSteam, eq(schema.jeuxSteam.steamAppId, schema.possessions.steamAppId))
				.where(isNull(schema.jeuxSteam.detailsLe))
				.groupBy(schema.possessions.steamAppId)
				.having(sql`count(*) >= 2`)
				.orderBy(sql`count(*) desc`)
				.limit(max)
				.all();
			for (const { id } of aLire) {
				const f = await steam.fiche(id);
				const valeurs = f ? analyserFiche(f) : {};
				db()
					.update(schema.jeuxSteam)
					.set({ ...valeurs, detailsLe: Date.now() })
					.where(eq(schema.jeuxSteam.steamAppId, id))
					.run();
				await new Promise((r) => setTimeout(r, 1200));
			}
		} catch (e) {
			console.error('[steam] fiches :', e);
		} finally {
			ficheEnCours = null;
		}
	})();
	return ficheEnCours;
}

/** Synchronise tous les membres liés, puis complète les fiches. */
export async function synchroniserTout(steam = new ClientSteam()) {
	const liés = db()
		.select({ id: schema.membres.id })
		.from(schema.membres)
		.where(and(sql`${schema.membres.steamId} is not null`, inArray(schema.membres.etatSteam, ['liee', 'privee'])))
		.all();
	let erreurs = 0;
	for (const { id } of liés) {
		try {
			await synchroniserMembre(id, steam);
		} catch (e) {
			erreurs++;
			console.error('[steam] synchro membre', id, e);
		}
	}
	void completerFiches(60, steam);
	return { membres: liés.length, erreurs };
}

