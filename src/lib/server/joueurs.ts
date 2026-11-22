// Joueurs connectés sur un serveur de jeu, en interrogeant le jeu lui-même (GameDig).
type Resultat = { connectes: number; max: number | null; noms: string[] } | null;

const cache = new Map<string, { valeur: Resultat; expire: number }>();

export async function joueursConnectes(type: string, adresse: string): Promise<Resultat> {
	const cleCache = `${type}@${adresse}`;
	const c = cache.get(cleCache);
	if (c && c.expire > Date.now()) return c.valeur;
	const [host, port] = separerAdresse(adresse);
	let valeur: Resultat = null;
	try {
		const { GameDig } = await import('gamedig');
		const r = await GameDig.query({ type, host, port, maxRetries: 1, socketTimeout: 2000, attemptTimeout: 4000 });
		valeur = {
			connectes: r.numplayers ?? r.players.length,
			max: r.maxplayers ?? null,
			noms: r.players.map((p: { name?: string }) => p.name).filter((n): n is string => !!n)
		};
	} catch {
		valeur = null;
	}
	cache.set(cleCache, { valeur, expire: Date.now() + 15_000 });
	return valeur;
}

export function separerAdresse(adresse: string): [string, number | undefined] {
	const m = adresse.match(/^\[?([^\]]+?)\]?(?::(\d+))?$/);
	if (!m) return [adresse, undefined];
	return [m[1], m[2] ? Number(m[2]) : undefined];
}
