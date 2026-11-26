<script lang="ts">
	// Watch list commune (prototype « Watch list commune ») : la prochaine soirée, ce qu'on suit
	// ensemble, ce qu'il reste à voir (avec les votes) et ce qu'on a déjà vu.
	// Les visiteurs voient tout en lecture seule, avec les prénoms seulement.
	import { page } from '$app/state';
	import AvatarGroup from '#lib/components/AvatarGroup.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import Lueur from '#lib/components/Lueur.svelte';
	import Affiche from '#lib/components/films/Affiche.svelte';
	import AjouterCommune from '#lib/components/films/AjouterCommune.svelte';
	import ProgrammerSoiree from '#lib/components/films/ProgrammerSoiree.svelte';
	import { envoyer } from '#lib/actions.ts';
	import { artTitre } from '#lib/design/art.ts';
	import { dateDe, heureLisible, jourCourt, jourLong, JOURS_COURTS, majuscule, pluriel, VOTES_MAX } from '#lib/commune.ts';
	import type { EntreeCommune, VueSoiree } from '#lib/server/commune.ts';
	import type { TypeTitre } from '#lib/watchlist.ts';

	let { data } = $props();
	const connecte = $derived(data.moiId !== null);

	// Soirée mise en avant : celle choisie dans « À venir » (ou ?soiree= depuis le calendrier).
	let selection = $state<number | null>(Number(page.url.searchParams.get('soiree')) || null);
	let filtre = $state<'tout' | TypeTitre>('tout');
	let toutVoir = $state(false);
	let ajout = $state(false);
	let plan = $state<Partial<VueSoiree> | null>(null);
	let changer = $state(false);
	let envoi = $state<string | null>(null);

	const membre = (id: number | null) => data.membres.find((m) => m.id === id);
	const prenom = (id: number | null) => (membre(id)?.nom ?? 'un ancien membre').split(' ')[0];
	const personnes = (ids: number[]) => ids.map(membre).filter((m) => m !== undefined);
	const parId = (id: number | null) => (id ? data.liste.find((e) => e.titre.id === id) : undefined);
	const typeLibelle = (t: TypeTitre) => (t === 'film' ? 'Film' : 'Série');

	const futures = $derived(data.soirees.filter((s) => s.date >= data.aujourdhui));
	const prochaineDe = (titreId: number) => futures.find((s) => s.titreId === titreId);
	const sel = $derived(data.soirees.find((s) => s.id === selection) ?? futures[0] ?? null);
	const passee = $derived(!!sel && sel.date < data.aujourdhui);
	const heros = $derived(parId(sel?.titreId ?? null) ?? null);
	const jeViens = $derived(!!sel && data.moiId !== null && sel.viennent.includes(data.moiId));

	const aVoirTout = $derived(data.liste.filter((e) => e.statut === 'avoir'));
	const aVoir = $derived(aVoirTout.filter((e) => filtre === 'tout' || e.titre.type === filtre));
	const enCours = $derived(data.liste.filter((e) => e.statut === 'cours'));
	const vus = $derived(data.liste.filter((e) => e.statut === 'vu').sort((a, b) => (b.finiLe ?? 0) - (a.finiLe ?? 0)));
	const candidats = $derived(data.liste.filter((e) => e.statut !== 'vu'));
	const suggestions = $derived(candidats.filter((e) => !prochaineDe(e.titre.id)).slice(0, 3));
	const restants = $derived(VOTES_MAX - data.votesUtilises);

	// Fond flou : le titre de la soirée affichée, sinon la première série en cours.
	const vedette = $derived(heros ?? enCours[0] ?? null);

	const etiquette = $derived(!sel ? 'Prochaine soirée' : passee ? 'Soirée passée' : sel.id === futures[0]?.id ? 'Prochaine soirée' : 'Soirée prévue');
	const sousTitre = $derived(
		heros && sel ? [sel.note, pluriel(heros.votes.length, 'vote'), `proposé par ${prenom(heros.proposeParId)}`].filter(Boolean).join(' · ') : ''
	);
	const viennentTexte = $derived.by(() => {
		if (!sel) return '';
		const n = sel.viennent.length;
		const qui = n === 0 ? 'Personne pour l’instant' : n === 1 ? `${prenom(sel.viennent[0])} vient` : `${n} viennent`;
		return passee ? qui : `${qui} · ${data.membres.length - n} sans réponse`;
	});
	const dansListe = $derived(Object.fromEntries(data.liste.map((e) => [e.cleTmdb, e.titre.id])));
	const soireesLibres = $derived(futures.filter((s) => !s.titreId).map((s) => ({ id: s.id, date: s.date })));

	const progression = (e: EntreeCommune) => {
		const a = e.avancement;
		if (!a) return { pct: 0, ou: '', prochain: 'Pas encore commencé' };
		const pct = a.total ? Math.round((a.vusTotal / a.total) * 100) : 0;
		const ou = a.vusTotal ? (a.prochain ? `S${a.saison} É${Math.max(a.vusSaison, 1)}` : 'Tout vu') : '';
		return { pct, ou, prochain: a.prochain ? `Prochain : S${a.prochain.saison} É${a.prochain.episode}` : 'Tout vu' };
	};

	async function action(nom: string, champs: Record<string, string | number | null>, cle: string, silencieux = false) {
		envoi = cle;
		const r = await envoyer(`?/${nom}`, champs, { silencieux });
		envoi = null;
		return r;
	}
	const voter = (e: EntreeCommune) => action('voter', { titreId: e.titre.id }, `v${e.titre.id}`, true);
	const venir = () => sel && action('venir', { soiree: sel.id }, 'venir', true);
	async function choisirTitre(titreId: number | null) {
		if (!sel) return;
		if (await action('choisir', { soiree: sel.id, titreId }, 'choisir')) changer = false;
	}
