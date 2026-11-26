<script lang="ts">
	// « Nouveau projet » / « Modifier » (prototype « Fichiers », assistant) : Infos, En-tête, Installation.
	// Un seul formulaire : les étapes sont masquées, pas retirées, pour garder les images choisies.
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { artOf } from '#lib/design/art.ts';
	import { AFFICHAGES, type Affichage } from '#lib/fichiers.ts';
	import type { VueProjet } from '#lib/server/fichiers.ts';

	let { projet = null, erreur = null }: { projet?: VueProjet | null; erreur?: string | null } = $props();

	const depart = untrack(() => projet);
	let etape = $state(1);
	let nom = $state(depart?.nom ?? '');
	let sousTitre = $state(depart?.sousTitre ?? '');
	let affichage = $state<Affichage>(depart?.affichage ?? 'logo_titre');
	let etapes = $state<string[]>(depart?.etapes.length ? [...depart.etapes] : ['']);
	let envoi = $state(false);
	let confirmer = $state(false);

	type CleImage = 'banniere' | 'logo' | 'vignette';
	/** Aperçu de chaque image : nouvelle (choisie), actuelle, ou retirée. */
	let apercus = $state<Record<CleImage, string | null>>({ banniere: depart?.banniere ?? null, logo: depart?.logo ?? null, vignette: depart?.vignette ?? null });
	let retirees = $state<Record<CleImage, boolean>>({ banniere: false, logo: false, vignette: false });
	const champs: Partial<Record<CleImage, HTMLInputElement>> = $state({});

	function choisir(cle: CleImage, e: Event) {
		const f = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!f) return;
		apercus[cle] = URL.createObjectURL(f);
		retirees[cle] = false;
	}
	function retirer(cle: CleImage) {
		if (champs[cle]) champs[cle]!.value = '';
		apercus[cle] = null;
		retirees[cle] = true;
	}

	const ETAPES = ['Infos', 'En-tête', 'Installation'];
	const art = $derived(artOf(nom.trim() || 'Nom du projet'));
	const titre = $derived(nom.trim() || 'Nom du projet');
	const peutContinuer = $derived(!!nom.trim());
</script>

<div class="fil"><a href="/fichiers">Fichiers</a><i class="icon-chevron-right" aria-hidden="true"></i><span>{depart ? `Modifier ${depart.nom}` : 'Nouveau projet'}</span></div>
<h1>{depart ? `Modifier ${depart.nom}` : 'Nouveau projet'}</h1>

