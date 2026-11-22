// Recherche de jeux sur IGDB (titre exact, année, série, images).
// L'API IGDB s'utilise avec un jeton d'application Twitch (identifiants client).
import { config } from './config.ts';

type Fetch = typeof fetch;

export interface JeuIgdb {
	igdbId: number;
	titre: string;
	annee: number | null;
	serie: string | null;
	/** Jaquette au format portrait. */
	jaquette: string | null;
	/** Image large (16:9) pour les cartes : illustration, sinon capture, sinon la jaquette. */
	banniere: string | null;
}

interface ReponseJeu {
	id: number;
	name: string;
	first_release_date?: number;
	cover?: { image_id: string };
	artworks?: { image_id: string }[];
	screenshots?: { image_id: string }[];
	collections?: { name: string }[];
	franchises?: { name: string }[];
	franchise?: { name: string };
}

export const imageIgdb = (id: string, taille: 't_cover_big' | 't_1080p' | 't_screenshot_big' | 't_thumb') =>
	`https://images.igdb.com/igdb/image/upload/${taille}/${id}.jpg`;

export function versJeu(j: ReponseJeu): JeuIgdb {
	const large = j.artworks?.[0]?.image_id ?? j.screenshots?.[0]?.image_id;
	const jaquette = j.cover ? imageIgdb(j.cover.image_id, 't_cover_big') : null;
	return {
		igdbId: j.id,
		titre: j.name,
		annee: j.first_release_date ? new Date(j.first_release_date * 1000).getUTCFullYear() : null,
		serie: j.collections?.[0]?.name ?? j.franchise?.name ?? j.franchises?.[0]?.name ?? null,
		jaquette,
		banniere: large ? imageIgdb(large, 't_1080p') : jaquette
	};
}

/** Texte de recherche sûr pour le langage de requête d'IGDB (Apicalypse). */
export const texteRecherche = (q: string) => q.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

export class ErreurIgdb extends Error {}

export class ClientIgdb {
	private jeton: { valeur: string; expire: number } | null = null;
	private cache = new Map<string, { valeur: JeuIgdb[]; expire: number }>();

	constructor(
		private clientId = config.igdb.clientId,
		private secret = config.igdb.secret,
		private fetcher: Fetch = fetch
	) {}

	private async jetonValide() {
		if (this.jeton && this.jeton.expire > Date.now()) return this.jeton.valeur;
		if (!this.clientId || !this.secret) throw new ErreurIgdb('IGDB n’est pas configuré.');
		const corps = new URLSearchParams({ client_id: this.clientId, client_secret: this.secret, grant_type: 'client_credentials' });
		const rep = await this.fetcher('https://id.twitch.tv/oauth2/token', { method: 'POST', body: corps, signal: AbortSignal.timeout(8000) }).catch(() => null);
		if (!rep?.ok) throw new ErreurIgdb('Twitch refuse les identifiants IGDB.');
		const r = (await rep.json()) as { access_token: string; expires_in: number };
		// Marge d'une minute avant l'expiration annoncée.
		this.jeton = { valeur: r.access_token, expire: Date.now() + (r.expires_in - 60) * 1000 };
		return this.jeton.valeur;
	}

	async chercher(brut: string): Promise<JeuIgdb[]> {
		const q = texteRecherche(brut);
		if (q.length < 2) return [];
		const cle = q.toLowerCase();
		const enCache = this.cache.get(cle);
		if (enCache && enCache.expire > Date.now()) return enCache.valeur;

		const requete = [
			`search "${q}";`,
			'fields name,first_release_date,cover.image_id,artworks.image_id,screenshots.image_id,collections.name,franchises.name,franchise.name;',
			// Écarte les éditions et versions d'un même jeu.
			'where version_parent = null;',
			'limit 8;'
		].join(' ');
		const envoyer = async () =>
			this.fetcher('https://api.igdb.com/v4/games', {
				method: 'POST',
				headers: { 'Client-ID': this.clientId!, Authorization: `Bearer ${await this.jetonValide()}`, Accept: 'application/json' },
				body: requete,
				signal: AbortSignal.timeout(8000)
			}).catch(() => null);

		let rep = await envoyer();
		if (rep?.status === 401) {
			this.jeton = null; // jeton révoqué : on en redemande un
			rep = await envoyer();
		}
		if (!rep) throw new ErreurIgdb('IGDB ne répond pas.');
		if (!rep.ok) throw new ErreurIgdb(`IGDB a répondu ${rep.status}.`);
		const valeur = ((await rep.json()) as ReponseJeu[]).map(versJeu);
		if (this.cache.size > 200) this.cache.clear();
		this.cache.set(cle, { valeur, expire: Date.now() + 10 * 60_000 });
		return valeur;
	}
}

let partage: ClientIgdb | undefined;
/** Client partagé, pour garder le jeton et le cache entre les requêtes. */
export const igdb = () => (partage ??= new ClientIgdb());
