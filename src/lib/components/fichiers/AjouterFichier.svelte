<script lang="ts">
	// Fenêtre « Ajouter un fichier » (ou le modifier) : fichier envoyé sur le hub, avec la
	// progression de l'envoi, ou lien externe. Type, nom, version, plateformes et note.
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Dialog from '#lib/components/Dialog.svelte';
	import { envoyer } from '#lib/actions.ts';
	import { toasts } from '#lib/toasts.svelte.ts';
	import { devinerDepuisNom, ORDRE_PLATEFORMES, PLATEFORMES, tailleLisible, TYPES_FICHIER, type Plateforme, type TypeFichier } from '#lib/fichiers.ts';
	import type { VueFichier } from '#lib/server/fichiers.ts';

	let {
		projets,
		projetId = null,
		fichier = null,
		tailleMax,
		onfermer
	}: {
		/** Projets proposés quand la fenêtre est ouverte depuis l'accueil Fichiers. */
		projets: { id: number; nom: string }[];
		projetId?: number | null;
		/** Fichier à modifier (le fichier envoyé ne change pas, seulement ses infos). */
		fichier?: VueFichier | null;
		tailleMax: number;
		onfermer: () => void;
	} = $props();

	const depart = untrack(() => ({ fichier, projetId, projets }));
	const edition = depart.fichier;
	let source = $state<'fichier' | 'lien'>(edition?.lien ? 'lien' : 'fichier');
	let projet = $state(String(depart.projetId ?? depart.projets[0]?.id ?? ''));
	let type = $state<TypeFichier>(edition?.type ?? 'appli');
	let nom = $state(edition?.nom ?? '');
	let version = $state(edition?.version ?? '');
	let plateformes = $state<Plateforme[]>(edition?.plateformes ?? ['win']);
	let note = $state(edition?.note ?? '');
	let lien = $state(edition?.lien ?? '');
	let choisi = $state<File | null>(null);
	let survol = $state(false);
	let progression = $state<number | null>(null);
	let erreur = $state('');
	let envoi = $state(false);
	let confirmer = $state(false);
	let champFichier: HTMLInputElement | undefined = $state();
	let requete: XMLHttpRequest | null = null;

	const tropGros = $derived(!!choisi && choisi.size > tailleMax);
	const peutEnvoyer = $derived(
		!!nom.trim() && plateformes.length > 0 && !!projet && (edition ? source !== 'lien' || !!lien.trim() : source === 'lien' ? !!lien.trim() : !!choisi && !tropGros)
	);

	function prendre(f: File | undefined | null) {
		if (!f) return;
		choisi = f;
		erreur = '';
		if (!nom.trim()) nom = f.name.replace(/\.[^.]+$/, '');
		const g = devinerDepuisNom(f.name);
		if (g.type) type = g.type;
		if (g.plateformes) plateformes = g.plateformes;
	}
	const basculer = (p: Plateforme) => (plateformes = plateformes.includes(p) ? plateformes.filter((x) => x !== p) : [...plateformes, p]);
	const champs = () => ({ nom, type, version, note, plateforme: plateformes });

	/** Envoi du fichier lui-même en flux, avec la progression (XMLHttpRequest). */
	function televerser(f: File) {
		const q = new URLSearchParams({ projet, nom, type, version, note, plateformes: plateformes.join(','), nomFichier: f.name });
		return new Promise<{ ok?: string; message?: string } | null>((fini) => {
			const x = new XMLHttpRequest();
			requete = x;
			x.open('POST', `/fichiers/envoi?${q}`);
			x.setRequestHeader('Content-Type', f.type || 'application/octet-stream');
			x.setRequestHeader('Accept', 'application/json');
			x.upload.onprogress = (e) => {
				if (e.lengthComputable) progression = Math.round((e.loaded / e.total) * 100);
			};
			x.onload = () => {
				let r: { ok?: string; message?: string } | null = null;
				try {
					r = JSON.parse(x.responseText);
				} catch {
					r = { message: x.status === 413 ? 'Fichier trop gros pour le serveur.' : `Erreur ${x.status}` };
				}
				fini(x.status >= 200 && x.status < 300 ? r : { message: r?.message ?? `Erreur ${x.status}` });
			};
			x.onerror = () => fini({ message: 'L’envoi a été coupé. Vérifie ta connexion.' });
			x.onabort = () => fini(null);
			x.send(f);
		});
	}

	async function valider(e: SubmitEvent) {
		e.preventDefault();
		if (!peutEnvoyer || envoi) return;
		envoi = true;
		erreur = '';
		if (edition) {
			const r = await envoyer('/fichiers?/modifier', { id: edition.id, ...champs(), lien: source === 'lien' ? lien : null });
			envoi = false;
			if (r) onfermer();
			return;
		}
		if (source === 'lien') {
			const r = await envoyer('/fichiers?/lien', { projet, lien, ...champs() });
			envoi = false;
			if (r) onfermer();
			return;
		}
		progression = 0;
		const r = await televerser(choisi!);
		requete = null;
		envoi = false;
		progression = null;
		if (!r) return; // annulé
		if (r.ok) {
			toasts.montrer('success', r.ok);
			await invalidateAll();
			onfermer();
		} else erreur = r.message ?? 'L’envoi n’a pas marché.';
	}
	function fermer() {
		requete?.abort();
		onfermer();
	}
	async function supprimer() {
		if (!edition) return;
		envoi = true;
		const r = await envoyer('/fichiers?/supprimer', { id: edition.id });
		envoi = false;
		if (r) onfermer();
	}
