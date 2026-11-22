// Client de l'API client de Pelican (Sakura Panel), utilisé avec la clé du membre connecté :
// ses permissions Pelican décident de ce qu'il peut voir et faire.
import { config } from './config.ts';

export type Signal = 'start' | 'stop' | 'restart';
export type EtatServeur = 'running' | 'offline' | 'starting' | 'stopping' | 'inconnu';

export interface ServeurPelican {
	identifiant: string;
	uuid: string;
	nom: string;
	description: string;
	proprietaire: boolean;
	suspendu: boolean;
	enInstallation: boolean;
	adresse: string | null;
	limites: { memoireMo: number; cpu: number; disqueMo: number };
}

export interface RessourcesServeur {
	etat: EtatServeur;
	memoireOctets: number;
	cpuPourcent: number;
	disqueOctets: number;
	dureeMs: number;
}

export interface Permissions {
	demarrer: boolean;
	arreter: boolean;
	redemarrer: boolean;
}

export class ErreurPelican extends Error {
	constructor(
		message: string,
		public statut: number
	) {
		super(message);
	}
}

type Fetch = typeof fetch;

export class ClientPelican {
	constructor(
		private cle: string,
		private base = config.pelican.url,
		private fetcher: Fetch = fetch
	) {}

	private async appel<T>(chemin: string, init: RequestInit = {}): Promise<T> {
		if (!this.base) throw new ErreurPelican('PELICAN_URL n’est pas configurée.', 500);
		let rep: Response;
		try {
			rep = await this.fetcher(`${this.base}/api/client${chemin}`, {
				...init,
				headers: {
					Authorization: `Bearer ${this.cle}`,
					Accept: 'application/json',
					'Content-Type': 'application/json',
					...init.headers
				},
				signal: init.signal ?? AbortSignal.timeout(8000)
			});
		} catch {
			throw new ErreurPelican('Sakura Panel ne répond pas.', 503);
		}
		if (rep.status === 401 || rep.status === 403) {
			throw new ErreurPelican('Sakura Panel refuse cette clé ou cette action.', rep.status);
		}
		if (!rep.ok) throw new ErreurPelican(`Sakura Panel a répondu ${rep.status}.`, rep.status);
		if (rep.status === 204) return undefined as T;
		const texte = await rep.text();
		return (texte ? JSON.parse(texte) : undefined) as T;
	}

	/** Vérifie la clé : renvoie le nom du compte Pelican. */
	async compte(): Promise<{ username: string; email: string; admin: boolean }> {
		const r = await this.appel<{ attributes: { username: string; email: string; admin: boolean } }>('/account');
		return r.attributes;
	}

	async serveurs(): Promise<ServeurPelican[]> {
		const tous: ServeurPelican[] = [];
		for (let page = 1; page <= 10; page++) {
			const r = await this.appel<ReponseListe>(`/?page=${page}&per_page=50`);
			tous.push(...r.data.map((s) => versServeur(s.attributes)));
			const pages = r.meta?.pagination?.total_pages ?? 1;
			if (page >= pages) break;
		}
		return tous;
	}

	async ressources(identifiant: string): Promise<RessourcesServeur> {
		const r = await this.appel<{ attributes: AttributsRessources }>(
			`/servers/${encodeURIComponent(identifiant)}/resources`
		);
		const a = r.attributes;
		return {
			etat: (['running', 'offline', 'starting', 'stopping'] as const).includes(a.current_state as never)
				? (a.current_state as EtatServeur)
				: 'inconnu',
			memoireOctets: a.resources?.memory_bytes ?? 0,
			cpuPourcent: a.resources?.cpu_absolute ?? 0,
			disqueOctets: a.resources?.disk_bytes ?? 0,
			dureeMs: a.resources?.uptime ?? 0
		};
	}

	async permissions(identifiant: string): Promise<Permissions> {
		const r = await this.appel<{ meta?: { is_server_owner?: boolean; user_permissions?: string[] } }>(
			`/servers/${encodeURIComponent(identifiant)}`
		);
		return permissionsDepuisMeta(r.meta);
	}

	async alimentation(identifiant: string, signal: Signal): Promise<void> {
		await this.appel(`/servers/${encodeURIComponent(identifiant)}/power`, {
			method: 'POST',
			body: JSON.stringify({ signal })
		});
	}
}

export function permissionsDepuisMeta(meta?: { is_server_owner?: boolean; user_permissions?: string[] }): Permissions {
	const p = meta?.user_permissions ?? [];
	const tout = !!meta?.is_server_owner || p.includes('*');
	const a = (droit: string) => tout || p.includes(droit) || p.includes('control.*');
	return { demarrer: a('control.start'), arreter: a('control.stop'), redemarrer: a('control.restart') };
}

export function urlServeurPelican(identifiant: string) {
	const modele = config.pelican.modeleUrlServeur;
	return modele ? modele.replace('{id}', encodeURIComponent(identifiant)) : null;
}

interface AttributsServeur {
	identifier: string;
	uuid: string;
	name: string;
	description?: string | null;
	server_owner?: boolean;
	is_suspended?: boolean;
	is_installing?: boolean;
	status?: string | null;
	limits?: { memory?: number; cpu?: number; disk?: number };
	relationships?: {
		allocations?: {
			data?: { attributes: { ip: string; ip_alias?: string | null; port: number; is_default?: boolean } }[];
		};
	};
}

interface ReponseListe {
	data: { attributes: AttributsServeur }[];
	meta?: { pagination?: { total_pages?: number } };
}

interface AttributsRessources {
	current_state: string;
	resources?: {
		memory_bytes?: number;
		cpu_absolute?: number;
		disk_bytes?: number;
		uptime?: number;
	};
}

export function versServeur(a: AttributsServeur): ServeurPelican {
	const allocations = a.relationships?.allocations?.data?.map((d) => d.attributes) ?? [];
	const defaut = allocations.find((x) => x.is_default) ?? allocations[0];
	return {
		identifiant: a.identifier,
		uuid: a.uuid,
		nom: a.name,
		description: a.description ?? '',
		proprietaire: !!a.server_owner,
		suspendu: !!a.is_suspended || a.status === 'suspended',
		enInstallation: !!a.is_installing || a.status === 'installing',
		adresse: defaut ? `${defaut.ip_alias || defaut.ip}:${defaut.port}` : null,
		limites: { memoireMo: a.limits?.memory ?? 0, cpu: a.limits?.cpu ?? 0, disqueMo: a.limits?.disk ?? 0 }
	};
}

/** Affiche une clé masquée : préfixe éventuel (« pacc_ »), puis les 4 derniers caractères. */
export function masquerCle(cle: string) {
	const i = cle.indexOf('_');
	return (i > 0 && i < 8 ? cle.slice(0, i + 1) : '') + '••••••••••••' + cle.slice(-4);
}
