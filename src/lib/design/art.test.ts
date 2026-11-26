import { describe, expect, it } from 'vitest';
import { artJeu, artServeur, fondImage, hueOf, posterOf } from './art.ts';

describe('jaquettes dessinées', () => {
	it('reprend la teinte et l’icône des jeux connus, préfixe accepté', () => {
		expect(artJeu('Halo 3')).toMatchObject({ hue: 145, icon: 'crosshair' });
		expect(artJeu('Civilization VI')).toMatchObject({ hue: 45, icon: 'landmark' });
		expect(artServeur('05135d01', 'Oxycraft')).toMatchObject({ hue: 120, icon: 'pickaxe' });
	});
	it('donne toujours la même jaquette à un nom inconnu', () => {
		expect(artJeu('Jeu inconnu')).toEqual(artJeu('jeu inconnu'));
		expect(artJeu('Jeu inconnu').hue).toBe(hueOf('jeu inconnu') % 360);
		expect(posterOf('Arcane')).toMatch(/^linear-gradient\(160deg/);
	});
	it('pose une image par-dessus le dégradé', () => {
		const art = artJeu('Hades');
		expect(fondImage(art)).toBe(art.grad);
		expect(fondImage(art, 'https://exemple.fr/a.jpg')).toBe(`url("https://exemple.fr/a.jpg"), ${art.grad}`);
	});
});
