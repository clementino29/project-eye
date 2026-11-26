import { describe, expect, it } from 'vitest';
import { lireEquipes } from './equipes.ts';
import { phraseVictoire } from '../parties.ts';

describe('lireEquipes', () => {
	const joueurs = [1, 2, 3];
	const lire = (v: unknown) => lireEquipes(JSON.stringify(v), joueurs);

	it('accepte une partie sans équipes', () => {
		expect(lireEquipes('', joueurs)).toEqual({ equipes: [] });
		expect(lire([])).toEqual({ equipes: [] });
	});

	it('lit les équipes et complète nom et couleur', () => {
		const r = lire([
			{ nom: ' Rouges ', couleur: 'rouge', gagnante: true, membres: [1, 3, 9] },
			{ couleur: '#fff', membres: [2] }
		]);
		expect(r).toEqual({
			equipes: [
				{ nom: 'Rouges', couleur: 'rouge', gagnante: true, membres: [1, 3] },
				{ nom: 'Équipe 2', couleur: 'bleu', gagnante: false, membres: [2] }
			]
		});
	});

	it('refuse une répartition incohérente', () => {
		expect(lire([{ membres: [1, 2, 3] }])).toEqual({ erreur: 'Il faut au moins deux équipes.' });
		expect(lire([{ membres: [1, 2] }, { membres: [2, 3] }])).toEqual({ erreur: 'Un joueur ne peut être que dans une équipe.' });
		expect(lire([{ membres: [1] }, { membres: [2] }])).toEqual({ erreur: 'Place chaque joueur dans une équipe.' });
		expect(lire(Array.from({ length: 9 }, (_, i) => ({ membres: [i] })))).toEqual({ erreur: '8 équipes au plus.' });
		expect(lireEquipes('{', joueurs)).toEqual({ erreur: 'Équipes illisibles.' });
	});
});

describe('phraseVictoire', () => {
	const prenom = (id: number) => ['', 'Léa', 'Tom', 'Max'][id];
	it('nomme le vainqueur, les ex aequo ou l’équipe gagnante', () => {
		expect(phraseVictoire({ equipes: [], gagnants: [1] }, prenom)).toBe('Victoire de Léa');
		expect(phraseVictoire({ equipes: [], gagnants: [1, 2, 3] }, prenom)).toMatch(/^Égalité : Léa, Tom et Max$/);
		expect(phraseVictoire({ equipes: [], gagnants: [] }, prenom)).toBeNull();
		const equipes = [
			{ nom: 'Rouges', couleur: 'rouge' as const, gagnante: true, membres: [1] },
			{ nom: 'Bleus', couleur: 'bleu' as const, gagnante: false, membres: [2] }
		];
		expect(phraseVictoire({ equipes, gagnants: [] }, prenom)).toBe('Victoire de Rouges');
	});
});