</script>

<Dialog
	titre={edition ? 'Modifier le fichier' : 'Ajouter un fichier'}
	description={edition ? (edition.heberge ? `${edition.nomOriginal} · ${tailleLisible(edition.taille)}` : 'Lien externe') : 'Héberge-le sur le hub ou mets un lien vers le site officiel.'}
	largeur={560}
	onfermer={fermer}
>
	<form class="corps" onsubmit={valider}>
		{#if !edition}
			<div class="nh-tabs sources" role="radiogroup" aria-label="Source">
				<button type="button" role="radio" aria-checked={source === 'fichier'} class="nh-tabs__tab" class:nh-tabs__tab--active={source === 'fichier'} onclick={() => (source = 'fichier')}><i class="icon-upload" aria-hidden="true"></i>Fichier</button>
				<button type="button" role="radio" aria-checked={source === 'lien'} class="nh-tabs__tab" class:nh-tabs__tab--active={source === 'lien'} onclick={() => (source = 'lien')}><i class="icon-link" aria-hidden="true"></i>Lien externe</button>
			</div>
		{/if}

		{#if source === 'fichier' && !edition}
			<input bind:this={champFichier} type="file" class="cache" tabindex="-1" aria-hidden="true" onchange={(e) => prendre(e.currentTarget.files?.[0])} />
			<button
				type="button"
				class="depot"
				class:survol
				class:pris={!!choisi}
				disabled={envoi}
				onclick={() => champFichier?.click()}
				ondragover={(e) => { e.preventDefault(); survol = true; }}
				ondragleave={() => (survol = false)}
				ondrop={(e) => { e.preventDefault(); survol = false; prendre(e.dataTransfer?.files[0]); }}
			>
				<i class="icon-{choisi ? 'file-check' : 'upload'}" aria-hidden="true"></i>
				<span class="d-titre">{choisi?.name ?? 'Glisse ton fichier ici'}</span>
				<span class="d-sous" class:rouge={tropGros}>
					{#if tropGros}Trop gros : {tailleLisible(tailleMax)} au plus.{:else if choisi}{tailleLisible(choisi.size)} · clique pour changer{:else}ou clique pour choisir · .exe, .dmg, .apk, .zip… ({tailleLisible(tailleMax)} au plus){/if}
				</span>
			</button>
		{:else if source === 'lien'}
			<div class="nh-field">
				<label class="nh-field__label" for="af-lien">Adresse</label>
				<div class="nh-input"><i class="icon-link" aria-hidden="true"></i><input id="af-lien" type="url" bind:value={lien} placeholder="https://…" required /></div>
			</div>
		{/if}

		<div class="deux">
			{#if !edition && projets.length > 1 && !projetId}
				<div class="nh-field">
					<label class="nh-field__label" for="af-projet">Projet</label>
					<div class="nh-input">
						<select id="af-projet" bind:value={projet}>
							{#each projets as p (p.id)}<option value={String(p.id)}>{p.nom}</option>{/each}
						</select>
						<i class="icon-chevron-down" aria-hidden="true"></i>
					</div>
				</div>
			{/if}
			<div class="nh-field">
				<label class="nh-field__label" for="af-type">Type</label>
				<div class="nh-input">
					<select id="af-type" bind:value={type}>
						{#each Object.entries(TYPES_FICHIER) as [v, t] (v)}<option value={v}>{t.l}</option>{/each}
					</select>
					<i class="icon-chevron-down" aria-hidden="true"></i>
				</div>
			</div>
			<div class="nh-field">
				<label class="nh-field__label" for="af-nom">Nom</label>
				<div class="nh-input"><input id="af-nom" bind:value={nom} maxlength="120" placeholder="Modpack de la bande" required /></div>
			</div>
			<div class="nh-field">
				<label class="nh-field__label" for="af-version">Version</label>
				<div class="nh-input"><input id="af-version" bind:value={version} maxlength="40" placeholder="2.3" /></div>
			</div>
		</div>

		<div class="groupe">
			<span class="nh-field__label" id="af-plats">Plateformes</span>
			<div class="tags" role="group" aria-labelledby="af-plats">
				{#each ORDRE_PLATEFORMES as p (p)}
					<button type="button" class="nh-tag nh-tag--clickable" class:nh-tag--selected={plateformes.includes(p)} aria-pressed={plateformes.includes(p)} onclick={() => basculer(p)}>{PLATEFORMES[p]}</button>
				{/each}
			</div>
		</div>

		<div class="nh-field">
			<label class="nh-field__label" for="af-note">Note d’install (facultatif)</label>
			<div class="nh-input"><input id="af-note" bind:value={note} maxlength="300" placeholder="Dézippe dans le dossier mods" /></div>
		</div>

		{#if progression !== null}
			<div class="envoi" aria-live="polite">
				<div class="barre" role="progressbar" aria-label="Envoi du fichier" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progression}><span style:width="{progression}%"></span></div>
				<span>Envoi… {progression} %</span>
			</div>
		{/if}
		{#if erreur}<p class="nh-field__hint nh-field__hint--error" role="alert">{erreur}</p>{/if}

		<div class="pied">
			{#if edition}
				{#if confirmer}
					<button type="button" class="nh-btn nh-btn--danger" disabled={envoi} onclick={supprimer}>Supprimer pour de bon</button>
				{:else}
					<button type="button" class="nh-btn nh-btn--ghost danger" onclick={() => (confirmer = true)}><i class="icon-trash-2" aria-hidden="true"></i>Supprimer</button>
				{/if}
			{/if}
			<span class="droite">
				<button type="button" class="nh-btn nh-btn--ghost" onclick={fermer}>{progression !== null ? 'Annuler l’envoi' : 'Annuler'}</button>
				<button type="submit" class="nh-btn nh-btn--primary" disabled={!peutEnvoyer || envoi}>{#if !edition}<i class="icon-plus" aria-hidden="true"></i>{/if}{edition ? 'Enregistrer' : 'Ajouter'}</button>
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
	.sources {
		align-self: flex-start;
	}
	.sources i {
		margin-right: 6px;
	}
	.cache {
		display: none;
	}
	.depot {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 22px;
		border: 1.5px dashed var(--border-default);
		border-radius: 16px;
		background: var(--surface-1);
		color: inherit;
		text-align: center;
		cursor: pointer;
		transition: all 120ms var(--ease-out);
	}
	.depot.pris {
		border-color: var(--border-strong);
	}
	.depot.survol,
	.depot:hover {
		border-color: var(--apricot-300);
		background: var(--surface-accent-soft);
	}
	.depot i {
		font-size: 22px;
		color: var(--apricot-300);
	}
	.d-titre {
		font-weight: 500;
		font-size: 15px;
		color: var(--fg-1);
		overflow-wrap: anywhere;
	}
	.d-sous {
		font-size: 13px;
		color: var(--fg-3);
	}
	.rouge {
		color: var(--danger-fg);
	}
	.deux {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 14px;
	}
	.groupe {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.envoi {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 13px;
		color: var(--fg-2);
	}
	.barre {
		flex: 1;
		height: 6px;
		border-radius: 999px;
		background: var(--surface-3);
		overflow: hidden;
	}
	.barre span {
		display: block;
		height: 100%;
		background: var(--apricot-300);
		transition: width 120ms linear;
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
