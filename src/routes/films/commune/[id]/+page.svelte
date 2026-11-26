<script lang="ts">
	// Fiche d'un titre de la Watch list commune : votes, soirée prévue, qui l'a déjà vu,
	// et pour une série les épisodes vus ensemble. Lecture seule pour les visiteurs.
	import { page } from '$app/state';
	import AvatarGroup from '#lib/components/AvatarGroup.svelte';
	import Lueur from '#lib/components/Lueur.svelte';
	import StatusPill from '#lib/components/StatusPill.svelte';
	import Affiche from '#lib/components/films/Affiche.svelte';
	import ProgrammerSoiree from '#lib/components/films/ProgrammerSoiree.svelte';
	import { envoyer } from '#lib/actions.ts';
	import { artTitre } from '#lib/design/art.ts';
	import { PASTILLES_WATCHLIST } from '#lib/design/pastilles.ts';
	import { enumerer, heureLisible, jourLong, pluriel, VOTES_MAX } from '#lib/commune.ts';
	import type { VueSoiree } from '#lib/server/commune.ts';
	import type { StatutWl } from '#lib/watchlist.ts';

	let { data } = $props();
	const e = $derived(data.entree);
	const t = $derived(e.titre);
	const connecte = $derived(data.moiId !== null);

	let envoi = $state(false);
	let plan = $state<Partial<VueSoiree> | null>(null);

	const membre = (id: number | null) => data.membres.find((m) => m.id === id);
	const prenom = (id: number | null) => (membre(id)?.nom ?? 'un ancien membre').split(' ')[0];
	const personnes = (ids: number[]) => ids.map(membre).filter((m) => m !== undefined);

	const nbEpisodes = $derived(t.saisons.reduce((n, s) => n + s.episodes, 0));
	const duree = (min: number | null) => (min ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : null);
	const surtitre = $derived(
		t.type === 'film'
			? ['Film', t.annee, duree(t.duree)].filter(Boolean).join(' · ')
			: ['Série', t.annee, pluriel(t.saisons.length, 'saison'), pluriel(nbEpisodes, 'épisode')].filter(Boolean).join(' · ')
	);
	const ajoute = $derived(new Date(e.ajouteLe).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }));
	const STATUTS = $derived<{ v: StatutWl; l: string }[]>(
		t.type === 'serie'
			? [
					{ v: 'avoir', l: 'À voir' },
					{ v: 'cours', l: 'En cours' },
					{ v: 'vu', l: 'Vu' }
				]
			: [
					{ v: 'avoir', l: 'À voir' },
					{ v: 'vu', l: 'Vu' }
				]
	);

	const prevue = $derived(data.soirees.find((s) => s.titreId === t.id && s.date >= data.aujourdhui) ?? null);
	const vote = $derived(data.moiId !== null && e.votes.includes(data.moiId));
	const peutVoter = $derived(e.statut !== 'vu');
	const plusDeVotes = $derived(!vote && data.votesUtilises >= VOTES_MAX);
	const jeLaiVu = $derived(data.moiId !== null && e.dejaVu.includes(data.moiId));
	const parWatchlist = $derived(jeLaiVu && !e.dejaVuCoche.includes(data.moiId!));

	const av = $derived(e.avancement);
	const saison = $derived(t.saisons.find((s) => s.numero === data.saison) ?? null);
	const progresTexte = $derived.by(() => {
		if (!av || !av.vusTotal) return 'Pas encore commencé';
		if (!av.prochain) return 'Tout vu ensemble';
		return `Vous en êtes à ${pluriel(av.vusTotal, 'épisode')} sur ${av.total} · prochain : S${av.prochain.saison} É${av.prochain.episode}`;
	});

	async function action(nom: string, champs: Record<string, string | number | null> = {}, silencieux = true, chemin = '?/') {
		envoi = true;
		const r = await envoyer(`${chemin}${nom}`, champs, { silencieux });
		envoi = false;
		return r;
	}
	/** Dernier épisode vu ensemble (dans l'ordre de la série), ou null. */
	const dernier = $derived.by(() => {
		if (!av || !av.vusTotal) return null;
		const ss = t.saisons;
		if (!av.prochain) return { saison: ss[ss.length - 1].numero, episode: ss[ss.length - 1].episodes };
		if (av.prochain.episode > 1) return { saison: av.prochain.saison, episode: av.prochain.episode - 1 };
		const avant = ss[ss.findIndex((x) => x.numero === av.prochain!.saison) - 1];
		return avant ? { saison: avant.numero, episode: avant.episodes } : null;
	});
	/** Toucher un épisode : vu avec ceux d'avant ; retoucher le dernier vu le retire. */
	function episode(n: number) {
		if (!saison) return;
		const cible = dernier?.saison === saison.numero && dernier.episode === n ? n - 1 : n;
		action('episode', { saison: saison.numero, episode: cible }, false);
	}
	let confirmer = $state(false);
</script>

<svelte:head><title>{t.titre} · Watch list commune · Nohriancons</title></svelte:head>

<Lueur jaquette={{ art: artTitre(t.titre), image: t.affiche }} />

