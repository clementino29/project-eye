<script lang="ts">
	// « Quoi faire ? » : jeux Steam en commun entre les présents, puis tirage à la roue pondéré par les envies.
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import AvatarGroup from '#lib/components/AvatarGroup.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import Tabs from '#lib/components/Tabs.svelte';
	import { envoyer } from '#lib/actions.ts';
	import { ilYa } from '#lib/libelles.ts';
	import { toasts } from '#lib/toasts.svelte.ts';
	import {
		MODES,
		imageSteam,
		jeuxEnCommun,
		jeuxPresque,
		libelleJoueurs,
		listeNoms,
		partsDeLaRoue,
		rotationPour,
		tirer,
		type JeuCommun
	} from '#lib/quoi-faire.ts';

	let { data } = $props();

	const DUREE = 5; // secondes de rotation
	const PONDERE = true; // plus d'envies = plus grosse part

	// Seuls les membres qui ont lié Steam peuvent être comparés.
	const joueurs = $derived(data.membres.filter((m) => m.etatSteam !== 'non_liee'));
	const sansSteam = $derived(data.membres.filter((m) => m.etatSteam === 'non_liee'));
	const prenom = (id: number) => data.membres.find((m) => m.id === id)?.nom.split(' ')[0] ?? '?';
	const nomComplet = (id: number) => data.membres.find((m) => m.id === id)?.nom ?? '?';

	// État partageable par lien : ?joueurs=1,2,3&onglet=tirage
	const depuisUrl = (() => {
		const p = page.url.searchParams;
		const liste = (p.get('joueurs') ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
		return { joueurs: liste, onglet: p.get('onglet') === 'tirage' ? 'tirage' : 'commun' };
	})();
	// Par défaut, tous ceux qui ont lié Steam (chacun retire les absents).
	let presents = $state<number[]>(
		depuisUrl.joueurs.length ? depuisUrl.joueurs : untrack(() => data.membres.filter((m) => m.etatSteam !== 'non_liee').map((m) => m.id))
	);
	let onglet = $state<'commun' | 'tirage'>(depuisUrl.onglet as 'commun' | 'tirage');
	let sous = $state<'tous' | 'presque'>('tous');
	let multi = $state(true);
	let places = $state(true);
	let exclus = $state<number[]>([]);
	let tires = $state<number[]>([]);
	let rotation = $state(0);
	let tourne = $state(false);
	let enAttente = $state<number | null>(null);
	let gagnant = $state<number | null>(null);
	let dialogue = $state(false);
	let synchro = $state(false);
	let fiche = $state<{ appid: number; nom: string; court: string; mode: string; max: string } | null>(null);
	let minuteur: ReturnType<typeof setTimeout> | undefined;

	$effect(() => () => clearTimeout(minuteur));

	function lien(o = onglet) {
		const u = new URL(page.url.href);
		u.searchParams.set('joueurs', presents.join(','));
		if (o === 'tirage') u.searchParams.set('onglet', 'tirage');
		else u.searchParams.delete('onglet');
		return u;
	}
	function majUrl() {
		goto(lien(), { shallow: true, replace: true, state: {} });
	}
	function remiseAZero() {
		tires = [];
		gagnant = null;
		enAttente = null;
	}
	function basculer(id: number) {
		presents = presents.includes(id) ? presents.filter((x) => x !== id) : [...presents, id];
		remiseAZero();
		majUrl();
	}
	function choisirTous(tous: boolean) {
		presents = tous ? joueurs.map((m) => m.id) : [];
		remiseAZero();
		majUrl();
	}
	function changerOnglet(v: string) {
		onglet = v as 'commun' | 'tirage';
		majUrl();
	}

	const presentsValides = $derived(presents.filter((id) => joueurs.some((m) => m.id === id)));
	const N = $derived(presentsValides.length);
	const filtres = $derived({ multi, places });
	const communs = $derived(jeuxEnCommun(data.jeux, presentsValides, filtres));
	const presque = $derived(jeuxPresque(data.jeux, presentsValides, filtres));
	const enviesDe = (id: number) => (data.envies[id] ?? []).filter((m) => presentsValides.includes(m));
	const roue = $derived(communs.filter((j) => !exclus.includes(j.id) && !tires.includes(j.id)));
	const horsRoue = $derived(communs.filter((j) => exclus.includes(j.id) || tires.includes(j.id)));
	const parts = $derived(partsDeLaRoue(roue.map((j) => j.id), (id) => enviesDe(id).length, PONDERE));
	const votants = $derived(presentsValides.filter((m) => communs.some((j) => (data.envies[j.id] ?? []).includes(m))).length);
	const jeuGagnant = $derived(gagnant !== null ? data.jeux.find((j) => j.id === gagnant) : undefined);
	const montrerGagnant = $derived(!tourne && gagnant !== null);

	const COULEURS = ['var(--petrol-500)', 'var(--petrol-700)', 'var(--petrol-400)', 'var(--petrol-800)'];
	const couleur = (i: number, n: number) => (n % 4 === 1 && i === n - 1 ? 'var(--night-700)' : COULEURS[i % 4]);
	const degrade = $derived(
		parts.length
			? `conic-gradient(${parts.map((p, i) => `${montrerGagnant && p.id === gagnant ? 'var(--apricot-300)' : couleur(i, parts.length)} ${p.debut}deg ${p.debut + p.angle}deg`).join(',')})`
			: 'var(--surface-1)'
	);
	const nomCourt = (id: number) => data.jeux.find((j) => j.id === id)?.court ?? '';

	const mode = (j: JeuCommun) => (j.mode ? MODES[j.mode] : j.multi === false ? 'Solo' : 'Multi');
	const tonMode = (j: JeuCommun) => (j.mode === 'coop' ? 'brand' : 'neutral');
	const tropPetit = (j: JeuCommun) => j.max !== null && j.max < N;

	function lancer() {
		if (tourne || parts.length < 2) return;
		const part = tirer(parts, Math.random())!;
		rotation = rotationPour(part, rotation, Math.random());
		tourne = true;
		enAttente = part.id;
		gagnant = null;
		dialogue = false;
		clearTimeout(minuteur);
		minuteur = setTimeout(() => {
			tourne = false;
			gagnant = enAttente;
			dialogue = true;
		}, DUREE * 1000 + 150);
	}
	function relancer() {
		if (gagnant !== null) tires = [...tires, gagnant];
		gagnant = null;
		dialogue = false;
		clearTimeout(minuteur);
		minuteur = setTimeout(lancer, 350);
	}
	async function valider() {
		if (!jeuGagnant) return;
		const nom = jeuGagnant.nom;
		dialogue = false;
		if (await envoyer('?/valider', { appid: jeuGagnant.id, joueurs: presentsValides }, { silencieux: true }))
			toasts.montrer('success', "C'est validé", `Ce soir : ${nom}.`);
	}
	function basculerHorsRoue(id: number) {
		if (tires.includes(id)) tires = tires.filter((x) => x !== id);
		else exclus = exclus.includes(id) ? exclus.filter((x) => x !== id) : [...exclus, id];
	}
	async function copier(texte: string, titre: string, message: string) {
		try {
			await navigator.clipboard.writeText(texte);
			toasts.montrer('info', titre, message);
		} catch {
			toasts.montrer('warning', 'Copie impossible', texte);
		}
	}
	async function synchroniser() {
		synchro = true;
		await envoyer('?/synchroniser', {});
		synchro = false;
	}
	function ouvrirFiche(j: JeuCommun) {
		fiche = { appid: j.id, nom: j.nom, court: j.court === j.nom ? '' : j.court, mode: j.mode ?? '', max: j.max ? String(j.max) : '' };
	}
	async function enregistrerFiche() {
		if (!fiche) return;
		if (await envoyer('?/fiche', { appid: fiche.appid, mode: fiche.mode, joueursMax: fiche.max, court: fiche.court })) fiche = null;
	}
	const masquer = (e: Event) => ((e.currentTarget as HTMLImageElement).style.display = 'none');
</script>

<svelte:head><title>Quoi faire ? · nohriancons</title></svelte:head>

{#snippet carte(j: JeuCommun, manquant: number | null)}
	<div class="nh-card jeu" class:presque={manquant !== null}>
		<div class="banniere">
			{j.nom}
			<img src={imageSteam(j.id)} alt="" loading="lazy" onerror={masquer} />
			{#if j.gratuit}<span class="coin"><span class="nh-badge nh-badge--success">Gratuit</span></span>{/if}
			<button type="button" class="nh-btn nh-iconbtn nh-btn--secondary nh-btn--sm corriger" aria-label="Corriger la fiche de {j.nom}" title="Corriger la fiche" onclick={() => ouvrirFiche(j)}><i class="icon-pencil" aria-hidden="true"></i></button>
		</div>
		<div class="corps">
			<div class="titre">{j.nom}</div>
			{#if manquant === null && j.genres}<div class="genres">{j.genres}</div>{/if}
			<div class="infos">
				<span class="nh-badge nh-badge--{tonMode(j)}">{mode(j)}</span>
				<span class="places"><i class="icon-users" aria-hidden="true"></i>{libelleJoueurs(j.max)}</span>
				{#if manquant === null && tropPetit(j)}<span class="nh-badge nh-badge--warning">Trop petit</span>{/if}
			</div>
			{#if manquant !== null}
				<div class="manque">
					<Avatar nom={nomComplet(manquant)} src={data.membres.find((m) => m.id === manquant)?.photo} taille={22} />
					<span>Manque {prenom(manquant)}{j.gratuit ? ' · gratuit à installer' : ''}</span>
				</div>
			{/if}
		</div>
	</div>
{/snippet}

<main class="nh-page" style="gap:20px">
	<div class="entete">
		<div style="flex:1 1 260px;min-width:0">
			<h1>Quoi faire ?</h1>
			<div class="sous-titre">Trouve un jeu que tout le monde a déjà sur Steam.</div>
		</div>
		<div class="sync">
			{#if data.steamConfigure}
				Bibliothèques synchronisées {ilYa(data.derniereSync)}
				<button type="button" class="nh-btn nh-iconbtn nh-btn--ghost nh-btn--sm" aria-label="Actualiser les bibliothèques" title="Actualiser" disabled={synchro} onclick={synchroniser}><i class={synchro ? 'icon-loader' : 'icon-refresh-cw'} aria-hidden="true"></i></button>
			{:else}
				Steam n’est pas encore configuré sur le hub.
			{/if}
		</div>
	</div>

	<Tabs
		variante="underline"
		onglets={[
			{ valeur: 'commun', libelle: 'Jeux en commun', icone: 'library', compte: communs.length },
			{ valeur: 'tirage', libelle: 'Tirage au sort', icone: 'dices' }
		]}
		valeur={onglet}
		onchange={changerOnglet}
	/>

	{#if onglet === 'commun'}
		<div class="pile">
			<div class="nh-card" style="padding:24px">
				<div class="pile" style="gap:18px">
					<div class="qui">
						<div class="nh-overline" style="margin-right:auto">Qui joue ce soir ? · {N} {N > 1 ? 'potes' : 'pote'}</div>
						<button type="button" class="nh-btn nh-btn--ghost nh-btn--sm" onclick={() => choisirTous(true)}>Tout le monde</button>
						<button type="button" class="nh-btn nh-btn--ghost nh-btn--sm" onclick={() => choisirTous(false)}>Personne</button>
					</div>
					<div class="joueurs">
						{#each joueurs as m (m.id)}
							{@const on = presents.includes(m.id)}
							<button type="button" class="nh-unset joueur" class:on aria-pressed={on} onclick={() => basculer(m.id)} title={m.etatSteam === 'privee' ? 'Bibliothèque Steam privée : ses jeux ne sont pas visibles' : undefined}>
								<span class="anneau"><Avatar nom={m.nom} src={m.photo} taille={52} /></span>
								<span class="prenom">{m.nom.split(' ')[0]}{#if m.etatSteam === 'privee'} <i class="icon-lock" aria-label="bibliothèque privée"></i>{/if}</span>
							</button>
						{/each}
						{#if !joueurs.length}<div class="discret">Personne n’a encore lié son compte Steam. Ça se fait depuis la page <a href="/compte">Compte</a>.</div>{/if}
					</div>
					{#if sansSteam.length && joueurs.length}
						<div class="discret">Pas encore de Steam lié : {listeNoms(sansSteam.map((m) => m.nom.split(' ')[0]))}. Ça se fait depuis la page <a href="/compte">Compte</a>.</div>
					{/if}
				</div>
			</div>

			{#if N < 2}
				<div class="nh-card vide-carte"><i class="icon-users" aria-hidden="true"></i><div>Choisis au moins deux potes pour comparer vos bibliothèques.</div></div>
			{:else}
				<div class="pile" style="gap:16px">
					<div class="filtres">
						<label class="nh-switch"><input type="checkbox" role="switch" bind:checked={multi} /><span class="nh-switch__track"></span>Multijoueur seulement</label>
						<button type="button" class="nh-tag nh-tag--clickable" class:nh-tag--selected={places} aria-pressed={places} onclick={() => (places = !places)}><i class="icon-users" aria-hidden="true"></i>Assez de places pour {N}</button>
						<div style="margin-left:auto"></div>
						<Tabs
							onglets={[
								{ valeur: 'tous', libelle: "Tout le monde l'a", compte: communs.length },
								{ valeur: 'presque', libelle: 'Presque', compte: presque.length }
							]}
							valeur={sous}
							onchange={(v) => (sous = v as 'tous' | 'presque')}
						/>
					</div>
					{#if data.ficheManquantes}
						<div class="discret"><i class="icon-loader" aria-hidden="true"></i> {data.ficheManquantes} fiche{data.ficheManquantes > 1 ? 's' : ''} Steam en cours de lecture : le mode et les genres arrivent petit à petit.</div>
					{/if}

					{#if sous === 'tous'}
						{#if !communs.length}<div class="aucun">Aucun jeu en commun avec ces filtres. Essaie de retirer un pote ou un filtre.</div>{/if}
						<div class="grille">{#each communs as j (j.id)}{@render carte(j, null)}{/each}</div>
					{:else}
						<div class="discret" style="font-size:14px">Ces jeux sont chez tout le monde sauf une personne.</div>
						{#if !presque.length}<div class="aucun">{N < 3 ? 'Il faut au moins trois présents pour cet onglet.' : 'Rien de ce côté-là.'}</div>{/if}
						<div class="grille">{#each presque as j (j.id)}{@render carte(j, j.manquant)}{/each}</div>
					{/if}
				</div>
			{/if}
		</div>
	{:else}
		<div class="pile">
			<div class="nh-card" style="padding:16px">
				<div class="resume">
					<AvatarGroup personnes={presentsValides.map((id) => ({ nom: nomComplet(id), photo: data.membres.find((m) => m.id === id)?.photo }))} taille={32} max={8} />
					<div style="flex:1;min-width:200px">
						<div class="noms">{N ? listeNoms(presentsValides.map(prenom)) : 'Personne de choisi'}</div>
						<div class="discret">{communs.length} jeux en commun · {roue.length} dans la roue</div>
					</div>
					<button type="button" class="nh-btn nh-btn--ghost nh-btn--sm" onclick={() => changerOnglet('commun')}><i class="icon-pencil" aria-hidden="true"></i>Modifier</button>
				</div>
			</div>

			<div class="tirage">
				<div class="nh-card etape1">
					<div class="e-tete">
						<div style="flex:1">
							<div class="nh-overline">Étape 1</div>
							<h3>Qui a envie de quoi ?</h3>
							<div class="discret" style="margin-top:4px">{votants} sur {N} ont donné leurs envies</div>
						</div>
						<button type="button" class="nh-btn nh-btn--outline nh-btn--sm" onclick={() => copier(lien('tirage').toString(), 'Lien de vote copié', 'Chacun peut cocher ses envies depuis son téléphone.')}><i class="icon-link" aria-hidden="true"></i>Envoyer le vote</button>
					</div>
					<div class="liste">
						{#if N < 2}<div class="discret" style="padding:16px 0">Choisis au moins deux potes dans l’onglet Jeux en commun.</div>{/if}
						{#each roue as j (j.id)}
							{@const v = enviesDe(j.id)}
							{@const mien = !!data.moi && (data.envies[j.id] ?? []).includes(data.moi.id)}
							<div class="rang">
								<div class="vignette"><img src={imageSteam(j.id, 'capsule')} alt="" loading="lazy" onerror={masquer} /></div>
								<div style="min-width:0"><div class="r-nom">{j.nom}</div><div class="r-info">{mode(j)} · {libelleJoueurs(j.max)}</div></div>
								<AvatarGroup personnes={v.map((id) => ({ nom: nomComplet(id), photo: data.membres.find((m) => m.id === id)?.photo }))} taille={24} max={4} />
								<button type="button" class="nh-tag nh-tag--clickable" class:nh-tag--selected={mien} aria-pressed={mien} aria-label="J'ai envie de {j.nom}" onclick={() => envoyer('?/envie', { appid: j.id }, { silencieux: true })}><i class="icon-heart" aria-hidden="true"></i>{v.length}</button>
								<button type="button" class="nh-btn nh-iconbtn nh-btn--ghost nh-btn--sm" aria-label="Retirer {j.nom} de la roue" title="Retirer de la roue" onclick={() => basculerHorsRoue(j.id)}><i class="icon-eye-off" aria-hidden="true"></i></button>
							</div>
						{/each}
						{#if horsRoue.length}
							<div class="nh-overline" style="padding:20px 0 4px">Pas dans la roue</div>
							{#each horsRoue as j (j.id)}
								<div class="rang hors">
									<div class="vignette"><img src={imageSteam(j.id, 'capsule')} alt="" loading="lazy" onerror={masquer} style="filter:grayscale(1)" /></div>
									<div class="r-nom barre">{j.nom}</div>
									<span class="nh-badge nh-badge--neutral">{tires.includes(j.id) ? 'Déjà tiré' : 'Retiré'}</span>
									<button type="button" class="nh-btn nh-iconbtn nh-btn--ghost nh-btn--sm" aria-label="Remettre {j.nom} dans la roue" title="Remettre dans la roue" onclick={() => basculerHorsRoue(j.id)}><i class="icon-undo-2" aria-hidden="true"></i></button>
								</div>
							{/each}
						{/if}
					</div>
				</div>

				<div class="nh-card nh-card--raised etape2">
					<div style="align-self:stretch">
						<div class="nh-overline">Étape 2</div>
						<h3>On tourne</h3>
					</div>
					<div class="cadre">
						<div class="fenetre">
							<div class="disque" style:background={degrade} style:transform="rotate({rotation}deg)" style:transition={tourne ? `transform ${DUREE}s cubic-bezier(.12,.7,.1,1)` : 'none'}>
								{#if parts.length > 1}
									{#each parts as p (p.id)}<div class="rayon" style:transform="rotate({p.debut}deg)"></div>{/each}
								{/if}
								{#each parts as p (p.id)}
									{@const droite = p.milieu <= 180}
									{@const gagne = montrerGagnant && p.id === gagnant}
									<div
										class="etiquette"
										class:gagne
										class:petite={p.angle < 26}
										style:text-align={droite ? 'left' : 'right'}
										style:transform={droite ? `rotate(${p.milieu - 90}deg) translate(13cqw,-50%)` : `rotate(${p.milieu + 90}deg) translate(-47cqw,-50%)`}
									>
										{nomCourt(p.id)}
									</div>
								{/each}
							</div>
						</div>
						<div class="aiguille"></div>
						<button type="button" class="moyeu" aria-label="Lancer la roue" disabled={tourne || parts.length < 2} onclick={lancer}><i class="icon-dices" aria-hidden="true"></i></button>
					</div>
					{#if parts.length < 2}<div class="discret" style="font-size:14px;text-align:center">Il faut au moins deux jeux dans la roue.</div>{/if}
					<button type="button" class="nh-btn nh-btn--primary nh-btn--lg nh-btn--block" disabled={tourne || parts.length < 2} onclick={lancer}><i class="icon-dices" aria-hidden="true"></i>{tourne ? 'Ça tourne…' : 'Lancer la roue'}</button>
					<div class="discret" style="text-align:center">{PONDERE ? "Plus un jeu a d'envies, plus sa part est grosse." : 'Chaque jeu a la même chance.'}</div>
					{#if data.dernier}
						<div class="dernier"><i class="icon-history" aria-hidden="true"></i>Dernier tirage validé : <span>{data.dernier.nom}</span></div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</main>

{#if dialogue && jeuGagnant}
	<Dialog titre={jeuGagnant.nom} description="La roue a choisi" onfermer={() => (dialogue = false)}>
		<div class="pile" style="gap:16px">
			<div class="banniere" style="border-radius:12px"><img src={imageSteam(jeuGagnant.id)} alt="" onerror={masquer} /></div>
			<div class="infos">
				<span class="nh-badge nh-badge--{tonMode(jeuGagnant)}">{mode(jeuGagnant)}</span>
				{#if jeuGagnant.gratuit}<span class="nh-badge nh-badge--success">Gratuit</span>{/if}
				{#if jeuGagnant.genres}<span class="discret">{jeuGagnant.genres}</span>{/if}
				<span class="places" style="margin-left:auto"><i class="icon-users" aria-hidden="true"></i>{libelleJoueurs(jeuGagnant.max)}</span>
			</div>
			{#if tropPetit(jeuGagnant)}<div style="font-size:14px;color:var(--warning-fg)">{jeuGagnant.max} places pour {N} joueurs : quelqu'un devra regarder.</div>{/if}
			<div class="actions">
				<button type="button" class="nh-btn nh-btn--outline" onclick={() => copier(`Ce soir on joue à ${jeuGagnant!.nom} ! ${lien('tirage')}`, 'Lien copié', 'Colle-le dans le groupe de la bande.')}><i class="icon-share-2" aria-hidden="true"></i>Partager</button>
				<button type="button" class="nh-btn nh-btn--secondary" onclick={relancer}><i class="icon-rotate-ccw" aria-hidden="true"></i>Relancer</button>
				<button type="button" class="nh-btn nh-btn--primary" onclick={valider}><i class="icon-play" aria-hidden="true"></i>C'est parti</button>
			</div>
		</div>
	</Dialog>
{/if}

{#if fiche}
	<Dialog titre="Corriger la fiche" description={fiche.nom} onfermer={() => (fiche = null)}>
		<form class="pile" style="gap:16px" onsubmit={(e) => { e.preventDefault(); enregistrerFiche(); }}>
			<div class="nh-field">
				<span class="nh-field__label">Mode</span>
				<div class="tags">
					{#each [['coop', 'Coop'], ['versus', 'Versus'], ['solo', 'Solo'], ['', 'Inconnu']] as [v, l] (v)}
						<button type="button" class="nh-tag nh-tag--clickable" class:nh-tag--selected={fiche.mode === v} aria-pressed={fiche.mode === v} onclick={() => (fiche!.mode = v)}>{l}</button>
					{/each}
				</div>
			</div>
			<div class="nh-field">
				<label class="nh-field__label" for="f-max">Joueurs au maximum</label>
				<div class="nh-input"><input id="f-max" type="number" min="1" max="999" bind:value={fiche.max} placeholder="4" /></div>
				<div class="nh-field__hint">Steam ne le donne pas. Laisse vide si tu ne sais pas.</div>
			</div>
			<div class="nh-field">
				<label class="nh-field__label" for="f-court">Nom court sur la roue</label>
				<div class="nh-input"><input id="f-court" bind:value={fiche.court} maxlength="40" placeholder={fiche.nom} /></div>
			</div>
			<div class="actions">
				<button type="button" class="nh-btn nh-btn--ghost" onclick={() => (fiche = null)}>Annuler</button>
				<button class="nh-btn nh-btn--primary">Enregistrer</button>
			</div>
		</form>
	</Dialog>
{/if}

<style>
	.pile {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.entete {
		display: flex;
		align-items: flex-end;
		gap: 16px;
		flex-wrap: wrap;
	}
	h1 {
		font: var(--type-h1);
		letter-spacing: var(--tracking-tight);
		color: var(--fg-1);
	}
	h3 {
		font: var(--type-h4);
		color: var(--fg-1);
		margin: 6px 0 0;
	}
	.sous-titre {
		color: var(--fg-3);
		font-size: 14px;
		margin-top: 4px;
	}
	.sync {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: var(--fg-3);
	}
	.discret {
		font-size: 13px;
		color: var(--fg-3);
	}
	.qui {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	.joueurs {
		display: flex;
		flex-wrap: wrap;
		gap: 22px;
	}
	.joueur {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		cursor: pointer;
		opacity: 0.4;
		transition:
			opacity 120ms var(--ease-out),
			transform 120ms var(--ease-out);
	}
	.joueur:hover {
		opacity: 0.8;
	}
	.joueur.on {
		opacity: 1;
	}
	.joueur:active {
		transform: scale(0.97);
	}
	.anneau {
		display: flex;
		border-radius: 50%;
	}
	.joueur.on .anneau {
		box-shadow:
			0 0 0 3px var(--surface-1),
			0 0 0 5px var(--apricot-300);
	}
	.prenom {
		font-weight: 500;
		font-size: 13px;
		color: var(--fg-3);
	}
	.joueur.on .prenom {
		color: var(--fg-1);
	}
	.vide-carte {
		padding: 32px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		text-align: center;
		color: var(--fg-3);
	}
	.vide-carte i {
		font-size: 28px;
	}
	.filtres {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
	}
	.aucun {
		padding: 32px;
		text-align: center;
		color: var(--fg-3);
		border: 1px dashed var(--border-default);
		border-radius: 16px;
	}
	.grille {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 16px;
		align-content: start;
	}
	.jeu {
		padding: 0;
		overflow: hidden;
		transition: transform var(--dur-base) var(--ease-out);
	}
	.jeu:hover {
		transform: translateY(-2px);
	}
	.banniere {
		position: relative;
		aspect-ratio: 460/215;
		background: var(--petrol-800);
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 16px;
		text-align: center;
		font-weight: 700;
		color: var(--fg-brand);
	}
	.banniere img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.presque .banniere img {
		filter: saturate(0.6);
		opacity: 0.75;
	}
	.coin {
		position: absolute;
		top: 10px;
		left: 10px;
		display: flex;
	}
	.corriger {
		position: absolute;
		top: 8px;
		right: 8px;
		opacity: 0;
		transition: opacity var(--dur-fast) var(--ease-out);
	}
	.jeu:hover .corriger,
	.corriger:focus-visible {
		opacity: 1;
	}
	@media (hover: none) {
		.corriger {
			opacity: 0.85;
		}
	}
	.corps {
		padding: 14px 16px 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.titre {
		font-weight: 700;
		font-size: 16px;
		line-height: 1.25;
		letter-spacing: -0.01em;
		color: var(--fg-1);
	}
	.genres {
		font-size: 13px;
		color: var(--fg-3);
	}
	.infos {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.places {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: var(--fg-2);
	}
	.places i {
		font-size: 14px;
		color: var(--fg-3);
	}
	.manque {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 4px;
		padding-top: 12px;
		border-top: 1px solid var(--border-subtle);
		font-size: 13px;
		color: var(--fg-2);
	}
	.resume {
		display: flex;
		align-items: center;
		gap: 14px;
		flex-wrap: wrap;
	}
	.noms {
		font-weight: 500;
		color: var(--fg-1);
	}
	.tirage {
		display: flex;
		gap: 24px;
		align-items: flex-start;
	}
	.etape1 {
		flex: 1 1 0;
		min-width: 0;
		padding: 24px;
	}
	.e-tete {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding-bottom: 16px;
		flex-wrap: wrap;
	}
	.liste {
		max-height: max(360px, calc(100vh - 480px));
		overflow-y: auto;
		margin-right: -8px;
		padding-right: 8px;
	}
	.rang {
		display: grid;
		grid-template-columns: 92px minmax(0, 1fr) auto auto auto;
		gap: 14px;
		align-items: center;
		padding: 12px 0;
		border-top: 1px solid var(--border-subtle);
	}
	.rang.hors {
		grid-template-columns: 92px minmax(0, 1fr) auto auto;
		padding: 10px 0;
		opacity: 0.55;
	}
	.vignette {
		width: 92px;
		height: 43px;
		border-radius: 8px;
		overflow: hidden;
		background: var(--petrol-800);
	}
	.vignette img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.r-nom {
		font-weight: 500;
		color: var(--fg-1);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.r-nom.barre {
		color: var(--fg-2);
		text-decoration: line-through;
	}
	.r-info {
		font-size: 12px;
		color: var(--fg-3);
	}
	.etape2 {
		flex: 0 0 480px;
		min-width: 0;
		padding: 24px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 20px;
	}
	.cadre {
		position: relative;
		container-type: inline-size;
		width: 400px;
		max-width: 100%;
		aspect-ratio: 1;
		padding: 10px;
		border-radius: 50%;
		background: var(--surface-3);
		border: 1px solid var(--border-default);
	}
	.fenetre {
		position: relative;
		width: 100%;
		height: 100%;
		border-radius: 50%;
		overflow: hidden;
		container-type: inline-size;
	}
	.disque {
		position: absolute;
		inset: 0;
		border-radius: 50%;
	}
	.rayon {
		position: absolute;
		left: 50%;
		top: 0;
		width: 2px;
		margin-left: -1px;
		height: 50%;
		background: var(--night-900);
		transform-origin: 50% 100%;
	}
	.etiquette {
		position: absolute;
		left: 50%;
		top: 50%;
		transform-origin: 0 0;
		width: 34cqw;
		font: 500 3.4cqw/1.2 var(--font-sans);
		color: var(--fg-1);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		pointer-events: none;
	}
	.etiquette.petite {
		font-size: 2.9cqw;
	}
	.etiquette.gagne {
		font-weight: 700;
		color: var(--apricot-ink);
	}
	.aiguille {
		position: absolute;
		left: 50%;
		top: -6px;
		transform: translateX(-50%);
		width: 0;
		height: 0;
		border-left: 14px solid transparent;
		border-right: 14px solid transparent;
		border-top: 28px solid var(--apricot-300);
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
	}
	.moyeu {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 19%;
		height: 19%;
		border-radius: 50%;
		border: 1px solid var(--border-strong);
		background: var(--surface-2);
		color: var(--apricot-300);
		display: grid;
		place-items: center;
		cursor: pointer;
		box-shadow: var(--shadow-2);
		font-size: clamp(20px, 7cqw, 28px);
	}
	.moyeu:hover:not(:disabled) {
		background: var(--surface-hover);
	}
	.moyeu:disabled {
		cursor: default;
	}
	.dernier {
		align-self: stretch;
		display: flex;
		align-items: center;
		gap: 8px;
		padding-top: 16px;
		border-top: 1px solid var(--border-subtle);
		font-size: 13px;
		color: var(--fg-3);
	}
	.dernier span {
		color: var(--fg-1);
		font-weight: 500;
	}
	.actions {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
		flex-wrap: wrap;
		margin-top: 4px;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	@media (max-width: 1100px) {
		.tirage {
			flex-direction: column;
			align-items: stretch;
		}
		.etape2 {
			flex: none;
		}
	}
	@media (max-width: 560px) {
		.rang {
			grid-template-columns: 64px minmax(0, 1fr) auto auto;
		}
		.rang :global(.nh-avatar-group) {
			display: none;
		}
		.vignette {
			width: 64px;
			height: 30px;
		}
		.rang.hors {
			grid-template-columns: 64px minmax(0, 1fr) auto auto;
		}
	}
</style>
