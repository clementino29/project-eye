import { describe, expect, it } from 'vitest';
import { jeuxEnCommun, jeuxPresque, libelleJoueurs, listeNoms, partsDeLaRoue, rotationPour, tirer, type JeuCommun } from './quoi-faire.ts';

const jeu = (id: number, proprietaires: number[], autre: Partial<JeuCommun> = {}): JeuCommun => ({
	id,
	nom: `Jeu ${id}`,
	court: `J${id}`,
	mode: 'coop',
	multi: true,
	max: 4,
	genres: null,
	gratuit: false,
	proprietaires,
	...autre
});

const tous = { multi: false, places: false };

describe('jeux en commun', () => {
	const jeux = [jeu(1, [1, 2, 3]), jeu(2, [1, 2]), jeu(3, [1, 3]), jeu(4, [1, 2, 3], { multi: false, mode: 'solo', max: 1 }), jeu(5, [1, 2, 3], { max: 2 })];

	it('demande au moins deux présents', () => {
		expect(jeuxEnCommun(jeux, [1], tous)).toEqual([]);
	});

	it('garde les jeux que tous les présents possèdent', () => {
		expect(jeuxEnCommun(jeux, [1, 2], tous).map((j) => j.id)).toEqual([1, 2, 4, 5]);
		expect(jeuxEnCommun(jeux, [1, 2, 3], tous).map((j) => j.id)).toEqual([1, 4, 5]);
	});

	it('applique les filtres multijoueur et places', () => {
		expect(jeuxEnCommun(jeux, [1, 2, 3], { multi: true, places: false }).map((j) => j.id)).toEqual([1, 5]);
		expect(jeuxEnCommun(jeux, [1, 2, 3], { multi: true, places: true }).map((j) => j.id)).toEqual([1]);
	});

	it("n'exclut pas un jeu dont on ne connaît pas encore la fiche", () => {
		const inconnu = jeu(9, [1, 2, 3], { multi: null, max: null, mode: null });
		expect(jeuxEnCommun([inconnu], [1, 2, 3], { multi: true, places: true })).toHaveLength(1);
	});

	it('trouve les jeux qui ne manquent qu’à une personne', () => {
		expect(jeuxPresque(jeux, [1, 2], tous)).toEqual([]);
		const r = jeuxPresque(jeux, [1, 2, 3], tous);
		expect(r.map((j) => [j.id, j.manquant])).toEqual([
			[2, 3],
			[3, 2]
		]);
	});
});

describe('roue', () => {
	it('donne une part plus grosse aux jeux avec plus d’envies', () => {
		const envies: Record<number, number> = { 1: 3, 2: 1, 3: 0 };
		const parts = partsDeLaRoue([1, 2, 3], (id) => envies[id], true);
		expect(parts.map((p) => p.angle)).toEqual([240, 80, 40]);
		expect(parts.reduce((a, p) => a + p.angle, 0)).toBeCloseTo(360);
		expect(parts[1].debut).toBe(240);
	});

	it('fait des parts égales sans pondération', () => {
		expect(partsDeLaRoue([1, 2, 3, 4], () => 7, false).map((p) => p.angle)).toEqual([90, 90, 90, 90]);
	});

	it('tire la part qui contient l’aléa', () => {
		const parts = partsDeLaRoue([1, 2], (id) => (id === 1 ? 3 : 1), true);
		expect(tirer(parts, 0)?.id).toBe(1);
		expect(tirer(parts, 0.74)?.id).toBe(1);
		expect(tirer(parts, 0.76)?.id).toBe(2);
		expect(tirer([], 0.5)).toBeUndefined();
	});

	it("arrête la roue avec l'aiguille dans la part tirée", () => {
		const parts = partsDeLaRoue([1, 2, 3], () => 1, true);
		for (const [part, depart, alea] of [
			[parts[0], 0, 0.5],
			[parts[2], 1234, 0],
			[parts[1], 720, 0.99]
		] as const) {
			const rot = rotationPour(part, depart, alea);
			expect(rot).toBeGreaterThan(depart + 360 * 5 - 1);
			// L'aiguille est en haut : l'angle de la roue sous l'aiguille est (360 - rot) mod 360.
			const sous = (((360 - rot) % 360) + 360) % 360;
			expect(sous).toBeGreaterThanOrEqual(part.debut);
			expect(sous).toBeLessThan(part.debut + part.angle);
		}
	});
});

describe('libellés', () => {
	it('écrit le nombre de joueurs', () => {
		expect(libelleJoueurs(1)).toBe('1 joueur');
		expect(libelleJoueurs(8)).toBe("Jusqu'à 8");
		expect(libelleJoueurs(null)).toBe('Places inconnues');
	});
	it('liste les prénoms', () => {
		expect(listeNoms(['Léa'])).toBe('Léa');
		expect(listeNoms(['Léa', 'Malik', 'Inès'])).toBe('Léa, Malik et Inès');
	});
});
