<script lang="ts">
	// Calendrier des soirées (prototype « Watch list commune », vue Calendrier) : le mois en cours,
	// les soirées prévues, et « À caser » : les titres sans soirée, à glisser sur une date.
	import { page } from '$app/state';
	import Lueur from '#lib/components/Lueur.svelte';
	import Affiche from '#lib/components/films/Affiche.svelte';
	import ProgrammerSoiree from '#lib/components/films/ProgrammerSoiree.svelte';
	import { envoyer } from '#lib/actions.ts';
	import { artTitre } from '#lib/design/art.ts';
	import { dateDe, heureLisible, joursDuMois, JOURS_COURTS, libelleMois, moisVoisin } from '#lib/commune.ts';
	import type { VueSoiree } from '#lib/server/commune.ts';

	let { data } = $props();
	const connecte = $derived(data.moiId !== null);

	let plan = $state<Partial<VueSoiree> | null>(null);
	let glisse = $state<number | null>(null);
	let survol = $state<string | null>(null);

	const parId = (id: number | null) => (id ? data.liste.find((e) => e.titre.id === id) : undefined);
	const jours = $derived(joursDuMois(data.mois));
	const soireeLe = (cle: string) => data.soirees.find((s) => s.date === cle);
	const duMois = $derived(data.soirees.filter((s) => s.date.startsWith(data.mois)));
	const futures = $derived(data.soirees.filter((s) => s.date >= data.aujourdhui));
	const aCaser = $derived(data.liste.filter((e) => e.statut !== 'vu' && !futures.some((s) => s.titreId === e.titre.id)));
	const vedette = $derived(parId(futures.find((s) => s.titreId)?.titreId ?? null) ?? null);

	async function deposer(cle: string) {
		const id = glisse;
		glisse = null;
		survol = null;
		if (id === null) return;
		await envoyer('/films?/caser', { date: cle, titreId: id });
	}
	function survoler(e: DragEvent, cle: string) {
		if (glisse === null) return;
		e.preventDefault();
		survol = cle;
	}
</script>

<svelte:head><title>Calendrier des soirées · Nohriancons</title></svelte:head>