</script>

<svelte:head><title>Watch list commune · Nohriancons</title></svelte:head>

{#if vedette}<Lueur jaquette={{ art: artTitre(vedette.titre.titre), image: vedette.titre.affiche }} />{:else}<Lueur />{/if}

<main class="nh-page commune" class:sans-cours={!enCours.length}>
	<header class="tete">
		<div class="col">
			<span class="surtitre">Films &amp; séries</span>
			<h1>Watch list commune</h1>
			<p class="intro">Ce qu'on regarde ensemble, et ce qu'il nous reste à voir.</p>
		</div>
		{#if connecte}
			<button type="button" class="nh-btn nh-btn--primary nh-btn--lg" onclick={() => (ajout = true)}><i class="icon-plus" aria-hidden="true"></i>Ajouter</button>
		{:else}
			<a href="/connexion?retour={encodeURIComponent(page.url.pathname)}" class="nh-btn nh-btn--outline"><i class="icon-log-in" aria-hidden="true"></i>Se connecter pour modifier</a>
		{/if}
	</header>

	<section class="nh-card bandeau" aria-labelledby="soiree-titre">
		<div class="heros">
			{#if heros}
				<a href="/films/commune/{heros.titre.id}" class="h-affiche" aria-label="Voir la fiche de {heros.titre.titre}">
					<Affiche titre={heros.titre.titre} annee={heros.titre.annee} image={heros.titre.affiche} taille="potes">
						<span class="type">{typeLibelle(heros.titre.type)}</span>
					</Affiche>
				</a>
			{:else}
				<div class="h-affiche vide-affiche" aria-hidden="true"><i class="icon-clapperboard"></i></div>
			{/if}
			<div class="h-corps">
				<span class="surtitre" id="soiree-titre">{etiquette}</span>
				{#if sel}
					<span class="h-date">{majuscule(jourLong(sel.date))} · {heureLisible(sel.heure)} · {sel.lieu}</span>
					{#if heros}
						<h2 class="h-titre"><a href="/films/commune/{heros.titre.id}">{heros.titre.titre}</a></h2>
						<span class="h-sous">{sousTitre}</span>
					{:else}
						<h2 class="h-titre">Titre à choisir</h2>
						{#if suggestions.length && !passee}
							<span class="h-sous">Les plus votés du moment :</span>
							<div class="tags">
								{#each suggestions as e (e.titre.id)}
									{#if connecte}
										<button type="button" class="nh-tag nh-tag--clickable" disabled={envoi === 'choisir'} onclick={() => choisirTitre(e.titre.id)}><i class="icon-plus" aria-hidden="true"></i>{e.titre.titre} · {pluriel(e.votes.length, 'vote')}</button>
									{:else}
										<span class="nh-tag">{e.titre.titre} · {pluriel(e.votes.length, 'vote')}</span>
									{/if}
								{/each}
							</div>
						{/if}
					{/if}
					<div class="h-viennent">
						{#if sel.viennent.length}<AvatarGroup personnes={personnes(sel.viennent)} taille={28} max={6} />{/if}
						<span>{viennentTexte}</span>
					</div>
					<div class="h-boutons">
						{#if passee}
							<span class="h-sous">{heros ? 'Vous l’avez regardé ensemble.' : 'Cette soirée est passée.'}</span>
						{:else if connecte}
							<button type="button" class="nh-btn {jeViens ? 'nh-btn--outline' : 'nh-btn--primary'}" aria-pressed={jeViens} disabled={envoi === 'venir'} onclick={venir}>{#if jeViens}<i class="icon-check" aria-hidden="true"></i>{/if}Je viens</button>
							<button type="button" class="nh-btn nh-btn--ghost" onclick={() => (changer = true)}><i class="icon-repeat" aria-hidden="true"></i>{heros ? 'Changer de titre' : 'Choisir un titre'}</button>
							<button type="button" class="nh-btn nh-btn--ghost" onclick={() => (plan = { ...sel })}><i class="icon-pencil" aria-hidden="true"></i>Modifier</button>
						{/if}
					</div>
				{:else}
					<h2 class="h-titre">Pas de soirée prévue</h2>
					<span class="h-sous">
						{#if suggestions.length}Les plus votés du moment : {suggestions.map((e) => e.titre.titre).join(', ')}.{:else}Ajoutez des titres à la liste, puis programmez une soirée.{/if}
					</span>
					{#if connecte}
						<div class="h-boutons"><button type="button" class="nh-btn nh-btn--primary" onclick={() => (plan = {})}><i class="icon-calendar-plus" aria-hidden="true"></i>Programmer une soirée</button></div>
					{/if}
				{/if}
			</div>
		</div>
		<div class="avenir">
			<span class="a-label">À venir</span>
			{#each futures.slice(0, 6) as s (s.id)}
				{@const t = parId(s.titreId)}
				{@const d = dateDe(s.date)}
				<button type="button" class="a-soiree" class:on={sel?.id === s.id} aria-pressed={sel?.id === s.id} onclick={() => (selection = s.id)}>
					<span class="a-jour">{JOURS_COURTS[d.getDay()]}<b>{d.getDate()}</b></span>
					<span class="a-txt"><span class="a-nom">{t?.titre.titre ?? 'Titre à choisir'}</span><span class="a-meta">{heureLisible(s.heure)} · {s.lieu}</span></span>
				</button>
			{:else}
				<span class="a-meta">Rien de prévu pour l’instant.</span>
			{/each}
			{#if connecte}<button type="button" class="nh-btn nh-btn--outline nh-iconbtn" aria-label="Programmer une soirée" title="Programmer une soirée" onclick={() => (plan = {})}><i class="icon-plus" aria-hidden="true"></i></button>{/if}
			<span class="espace"></span>
			<a href="/films/calendrier" class="nh-btn nh-btn--ghost nh-btn--sm"><i class="icon-calendar-days" aria-hidden="true"></i>Calendrier</a>
		</div>
	</section>

	{#if enCours.length}
		<section class="cours" aria-labelledby="cours-titre">
			<h2 id="cours-titre">On en est où</h2>
			<div class="c-grille">
				{#each enCours as e (e.titre.id)}
					{@const p = progression(e)}
					<a href="/films/commune/{e.titre.id}" class="nh-card nh-card--interactive c-carte">
						<Affiche titre={e.titre.titre} image={e.titre.affiche} taille="mini" />
						<span class="c-corps">
							<span class="c-haut"><span class="c-nom">{e.titre.titre}</span><span class="c-ou">{p.ou}</span></span>
							<span class="barre" role="progressbar" aria-label="Épisodes vus ensemble" aria-valuemin="0" aria-valuemax="100" aria-valuenow={p.pct}><span style:width="{p.pct}%"></span></span>
							<span class="c-suivant">{p.prochain}</span>
						</span>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<section class="voir" aria-labelledby="voir-titre">
		<div class="v-tete">
			<div class="v-txt">
				<h2 id="voir-titre">Il nous reste à voir · {aVoirTout.length}</h2>
				<p class="v-votes">
					{#if !connecte}Le plus voté passe à la prochaine soirée.{:else if restants <= 0}Tu as donné tes {VOTES_MAX} votes. Retire-en un pour en changer.{:else}Il te reste {pluriel(restants, 'vote')} sur {VOTES_MAX}. Le plus voté passe à la prochaine soirée.{/if}
				</p>
			</div>
			<div class="nh-tabs" role="tablist" aria-label="Type">
				{#each [['tout', 'Tout'], ['film', 'Films'], ['serie', 'Séries']] as [v, l] (v)}
					{@const n = aVoirTout.filter((e) => v === 'tout' || e.titre.type === v).length}
					<button type="button" role="tab" aria-selected={filtre === v} class="nh-tabs__tab" class:nh-tabs__tab--active={filtre === v} onclick={() => (filtre = v as typeof filtre)}>{l} <span class="nh-tabs__count">{n}</span></button>
				{/each}
			</div>
		</div>
		{#if aVoir.length}
			<div class="grille">
				{#each aVoir as e (e.titre.id)}
					{@const vote = data.moiId !== null && e.votes.includes(data.moiId)}
					{@const prevue = prochaineDe(e.titre.id)}
					<div class="carte">
						<div class="p-affiche">
							<a href="/films/commune/{e.titre.id}" class="p-lien" aria-label="Voir la fiche de {e.titre.titre}">
								<Affiche titre={e.titre.titre} annee={e.titre.annee} image={e.titre.affiche}>
									<span class="type">{typeLibelle(e.titre.type)}</span>
								</Affiche>
							</a>
							{#if connecte}
								<button type="button" class="vote" class:on={vote} aria-pressed={vote} aria-label="{vote ? 'Retirer mon vote pour' : 'Voter pour'} {e.titre.titre} ({pluriel(e.votes.length, 'vote')})" title={vote ? 'Retirer mon vote' : 'Voter pour celui-là'} disabled={envoi === `v${e.titre.id}`} onclick={() => voter(e)}><i class="icon-chevron-up" aria-hidden="true"></i>{e.votes.length}</button>
							{:else}
								<span class="vote" aria-label={pluriel(e.votes.length, 'vote')}><i class="icon-chevron-up" aria-hidden="true"></i>{e.votes.length}</span>
							{/if}
						</div>
						<a href="/films/commune/{e.titre.id}" class="p-nom">{e.titre.titre}</a>
						<span class="p-meta">Proposé par {prenom(e.proposeParId)}</span>
						{#if e.dejaVu.length}<span class="p-vu"><AvatarGroup personnes={personnes(e.dejaVu)} taille={20} max={3} />déjà vu</span>{/if}
						{#if prevue}<span><span class="nh-badge nh-badge--brand">{jourCourt(prevue.date)}</span></span>{/if}
					</div>
				{/each}
			</div>
		{:else}
			<div class="nh-card vide">
				<p class="v-titre">{aVoirTout.length ? 'Rien dans ce filtre.' : 'La liste est vide.'}</p>
				<p class="v-votes">{aVoirTout.length ? 'Change de filtre pour voir le reste.' : 'Ajoutez un film ou une série à regarder ensemble.'}</p>
				{#if connecte && !aVoirTout.length}<button type="button" class="nh-btn nh-btn--outline" onclick={() => (ajout = true)}>Ajouter un titre</button>{/if}
			</div>
		{/if}
	</section>

	{#if vus.length}
		<section class="vus" aria-labelledby="vus-titre">
			<div class="v-tete">
				<h2 id="vus-titre">Déjà vu ensemble · {vus.length}</h2>
				{#if vus.length > 8}<button type="button" class="nh-btn nh-btn--ghost nh-btn--sm" aria-expanded={toutVoir} onclick={() => (toutVoir = !toutVoir)}>{toutVoir ? 'Réduire' : 'Tout voir'}</button>{/if}
			</div>
			<div class="g-vus">
				{#each toutVoir ? vus : vus.slice(0, 8) as e (e.titre.id)}
					<a href="/films/commune/{e.titre.id}" class="vu" title={e.titre.titre}><Affiche titre={e.titre.titre} image={e.titre.affiche} taille="potes" /></a>
				{/each}
			</div>
		</section>
	{/if}
</main>

{#if ajout}
	<AjouterCommune idees={data.idees} configure={data.tmdbConfigure} {dansListe} membres={data.membres} {soireesLibres} onfermer={() => (ajout = false)} />
{/if}

{#if plan}
	<ProgrammerSoiree soirees={data.soirees} liste={data.liste} lieux={data.lieux} aujourdhui={data.aujourdhui} initial={plan} onfermer={() => (plan = null)} onfini={(id) => (selection = id)} />
{/if}

{#if changer && sel}
	<Dialog titre="Choisir le titre" description="Pour {jourLong(sel.date)}, classés par votes." largeur={520} onfermer={() => (changer = false)}>
		<div class="candidats">
			{#each candidats as e (e.titre.id)}
				<button type="button" class="cand" class:on={sel.titreId === e.titre.id} aria-pressed={sel.titreId === e.titre.id} disabled={envoi === 'choisir'} onclick={() => choisirTitre(e.titre.id)}>
					<Affiche titre={e.titre.titre} image={e.titre.affiche} taille="mini" />
					<span class="cand-txt"><span class="cand-nom">{e.titre.titre}</span><span class="cand-meta">{typeLibelle(e.titre.type)} · proposé par {prenom(e.proposeParId)}</span></span>
					<span class="cand-votes"><i class="icon-chevron-up" aria-hidden="true"></i>{e.votes.length}</span>
				</button>
			{:else}
				<p class="v-votes">La liste est vide : ajoutez d’abord un titre.</p>
			{/each}
		</div>
		<div class="cand-pied"><button type="button" class="nh-btn nh-btn--ghost" disabled={envoi === 'choisir' || !sel.titreId} onclick={() => choisirTitre(null)}>Laisser à choisir</button></div>
	</Dialog>
{/if}

<style>
	.commune {
		gap: 32px;
	}
	.tete {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16px;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.surtitre {
		font: var(--type-overline);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--fg-brand);
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
	h2 {
		margin: 0;
		font-size: 22px;
		line-height: 1.3;
		font-weight: 700;
		color: var(--fg-1);
	}

	/* Bandeau : soirée affichée + « À venir » */
	.bandeau {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 24px;
	}
	.heros {
		display: flex;
		gap: 24px;
	}
	.h-affiche {
		flex: none;
		width: 150px;
		align-self: flex-start;
		text-decoration: none;
	}
	.vide-affiche {
		aspect-ratio: 2 / 3;
		border-radius: 12px;
		border: 1.5px dashed var(--border-strong);
		display: grid;
		place-items: center;
		color: var(--fg-3);
		font-size: 28px;
	}
	.h-corps {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.h-date {
		font-weight: 500;
		font-size: 15px;
		color: var(--fg-2);
	}
	.h-titre {
		font: var(--type-h2);
		letter-spacing: var(--tracking-tight);
		text-wrap: balance;
	}
	.h-titre a {
		color: inherit;
		text-decoration: none;
	}
	.h-titre a:hover {
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	.h-sous {
		font-size: 14px;
		color: var(--fg-2);
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.h-viennent {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 4px;
		font-size: 14px;
		color: var(--fg-2);
	}
	.h-boutons {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: auto;
		padding-top: 8px;
	}
	.type {
		position: absolute;
		top: 12px;
		left: 12px;
		z-index: 1;
		font: 700 11px/1 var(--font-sans);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--petrol-200);
		text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
	}
	.avenir {
		display: flex;
		align-items: center;
		gap: 8px;
		border-top: 1px solid var(--border-subtle);
		padding-top: 14px;
		overflow-x: auto;
	}
	.a-label {
		flex: none;
		margin-right: 6px;
		font: var(--type-overline);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--fg-2);
	}
	.a-soiree {
		flex: none;
		display: flex;
		align-items: center;
		gap: 10px;
		height: 52px;
		padding: 0 14px 0 8px;
		border-radius: 12px;
		border: 1px solid var(--border-subtle);
		background: transparent;
		color: var(--fg-2);
		text-align: left;
		cursor: pointer;
		transition: background 120ms var(--ease-out);
	}
	.a-soiree:hover {
		background: var(--surface-2);
	}
	.a-soiree.on {
		background: var(--surface-accent-soft);
		border-color: rgba(244, 178, 122, 0.4);
	}
	.a-jour {
		width: 34px;
		display: flex;
		flex-direction: column;
		align-items: center;
		font-size: 11px;
		line-height: 1.1;
		color: var(--fg-3);
	}
	.a-jour b {
		font-size: 16px;
		color: var(--fg-1);
	}
	.a-txt {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-width: 160px;
	}
	.a-nom {
		font-weight: 500;
		font-size: 13px;
		color: var(--fg-1);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.a-meta {
		font-size: 12px;
		color: var(--fg-3);
		white-space: nowrap;
	}
	.espace {
		flex: 1;
	}

	/* On en est où */
	.cours,
	.voir,
	.vus {
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-width: 0;
	}
	.c-grille {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(250px, 100%), 1fr));
		gap: 16px;
	}
	.c-carte {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px;
		color: inherit;
		text-decoration: none;
	}
	.c-corps {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.c-haut {
		display: flex;
		justify-content: space-between;
		gap: 8px;
	}
	.c-nom {
		font-weight: 500;
		font-size: 15px;
		color: var(--fg-1);
	}
	.c-ou,
	.c-suivant {
		font-size: 13px;
		color: var(--fg-3);
		white-space: nowrap;
	}
	.barre {
		display: block;
		height: 6px;
		border-radius: 999px;
		background: var(--surface-3);
		overflow: hidden;
	}
	.barre span {
		display: block;
		height: 100%;
		background: var(--petrol-300);
		border-radius: 999px;
	}

	/* Il nous reste à voir */
	.v-tete {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px 16px;
	}
	.v-txt {
		flex: 1 1 240px;
		min-width: 0;
	}
	.v-votes {
		margin: 4px 0 0;
		font-size: 14px;
		color: var(--fg-2);
	}
	.grille {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 24px 16px;
	}
	.carte {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}
	.p-affiche {
		position: relative;
		margin-bottom: 5px;
		transition: transform 180ms var(--ease-out);
	}
	.p-affiche:hover {
		transform: translateY(-2px);
	}
	.p-lien {
		display: block;
		text-decoration: none;
	}
	.vote {
		position: absolute;
		top: 8px;
		right: 8px;
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 4px;
		height: 28px;
		padding: 0 10px 0 8px;
		border-radius: 999px;
		border: 1px solid var(--border-strong);
		background: rgba(7, 14, 19, 0.78);
		color: var(--fg-1);
		font-weight: 700;
		font-size: 13px;
		transition: background 120ms var(--ease-out);
	}
	button.vote {
		cursor: pointer;
	}
	button.vote:hover:not(.on) {
		background: rgba(7, 14, 19, 0.92);
	}
	.vote.on {
		background: var(--apricot-300);
		border-color: var(--apricot-300);
		color: var(--apricot-ink);
	}
	.vote i {
		font-size: 15px;
	}
	.p-nom {
		font-weight: 500;
		font-size: 14px;
		color: var(--fg-1);
		text-decoration: none;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.p-meta {
		font-size: 13px;
		color: var(--fg-3);
	}
	.p-vu {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--fg-3);
	}
	.vide {
		padding: 40px 24px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		text-align: center;
	}
	.v-titre {
		margin: 0;
		font-size: 18px;
		font-weight: 500;
		color: var(--fg-1);
	}

	/* Déjà vu ensemble */
	.g-vus {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
		gap: 12px;
	}
	.vu {
		opacity: 0.85;
		text-decoration: none;
		transition: opacity 120ms;
	}
	.vu:hover {
		opacity: 1;
	}

	/* Fenêtre « Choisir le titre » */
	.candidats {
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-height: 400px;
		overflow-y: auto;
		margin: 0 -8px;
		padding: 0 8px;
	}
	.cand {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px;
		border: none;
		border-radius: 12px;
		background: transparent;
		color: var(--fg-2);
		text-align: left;
		cursor: pointer;
	}
	.cand:hover,
	.cand.on {
		background: var(--surface-3);
	}
	.cand-txt {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.cand-nom {
		font-weight: 500;
		font-size: 15px;
		color: var(--fg-1);
	}
	.cand-meta,
	.cand-votes {
		font-size: 13px;
		color: var(--fg-3);
	}
	.cand-votes {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.cand-pied {
		display: flex;
		justify-content: flex-end;
		margin-top: 12px;
	}

	/* Grand écran : « On en est où » dans une colonne à droite, comme le prototype. */
	@media (min-width: 1400px) {
		.commune {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 360px;
			grid-template-areas: 'tete tete' 'bandeau bandeau' 'voir cours' 'vus cours';
			align-items: start;
		}
		.tete {
			grid-area: tete;
		}
		.bandeau {
			grid-area: bandeau;
		}
		.voir {
			grid-area: voir;
		}
		.vus {
			grid-area: vus;
		}
		.cours {
			grid-area: cours;
		}
		.c-grille {
			grid-template-columns: 1fr;
		}
		.commune.sans-cours {
			grid-template-columns: minmax(0, 1fr);
			grid-template-areas: 'tete' 'bandeau' 'voir' 'vus';
		}
	}
	@media (max-width: 799px) {
		.h-affiche {
			width: 120px;
		}
		.h-titre {
			font-size: 28px;
			line-height: 1.25;
		}
	}
	@media (max-width: 559px) {
		.bandeau {
			padding: 16px;
		}
		.heros {
			gap: 16px;
		}
		.h-affiche {
			width: 92px;
		}
		.h-titre {
			font-size: 22px;
		}
		.grille {
			grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
			gap: 20px 12px;
		}
		.v-tete .nh-tabs {
			max-width: 100%;
			overflow-x: auto;
		}
	}
</style>
