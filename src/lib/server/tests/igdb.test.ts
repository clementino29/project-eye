import { describe, expect, it } from 'vitest';
import { ClientIgdb, texteRecherche, versJeu } from '../igdb.ts';

describe('IGDB', () => {
	it('convertit un jeu et préfère une illustration large pour la bannière', () => {
		const j = versJeu({
			id: 7,
			name: 'Halo 3',
			first_release_date: 1190678400,
			cover: { image_id: 'co1' },
			artworks: [{ image_id: 'ar1' }],
			collections: [{ name: 'Halo' }]
		});
		expect(j).toEqual({
			igdbId: 7,
			titre: 'Halo 3',
			annee: 2007,
			serie: 'Halo',
			jaquette: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1.jpg',
			banniere: 'https://images.igdb.com/igdb/image/upload/t_1080p/ar1.jpg'
		});
		expect(versJeu({ id: 8, name: 'X', cover: { image_id: 'co2' } }).banniere).toContain('t_cover_big/co2');
		expect(versJeu({ id: 9, name: 'Y', franchises: [{ name: 'F' }] })).toMatchObject({ serie: 'F', annee: null, banniere: null });
	});

	it('nettoie le texte de recherche', () => {
		expect(texteRecherche(' Halo "3"; \\ ')).toBe('Halo 3 ;');
	});

	it('demande un jeton Twitch, le réutilise et le renouvelle s’il est refusé', async () => {
		const appels: string[] = [];
		let jetons = 0;
		let refus = true;
		const faux = (async (url: string, init: RequestInit) => {
			appels.push(url);
			if (url.startsWith('https://id.twitch.tv')) {
				jetons++;
				return Response.json({ access_token: `j${jetons}`, expires_in: 3600 });
			}
			const auth = (init.headers as Record<string, string>).Authorization;
			if (refus && auth === 'Bearer j1') {
				refus = false;
				return new Response('', { status: 401 });
			}
			expect(String(init.body)).toContain('search "halo";');
			return Response.json([{ id: 1, name: 'Halo' }]);
		}) as unknown as typeof fetch;
		const c = new ClientIgdb('id', 'secret', faux);
		expect((await c.chercher('halo')).map((j) => j.titre)).toEqual(['Halo']);
		expect(jetons).toBe(2);
		// Deuxième recherche identique : servie par le cache.
		await c.chercher('Halo');
		expect(appels.filter((u) => u.includes('api.igdb.com'))).toHaveLength(2);
		expect(await c.chercher('h')).toEqual([]);
	});
});
