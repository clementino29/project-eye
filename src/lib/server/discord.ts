// Annonces sur le serveur Discord du groupe, par un webhook (DISCORD_WEBHOOK_URL).
// Une annonce ratée ne bloque jamais le hub : elle est seulement notée dans les journaux.
import { config } from './config.ts';

type Fetch = typeof fetch;
let envoyeur: Fetch = (...a) => fetch(...a);

/** Pour les tests : remplace l'appel réseau. */
export function remplacerEnvoiDiscord(f: Fetch) {
	envoyeur = f;
}

export const COULEURS = { demarre: 0x3fb37f, partie: 0xf0a868, soiree: 0x6c8ebf } as const;

export interface Annonce {
	titre: string;
	texte?: string;
	/** Adresse dans le hub (« /panel ») ou complète. */
	lien?: string;
	couleur?: number;
	champs?: { nom: string; valeur: string; enLigne?: boolean }[];
}

/** Les noms viennent des membres : on neutralise la mise en forme Discord et les mentions. */
export const sansMiseEnForme = (v: string) => v.replace(/([\\*_~`|>#[\]()])/g, '\\$1').replace(/@/g, '@\u200b');

const lienComplet = (l: string) => (/^https?:\/\//.test(l) ? l : `${config.origine}${l.startsWith('/') ? '' : '/'}${l}`);

function versEmbed(a: Annonce) {
	return {
		title: a.titre.slice(0, 256),
		...(a.texte ? { description: a.texte.slice(0, 4000) } : {}),
		...(a.lien ? { url: lienComplet(a.lien) } : {}),
		color: a.couleur ?? COULEURS.partie,
		...(a.champs?.length ? { fields: a.champs.slice(0, 25).map((c) => ({ name: c.nom.slice(0, 256), value: c.valeur.slice(0, 1024) || '—', inline: !!c.enLigne })) } : {})
	};
}

/**
 * Envoie une ou plusieurs annonces (10 au plus par message, la limite de Discord).
 * Renvoie le nombre d'annonces envoyées : 0 si le webhook n'est pas réglé ou si Discord refuse.
 */
export async function annoncer(annonces: Annonce | Annonce[]): Promise<number> {
	const liste = [annonces].flat();
	const webhook = config.discord.webhook;
	if (!webhook || !liste.length) return 0;
	let envoyees = 0;
	for (let i = 0; i < liste.length; i += 10) {
		const paquet = liste.slice(i, i + 10);
		try {
			const rep = await envoyeur(webhook, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				// Aucune mention (@everyone, rôles, membres) ne peut partir d'un nom saisi sur le hub.
				body: JSON.stringify({ username: 'Nohriancons', embeds: paquet.map(versEmbed), allowed_mentions: { parse: [] } }),
				signal: AbortSignal.timeout(8000)
			});
			if (!rep.ok) {
				console.error('[discord] annonce refusée :', rep.status);
				continue;
			}
			envoyees += paquet.length;
		} catch (e) {
			console.error('[discord] annonce impossible :', e instanceof Error ? e.message : e);
		}
	}
	return envoyees;
}

// Un serveur démarré deux fois de suite (double clic, redémarrage raté) n'est annoncé qu'une fois.
const derniersDemarrages = new Map<string, number>();
const ECART_DEMARRAGES = 10 * 60_000;

/** « Serveur Minecraft démarré par Léa », sans adresse de connexion. */
export function annoncerDemarrage(s: { id: string; nom: string; jeu?: string | null; par: string }, maintenant = Date.now()) {
	const avant = derniersDemarrages.get(s.id);
	if (avant && maintenant - avant < ECART_DEMARRAGES) return Promise.resolve(0);
	derniersDemarrages.set(s.id, maintenant);
	return annoncer({
		titre: `▶️ ${sansMiseEnForme(s.nom)} est démarré`,
		texte: `Démarré par ${sansMiseEnForme(s.par)} depuis le hub${s.jeu ? `, pour jouer à ${sansMiseEnForme(s.jeu)}` : ''}.`,
		lien: '/panel',
		couleur: COULEURS.demarre
	});
}

/** Pour les tests. */
export function oublierDemarrages() {
	derniersDemarrages.clear();
}
