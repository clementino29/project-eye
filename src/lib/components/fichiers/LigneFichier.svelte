<script lang="ts">
	// Une ligne de fichier : icône du type, nom, version, taille, puis Télécharger ou Ouvrir.
	import { NOUVEAU_PENDANT, plateformesLibelle, tailleLisible, TYPES_FICHIER } from '#lib/fichiers.ts';
	import type { VueFichier } from '#lib/server/fichiers.ts';

	let {
		f,
		meta = null,
		quand = null,
		grise = false,
		onmodifier = null
	}: {
		f: VueFichier;
		/** Remplace « Type · plateformes » (ex. sur l'accueil : le projet). */
		meta?: string | null;
		/** « hier », « il y a 3 j »… à la place de la version et de la taille. */
		quand?: string | null;
		/** Plateforme filtrée qui ne correspond pas. */
		grise?: boolean;
		onmodifier?: (() => void) | null;
	} = $props();
	const nouveau = $derived(Date.now() - f.ajouteLe < NOUVEAU_PENDANT);
</script>

<div class="ligne" class:grise class:court={!!quand}>
	<span class="icone" aria-hidden="true"><i class="icon-{f.lien ? 'external-link' : TYPES_FICHIER[f.type].icone}"></i></span>
	<div class="txt">
		<div class="nom">{f.nom}{#if nouveau}<span class="nh-badge nh-badge--accent">Nouveau</span>{/if}</div>
		<div class="meta">{meta ?? `${TYPES_FICHIER[f.type].l} · ${plateformesLibelle(f.plateformes)}`}</div>
		{#if f.note && !quand}<div class="note"><i class="icon-info" aria-hidden="true"></i>{f.note}</div>{/if}
	</div>
	{#if quand}
		<span class="quand">{quand}</span>
	{:else}
		<span class="version">{f.version ? `v${f.version}` : '—'}</span>
		<span class="taille">{f.lien ? 'Lien externe' : tailleLisible(f.taille)}</span>
	{/if}
	<span class="actions">
		{#if onmodifier}<button type="button" class="nh-btn nh-btn--ghost nh-btn--sm nh-iconbtn" aria-label="Modifier {f.nom}" title="Modifier" onclick={onmodifier}><i class="icon-pencil" aria-hidden="true"></i></button>{/if}
		{#if f.lien}
			<a href={f.lien} target="_blank" rel="noopener noreferrer" class="nh-btn nh-btn--outline nh-btn--sm">Ouvrir<i class="icon-arrow-up-right" aria-hidden="true"></i><span class="sr">(s’ouvre dans un nouvel onglet)</span></a>
		{:else}
			<a href="/fichiers/telecharger/{f.id}" download class="nh-btn nh-btn--secondary nh-btn--sm" data-sveltekit-reload><i class="icon-download" aria-hidden="true"></i>Télécharger</a>
		{/if}
	</span>
</div>

<style>
	.ligne {
		display: grid;
		grid-template-columns: 40px minmax(0, 1fr) 80px 110px auto;
		gap: 16px;
		align-items: center;
		padding: 14px 18px;
		border-top: 1px solid var(--border-subtle);
		transition:
			opacity 180ms var(--ease-out),
			background 120ms;
	}
	.ligne:first-child {
		border-top: none;
	}
	.ligne:hover {
		background: var(--surface-2);
	}
	.ligne.court {
		grid-template-columns: 40px minmax(0, 1fr) auto auto;
	}
	.grise {
		opacity: 0.4;
	}
	.icone {
		width: 40px;
		height: 40px;
		border-radius: 12px;
		background: var(--petrol-500);
		display: grid;
		place-items: center;
		color: var(--apricot-300);
		font-size: 18px;
	}
	.txt {
		min-width: 0;
	}
	.nom {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 500;
		font-size: 15px;
		color: var(--fg-1);
	}
	.meta,
	.quand,
	.taille {
		font-size: 13px;
		color: var(--fg-3);
		margin-top: 2px;
	}
	.quand {
		white-space: nowrap;
	}
	.note {
		display: flex;
		gap: 6px;
		align-items: flex-start;
		margin-top: 4px;
		font-size: 13px;
		color: var(--fg-2);
	}
	.note i {
		margin-top: 2px;
		font-size: 14px;
		color: var(--fg-3);
	}
	.version {
		font-size: 14px;
		color: var(--fg-2);
		font-variant-numeric: tabular-nums;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 6px;
	}
	.actions i.icon-arrow-up-right {
		margin-left: 4px;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	@media (max-width: 719px) {
		.ligne,
		.ligne.court {
			grid-template-columns: 40px minmax(0, 1fr);
			row-gap: 10px;
		}
		.version,
		.taille,
		.quand {
			display: none;
		}
		.actions {
			grid-column: 2;
			justify-content: flex-start;
		}
	}
</style>
