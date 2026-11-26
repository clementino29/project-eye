import { describe, expect, it } from 'vitest';
import { etatGlobal, type ServiceKuma, type StatutKuma } from '../kuma.ts';
import { vueService } from '../../libelles.ts';

const service = (etat: ServiceKuma['etat'], ping: number | null = 40): ServiceKuma => ({
	id: Math.random(),
	nom: 'Service',
	etat,
	dispo24h: 1,
	dispo30j: 1,
	message: null,
	ping,
	historique: []
});
const statut = (...services: ServiceKuma[]): StatutKuma => ({
	titre: 'Statut',
	groupes: [{ nom: 'Applications', services }],
	incident: null,
	maintenances: [],
	urlPage: 'https://kuma.test/status/games',
	lueLe: Date.now()
});

describe('état des services', () => {
	it('affiche « Lent » un service en ligne qui met plus d’une seconde à répondre', () => {
		expect(vueService('en_ligne', 200)).toBe('en_ligne');
		expect(vueService('en_ligne', 1840)).toBe('lent');
		expect(vueService('en_panne', null)).toBe('hors_ligne');
		expect(vueService('bizarre')).toBe('inconnu');
	});

	it('résume la page : la panne l’emporte sur le ralentissement', () => {
		expect(etatGlobal(null)).toBeNull();
		expect(etatGlobal(statut())).toBeNull();
		expect(etatGlobal(statut(service('en_ligne'), service('en_ligne', 8)))).toBe('ok');
		expect(etatGlobal(statut(service('en_ligne'), service('en_ligne', 1500)))).toBe('degrade');
		expect(etatGlobal(statut(service('maintenance'), service('en_ligne')))).toBe('degrade');
		expect(etatGlobal(statut(service('en_ligne', 1500), service('en_panne', null)))).toBe('panne');
	});
});
