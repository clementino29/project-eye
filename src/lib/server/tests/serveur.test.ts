import { describe, expect, it } from 'vitest';
import { chiffrer, dechiffrer, hacher } from '../crypto.ts';
import { masquerCle, permissionsDepuisMeta, versServeur, ClientPelican, ErreurPelican } from '../pelican.ts';
import { analyserFiche, lireEntreeSteam, nomCourt } from '../steam.ts';
import { assembler } from '../kuma.ts';
import { accesDepuisGroupes } from '../auth.ts';

const CLE = Buffer.alloc(32, 7).toString('base64');

describe('chiffrement des clés Pelican', () => {
	it('chiffre et déchiffre', () => {
		const paquet = chiffrer('pacc_secret', CLE);
		expect(paquet.startsWith('v1:')).toBe(true);
		expect(paquet).not.toContain('pacc_secret');
		expect(dechiffrer(paquet, CLE)).toBe('pacc_secret');
	});
	it('refuse une clé modifiée ou une mauvaise clé', () => {
		const paquet = chiffrer('pacc_secret', CLE);
		expect(() => dechiffrer(paquet, Buffer.alloc(32, 8).toString('base64'))).toThrow();
		const [v, iv, tag, d] = paquet.split(':');
		const abime = Buffer.from(d, 'base64');
		abime[0] ^= 1;
		expect(() => dechiffrer([v, iv, tag, abime.toString('base64')].join(':'), CLE)).toThrow();
	});
	it('exige une clé de 32 octets', () => {
		expect(() => chiffrer('x', Buffer.alloc(16).toString('base64'))).toThrow(/32 octets/);
	});
	it('hache les jetons de session', () => {
		expect(hacher('abc')).toHaveLength(64);
	});
});

describe('Pelican', () => {
	it('lit les permissions', () => {
		expect(permissionsDepuisMeta({ is_server_owner: true })).toEqual({ demarrer: true, arreter: true, redemarrer: true });
		expect(permissionsDepuisMeta({ user_permissions: ['control.start'] })).toEqual({ demarrer: true, arreter: false, redemarrer: false });
		expect(permissionsDepuisMeta({ user_permissions: ['control.*'] }).redemarrer).toBe(true);
		expect(permissionsDepuisMeta(undefined)).toEqual({ demarrer: false, arreter: false, redemarrer: false });
	});

	it("convertit un serveur et choisit l'adresse par défaut", () => {
		const s = versServeur({
			identifier: 'abcd1234',
			uuid: 'u',
			name: 'Minecraft',
			status: 'suspended',
			limits: { memory: 4096, cpu: 200, disk: 10000 },
			relationships: {
				allocations: {
					data: [
						{ attributes: { ip: '10.0.0.1', port: 25566 } },
						{ attributes: { ip: '10.0.0.1', ip_alias: 'mc.exemple.fr', port: 25565, is_default: true } }
					]
				}
			}
		});
		expect(s.adresse).toBe('mc.exemple.fr:25565');
		expect(s.suspendu).toBe(true);
		expect(s.limites.memoireMo).toBe(4096);
	});

	it('masque une clé', () => {
		expect(masquerCle('pacc_abcdefghijklmnop')).toBe('pacc_••••••••••••mnop');
		expect(masquerCle('abcdefghijklmnop')).toBe('••••••••••••mnop');
	});

	it("appelle l'API client avec la clé du membre", async () => {
		const appels: [string, RequestInit][] = [];
		const faux = (async (url: string, init: RequestInit) => {
			appels.push([url, init]);
			return new Response(null, { status: 204 });
		}) as unknown as typeof fetch;
		await new ClientPelican('pacc_x', 'https://panel.exemple.fr', faux).alimentation('abcd1234', 'restart');
		expect(appels[0][0]).toBe('https://panel.exemple.fr/api/client/servers/abcd1234/power');
		expect((appels[0][1].headers as Record<string, string>).Authorization).toBe('Bearer pacc_x');
		expect(appels[0][1].body).toBe('{"signal":"restart"}');
	});

	it('signale un refus de Pelican', async () => {
		const faux = (async () => new Response('{}', { status: 403 })) as unknown as typeof fetch;
		await expect(new ClientPelican('k', 'https://p', faux).compte()).rejects.toBeInstanceOf(ErreurPelican);
	});
});

describe('Steam', () => {
	it('lit une URL de profil ou un SteamID64', () => {
		expect(lireEntreeSteam('76561198000000001')).toEqual({ type: 'id64', valeur: '76561198000000001' });
		expect(lireEntreeSteam('https://steamcommunity.com/profiles/76561198000000001/')).toEqual({ type: 'id64', valeur: '76561198000000001' });
		expect(lireEntreeSteam('steamcommunity.com/id/leamartin')).toEqual({ type: 'pseudo', valeur: 'leamartin' });
		expect(lireEntreeSteam('https://exemple.fr/id/x')).toBeNull();
	});

	it('déduit le mode depuis les catégories du Store', () => {
		expect(analyserFiche({ name: 'A', categories: [{ id: 1, description: '' }, { id: 38, description: '' }] }).mode).toBe('coop');
		expect(analyserFiche({ name: 'B', categories: [{ id: 49, description: '' }] }).mode).toBe('versus');
		const solo = analyserFiche({ name: 'C', categories: [{ id: 2, description: '' }], is_free: true, genres: [{ id: '1', description: 'Action' }] });
		expect(solo).toEqual({ mode: 'solo', multijoueur: false, gratuit: true, genres: 'Action' });
	});

	it('raccourcit les noms pour la roue', () => {
		expect(nomCourt('Portal 2')).toBe('Portal 2');
		expect(nomCourt('Warhammer 40,000: Darktide')).toBe('Warhammer 40,000');
		expect(nomCourt('Tom Clancy’s Rainbow Six Siege')).toBe('Tom Clancy’s Ra…');
		expect(nomCourt('Halo: The Master Chief Collection')).toBe('Halo');
	});
});

describe('Uptime Kuma', () => {
	it('assemble la page de statut', () => {
		const s = assembler(
			{ config: { title: 'Bande' }, publicGroupList: [{ name: 'Jeux', monitorList: [{ id: 1, name: 'Minecraft' }, { id: 2, name: 'Valheim' }] }] },
			{ heartbeatList: { 1: [{ status: 0 }, { status: 1, ping: 30 }] }, uptimeList: { '1_24': 0.99, '1_720': 0.95 } },
			'https://status/status/bande'
		);
		expect(s.groupes[0].services[0]).toMatchObject({ nom: 'Minecraft', etat: 'en_ligne', dispo24h: 0.99, ping: 30, historique: ['en_panne', 'en_ligne'] });
		expect(s.groupes[0].services[1]).toMatchObject({ etat: 'inconnu', dispo24h: null, historique: [] });
		expect(s.incident).toBeNull();
	});
});

describe('accès Authentik', () => {
	it('donne le rôle selon les groupes', () => {
		expect(accesDepuisGroupes(['hub-admins'])).toEqual({ autorise: true, role: 'admin' });
		expect(accesDepuisGroupes(['autre', 'hub-membres'])).toEqual({ autorise: true, role: 'membre' });
		expect(accesDepuisGroupes(['autre'])).toEqual({ autorise: false });
		expect(accesDepuisGroupes(undefined)).toEqual({ autorise: false });
	});
});