{#if vedette}<Lueur jaquette={{ art: artTitre(vedette.titre.titre), image: vedette.titre.affiche }} />{:else}<Lueur />{/if}

<main class="nh-page" style="gap:24px">
	<a href="/films" class="nh-btn nh-btn--ghost nh-btn--sm retour"><i class="icon-arrow-left" aria-hidden="true"></i>Watch list commune</a>
	<header class="tete">
		<div class="col">
			<h1>Calendrier des soirées</h1>
			<p class="intro">
				{#if !connecte}Les soirées prévues par la bande.{:else}<span class="large">Glisse un titre sur une date pour le programmer.</span><span class="etroit">Touche une date ou un titre pour programmer une soirée.</span>{/if}
			</p>
		</div>
		<nav class="mois" aria-label="Mois">
			<a href="?mois={moisVoisin(data.mois, -1)}" data-sveltekit-noscroll data-sveltekit-replacestate class="nh-btn nh-btn--outline nh-iconbtn" aria-label="Mois précédent"><i class="icon-chevron-left" aria-hidden="true"></i></a>
			<span class="m-nom" aria-live="polite">{libelleMois(data.mois)}</span>
			<a href="?mois={moisVoisin(data.mois, 1)}" data-sveltekit-noscroll data-sveltekit-replacestate class="nh-btn nh-btn--outline nh-iconbtn" aria-label="Mois suivant"><i class="icon-chevron-right" aria-hidden="true"></i></a>
		</nav>
		{#if connecte}
			<button type="button" class="nh-btn nh-btn--primary" onclick={() => (plan = {})}><i class="icon-plus" aria-hidden="true"></i>Programmer une soirée</button>
		{:else}
			<a href="/connexion?retour={encodeURIComponent(page.url.pathname)}" class="nh-btn nh-btn--outline"><i class="icon-log-in" aria-hidden="true"></i>Se connecter pour modifier</a>
		{/if}
	</header>

	<div class="corps">
		<div class="grille" role="group" aria-label="Soirées de {libelleMois(data.mois)}">
			{#each ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'] as j (j)}<span class="jsem" aria-hidden="true">{j}</span>{/each}
			{#each jours as c (c.cle)}
				{@const s = soireeLe(c.cle)}
				{@const t = parId(s?.titreId ?? null)}
				{@const passe = c.cle < data.aujourdhui}
				{@const cible = connecte && !passe}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="case"
					class:hors={!c.dansLeMois}
					class:passe={passe && !s}
					class:survol={survol === c.cle}
					ondragover={cible ? (e) => survoler(e, c.cle) : undefined}
					ondragleave={cible ? () => survol === c.cle && (survol = null) : undefined}
					ondrop={cible ? (e) => { e.preventDefault(); deposer(c.cle); } : undefined}
				>
					{#if s}
						<a href="/films?soiree={s.id}" class="remplir" aria-label="{c.numero} : {t?.titre.titre ?? 'titre à choisir'}, {heureLisible(s.heure)}">
							<span class="num" class:auj={c.cle === data.aujourdhui}>{c.numero}</span>
							<span class="bloc" class:libre={!t} class:fini={passe}>
								<span class="b-heure">{heureLisible(s.heure)}</span>
								<span class="b-titre">{t?.titre.titre ?? 'Titre à choisir'}</span>
							</span>
						</a>
					{:else if cible}
						<button type="button" class="remplir" aria-label="Programmer une soirée le {c.numero}" onclick={() => (plan = { date: c.cle })}>
							<span class="num" class:auj={c.cle === data.aujourdhui}>{c.numero}</span>
						</button>
					{:else}
						<span class="remplir"><span class="num" class:auj={c.cle === data.aujourdhui}>{c.numero}</span></span>
					{/if}
				</div>
			{/each}
		</div>

		<aside class="cote">
			<section class="nh-card panneau du-mois" aria-labelledby="mois-titre">
				<h2 id="mois-titre">Soirées du mois</h2>
				{#each duMois as s (s.id)}
					{@const t = parId(s.titreId)}
					{@const d = dateDe(s.date)}
					<a href="/films?soiree={s.id}" class="sm">
						<span class="sm-jour">{JOURS_COURTS[d.getDay()]}<b>{d.getDate()}</b></span>
						<span class="sm-txt"><span class="sm-nom">{t?.titre.titre ?? 'Titre à choisir'}</span><span class="sm-meta">{heureLisible(s.heure)} · {s.lieu}</span></span>
						<i class="icon-chevron-right" aria-hidden="true"></i>
					</a>
				{:else}
					<p class="sm-meta">Aucune soirée ce mois-ci.{connecte ? ' Touche une date pour en programmer une.' : ''}</p>
				{/each}
			</section>

			{#if connecte}
				<section class="nh-card panneau" aria-labelledby="caser-titre">
					<div class="p-tete"><h2 id="caser-titre">À caser · {aCaser.length}</h2><span class="sm-meta">par votes</span></div>
					{#each aCaser as e (e.titre.id)}
						<button
							type="button"
							class="caser"
							class:glisse={glisse === e.titre.id}
							draggable="true"
							aria-label="Programmer {e.titre.titre}"
							ondragstart={(ev) => { ev.dataTransfer?.setData('text/plain', String(e.titre.id)); if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move'; glisse = e.titre.id; }}
							ondragend={() => { glisse = null; survol = null; }}
							onclick={() => (plan = { titreId: e.titre.id })}
						>
							<i class="icon-grip-vertical poignee" aria-hidden="true"></i>
							<Affiche titre={e.titre.titre} image={e.titre.affiche} taille="mini" />
							<span class="c-nom">{e.titre.titre}</span>
							<span class="c-votes"><i class="icon-chevron-up" aria-hidden="true"></i>{e.votes.length}</span>
						</button>
					{:else}
						<p class="sm-meta">Tous les titres ont une soirée.</p>
					{/each}
				</section>
			{/if}
		</aside>
	</div>
</main>

{#if plan}
	<ProgrammerSoiree soirees={data.soirees} liste={data.liste} lieux={data.lieux} aujourdhui={data.aujourdhui} initial={plan} onfermer={() => (plan = null)} />
{/if}

<style>
	.retour {
		align-self: flex-start;
	}
	.tete {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 16px;
	}
	.col {
		flex: 1 1 280px;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	h1 {
		font: var(--type-h1);
		letter-spacing: var(--tracking-tight);
	}
	.intro {
		margin: 0;
		font-size: 16px;
		color: var(--fg-2);
	}
	.etroit {
		display: none;
	}
	.mois {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.m-nom {
		min-width: 150px;
		text-align: center;
		font-weight: 700;
		font-size: 18px;
		color: var(--fg-1);
	}
	h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 700;
		color: var(--fg-1);
	}
	.corps {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 24px;
	}
	.grille {
		flex: 1 1 600px;
		min-width: 0;
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 6px;
	}
	.jsem {
		padding: 0 4px 4px;
		font-size: 12px;
		font-weight: 500;
		color: var(--fg-2);
	}
	.case {
		min-height: 112px;
		border-radius: 12px;
		border: 1px solid var(--border-subtle);
		background: var(--surface-1);
		transition:
			background 120ms var(--ease-out),
			border-color 120ms var(--ease-out);
	}
	.case.hors {
		background: transparent;
		opacity: 0.4;
	}
	.case.passe {
		opacity: 0.55;
	}
	.case.survol {
		background: var(--surface-accent-soft);
		border: 1px dashed var(--apricot-300);
	}
	.remplir {
		width: 100%;
		height: 100%;
		min-height: inherit;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px;
		border: none;
		border-radius: inherit;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		text-decoration: none;
	}
	button.remplir,
	a.remplir {
		cursor: pointer;
	}
	button.remplir:hover,
	a.remplir:hover {
		background: var(--surface-2);
	}
	.num {
		align-self: flex-start;
		min-width: 24px;
		height: 24px;
		padding: 0 6px;
		box-sizing: border-box;
		border-radius: 999px;
		display: grid;
		place-items: center;
		font-size: 13px;
		font-weight: 500;
		color: var(--fg-2);
	}
	.num.auj {
		background: var(--apricot-300);
		color: var(--apricot-ink);
		font-weight: 700;
	}
	.bloc {
		flex: 1;
		min-height: 8px;
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 8px;
		border-radius: 8px;
		background: var(--petrol-500);
		overflow: hidden;
	}
	.bloc.fini {
		background: var(--surface-3);
	}
	.bloc.libre {
		background: transparent;
		border: 1.5px dashed var(--border-strong);
	}
	.b-heure {
		font-size: 11px;
		font-weight: 700;
		color: var(--petrol-200);
	}
	.libre .b-heure {
		color: var(--fg-2);
	}
	.b-titre {
		font: 700 14px/1.1 var(--font-condensed);
		color: var(--fg-1);
		overflow-wrap: anywhere;
	}
	.libre .b-titre {
		font: 500 13px/1.2 var(--font-sans);
		color: var(--fg-2);
	}
	.cote {
		flex: 1 1 280px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.panneau {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 16px;
	}
	.du-mois {
		display: none;
		gap: 4px;
	}
	.p-tete {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 4px;
	}
	.sm {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 48px;
		padding: 8px;
		border-radius: 12px;
		color: var(--fg-2);
		text-decoration: none;
	}
	.sm:hover {
		background: var(--surface-2);
	}
	.sm-jour {
		width: 38px;
		flex: none;
		display: flex;
		flex-direction: column;
		align-items: center;
		font-size: 11px;
		line-height: 1.1;
		color: var(--fg-3);
	}
	.sm-jour b {
		font-size: 16px;
		color: var(--fg-1);
	}
	.sm-txt {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.sm-nom {
		font-weight: 500;
		font-size: 14px;
		color: var(--fg-1);
	}
	.sm-meta {
		margin: 0;
		font-size: 13px;
		color: var(--fg-3);
	}
	.caser {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		padding: 8px;
		box-sizing: border-box;
		border-radius: 12px;
		border: 1px solid var(--border-subtle);
		background: var(--surface-2);
		color: inherit;
		text-align: left;
		cursor: grab;
	}
	.caser:hover {
		border-color: var(--border-strong);
		background: var(--surface-3);
	}
	.caser.glisse {
		opacity: 0.5;
	}
	.caser :global(.mini) {
		width: 26px;
		height: 39px;
		border-radius: 5px;
	}
	.poignee {
		font-size: 14px;
		color: var(--fg-3);
	}
	.c-nom {
		flex: 1;
		min-width: 0;
		font-weight: 500;
		font-size: 14px;
		color: var(--fg-1);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.c-votes {
		display: flex;
		align-items: center;
		gap: 2px;
		font-size: 13px;
		color: var(--fg-3);
	}
	@media (max-width: 999px) {
		.large {
			display: none;
		}
		.etroit {
			display: inline;
		}
		.du-mois {
			display: flex;
		}
		.case {
			min-height: 92px;
		}
	}
	@media (max-width: 599px) {
		.grille {
			gap: 3px;
		}
		.case {
			min-height: 54px;
			border-radius: 8px;
		}
		.remplir {
			padding: 4px;
			gap: 4px;
		}
		.bloc {
			padding: 0;
			border-radius: 4px;
		}
		.b-heure,
		.b-titre {
			display: none;
		}
		.mois {
			width: 100%;
			justify-content: space-between;
		}
	}
</style>
