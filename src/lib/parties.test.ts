import { describe, expect, it } from 'vitest';
import { derniereSession, journal, pourcentage, tourActuel } from './parties.ts';

const sessions = [
	{ id: 1, date: '2026-10-19', tourAtteint: 97, note: null },
	{ id: 2, date: '2026-10-05', tourAtteint: 48, note: 'Premiers contacts' },
	{ id: 3, date: '2026-11-16', tourAtteint: 158, note: null }
];

describe('parties', () => {
	it('calcule le tour actuel et la dernière session', () => {
		expect(tourActuel(sessions)).toBe(158);
		expect(tourActuel([])).toBe(0);
		expect(derniereSession(sessions)).toBe('2026-11-16');
		expect(derniereSession([])).toBe('');
	});

	it('construit le journal du plus récent au plus ancien', () => {
		expect(journal(sessions).map((s) => [s.id, s.plage, s.gain])).toEqual([
			[3, 'Tour 97 → 158', '+61 tours'],
			[1, 'Tour 48 → 97', '+49 tours'],
			[2, 'Tour 1 → 48', '+48 tours']
		]);
	});

	it('plafonne la progression à 100 %', () => {
		expect(pourcentage(250, 500)).toBe('50%');
		expect(pourcentage(600, 500)).toBe('100%');
		expect(pourcentage(10, null)).toBe('0%');
	});
});
