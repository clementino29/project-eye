<script lang="ts">
	// Fiche d'un film ou d'une série (prototype « Fiche titre ») : statut, note, épisodes, « Chez les potes », avis.
	import Avatar from '#lib/components/Avatar.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import Lueur from '#lib/components/Lueur.svelte';
	import StatusPill from '#lib/components/StatusPill.svelte';
	import Affiche from '#lib/components/films/Affiche.svelte';
	import { envoyer } from '#lib/actions.ts';
	import { artTitre } from '#lib/design/art.ts';
	import { PASTILLES_WATCHLIST } from '#lib/design/pastilles.ts';
	import { LIBELLES_WL, type StatutWl } from '#lib/watchlist.ts';

	let { data } = $props();
	const t = $derived(data.titre);

	const STATUTS: StatutWl[] = ['avoir', 'cours', 'vu'];
	let envoi = $state(false);
	let avis = $state('');
	let avisSynchro = $state<string | null | undefined>(undefined);
	$effect.pre(() => {
		// Reprend l'avis enregistré quand on change de titre ou après une publication.
		const enregistre = data.moi?.avis ?? '';
		if (avisSynchro !== enregistre) {
			avis = enregistre;
			avisSynchro = enregistre;
		}
	});
	let conseil = $state<{ a: number[]; message: string } | null>(null);

	const nbEpisodes = $derived(t.saisons.reduce((n, s) => n + s.episodes, 0));
	const duree = (min: number | null) => (min ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : null);
	const surtitre = $derived(
		t.type === 'film'
			? ['Film', t.annee, duree(t.duree)].filter(Boolean).join(' · ')
			: ['Série', t.annee, `${t.saisons.length} saison${t.saisons.length > 1 ? 's' : ''}`, `${nbEpisodes} épisode${nbEpisodes > 1 ? 's' : ''}`]
					.filter(Boolean)
					.join(' · ')
	);
	const ligneAffiche = $derived(
		t.type === 'film'
			? [t.annee, duree(t.duree)].filter(Boolean).join(' · ')
			: [t.annee, `${t.saisons.length} saison${t.saisons.length > 1 ? 's' : ''}`].filter(Boolean).join(' · ')
	);
	const saison = $derived(t.saisons.find((s) => s.numero === data.saison) ?? null);
	const vusSaison = $derived(data.episodes.filter((e) => e.vu).length);
	const pct = $derived(data.episodes.length ? Math.round((vusSaison / data.episodes.length) * 100) : 0);
	const prochain = $derived(data.episodes.find((e) => !e.vu)?.numero ?? null);

	const prenom = (nom: string) => nom.split(' ')[0];
	const date = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
	const liste = (noms: string[]) => (noms.length > 1 ? `${noms.slice(0, -1).join(', ')} et ${noms.at(-1)}` : (noms[0] ?? ''));
	type Pote = (typeof data.potes)[number];
	const detail = (p: Pote) => {
		if (p.statut === 'cours' && p.avancement) return `S${p.avancement.saison} · É${p.avancement.vusSaison} sur ${p.avancement.totalSaison}`;
		const bouts = [p.note ? `Note : ${p.note}/5` : null, p.avis ? `« ${p.avis} »` : null].filter(Boolean);
		return bouts.length ? bouts.join(' · ') : `Ajouté le ${date(p.ajouteLe)}`;
	};

	async function action(nom: string, champs: Record<string, string | number | number[] | null> = {}, silencieux = true) {
		envoi = true;
		const r = await envoyer(`?/${nom}`, champs, { silencieux });
		envoi = false;
		return r;
	}
	const cocher = (numero: number, vu: boolean) => action('episode', { saison: data.saison, episode: numero, vu: vu ? 1 : 0 });
	const noter = (n: number) => action('note', { note: data.moi?.note === n ? 0 : n });
	async function envoyerConseil() {
		if (!conseil?.a.length) return;
		if (await action('conseiller', { a: conseil.a, message: conseil.message }, false)) conseil = null;
	}
</script>

<svelte:head><title>{t.titre} · Nohriancons</title></svelte:head>

