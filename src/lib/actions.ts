// Appel d'une action de formulaire SvelteKit depuis le code (changement de statut d'un clic, etc.).
import { deserialize } from '$app/forms';
import { goto, invalidateAll } from '$app/navigation';
import { toasts } from './toasts.svelte.ts';

type Valeur = string | number | boolean | null | undefined;

export async function envoyer(action: string, champs: Record<string, Valeur | Valeur[]>, { silencieux = false } = {}) {
	const fd = new FormData();
	for (const [k, v] of Object.entries(champs)) {
		for (const x of Array.isArray(v) ? v : [v]) if (x !== null && x !== undefined) fd.append(k, String(x));
	}
	let resultat;
	try {
		const rep = await fetch(action, { method: 'POST', body: fd, headers: { 'x-sveltekit-action': 'true' } });
		resultat = deserialize(await rep.text());
	} catch {
		toasts.montrer('danger', 'Pas de réponse', 'Vérifie ta connexion.');
		return null;
	}
	if (resultat.type === 'success') {
		await invalidateAll();
		const ok = (resultat.data as { ok?: string | null } | undefined)?.ok;
		if (ok && !silencieux) toasts.montrer('success', ok);
		return resultat.data as Record<string, unknown> | undefined;
	}
	if (resultat.type === 'redirect') {
		// L'action renvoie ailleurs (ex. titre retiré : retour à la liste).
		await goto(resultat.location, { invalidateAll: true });
		return {};
	}
	if (resultat.type === 'failure') {
		toasts.montrer('danger', 'Ça n’a pas marché', (resultat.data as { erreur?: string } | undefined)?.erreur ?? '');
	} else if (resultat.type === 'error') {
		toasts.montrer('danger', 'Erreur', resultat.error.message);
	}
	return null;
}