<ol class="etapier" aria-label="Étapes">
	{#each ETAPES as l, i (l)}
		{@const n = i + 1}
		<li>
			<button type="button" class="pas" class:on={etape === n} class:fait={etape > n} aria-current={etape === n ? 'step' : undefined} disabled={!peutContinuer && n > 1} onclick={() => (etape = n)}><span class="rond">{n}</span>{l}</button>
			{#if n < ETAPES.length}<span class="trait" aria-hidden="true"></span>{/if}
		</li>
	{/each}
</ol>

<form
	method="POST"
	action="?/enregistrer"
	enctype="multipart/form-data"
	use:enhance={() => {
		envoi = true;
		return async ({ update }) => {
			await update({ reset: false });
			envoi = false;
		};
	}}
>
	<div class="nh-card carte">
		<div class="pan" hidden={etape !== 1}>
			<div class="nh-field">
				<label class="nh-field__label" for="fp-nom">Nom du jeu ou du projet</label>
				<div class="nh-input"><input id="fp-nom" name="nom" bind:value={nom} maxlength="80" placeholder="Satisfactory" required /></div>
			</div>
			<div class="nh-field">
				<label class="nh-field__label" for="fp-sous">Sous-titre</label>
				<div class="nh-input"><input id="fp-sous" name="sousTitre" bind:value={sousTitre} maxlength="140" placeholder="Usine de la bande · Update 1.0" /></div>
				<div class="nh-field__hint">Une ligne : version, serveur, ce qui compte.</div>
			</div>
		</div>

		<div class="pan entete" hidden={etape !== 2}>
			<div class="col">
				<span class="nh-field__label">Bannière et logo</span>
				<div class="apercu">
					<div class="a-fond" style:background={art.grad}>
						{#if apercus.banniere}<img src={apercus.banniere} alt="" />{/if}
					</div>
					<div class="a-centre">
						{#if affichage !== 'titre' && apercus.logo}<img class="a-logo" src={apercus.logo} alt="" />{/if}
						{#if affichage !== 'logo' || !apercus.logo}<span class="a-titre">{titre}</span>{/if}
					</div>
				</div>
				<div class="tags" role="radiogroup" aria-label="Afficher">
					<span class="aide">Afficher</span>
					{#each AFFICHAGES as [v, l] (v)}
						<button type="button" role="radio" aria-checked={affichage === v} class="nh-tag nh-tag--clickable" class:nh-tag--selected={affichage === v} onclick={() => (affichage = v)}>{l}</button>
					{/each}
					<input type="hidden" name="affichage" value={affichage} />
				</div>
				{#each [['banniere', 'Image de fond', 'Changer l’image de fond'], ['logo', 'Logo (PNG transparent)', 'Changer le logo']] as [cle, l, c] (cle)}
					{@render choixImage(cle as CleImage, l, c)}
				{/each}
			</div>
			<div class="col">
				<span class="nh-field__label">Vignette</span>
				<div class="carte-vignette">
					<div class="v-image" style:background={art.grad}>
						<i class="icon-{art.icon}" aria-hidden="true"></i>
						<span>{titre}</span>
						{#if apercus.vignette}<img src={apercus.vignette} alt="" />{/if}
					</div>
					<div class="v-pied"><strong>{titre}</strong><span>{depart ? `${depart.fichiers.length} fichier${depart.fichiers.length > 1 ? 's' : ''}` : '0 fichier'}</span></div>
				</div>
				<span class="aide">Format 16:9, comme sur la page Fichiers.</span>
				{@render choixImage('vignette', 'Vignette', 'Changer la vignette')}
			</div>
		</div>

		<div class="pan" hidden={etape !== 3}>
			<span class="nh-field__label">Étapes d’installation</span>
			{#each etapes as _, i (i)}
				<div class="ligne-etape">
					<span class="num" aria-hidden="true">{i + 1}</span>
					<div class="nh-input"><input name="etape" bind:value={etapes[i]} maxlength="400" placeholder="Décris l’étape" aria-label="Étape {i + 1}" /></div>
					<button type="button" class="nh-btn nh-btn--ghost nh-btn--sm nh-iconbtn" aria-label="Supprimer l’étape {i + 1}" onclick={() => (etapes = etapes.filter((_, j) => j !== i))}><i class="icon-trash-2" aria-hidden="true"></i></button>
				</div>
			{/each}
			<div><button type="button" class="nh-btn nh-btn--ghost nh-btn--sm" onclick={() => (etapes = [...etapes, ''])}><i class="icon-plus" aria-hidden="true"></i>Ajouter une étape</button></div>
			{#if !depart}<p class="aide">Les fichiers s’ajoutent ensuite depuis la page du projet.</p>{/if}
		</div>
	</div>

	{#if erreur}<p class="nh-field__hint nh-field__hint--error" role="alert">{erreur}</p>{/if}

	<div class="pied">
		{#if etape === 1}
			<a href={depart ? `/fichiers/${depart.slug}` : '/fichiers'} class="nh-btn nh-btn--ghost"><i class="icon-arrow-left" aria-hidden="true"></i>Annuler</a>
		{:else}
			<button type="button" class="nh-btn nh-btn--ghost" onclick={() => etape--}><i class="icon-arrow-left" aria-hidden="true"></i>Retour</button>
		{/if}
		{#if etape < ETAPES.length}
			<button type="button" class="nh-btn nh-btn--primary" disabled={!peutContinuer} onclick={() => etape++}>Suivant<i class="icon-arrow-right" aria-hidden="true"></i></button>
		{:else}
			<button type="submit" class="nh-btn nh-btn--primary" disabled={!peutContinuer || envoi}><i class="icon-check" aria-hidden="true"></i>{depart ? 'Enregistrer' : 'Créer le projet'}</button>
		{/if}
	</div>
</form>

{#if depart}
	<form method="POST" action="?/supprimer" class="zone" use:enhance>
		<div>
			<strong>Supprimer le projet</strong>
			<p class="aide">Ses {depart.fichiers.length} fichier{depart.fichiers.length > 1 ? 's' : ''} et ses images sont effacés du hub.</p>
		</div>
		{#if confirmer}
			<span class="boutons">
				<button type="button" class="nh-btn nh-btn--ghost" onclick={() => (confirmer = false)}>Annuler</button>
				<button type="submit" class="nh-btn nh-btn--danger">Supprimer pour de bon</button>
			</span>
		{:else}
			<button type="button" class="nh-btn nh-btn--ghost danger" onclick={() => (confirmer = true)}><i class="icon-trash-2" aria-hidden="true"></i>Supprimer</button>
		{/if}
	</form>
{/if}

{#snippet choixImage(cle: CleImage, libelle: string, changer: string)}
	<div class="choix">
		<label class="nh-btn nh-btn--outline nh-btn--sm">
			<i class="icon-image-up" aria-hidden="true"></i>{apercus[cle] ? changer : libelle}
			<input bind:this={champs[cle]} type="file" name={cle} accept="image/png,image/jpeg,image/webp,image/gif" class="cache" onchange={(e) => choisir(cle, e)} />
		</label>
		{#if apercus[cle]}<button type="button" class="nh-btn nh-btn--ghost nh-btn--sm" onclick={() => retirer(cle)}>Retirer</button>{/if}
		{#if retirees[cle]}<input type="hidden" name="retirer_{cle}" value="1" />{/if}
	</div>
{/snippet}

<style>
	.fil {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		color: var(--fg-2);
	}
	.fil a {
		color: inherit;
	}
	h1 {
		font: var(--type-h1);
		letter-spacing: var(--tracking-tight);
	}
	.etapier {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.etapier li {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.pas {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 14px 8px 8px;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: var(--fg-3);
		font: inherit;
		font-weight: 500;
		font-size: 14px;
		cursor: pointer;
	}
	.pas.fait {
		color: var(--fg-2);
	}
	.pas.on {
		background: var(--surface-accent-soft);
		color: var(--fg-1);
	}
	.rond {
		width: 24px;
		height: 24px;
		border-radius: 999px;
		display: grid;
		place-items: center;
		font-size: 12px;
		font-weight: 700;
		background: var(--surface-3);
		color: var(--fg-1);
	}
	.fait .rond {
		background: var(--petrol-500);
	}
	.on .rond {
		background: var(--apricot-300);
		color: var(--apricot-ink);
	}
	.trait {
		width: 24px;
		height: 1px;
		background: var(--border-default);
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.carte {
		padding: 28px;
	}
	.pan {
		display: flex;
		flex-direction: column;
		gap: 20px;
		max-width: 520px;
	}
	.pan[hidden] {
		display: none;
	}
	.entete {
		max-width: none;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 260px;
		gap: 24px;
		align-items: start;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.apercu {
		position: relative;
		height: 240px;
		border-radius: 16px;
		overflow: hidden;
		background: var(--bg-page);
		border: 1px solid var(--border-subtle);
	}
	.a-fond {
		position: absolute;
		inset: 0;
		-webkit-mask-image: linear-gradient(to bottom, #000 30%, transparent 100%);
		mask-image: linear-gradient(to bottom, #000 30%, transparent 100%);
	}
	.a-fond img,
	.v-image img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.a-centre {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}
	.a-logo {
		max-width: 200px;
		max-height: 84px;
		object-fit: contain;
	}
	.a-titre {
		font: 700 28px/1.1 var(--font-sans);
		letter-spacing: -0.02em;
		color: var(--fg-1);
		text-shadow: 0 2px 16px rgba(0, 0, 0, 0.5);
	}
	.tags,
	.choix,
	.boutons {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.aide {
		margin: 0;
		font-size: 13px;
		color: var(--fg-2);
	}
	.cache {
		display: none;
	}
	.carte-vignette {
		border: 1px solid var(--border-subtle);
		border-radius: 16px;
		overflow: hidden;
		background: var(--surface-2);
	}
	.v-image {
		position: relative;
		aspect-ratio: 16 / 9;
		overflow: hidden;
	}
	.v-image i {
		position: absolute;
		right: -6px;
		top: 50%;
		transform: translateY(-50%) rotate(-12deg);
		font-size: 80px;
		color: rgba(255, 255, 255, 0.2);
	}
	.v-image span {
		position: absolute;
		left: 12px;
		bottom: 10px;
		font-weight: 800;
		font-size: 17px;
		color: #fff;
	}
	.v-pied {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 12px 14px;
		font-size: 13px;
		color: var(--fg-3);
	}
	.v-pied strong {
		font-size: 16px;
		color: var(--fg-1);
	}
	.ligne-etape {
		display: grid;
		grid-template-columns: 28px minmax(0, 1fr) 36px;
		gap: 12px;
		align-items: center;
	}
	.num {
		width: 28px;
		height: 28px;
		border-radius: 999px;
		background: var(--petrol-500);
		color: var(--fg-1);
		display: grid;
		place-items: center;
		font-weight: 700;
		font-size: 13px;
	}
	.pied {
		display: flex;
		justify-content: space-between;
		gap: 12px;
	}
	.pied i.icon-arrow-right {
		margin-left: 6px;
	}
	.zone {
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-top: 24px;
		padding: 18px 20px;
		border: 1px solid rgba(255, 143, 156, 0.25);
		border-radius: 16px;
	}
	.zone strong {
		color: var(--fg-1);
	}
	.danger {
		color: var(--danger-fg);
	}
	@media (max-width: 719px) {
		.entete {
			grid-template-columns: 1fr;
		}
		.carte {
			padding: 20px;
		}
	}
</style>