<main class="nh-page" style="gap:32px">
	<a href="/films" class="nh-btn nh-btn--ghost nh-btn--sm retour"><i class="icon-arrow-left" aria-hidden="true"></i>Watch list commune</a>

	<div class="fiche">
		<div class="gauche">
			<Affiche titre={t.titre} annee={t.annee} image={t.grandeAffiche} taille="fiche" />
			{#if connecte}
				<div class="actions">
					{#if peutVoter}
						<button type="button" class="nh-btn nh-btn--block {vote ? 'nh-btn--secondary' : 'nh-btn--primary'}" aria-pressed={vote} disabled={envoi || plusDeVotes} title={plusDeVotes ? `Tu as déjà donné tes ${VOTES_MAX} votes` : undefined} onclick={() => action('voter', { titreId: t.id }, true, '/films?/')}>
							<i class="icon-chevron-up" aria-hidden="true"></i>{vote ? 'Voté' : 'Voter'} · {e.votes.length}
						</button>
						{#if plusDeVotes}<span class="aide">Tes {VOTES_MAX} votes sont pris : retires-en un pour voter ici.</span>{/if}
					{/if}
					<button type="button" class="nh-btn nh-btn--outline nh-btn--block" onclick={() => (plan = prevue ? { ...prevue } : { titreId: t.id })}><i class="icon-calendar-plus" aria-hidden="true"></i>{prevue ? 'Modifier la soirée' : 'Programmer une soirée'}</button>
				</div>
			{/if}
		</div>

		<div class="droite">
			<div class="col">
				<span class="surtitre">{surtitre}</span>
				<h1>{t.titre}</h1>
				<span class="ajout">Proposé par {prenom(e.proposeParId)} le {ajoute}</span>
			</div>

			{#if connecte}
				<div class="nh-tabs statuts" role="radiogroup" aria-label="Où en est la bande">
					{#each STATUTS as s (s.v)}
						<button type="button" role="radio" aria-checked={e.statut === s.v} class="nh-tabs__tab" class:nh-tabs__tab--active={e.statut === s.v} disabled={envoi} onclick={() => action('statut', { statut: s.v }, false)}>{s.l}</button>
					{/each}
				</div>
			{:else}
				<div><StatusPill pastille={{ ...PASTILLES_WATCHLIST[e.statut], l: e.statut === 'vu' ? 'Vu ensemble' : PASTILLES_WATCHLIST[e.statut].l }} /></div>
			{/if}

			{#if prevue}
				<a href="/films?soiree={prevue.id}" class="nh-card nh-card--brand prevue">
					<i class="icon-calendar-days" aria-hidden="true"></i>
					<span>Prévu {jourLong(prevue.date)} à {heureLisible(prevue.heure)} · {prevue.lieu}</span>
				</a>
			{/if}

			{#if t.genres.length}<div class="tags">{#each t.genres as g (g)}<span class="nh-tag">{g}</span>{/each}</div>{/if}
			{#if t.resume}<p class="resume">{t.resume}</p>{/if}

			<div class="qui">
				<div class="groupe">
					<span class="label">Déjà vu par</span>
					{#if e.dejaVu.length}
						<span class="ligne"><AvatarGroup personnes={personnes(e.dejaVu)} taille={32} max={6} /><span>{enumerer(e.dejaVu.map(prenom))}</span></span>
					{:else}
						<span class="ligne">Personne, tout le monde le découvre.</span>
					{/if}
					{#if connecte}
						<label class="nh-check" class:nh-check--disabled={parWatchlist} title={parWatchlist ? 'D’après ta watchlist' : undefined}>
							<input type="checkbox" checked={jeLaiVu} disabled={envoi || parWatchlist} onchange={(ev) => action('dejaVu', { vu: ev.currentTarget.checked ? 1 : 0 })} />
							<span class="nh-check__box"><i class="icon-check" aria-hidden="true"></i></span>
							Je l’ai déjà vu{parWatchlist ? ' (d’après ta watchlist)' : ''}
						</label>
					{/if}
				</div>
				{#if peutVoter}
					<div class="groupe">
						<span class="label">Ont voté · {e.votes.length}</span>
						{#if e.votes.length}<span class="ligne"><AvatarGroup personnes={personnes(e.votes)} taille={32} max={6} /></span>{:else}<span class="ligne">Pas encore de vote.</span>{/if}
					</div>
				{/if}
			</div>

			{#if t.type === 'serie' && saison}
				<section class="nh-card episodes" aria-labelledby="ep-titre">
					<div class="ep-tete">
						<div class="col" style="gap:2px">
							<h2 id="ep-titre">Épisodes vus ensemble</h2>
							<span class="aide">{progresTexte}</span>
						</div>
						{#if t.saisons.length > 1}
							<nav class="nh-tabs saisons" aria-label="Saisons">
								{#each t.saisons as s (s.numero)}
									<a href="?saison={s.numero}" data-sveltekit-noscroll data-sveltekit-replacestate class="nh-tabs__tab" class:nh-tabs__tab--active={s.numero === data.saison} aria-current={s.numero === data.saison ? 'true' : undefined}>Saison {s.numero}</a>
								{/each}
							</nav>
						{/if}
					</div>
					<div class="eps">
						{#each data.episodes as x (x.numero)}
							{@const suivant = av?.prochain?.saison === saison.numero && av.prochain.episode === x.numero}
							{#if connecte}
								<button type="button" class="ep" class:vu={x.vu} class:suivant aria-pressed={x.vu} title="S{saison.numero} É{x.numero} · {x.nom}" aria-label="Épisode {x.numero} : {x.nom}{x.vu ? ', vu ensemble' : ''}" disabled={envoi} onclick={() => episode(x.numero)}>{x.numero}</button>
							{:else}
								<span class="ep" class:vu={x.vu} class:suivant title="S{saison.numero} É{x.numero} · {x.nom}">{x.numero}</span>
							{/if}
						{/each}
					</div>
					{#if connecte}<span class="aide">Touche un épisode pour marquer que vous l’avez vu, avec tous ceux d’avant.</span>{/if}
				</section>
			{/if}

			<div class="pied">
				{#if connecte}
					<a href="/films/titre/{t.id}" class="nh-btn nh-btn--ghost"><i class="icon-list-video" aria-hidden="true"></i>{data.maWatchlist ? 'Dans ma watchlist' : 'Ajouter à ma watchlist'}</a>
					{#if confirmer}
						<span class="confirmer">
							<span class="aide">Les votes et les épisodes vus ensemble seront perdus.</span>
							<button type="button" class="nh-btn nh-btn--danger" disabled={envoi} onclick={() => action('retirer', {}, false)}>Retirer</button>
							<button type="button" class="nh-btn nh-btn--ghost" onclick={() => (confirmer = false)}>Annuler</button>
						</span>
					{:else}
						<button type="button" class="nh-btn nh-btn--ghost danger" onclick={() => (confirmer = true)}><i class="icon-trash-2" aria-hidden="true"></i>Retirer de la liste commune</button>
					{/if}
				{:else}
					<a href="/connexion?retour={encodeURIComponent(page.url.pathname)}" class="nh-btn nh-btn--outline"><i class="icon-log-in" aria-hidden="true"></i>Se connecter pour modifier</a>
				{/if}
			</div>
		</div>
	</div>
</main>

{#if plan}
	<ProgrammerSoiree soirees={data.soirees} liste={data.liste} lieux={data.lieux} aujourdhui={data.aujourdhui} initial={plan} onfermer={() => (plan = null)} />
{/if}

<style>
	.retour {
		align-self: flex-start;
	}
	.fiche {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 40px;
	}
	.gauche {
		flex: none;
		width: 260px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.actions {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-top: 6px;
	}
	.droite {
		flex: 1 1 480px;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 20px;
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
		text-wrap: balance;
	}
	h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 700;
		color: var(--fg-1);
	}
	.ajout,
	.aide {
		font-size: 14px;
		color: var(--fg-2);
	}
	.statuts {
		align-self: flex-start;
	}
	.prevue {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px;
		color: var(--fg-1);
		font-weight: 500;
		font-size: 15px;
		text-decoration: none;
	}
	.prevue i {
		font-size: 20px;
		color: var(--apricot-300);
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.resume {
		margin: 0;
		max-width: 68ch;
		font-size: 16px;
		line-height: 1.6;
		color: var(--fg-2);
	}
	.qui {
		display: flex;
		flex-wrap: wrap;
		gap: 24px 40px;
	}
	.groupe {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.label {
		font: var(--type-overline);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--fg-2);
	}
	.ligne {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;
		color: var(--fg-2);
	}
	.episodes {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 20px;
	}
	.ep-tete {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.saisons {
		max-width: 100%;
		overflow-x: auto;
	}
	.saisons .nh-tabs__tab {
		white-space: nowrap;
		text-decoration: none;
	}
	.eps {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.ep {
		width: 40px;
		height: 40px;
		display: grid;
		place-items: center;
		box-sizing: border-box;
		border-radius: 12px;
		border: 1px solid var(--border-default);
		background: var(--surface-2);
		color: var(--fg-2);
		font-weight: 500;
		font-size: 14px;
		transition: background 120ms var(--ease-out);
	}
	button.ep {
		cursor: pointer;
	}
	button.ep:hover:not(.vu) {
		background: var(--surface-3);
	}
	.ep.vu {
		background: var(--petrol-500);
		border-color: transparent;
		color: var(--fg-1);
	}
	.ep.suivant {
		border: 2px solid var(--apricot-300);
		color: var(--apricot-300);
	}
	.pied {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding-top: 8px;
		border-top: 1px solid var(--border-subtle);
	}
	.danger {
		color: var(--danger-fg);
	}
	.confirmer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	@media (max-width: 559px) {
		.fiche {
			gap: 24px;
		}
		.gauche {
			width: 100%;
			flex-direction: row;
			align-items: flex-start;
			gap: 16px;
		}
		.actions {
			flex: 1;
			margin-top: 0;
		}
		h1 {
			font-size: 30px;
			line-height: 1.15;
		}
		.ep {
			width: 44px;
			height: 44px;
		}
	}
</style>
