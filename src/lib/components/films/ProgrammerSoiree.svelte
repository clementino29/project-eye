<script lang="ts">
	// Fenêtre « Programmer une soirée » (ou la modifier) : date, heure, lieu, titre, précision.
	// Une seule soirée par date : choisir une date déjà prise met à jour cette soirée-là.
	import { untrack } from 'svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import { envoyer } from '#lib/actions.ts';
	import { HEURES, heureLisible, jourLong } from '#lib/commune.ts';
	import type { EntreeCommune, VueSoiree } from '#lib/server/commune.ts';

	let {
		soirees,
		liste,
		lieux,
		aujourdhui,
		initial,
		onfermer,
		onfini
	}: {
		soirees: VueSoiree[];
		liste: EntreeCommune[];
		lieux: string[];
		aujourdhui: string;
		/** Soirée à modifier (avec `id`), ou valeurs de départ d'une nouvelle soirée. */
		initial: Partial<VueSoiree>;
		onfermer: () => void;
		/** Après l'envoi : identifiant de la soirée programmée. */
		onfini?: (soireeId: number) => void;
	} = $props();

	const edition = $derived(initial.id ?? null);
	// Valeurs de départ, copiées une fois à l'ouverture.
	const depart = untrack(() => initial);
	let date = $state(depart.date ?? '');
	let heure = $state(depart.heure ?? '21:00');
	let lieu = $state(depart.lieu ?? 'En ligne');
	let titreId = $state(depart.titreId ? String(depart.titreId) : '');
	let note = $state(depart.note ?? '');
	let envoi = $state(false);

	const heures = $derived(HEURES.includes(heure) ? HEURES : [...HEURES, heure].sort());
	const lieuxProposes = $derived(lieux.includes(lieu) ? lieux : [lieu, ...lieux]);
	const titres = $derived(liste.filter((e) => e.statut !== 'vu' || String(e.titre.id) === titreId));
	const prise = $derived(soirees.find((s) => s.date === date && s.id !== edition) ?? null);

	async function programmer(e: SubmitEvent) {
		e.preventDefault();
		if (!date || (edition && prise)) return;
		envoi = true;
		const r = await envoyer('/films?/programmer', { soiree: edition, date, heure, lieu, titreId: titreId || null, note });
		envoi = false;
		if (r) {
			onfini?.(Number(r.soireeId));
			onfermer();
		}
	}
	async function annulerSoiree() {
		if (!edition) return;
		envoi = true;
		const r = await envoyer('/films?/supprimerSoiree', { soiree: edition });
		envoi = false;
		if (r) onfermer();
	}
</script>

<Dialog titre={edition ? 'Modifier la soirée' : 'Programmer une soirée'} {onfermer} largeur={480}>
	<form class="corps" onsubmit={programmer}>
		<div class="nh-field">
			<label class="nh-field__label" for="ps-date">Date</label>
			<div class="nh-input"><input id="ps-date" type="date" bind:value={date} min={edition && initial.date && initial.date < aujourdhui ? undefined : aujourdhui} required /></div>
			{#if prise}
				<div class="nh-field__hint" class:nh-field__hint--error={!!edition}>
					{edition ? 'Il y a déjà une soirée ce jour-là.' : `Il y a déjà une soirée ${jourLong(date)} : elle sera mise à jour.`}
				</div>
			{/if}
		</div>
		<div class="deux">
			<div class="nh-field">
				<label class="nh-field__label" for="ps-heure">Heure</label>
				<div class="nh-input">
					<select id="ps-heure" bind:value={heure}>
						{#each heures as h (h)}<option value={h}>{heureLisible(h)}</option>{/each}
					</select>
					<i class="icon-chevron-down" aria-hidden="true"></i>
				</div>
			</div>
			<div class="nh-field">
				<label class="nh-field__label" for="ps-lieu">Où</label>
				<div class="nh-input">
					<select id="ps-lieu" bind:value={lieu}>
						{#each lieuxProposes as l (l)}<option value={l}>{l}</option>{/each}
					</select>
					<i class="icon-chevron-down" aria-hidden="true"></i>
				</div>
			</div>
		</div>
		<div class="nh-field">
			<label class="nh-field__label" for="ps-titre">Quoi</label>
			<div class="nh-input">
				<select id="ps-titre" bind:value={titreId}>
					<option value="">À choisir plus tard</option>
					{#each titres as e (e.titre.id)}<option value={String(e.titre.id)}>{e.titre.titre} ({e.votes.length})</option>{/each}
				</select>
				<i class="icon-chevron-down" aria-hidden="true"></i>
			</div>
			<div class="nh-field__hint">Classés par votes.</div>
		</div>
		<div class="nh-field">
			<label class="nh-field__label" for="ps-note">Précision</label>
			<div class="nh-input"><input id="ps-note" bind:value={note} maxlength="120" placeholder="Épisodes 3 et 4" /></div>
			<div class="nh-field__hint">Facultatif.</div>
		</div>
		<div class="pied">
			{#if edition}<button type="button" class="nh-btn nh-btn--ghost danger" disabled={envoi} onclick={annulerSoiree}><i class="icon-trash-2" aria-hidden="true"></i>Annuler la soirée</button>{/if}
			<span class="droite">
				<button type="button" class="nh-btn nh-btn--ghost" onclick={onfermer}>Fermer</button>
				<button type="submit" class="nh-btn nh-btn--primary" disabled={envoi || !date || (!!edition && !!prise)}>{edition ? 'Enregistrer' : 'Programmer'}</button>
			</span>
		</div>
	</form>
</Dialog>

<style>
	.corps {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.deux {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.pied {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-top: 4px;
	}
	.droite {
		margin-left: auto;
		display: flex;
		gap: 8px;
	}
	.danger {
		color: var(--danger-fg);
	}
	@media (max-width: 559px) {
		.deux {
			grid-template-columns: 1fr;
		}
	}
</style>
