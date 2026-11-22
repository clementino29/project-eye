<script lang="ts">
	// « Liste des jeux en cours » : cartes par jeu, piles par série, statut modifiable d'un clic.
	import AvatarGroup from '#lib/components/AvatarGroup.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import { envoyer } from '#lib/actions.ts';
	import { ORDRE_JEU, STATUTS_JEU as ST, type StatutJeu } from '#lib/libelles.ts';

	let { data } = $props();
	type Jeu = (typeof data.jeux)[number];

	const TEINTES = ['var(--petrol-500)', 'var(--petrol-700)', 'var(--petrol-400)', 'var(--petrol-800)', 'var(--night-600)'];
	const teinte = (nom: string) => {
		let h = 0;
		for (const ch of nom || '') h = (h * 31 + ch.charCodeAt(0)) % 997;
		return TEINTES[h % TEINTES.length];
	};

	let largeur = $state(1200);
	let recherche = $state('');
	let filtreStatut = $state<'tous' | StatutJeu>('tous');
	let tri = $state<'progression' | 'recent' | 'titre'>('progression');
	let parSerie = $state(true);
	let edition = $state(true);
	let ouverte = $state<string | null>(null);
	let menu = $state<number | null>(null);
	let modale = $state<'nouveau' | number | null>(null);
	let form = $state({ titre: '', serie: '', image: '', statut: 'a_faire' as StatutJeu, joueurs: [] as number[], igdbId: null as number | null });
	let enregistrement = $state(false);

	const cols = $derived(largeur >= 1440 ? 5 : largeur >= 1000 ? 4 : largeur >= 720 ? 3 : 2);
	const nomsDe = (j: Jeu) => j.joueurs.map((id) => data.membres.find((m) => m.id === id)).filter((m) => !!m).map((m) => ({ nom: m!.nom, photo: m!.photo }));
	const rang = (gs: Jeu[]) => Math.min(...gs.map((g) => ORDRE_JEU.indexOf(g.statut)));
	const barre = (gs: Jeu[]) => ORDRE_JEU.map((k) => ({ n: gs.filter((g) => g.statut === k).length, c: ST[k].c })).filter((b) => b.n);

	type Cellule =
		| { type: 'seul'; jeu: Jeu }
		| { type: 'pile'; nom: string; jeux: Jeu[]; couverture: Jeu; termines: number; ouverte: boolean }
		| { type: 'panneau'; nom: string; jeux: Jeu[]; termines: number; caret: string };

	const cellules = $derived.by(() => {
		const q = recherche.trim().toLowerCase();
		const liste = data.jeux.filter(
			(g) => (filtreStatut === 'tous' || g.statut === filtreStatut) && (!q || g.titre.toLowerCase().includes(q) || g.serie.toLowerCase().includes(q))
		);
		const totalSerie: Record<string, number> = {};
		data.jeux.forEach((g) => g.serie && (totalSerie[g.serie] = (totalSerie[g.serie] ?? 0) + 1));

		let groupes: { nom: string; jeux: Jeu[]; pile: boolean; recent: number }[];
		if (parSerie) {
			const map = new Map<string, Jeu[]>();
			for (const g of liste) {
				const k = g.serie && totalSerie[g.serie] > 1 ? 's:' + g.serie : 'g:' + g.id;
				map.set(k, [...(map.get(k) ?? []), g]);
			}
			groupes = [...map].map(([k, gs]) => ({
				nom: k[0] === 's' ? gs[0].serie : gs[0].titre,
				jeux: gs.sort((a, b) => a.ajouteLe - b.ajouteLe || a.id - b.id),
				pile: k[0] === 's',
				recent: Math.max(...gs.map((g) => g.ajouteLe))
			}));
		} else groupes = liste.map((g) => ({ nom: g.titre, jeux: [g], pile: false, recent: g.ajouteLe }));

		const cmp = {
			recent: (a: (typeof groupes)[0], b: (typeof groupes)[0]) => b.recent - a.recent,
			titre: (a: (typeof groupes)[0], b: (typeof groupes)[0]) => a.nom.localeCompare(b.nom, 'fr'),
			progression: (a: (typeof groupes)[0], b: (typeof groupes)[0]) => rang(a.jeux) - rang(b.jeux) || a.nom.localeCompare(b.nom, 'fr')
		}[tri];
		groupes.sort(cmp);

		const res: Cellule[] = groupes.map((it) => {
			if (!it.pile) return { type: 'seul', jeu: it.jeux[0] };
			const couverture = it.jeux.find((g) => g.statut === 'en_cours') ?? it.jeux.find((g) => g.statut === 'en_pause') ?? it.jeux[0];
			return { type: 'pile', nom: it.nom, jeux: it.jeux, couverture, termines: it.jeux.filter((g) => g.statut === 'termine').length, ouverte: ouverte === it.nom };
		});
		const oi = res.findIndex((c) => c.type === 'pile' && c.ouverte);
		if (oi >= 0) {
			const c = res[oi] as Extract<Cellule, { type: 'pile' }>;
			const fin = Math.min(res.length - 1, Math.floor(oi / cols) * cols + cols - 1);
			res.splice(fin + 1, 0, { type: 'panneau', nom: c.nom, jeux: c.jeux, termines: c.termines, caret: `calc(${(((oi % cols) + 0.5) / cols) * 100}% - 5px)` });
		}
		return res;
	});

	const resume = $derived(ORDRE_JEU.map((k) => ({ l: ST[k].l.toLowerCase(), n: data.jeux.filter((g) => g.statut === k).length, c: ST[k].c })));
	const series = $derived([...new Set(data.jeux.map((g) => g.serie).filter(Boolean))]);

	function ouvrirAjout() {
		form = { titre: '', serie: ouverte ?? '', image: '', statut: 'a_faire', joueurs: data.moi ? [data.moi.id] : [], igdbId: null };
		viderIgdb();
		menu = null;
		modale = 'nouveau';
	}
	function ouvrirEdition(j: Jeu) {
		form = { titre: j.titre, serie: j.serie, image: j.image, statut: j.statut, joueurs: [...j.joueurs], igdbId: j.igdbId };
		viderIgdb();
		menu = null;
		modale = j.id;
	}
	async function enregistrer() {
		if (!form.titre.trim()) return;
		enregistrement = true;
		const r = await envoyer('?/enregistrer', { id: modale === 'nouveau' ? null : modale, ...form });
		enregistrement = false;
		if (r) modale = null;
	}
	async function supprimer() {
		if (typeof modale !== 'number') return;
		if (await envoyer('?/supprimer', { id: modale })) modale = null;
	}
	async function changerStatut(j: Jeu, statut: StatutJeu) {
		menu = null;
		j.statut = statut; // affichage immédiat, confirmé par le serveur
		await envoyer('?/statut', { id: j.id, statut }, { silencieux: true });
	}
	const basculerJoueur = (id: number) =>
		(form.joueurs = form.joueurs.includes(id) ? form.joueurs.filter((x) => x !== id) : [...form.joueurs, id]);

	// Recherche IGDB : remplit le titre, la série et l'image d'un clic.
	type ResultatIgdb = { igdbId: number; titre: string; annee: number | null; serie: string | null; jaquette: string | null; banniere: string | null };
	let rechercheIgdb = $state('');
	let resultatsIgdb = $state<ResultatIgdb[]>([]);
	let etatIgdb = $state<'repos' | 'charge' | 'vide' | 'erreur'>('repos');
	let attenteIgdb: ReturnType<typeof setTimeout> | undefined;
	let numeroIgdb = 0;
	function viderIgdb() {
		clearTimeout(attenteIgdb);
		rechercheIgdb = '';
		resultatsIgdb = [];
		etatIgdb = 'repos';
	}
	function chercherIgdb() {
		clearTimeout(attenteIgdb);
		const q = rechercheIgdb.trim();
		if (q.length < 2) {
			resultatsIgdb = [];
			etatIgdb = 'repos';
			return;
		}
		etatIgdb = 'charge';
		attenteIgdb = setTimeout(async () => {
			const n = ++numeroIgdb;
			try {
				const rep = await fetch(`/jeux/igdb?q=${encodeURIComponent(q)}`);
				if (!rep.ok) throw new Error();
				const r = (await rep.json()) as ResultatIgdb[];
				if (n !== numeroIgdb) return; // une recherche plus récente est partie
				resultatsIgdb = r;
				etatIgdb = r.length ? 'repos' : 'vide';
			} catch {
				if (n === numeroIgdb) etatIgdb = 'erreur';
			}
		}, 300);
	}
	function choisirIgdb(r: ResultatIgdb) {
		form.titre = r.titre;
		if (r.serie) form.serie = r.serie;
		if (r.banniere) form.image = r.banniere;
		form.igdbId = r.igdbId;
		viderIgdb();
	}

	function fermerMenus() {
		menu = null;
	}
