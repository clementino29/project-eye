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
	/** Nombre de sauvegardes autorisées par Sakura Panel (0 = aucune). */
	sauvegardesMax: number;
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
	/** Lire la console (connexion websocket). */
	console: boolean;
	/** Envoyer une commande à la console. */
	commande: boolean;
	sauvegardes: { voir: boolean; creer: boolean; telecharger: boolean };
}

export const SANS_PERMISSION: Permissions = {
	demarrer: false,
	arreter: false,
	redemarrer: false,
	console: false,
	commande: false,
	sauvegardes: { voir: false, creer: false, telecharger: false }
};

export interface Sauvegarde {
	uuid: string;
	nom: string;
	reussie: boolean;
	verrouillee: boolean;
	octets: number;
	creeeLe: number;
	/** Vide tant que la sauvegarde est en cours. */
	termineeLe: number | null;
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

	async commande(identifiant: string, commande: string): Promise<void> {
		await this.appel(`/servers/${encodeURIComponent(identifiant)}/command`, {
			method: 'POST',
			body: JSON.stringify({ command: commande })
		});
	}

	/** Jeton et adresse du websocket de Wings, qui seul donne la console. */
	async websocket(identifiant: string): Promise<{ jeton: string; adresse: string }> {
		const r = await this.appel<{ data: { token: string; socket: string } }>(`/servers/${encodeURIComponent(identifiant)}/websocket`);
		return { jeton: r.data.token, adresse: r.data.socket };
	}

	/**
	 * Dernières lignes de la console : on se connecte au websocket de Wings, on demande
	 * l'historique (« send logs ») et on garde ce qui arrive pendant un court instant.
	 */
	async console(identifiant: string, { attente = 1200, max = 200, Socket = WebSocket } = {}): Promise<string[]> {
		const { jeton, adresse } = await this.websocket(identifiant);
		const lignes: string[] = [];
		await new Promise<void>((fini, echec) => {
			let ws: WebSocket;
			try {
				// Wings n'accepte que l'origine du panel.
				ws = new Socket(adresse, { headers: { Origin: this.base ?? '' } } as never);
			} catch {
				return echec(new ErreurPelican('Console injoignable.', 503));
			}
			let minuteur: ReturnType<typeof setTimeout> | undefined;
			const fermer = (e?: Error) => {
				clearTimeout(minuteur);
				clearTimeout(garde);
				try {
					ws.close();
				} catch {
					// déjà fermé
				}
				if (e) echec(e);
				else fini();
			};
			const garde = setTimeout(() => fermer(lignes.length ? undefined : new ErreurPelican('La console ne répond pas.', 504)), attente + 5000);
			ws.onopen = () => ws.send(JSON.stringify({ event: 'auth', args: [jeton] }));
			ws.onerror = () => fermer(new ErreurPelican('Console injoignable.', 503));
			ws.onmessage = (m) => {
				let msg: { event?: string; args?: unknown[] };
				try {
					msg = JSON.parse(String(m.data));
				} catch {
					return;
				}
				if (msg.event === 'auth success') {
					ws.send(JSON.stringify({ event: 'send logs', args: [null] }));
					minuteur = setTimeout(() => fermer(), attente);
				} else if (msg.event === 'console output' || msg.event === 'install output' || msg.event === 'daemon message') {
					for (const a of msg.args ?? []) for (const l of String(a).split(/\r?\n/)) lignes.push(nettoyerLigne(l));
				} else if (msg.event === 'jwt error' || msg.event === 'token expired') {
					fermer(new ErreurPelican('Sakura Panel refuse l’accès à la console.', 403));
				}
			};
		});
		return lignes.slice(-max);
	}

	async sauvegardes(identifiant: string): Promise<Sauvegarde[]> {
		const r = await this.appel<{ data: { attributes: AttributsSauvegarde }[] }>(`/servers/${encodeURIComponent(identifiant)}/backups?per_page=50`);
		return r.data.map((d) => versSauvegarde(d.attributes)).sort((a, b) => b.creeeLe - a.creeeLe);
	}

	async creerSauvegarde(identifiant: string, nom: string): Promise<Sauvegarde> {
		const r = await this.appel<{ attributes: AttributsSauvegarde }>(`/servers/${encodeURIComponent(identifiant)}/backups`, {
			method: 'POST',
			body: JSON.stringify({ name: nom })
		});
		return versSauvegarde(r.attributes);
	}

	/** Lien de téléchargement signé (valable quelques minutes), fourni par Wings. */
	async lienSauvegarde(identifiant: string, uuid: string): Promise<string> {
		const r = await this.appel<{ attributes: { url: string } }>(
			`/servers/${encodeURIComponent(identifiant)}/backups/${encodeURIComponent(uuid)}/download`
		);
		return r.attributes.url;
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
	const a = (droit: string) => tout || p.includes(droit) || p.includes(`${droit.split('.')[0]}.*`);
	return {
		demarrer: a('control.start'),
		arreter: a('control.stop'),
		redemarrer: a('control.restart'),
		console: a('websocket.connect'),
		commande: a('control.console'),
		sauvegardes: { voir: a('backup.read'), creer: a('backup.create'), telecharger: a('backup.download') }
	};
}

/** Retire les codes de couleur ANSI des lignes de console. */
export const nettoyerLigne = (l: string) =>
	// eslint-disable-next-line no-control-regex
	l.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\u001b[@-_]/g, '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');

interface AttributsSauvegarde {
	uuid: string;
	name: string;
	is_successful?: boolean;
	is_locked?: boolean;
	bytes?: number;
	created_at: string;
	completed_at?: string | null;
}

export function versSauvegarde(a: AttributsSauvegarde): Sauvegarde {
	return {
		uuid: a.uuid,
		nom: a.name,
		reussie: !!a.is_successful,
		verrouillee: !!a.is_locked,
		octets: a.bytes ?? 0,
		creeeLe: Date.parse(a.created_at) || 0,
		termineeLe: a.completed_at ? Date.parse(a.completed_at) || null : null
	};
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
	feature_limits?: { backups?: number };
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
		limites: { memoireMo: a.limits?.memory ?? 0, cpu: a.limits?.cpu ?? 0, disqueMo: a.limits?.disk ?? 0 },
		sauvegardesMax: a.feature_limits?.backups ?? 0
	};
}

/** Affiche une clé masquée : préfixe éventuel (« pacc_ »), puis les 4 derniers caractères. */
export function masquerCle(cle: string) {
	const i = cle.indexOf('_');
	return (i > 0 && i < 8 ? cle.slice(0, i + 1) : '') + '••••••••••••' + cle.slice(-4);
}
