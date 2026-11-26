// Page Status : lecture de la page de statut publique d'Uptime Kuma (API JSON).
import { config } from './config.ts';
import { VUES_SERVICE, vueService, type EtatGlobal } from '../libelles.ts';

type Fetch = typeof fetch;

export type EtatService = 'en_ligne' | 'en_panne' | 'en_attente' | 'maintenance' | 'inconnu';

export interface ServiceKuma {
	id: number;
	nom: string;
	etat: EtatService;
	dispo24h: number | null;
	dispo30j: number | null;
	message: string | null;
	ping: number | null;
	/** Derniers battements, du plus ancien au plus récent. */
	historique: EtatService[];
}

export interface StatutKuma {
	titre: string;
	groupes: { nom: string; services: ServiceKuma[] }[];
	incident: { titre: string; contenu: string; style: string } | null;
	maintenances: { titre: string; description: string }[];
	urlPage: string;
	lueLe: number;
}

const ETATS: Record<number, EtatService> = { 0: 'en_panne', 1: 'en_ligne', 2: 'en_attente', 3: 'maintenance' };

interface ReponsePage {
	config?: { title?: string };
	incident?: { title?: string; content?: string; style?: string } | null;
	publicGroupList?: { name: string; monitorList: { id: number; name: string }[] }[];
	maintenanceList?: { title?: string; description?: string }[];
}

interface ReponseBattements {
	heartbeatList?: Record<string, { status: number; msg?: string; ping?: number | null }[]>;
	uptimeList?: Record<string, number>;
}

export function assembler(page: ReponsePage, battements: ReponseBattements, urlPage: string): StatutKuma {
	const service = (m: { id: number; name: string }): ServiceKuma => {
		const liste = battements.heartbeatList?.[String(m.id)] ?? [];
		const dernier = liste[liste.length - 1];
		return {
			id: m.id,
			nom: m.name,
			etat: dernier ? (ETATS[dernier.status] ?? 'inconnu') : 'inconnu',
			dispo24h: battements.uptimeList?.[`${m.id}_24`] ?? null,
			dispo30j: battements.uptimeList?.[`${m.id}_720`] ?? null,
			message: dernier?.msg || null,
			ping: dernier?.ping ?? null,
			historique: liste.slice(-40).map((x) => ETATS[x.status] ?? 'inconnu')
		};
	};
	return {
		titre: page.config?.title ?? 'Statut',
		groupes: (page.publicGroupList ?? []).map((g) => ({ nom: g.name, services: g.monitorList.map(service) })),
		incident: page.incident?.title
			? { titre: page.incident.title, contenu: page.incident.content ?? '', style: page.incident.style ?? 'warning' }
			: null,
		maintenances: (page.maintenanceList ?? []).map((m) => ({
			titre: m.title ?? 'Maintenance',
			description: m.description ?? ''
		})),
		urlPage,
		lueLe: Date.now()
	};
}

let cache: { valeur: StatutKuma; expire: number } | undefined;

export async function lireStatut(fetcher: Fetch = fetch): Promise<StatutKuma | null> {
	const { url, slug } = config.kuma;
	if (!url || !slug) return null;
	if (cache && cache.expire > Date.now()) return cache.valeur;
	const opts = { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } };
	const s = encodeURIComponent(slug);
	const [p, b] = await Promise.all([
		fetcher(`${url}/api/status-page/${s}`, opts),
		fetcher(`${url}/api/status-page/heartbeat/${s}`, opts)
	]);
	if (!p.ok || !b.ok) throw new Error(`Uptime Kuma a répondu ${p.ok ? b.status : p.status}.`);
	const valeur = assembler(await p.json(), await b.json(), `${url}/status/${s}`);
	cache = { valeur, expire: Date.now() + 30_000 };
	return valeur;
}

/** Résumé de tous les services : une panne l'emporte sur un ralentissement. */
export function etatGlobal(statut: StatutKuma | null): EtatGlobal | null {
	const services = statut?.groupes.flatMap((g) => g.services) ?? [];
	if (!services.length) return null;
	const etats = services.map((s) => VUES_SERVICE[vueService(s.etat, s.ping)].global);
	if (etats.includes('panne')) return 'panne';
	if (etats.includes('degrade')) return 'degrade';
	return 'ok';
}

/** Après un échec, le menu n'attend plus Uptime Kuma pendant 30 s. */
let echecJusqua = 0;

/** Pour le menu : l'état global sans jamais faire échouer ni ralentir longtemps la page (1,5 s au plus). */
export async function etatGlobalRapide(fetcher: Fetch = fetch): Promise<EtatGlobal | null> {
	if (Date.now() < echecJusqua && !(cache && cache.expire > Date.now())) return null;
	let minuteur: ReturnType<typeof setTimeout> | undefined;
	try {
		const statut = await Promise.race([
			lireStatut(fetcher),
			new Promise<'trop_long'>((r) => (minuteur = setTimeout(() => r('trop_long'), 1500)))
		]);
		if (statut === 'trop_long') {
			echecJusqua = Date.now() + 30_000;
			return null;
		}
		return etatGlobal(statut);
	} catch {
		echecJusqua = Date.now() + 30_000;
		return null;
	} finally {
		clearTimeout(minuteur);
	}
}