</script>

<svelte:head><title>Liste des jeux en cours · nohriancons</title></svelte:head>
<svelte:window bind:innerWidth={largeur} onclick={fermerMenus} />

{#snippet couverture(j: { titre: string; serie: string; image: string }, taille: string, rayon = 'var(--radius-lg)')}
	<div class="couv" style:border-radius={rayon} style:background-color={j.image ? 'var(--surface-2)' : teinte(j.serie || j.titre)} style:background-image={j.image ? `url("${j.image}")` : 'none'}>
		{#if !j.image}<div class="couv-titre" style:font-size={taille}>{j.titre}</div>{/if}
	</div>
{/snippet}

{#snippet statut(j: Jeu)}
	<div class="statut">
		<button type="button" class="nh-unset" style:cursor={edition ? 'pointer' : 'default'} aria-haspopup={edition ? 'menu' : undefined} aria-expanded={edition ? menu === j.id : undefined} onclick={(e) => { e.stopPropagation(); if (edition) menu = menu === j.id ? null : j.id; }}>
			<span class="nh-badge nh-badge--{ST[j.statut].ton}"><span class="nh-badge__dot"></span>{ST[j.statut].l}{#if edition}<i class="icon-chevron-down" style="font-size:12px" aria-hidden="true"></i>{/if}</span>
		</button>
		{#if edition}
			<span style="margin-left:auto"><button type="button" class="nh-btn nh-iconbtn nh-btn--ghost nh-btn--sm" aria-label="Modifier {j.titre}" title="Modifier" onclick={() => ouvrirEdition(j)}><i class="icon-pencil" aria-hidden="true"></i></button></span>
		{/if}
		{#if menu === j.id}
			<div class="nh-menu" role="menu" style="top:calc(100% + 6px);left:0">
				{#each ORDRE_JEU as k (k)}
					<button type="button" role="menuitemradio" aria-checked={k === j.statut} aria-current={k === j.statut} onclick={(e) => { e.stopPropagation(); changerStatut(j, k); }}><span class="nh-dot" style:background={ST[k].c}></span>{ST[k].l}</button>
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

<main class="nh-page" style="gap:var(--space-8)">
	<header class="entete">
		<div class="ligne">
			<div class="col">
				<h1>Liste des jeux en cours</h1>
				<div class="resume">
					{#each resume as s (s.l)}<span><span class="nh-dot" style:background={s.c}></span>{s.n} {s.l}</span>{/each}
				</div>
			</div>
			<div class="boutons">
				<button type="button" class="nh-btn nh-btn--ghost" onclick={() => { edition = !edition; menu = null; }}><i class="icon-{edition ? 'eye' : 'pencil'}" aria-hidden="true"></i>{edition ? 'Mode lecture' : 'Modifier'}</button>
				{#if edition}<button type="button" class="nh-btn nh-btn--primary" onclick={ouvrirAjout}><i class="icon-plus" aria-hidden="true"></i>Ajouter un jeu</button>{/if}
			</div>
		</div>
		<div class="filtres">
			<div class="nh-input recherche"><i class="icon-search" aria-hidden="true"></i><input bind:value={recherche} placeholder="Cherche un jeu ou une série" aria-label="Chercher" /></div>
			<div class="nh-input" style="width:190px">
				<select bind:value={filtreStatut} aria-label="Filtrer par statut">
					<option value="tous">Tous les statuts</option>
					{#each ORDRE_JEU as k (k)}<option value={k}>{ST[k].l}</option>{/each}
				</select><i class="icon-chevron-down" aria-hidden="true" style="pointer-events:none"></i>
			</div>
			<div class="nh-input" style="width:190px">
				<select bind:value={tri} aria-label="Trier">
					<option value="progression">Par progression</option>
					<option value="recent">Ajout récent</option>
					<option value="titre">Titre A → Z</option>
				</select><i class="icon-chevron-down" aria-hidden="true" style="pointer-events:none"></i>
			</div>
			<label class="nh-switch" style="margin-left:var(--space-2)"><input type="checkbox" role="switch" bind:checked={parSerie} onchange={() => (ouverte = null)} /><span class="nh-switch__track"></span>Par série</label>
		</div>
	</header>

	{#if cellules.length === 0}
		<div class="vide">{data.jeux.length ? 'Aucun jeu ne correspond. Change la recherche ou les filtres.' : 'Aucun jeu pour l’instant. Ajoute le premier !'}</div>
	{/if}

	<div class="grille" style:grid-template-columns="repeat({cols},minmax(0,1fr))">
		{#each cellules as c, i (c.type === 'seul' ? `j${c.jeu.id}` : `${c.type}:${c.nom}`)}
			{#if c.type === 'pile'}
				<button type="button" class="nh-unset pile" aria-expanded={c.ouverte} onclick={(e) => { e.stopPropagation(); ouverte = c.ouverte ? null : c.nom; menu = null; }}>
					<div class="pile-img">
						<div class="feuille" style="transform:translate(10px,-10px);background:var(--night-750)"></div>
						<div class="feuille" style="transform:translate(5px,-5px);background:var(--night-700)"></div>
						<div class="dessus" style:box-shadow="0 0 0 2px {c.ouverte ? 'var(--apricot-300)' : 'transparent'},var(--shadow-2)">
							{@render couverture({ ...c.couverture, titre: c.nom, serie: c.nom }, 'var(--text-2xl)')}
							<span class="compte"><span class="nh-badge nh-badge--neutral">{c.jeux.length} jeux</span></span>
						</div>
					</div>
					<div class="legende">
						<div class="l1"><span class="nom">{c.nom}</span><span class="sub">{c.termines}/{c.jeux.length} terminés</span></div>
						<div class="nh-bar">{#each barre(c.jeux) as b, k (k)}<span style:flex={b.n} style:background={b.c}></span>{/each}</div>
					</div>
				</button>
			{:else if c.type === 'seul'}
				<div class="seul">
					<div class="seul-img">{@render couverture(c.jeu, 'var(--text-xl)')}</div>
					<div class="l1"><span class="nom">{c.jeu.titre}</span><AvatarGroup personnes={nomsDe(c.jeu)} taille={24} /></div>
					{@render statut(c.jeu)}
				</div>
			{:else}
				<div class="panneau">
					<span class="caret" style:left={c.caret}></span>
					<div class="p-tete">
						<span class="p-nom">{c.nom}</span>
						<span class="sub">{c.termines}/{c.jeux.length} terminés</span>
						<div class="nh-bar" style="flex:1;min-width:120px;max-width:240px">{#each barre(c.jeux) as b, k (k)}<span style:flex={b.n} style:background={b.c}></span>{/each}</div>
						<span style="margin-left:auto"><button type="button" class="nh-btn nh-iconbtn nh-btn--ghost" aria-label="Fermer" onclick={() => (ouverte = null)}><i class="icon-x" aria-hidden="true"></i></button></span>
					</div>
					<div class="p-grille">
						{#each c.jeux as j (j.id)}
							<div class="seul" style="padding:0">
								<div class="seul-img" style="aspect-ratio:16/9">{@render couverture(j, 'var(--text-lg)', 'var(--radius-md)')}</div>
								<div class="l1"><span class="nom" style="font-size:var(--text-sm)">{j.titre}</span><AvatarGroup personnes={nomsDe(j)} taille={22} /></div>
								{@render statut(j)}
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/each}
	</div>
</main>

{#if modale !== null}
	<Dialog titre={modale === 'nouveau' ? 'Ajouter un jeu' : 'Modifier le jeu'} onfermer={() => (modale = null)}>
		<form class="form" onsubmit={(e) => { e.preventDefault(); enregistrer(); }}>
			<div class="defile">
				{#if data.igdbActif}
					<div class="nh-field">
						<label class="nh-field__label" for="j-igdb">Chercher sur IGDB</label>
						<div class="nh-input"><i class={etatIgdb === 'charge' ? 'icon-loader' : 'icon-search'} aria-hidden="true"></i><input id="j-igdb" bind:value={rechercheIgdb} oninput={chercherIgdb} placeholder="Halo, Civilization…" autocomplete="off" onkeydown={(e) => e.key === 'Enter' && e.preventDefault()} /></div>
						{#if resultatsIgdb.length}
							<div class="igdb" role="listbox" aria-label="Résultats IGDB">
								{#each resultatsIgdb as r (r.igdbId)}
									<button type="button" role="option" aria-selected={form.igdbId === r.igdbId} class="nh-unset igdb-ligne" onclick={() => choisirIgdb(r)}>
										<span class="igdb-jaq">{#if r.jaquette}<img src={r.jaquette} alt="" loading="lazy" />{/if}</span>
										<span class="igdb-txt"><span class="igdb-nom">{r.titre}</span><span class="igdb-sub">{[r.annee, r.serie].filter(Boolean).join(' · ') || 'Sans date'}</span></span>
									</button>
								{/each}
							</div>
						{:else if etatIgdb === 'vide'}
							<div class="nh-field__hint">Rien trouvé sur IGDB. Tu peux remplir à la main.</div>
						{:else if etatIgdb === 'erreur'}
							<div class="nh-field__hint">IGDB ne répond pas. Tu peux remplir à la main.</div>
						{:else}
							<div class="nh-field__hint">Remplit le titre, la série et l'image. Tout reste modifiable.</div>
						{/if}
					</div>
				{/if}
				<div class="apercu">{@render couverture({ titre: form.titre || 'Nouveau jeu', serie: form.serie, image: form.image.trim() }, 'var(--text-xl)', 'var(--radius-md)')}</div>
				<div class="nh-field"><label class="nh-field__label" for="j-titre">Titre</label><div class="nh-input"><input id="j-titre" bind:value={form.titre} placeholder="Halo 2" required /></div></div>
				<div class="nh-field">
					<label class="nh-field__label" for="j-serie">Série</label>
					<div class="nh-input"><input id="j-serie" bind:value={form.serie} list="series" placeholder="Halo" /></div>
					<div class="nh-field__hint">Facultatif. Les jeux d'une même série sont empilés.</div>
					<datalist id="series">{#each series as s (s)}<option value={s}></option>{/each}</datalist>
				</div>
				<div class="nh-field">
					<label class="nh-field__label" for="j-image">Bannière</label>
					<div class="nh-input"><i class="icon-image" aria-hidden="true"></i><input id="j-image" bind:value={form.image} placeholder="https://…" type="url" /></div>
					<div class="nh-field__hint">Colle le lien d'une image.</div>
				</div>
				<div class="groupe">
					<span class="nh-field__label">Qui joue</span>
					<div class="tags">
						{#each data.membres as m (m.id)}
							{@const on = form.joueurs.includes(m.id)}
							<button type="button" class="nh-tag nh-tag--clickable" class:nh-tag--selected={on} aria-pressed={on} onclick={() => basculerJoueur(m.id)}><i class="icon-{on ? 'check' : 'plus'}" aria-hidden="true"></i>{m.nom.split(' ')[0]}</button>
						{/each}
					</div>
				</div>
				<div class="groupe">
					<span class="nh-field__label">Statut</span>
					<div class="tags">
						{#each ORDRE_JEU as k (k)}
							<button type="button" class="nh-tag nh-tag--clickable" class:nh-tag--selected={form.statut === k} aria-pressed={form.statut === k} onclick={() => (form.statut = k)}>{ST[k].l}</button>
						{/each}
					</div>
				</div>
			</div>
			<div class="pied">
				{#if modale !== 'nouveau'}<button type="button" class="nh-btn nh-btn--danger" onclick={supprimer}>Supprimer</button>{/if}
				<span style="margin-left:auto"><button type="button" class="nh-btn nh-btn--ghost" onclick={() => (modale = null)}>Annuler</button></span>
				<button class="nh-btn nh-btn--primary" disabled={!form.titre.trim() || enregistrement}>Enregistrer</button>
			</div>
		</form>
	</Dialog>
{/if}

<style>
	.entete {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}
	.ligne {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-4);
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	h1 {
		font: var(--type-h1);
		letter-spacing: var(--tracking-tight);
	}
	.resume {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
		font: var(--type-body-sm);
		color: var(--fg-3);
	}
	.resume > span {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.boutons {
		display: flex;
		gap: var(--space-2);
	}
	.filtres {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}
	.recherche {
		flex: 1;
		min-width: 220px;
		max-width: 340px;
	}
	.vide {
		padding: var(--space-20) 0;
		text-align: center;
		color: var(--fg-3);
	}
	.grille {
		display: grid;
		gap: var(--space-8) var(--space-6);
		align-items: start;
	}
	.couv {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background-size: cover;
		background-position: center;
	}
	.couv-titre {
		position: absolute;
		inset: 0;
		padding: var(--space-4);
		display: flex;
		align-items: flex-end;
		font-weight: var(--weight-bold);
		line-height: var(--leading-tight);
		letter-spacing: var(--tracking-tight);
		color: var(--fg-1);
	}
	.pile {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
		transition: transform var(--dur-base) var(--ease-out);
	}
	.pile:hover {
		transform: translateY(-2px);
	}
	.pile-img {
		position: relative;
		aspect-ratio: 16/9;
		margin: 10px 10px 0 0;
	}
	.feuille {
		position: absolute;
		inset: 0;
		border-radius: var(--radius-lg);
		border: 1px solid var(--border-subtle);
	}
	.dessus {
		position: absolute;
		inset: 0;
		border-radius: var(--radius-lg);
		overflow: hidden;
	}
	.compte {
		position: absolute;
		top: var(--space-3);
		right: var(--space-3);
	}
	.legende {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.l1 {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.nom {
		font: var(--type-label);
		font-size: var(--text-md);
		color: var(--fg-1);
		min-width: 0;
	}
	.sub {
		font: var(--type-body-sm);
		font-size: 13px;
		color: var(--fg-3);
		white-space: nowrap;
	}
	.seul {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
		padding-top: 10px;
		padding-right: 10px;
	}
	.seul-img {
		position: relative;
		aspect-ratio: 16/9;
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-2);
	}
	.statut {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.panneau {
		grid-column: 1/-1;
		position: relative;
		padding: var(--space-6) var(--space-8) var(--space-8);
		border-radius: var(--radius-lg);
		background: var(--surface-1);
		border: 1px solid var(--border-subtle);
		box-shadow: var(--shadow-1);
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}
	.caret {
		position: absolute;
		top: -8px;
		width: 14px;
		height: 14px;
		background: var(--surface-1);
		border-left: 1px solid var(--border-subtle);
		border-top: 1px solid var(--border-subtle);
		transform: translateX(-50%) rotate(45deg);
	}
	.p-tete {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		flex-wrap: wrap;
	}
	.p-nom {
		font: var(--type-h3);
		letter-spacing: var(--tracking-tight);
		color: var(--fg-1);
	}
	.p-grille {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: var(--space-6) var(--space-5);
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.defile {
		max-height: calc(100vh - 220px);
		overflow: auto;
		margin: 0 -4px;
		padding: 0 4px;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.apercu {
		position: relative;
		flex: none;
		height: 120px;
	}
	.igdb {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--space-1);
		border-radius: var(--radius-md);
		background: var(--surface-2);
		border: 1px solid var(--border-subtle);
		max-height: 260px;
		overflow: auto;
	}
	.igdb-ligne {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.igdb-ligne:hover,
	.igdb-ligne:focus-visible {
		background: var(--surface-hover);
	}
	.igdb-jaq {
		flex: none;
		width: 30px;
		height: 40px;
		border-radius: 4px;
		overflow: hidden;
		background: var(--petrol-800);
	}
	.igdb-jaq img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.igdb-txt {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.igdb-nom {
		font: var(--type-label);
		color: var(--fg-1);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.igdb-sub {
		font-size: 12px;
		color: var(--fg-3);
	}
	.groupe {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.pied {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-1);
	}
	@media (max-width: 719px) {
		.panneau {
			padding: var(--space-5);
		}
		.p-grille {
			grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		}
	}
</style>