<Lueur jaquette={{ art: artTitre(t.titre), image: t.affiche }} />

<main class="nh-page" style="gap:40px">
	<a href="/films/ma-watchlist" class="nh-btn nh-btn--ghost nh-btn--sm retour"><i class="icon-chevron-left" aria-hidden="true"></i>Ma watchlist</a>

	<section class="haut">
		<Affiche titre={t.titre} ligne={ligneAffiche} image={t.grandeAffiche} taille="fiche" />
		<div class="infos">
			<div class="col">
				<span class="surtitre">{surtitre}</span>
				<h1>{t.titre}</h1>
				{#if t.titreOriginal}<span class="original">{t.titreOriginal}</span>{/if}
			</div>
			{#if t.genres.length}<div class="tags">{#each t.genres as g (g)}<span class="nh-tag">{g}</span>{/each}</div>{/if}
			{#if t.resume}<p class="resume">{t.resume}</p>{/if}

			<div class="reglages">
				<div class="groupe">
					<span id="statut-label" class="label">Où tu en es</span>
					<div class="nh-tabs" role="radiogroup" aria-labelledby="statut-label">
						{#each STATUTS as s (s)}
							<button type="button" role="radio" aria-checked={data.moi?.statut === s} class="nh-tabs__tab" class:nh-tabs__tab--active={data.moi?.statut === s} disabled={envoi} onclick={() => action('statut', { statut: s })}>{LIBELLES_WL[s].l}</button>
						{/each}
					</div>
					{#if !data.moi}<span class="aide">Pas encore dans ta liste : choisis un statut pour l’ajouter.</span>{/if}
				</div>
				<div class="groupe">
					<span id="note-label" class="label">Ta note</span>
					<div class="etoiles" role="radiogroup" aria-labelledby="note-label">
						{#each [1, 2, 3, 4, 5] as n (n)}
							{@const pleine = n <= (data.moi?.note ?? 0)}
							<button type="button" role="radio" class="etoile" class:pleine aria-label="{n} sur 5" aria-checked={data.moi?.note === n} disabled={envoi} onclick={() => noter(n)}><svg width="24" height="24" viewBox="0 0 24 24" fill={pleine ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg></button>
						{/each}
					</div>
				</div>
				<div class="boutons">
					<button type="button" class="nh-btn nh-btn--outline" disabled={!data.membres.length} onclick={() => (conseil = { a: [], message: '' })}><i class="icon-send" aria-hidden="true"></i>Conseiller à un pote</button>
					{#if data.moi}<button type="button" class="nh-btn nh-btn--ghost" disabled={envoi} onclick={() => action('retirer', {}, false)}>Retirer de ma liste</button>{/if}
				</div>
			</div>
		</div>
	</section>

	<div class="bas">
		{#if t.type === 'serie' && saison}
			<section class="nh-card episodes" aria-labelledby="ep-titre">
				<div class="ep-tete">
					<h2 id="ep-titre">Épisodes</h2>
					{#if t.saisons.length > 1}
						<nav class="nh-tabs saisons" aria-label="Saisons">
							{#each t.saisons as s (s.numero)}
								<a href="?saison={s.numero}" data-sveltekit-noscroll data-sveltekit-replacestate class="nh-tabs__tab" class:nh-tabs__tab--active={s.numero === data.saison} aria-current={s.numero === data.saison ? 'true' : undefined}>Saison {s.numero}</a>
							{/each}
						</nav>
					{/if}
				</div>
				<div class="avance">
					<div class="av-txt">
						<span class="av-l">Saison {saison.numero} · {vusSaison} épisode{vusSaison > 1 ? 's' : ''} vu{vusSaison > 1 ? 's' : ''} sur {data.episodes.length}</span>
						<span class="av-p">{pct} %</span>
					</div>
					<div class="barre" role="progressbar" aria-label="Progression de la saison" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}><span style:width="{pct}%"></span></div>
				</div>
				<div class="liste-ep">
					{#each data.episodes as e (e.numero)}
						<label class="nh-check ep">
							<input type="checkbox" checked={e.vu} disabled={envoi} onchange={(ev) => cocher(e.numero, ev.currentTarget.checked)} />
							<span class="nh-check__box"><i class="icon-check" aria-hidden="true"></i></span>
							<span class="ep-code">É{String(e.numero).padStart(2, '0')}</span>
							<span class="ep-nom" class:vu={e.vu}>{e.nom}</span>
							{#if e.numero === prochain}<span class="nh-badge nh-badge--accent">Prochain</span>{/if}
						</label>
					{/each}
				</div>
				<button type="button" class="nh-btn nh-btn--secondary" style="align-self:flex-start" disabled={envoi || prochain === null} onclick={() => action('saison', { saison: saison.numero }, false)}>Toute la saison est vue</button>
			</section>
		{/if}

		<aside class="cote" class:large={t.type !== 'serie' || !saison}>
			<section class="nh-card bloc" aria-labelledby="potes-titre">
				<div class="b-tete">
					<h2 id="potes-titre">Chez les potes</h2>
					<span class="compte">{data.potes.length} sur {data.potes.length + data.sansLui.length}</span>
				</div>
				{#if data.potes.length}
					<ul class="potes">
						{#each data.potes as p (p.membre.id)}
							<li>
								<Avatar nom={p.membre.nom} src={p.membre.photo} taille={36} />
								<span class="p-txt"><span class="p-nom">{prenom(p.membre.nom)}</span><span class="p-det">{detail(p)}</span></span>
								<StatusPill pastille={PASTILLES_WATCHLIST[p.statut]} />
							</li>
						{/each}
					</ul>
				{/if}
				{#if data.sansLui.length}
					<p class="sans" class:seul={!data.potes.length}>Pas encore dans la liste de {liste(data.sansLui)}.</p>
				{/if}
			</section>

			{#if data.moi}
				<section class="nh-card bloc" aria-labelledby="avis-titre">
					<h2 id="avis-titre">Ton avis</h2>
					<label class="nh-field">
						<span class="nh-field__label">Un mot pour la bande</span>
						<textarea rows="3" maxlength="500" bind:value={avis} placeholder="Pas de spoil, promis ?"></textarea>
						<span class="nh-field__hint">Visible par tes potes sur la fiche.</span>
					</label>
					<button type="button" class="nh-btn nh-btn--primary" style="align-self:flex-start" disabled={envoi || avis.trim() === (data.moi.avis ?? '')} onclick={() => action('avis', { avis }, false)}>Publier</button>
				</section>
			{/if}
		</aside>
	</div>
</main>

{#if conseil}
	<Dialog titre="Conseiller à un pote" description={t.titre} onfermer={() => (conseil = null)}>
		<form class="form-conseil" onsubmit={(e) => { e.preventDefault(); envoyerConseil(); }}>
			<div class="tags" role="group" aria-label="À qui">
				{#each data.membres as m (m.id)}
					{@const on = conseil.a.includes(m.id)}
					<button type="button" class="nh-tag nh-tag--clickable" class:nh-tag--selected={on} aria-pressed={on} onclick={() => (conseil!.a = on ? conseil!.a.filter((x) => x !== m.id) : [...conseil!.a, m.id])}><i class="icon-{on ? 'check' : 'plus'}" aria-hidden="true"></i>{prenom(m.nom)}</button>
				{/each}
			</div>
			<label class="nh-field">
				<span class="nh-field__label">Un mot (facultatif)</span>
				<textarea rows="2" maxlength="300" bind:value={conseil.message} placeholder="Tu vas adorer la fin de la saison 2"></textarea>
			</label>
			<div class="pied">
				<button type="button" class="nh-btn nh-btn--ghost" onclick={() => (conseil = null)}>Annuler</button>
				<button class="nh-btn nh-btn--primary" disabled={!conseil.a.length || envoi}><i class="icon-send" aria-hidden="true"></i>Envoyer</button>
			</div>
		</form>
	</Dialog>
{/if}

<style>
	.retour {
		align-self: flex-start;
		margin-left: -12px;
		text-decoration: none;
	}
	.haut {
		display: flex;
		flex-wrap: wrap;
		gap: 40px;
		align-items: flex-start;
	}
	.infos {
		flex: 999 1 480px;
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
	}
	.original {
		font-size: 15px;
		color: var(--fg-3);
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.resume {
		margin: 0;
		max-width: 640px;
		font-size: 18px;
		line-height: 1.65;
		color: var(--fg-2);
	}
	.reglages {
		display: flex;
		flex-wrap: wrap;
		gap: 24px 40px;
		align-items: flex-end;
		padding-top: 8px;
	}
	.groupe {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.label {
		font: var(--type-label);
		color: var(--fg-1);
	}
	.aide {
		font-size: 13px;
		color: var(--fg-3);
	}
	.etoiles {
		display: flex;
		gap: 2px;
		margin-left: -4px;
	}
	.etoile {
		display: inline-grid;
		place-items: center;
		padding: 4px;
		border: 0;
		border-radius: 8px;
		background: none;
		cursor: pointer;
		color: var(--fg-3);
	}
	.etoile:hover {
		background: var(--surface-2);
	}
	.etoile.pleine {
		color: var(--apricot-300);
	}
	.boutons {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-left: auto;
	}
	.bas {
		display: flex;
		flex-wrap: wrap;
		gap: 32px;
		align-items: flex-start;
	}
	.episodes {
		flex: 999 1 560px;
		min-width: 0;
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.ep-tete,
	.b-tete {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}
	h2 {
		margin: 0;
		font-size: 22px;
		line-height: 1.3;
		font-weight: 700;
		color: var(--fg-1);
	}
	.saisons {
		flex-wrap: wrap;
	}
	.saisons a:hover {
		text-decoration: none;
	}
	.avance {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.av-txt {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		font-size: 14px;
	}
	.av-l {
		color: var(--fg-1);
		font-weight: 500;
	}
	.av-p {
		color: var(--fg-3);
	}
	.barre {
		height: 8px;
		border-radius: 999px;
		background: var(--surface-3);
		overflow: hidden;
	}
	.barre span {
		display: block;
		height: 100%;
		background: var(--apricot-300);
		border-radius: 999px;
		transition: width 180ms var(--ease-out);
	}
	.liste-ep {
		display: flex;
		flex-direction: column;
	}
	.ep {
		display: flex;
		gap: 14px;
		padding: 12px;
		border-radius: 12px;
		border-bottom: 1px solid var(--border-subtle);
		transition: background 120ms;
	}
	.ep:hover {
		background: var(--surface-2);
	}
	.ep-code {
		flex: none;
		width: 40px;
		font-family: var(--font-mono);
		font-size: 13px;
		color: var(--fg-3);
	}
	.ep-nom {
		flex: 1;
		min-width: 0;
		color: var(--fg-1);
	}
	.ep-nom.vu {
		color: var(--fg-3);
	}
	.cote {
		flex: 1 1 340px;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.cote.large {
		flex-direction: row;
		flex-wrap: wrap;
	}
	.cote.large .bloc {
		flex: 1 1 340px;
	}
	.bloc {
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.compte {
		font-size: 13px;
		color: var(--fg-3);
	}
	.potes {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.potes li {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.p-txt {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.p-nom {
		color: var(--fg-1);
		font-weight: 500;
	}
	.p-det {
		font-size: 13px;
		color: var(--fg-3);
		overflow-wrap: anywhere;
	}
	.sans {
		margin: 0;
		padding-top: 12px;
		border-top: 1px solid var(--border-subtle);
		font-size: 14px;
		color: var(--fg-3);
	}
	.sans.seul {
		padding-top: 0;
		border-top: 0;
	}
	textarea {
		resize: vertical;
		min-height: 88px;
		padding: 12px 14px;
		border-radius: 12px;
		background: var(--bg-sunken);
		border: 1px solid var(--border-strong);
		color: var(--fg-1);
		font: var(--type-body);
		font-family: var(--font-sans);
	}
	.form-conseil {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.pied {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
	@media (max-width: 559px) {
		.haut {
			gap: 24px;
		}
		.boutons {
			margin-left: 0;
		}
	}
</style>
