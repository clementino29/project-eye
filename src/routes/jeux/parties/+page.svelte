<script lang="ts">
	// « Parties » : cartes groupées par jeu, panneau de détail avec le journal des sessions.
	import Avatar from '#lib/components/Avatar.svelte';
	import AvatarGroup from '#lib/components/AvatarGroup.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import { envoyer } from '#lib/actions.ts';
	import { ORDRE_PARTIE, STATUTS_PARTIE as ST, type StatutPartie } from '#lib/libelles.ts';
	import { dateCourte, dateLongue, derniereSession, journal, pourcentage, tourActuel, trierSessions } from '#lib/parties.ts';

	let { data } = $props();
	type Partie = (typeof data.parties)[number];

	let largeur = $state(1200);
	let recherche = $state('');
	let filtreJeu = $state('tous');
	let filtreStatut = $state<'tous' | StatutPartie>('tous');
	let edition = $state(true);
	let ouverte = $state<number | null>(null);
	let menu = $state<number | null>(null);
	let modale = $state<'nouvelle' | 'session' | number | null>(null);
	let form = $state({ nom: '', jeu: '', toursMax: '', statut: 'en_cours' as StatutPartie, joueurs: [] as number[], gagnantId: null as number | null });
	let sform = $state({ partieId: 0, date: '', tour: '', note: '', min: 1, exemple: '' });
	let envoi = $state(false);

	const cols = $derived(largeur >= 1440 ? 4 : largeur >= 1000 ? 3 : largeur >= 640 ? 2 : 1);
	const membre = (id: number | null) => data.membres.find((m) => m.id === id);
	const prenom = (id: number | null) => membre(id)?.nom.split(' ')[0] ?? 'un ancien membre';
	const personnes = (p: Partie) => p.joueurs.map((id) => membre(id)).filter((m) => !!m).map((m) => ({ nom: m!.nom, photo: m!.photo }));
	const barreDe = (ps: Partie[]) => ORDRE_PARTIE.map((k) => ({ n: ps.filter((p) => p.statut === k).length, c: ST[k].c })).filter((b) => b.n);
	const couleurBarre = (p: Partie) => (p.statut === 'terminee' ? 'var(--success-fg)' : p.statut === 'en_pause' ? 'var(--warning-fg)' : 'var(--petrol-300)');
	const aujourdhui = () => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	};

	type Cellule = { type: 'carte'; partie: Partie; ouverte: boolean } | { type: 'panneau'; partie: Partie; caret: string };

	const groupes = $derived.by(() => {
		const q = recherche.trim().toLowerCase();
		const liste = data.parties.filter(
			(p) =>
				(filtreStatut === 'tous' || p.statut === filtreStatut) &&
				(filtreJeu === 'tous' || p.jeu === filtreJeu) &&
				(!q || p.nom.toLowerCase().includes(q) || p.jeu.toLowerCase().includes(q))
		);
		const parJeu = new Map<string, Partie[]>();
		for (const p of liste) parJeu.set(p.jeu, [...(parJeu.get(p.jeu) ?? []), p]);
		const rang = (ps: Partie[]) => Math.min(...ps.map((p) => ORDRE_PARTIE.indexOf(p.statut)));
		return [...parJeu]
			.sort(([a, pa], [b, pb]) => rang(pa) - rang(pb) || a.localeCompare(b, 'fr'))
			.map(([nom, ps]) => {
				ps.sort((a, b) => ORDRE_PARTIE.indexOf(a.statut) - ORDRE_PARTIE.indexOf(b.statut) || derniereSession(b.sessions).localeCompare(derniereSession(a.sessions)));
				const toutes = data.parties.filter((p) => p.jeu === nom);
				const enCours = toutes.filter((p) => p.statut === 'en_cours').length;
				const cellules: Cellule[] = ps.map((p) => ({ type: 'carte', partie: p, ouverte: ouverte === p.id }));
				const oi = cellules.findIndex((c) => c.type === 'carte' && c.ouverte);
				if (oi >= 0) {
					const fin = Math.min(cellules.length - 1, Math.floor(oi / cols) * cols + cols - 1);
					cellules.splice(fin + 1, 0, { type: 'panneau', partie: cellules[oi].partie, caret: `calc(${(((oi % cols) + 0.5) / cols) * 100}% - 4px)` });
				}
				return {
					nom,
					cellules,
					barre: barreDe(toutes),
					meta: `${toutes.length} partie${toutes.length > 1 ? 's' : ''}${enCours ? ` · ${enCours} en cours` : ''}`
				};
			});
	});

	const resume = $derived(ORDRE_PARTIE.map((k) => ({ l: ST[k].pl, n: data.parties.filter((p) => p.statut === k).length, c: ST[k].c })));
	const jeuxUtilises = $derived([...new Set(data.parties.map((p) => p.jeu))].sort((a, b) => a.localeCompare(b, 'fr')));
	const partieSession = $derived(data.parties.find((p) => p.id === sform.partieId));
	const peutEnregistrer = $derived(!!(form.nom.trim() && form.jeu.trim() && form.joueurs.length) && !envoi);
	const peutAjouterSession = $derived(!!sform.date && Number.parseInt(sform.tour, 10) >= sform.min && !envoi);

	function ouvrirAjout() {
		form = { nom: '', jeu: filtreJeu !== 'tous' ? filtreJeu : '', toursMax: '', statut: 'en_cours', joueurs: data.moi ? [data.moi.id] : [], gagnantId: null };
		menu = null;
		modale = 'nouvelle';
	}
	function ouvrirEdition(p: Partie) {
		form = { nom: p.nom, jeu: p.jeu, toursMax: p.toursMax ? String(p.toursMax) : '', statut: p.statut, joueurs: [...p.joueurs], gagnantId: p.gagnantId };
		menu = null;
		modale = p.id;
	}
	function ouvrirSession(p: Partie) {
		const t = tourActuel(p.sessions);
		sform = { partieId: p.id, date: aujourdhui(), tour: '', note: '', min: t + 1, exemple: String(t + 30) };
		modale = 'session';
	}
	function basculerJoueur(id: number) {
		const on = form.joueurs.includes(id);
		form.joueurs = on ? form.joueurs.filter((x) => x !== id) : [...form.joueurs, id];
		if (on && form.gagnantId === id) form.gagnantId = null;
	}

	async function enregistrer() {
		if (!peutEnregistrer) return;
		envoi = true;
		const r = await envoyer('?/enregistrer', {
			id: typeof modale === 'number' ? modale : null,
			nom: form.nom,
			jeu: form.jeu,
			toursMax: form.toursMax,
			statut: form.statut,
			joueurs: form.joueurs,
			gagnantId: form.statut === 'terminee' ? form.gagnantId : null
		});
		envoi = false;
		if (r) {
			if (modale === 'nouvelle' && typeof r.id === 'number') ouverte = r.id;
			modale = null;
		}
	}
	async function supprimer() {
		if (typeof modale !== 'number') return;
		const id = modale;
		if (await envoyer('?/supprimer', { id })) {
			modale = null;
			if (ouverte === id) ouverte = null;
		}
	}
	async function ajouterSession() {
		if (!peutAjouterSession) return;
		envoi = true;
		const r = await envoyer('?/ajouterSession', { partieId: sform.partieId, date: sform.date, tourAtteint: sform.tour, note: sform.note });
		envoi = false;
		if (r) modale = null;
	}
	async function changerStatut(p: Partie, statut: StatutPartie) {
		menu = null;
		p.statut = statut; // affichage immédiat, confirmé par le serveur
		await envoyer('?/statut', { id: p.id, statut }, { silencieux: true });
	}
</script>

<svelte:head><title>Parties · Nohriancons</title></svelte:head>
<svelte:window bind:innerWidth={largeur} onclick={() => (menu = null)} onkeydown={(e) => e.key === 'Escape' && (menu = null)} />

{#snippet avancement(p: Partie, grand: boolean)}
	{@const tour = tourActuel(p.sessions)}
	<div class="tour">
		<span class="tour-l">Tour</span><span class="tour-n" class:grand>{tour}</span>{#if p.toursMax}<span class="tour-max" class:grand>/ {p.toursMax}</span>{/if}
	</div>
	{#if p.toursMax}
		<div class="jauge" style:height={grand ? '6px' : '4px'}><div style:width={pourcentage(tour, p.toursMax)} style:background={couleurBarre(p)}></div></div>
	{:else if !grand}
		<span class="sans-limite">Sans limite de tours</span>
	{/if}
{/snippet}

<main class="nh-page" style="gap:var(--space-12)">
	<header class="entete">
		<div class="ligne">
			<div class="col">
				<h1>Parties</h1>
				<div class="resume">
					{#each resume as s (s.l)}<span><span class="nh-dot" style:background={s.c}></span>{s.n} {s.l}</span>{/each}
				</div>
			</div>
			<div class="boutons">
				<button type="button" class="nh-btn nh-btn--ghost" onclick={() => { edition = !edition; menu = null; }}><i class="icon-{edition ? 'eye' : 'pencil'}" aria-hidden="true"></i>{edition ? 'Mode lecture' : 'Modifier'}</button>
				{#if edition}<button type="button" class="nh-btn nh-btn--primary" onclick={ouvrirAjout}><i class="icon-plus" aria-hidden="true"></i>Nouvelle partie</button>{/if}
			</div>
		</div>
		<div class="filtres">
			<div class="nh-input recherche"><i class="icon-search" aria-hidden="true"></i><input bind:value={recherche} placeholder="Cherche une partie ou un jeu" aria-label="Chercher" /></div>
			<div class="nh-input" style="width:200px">
				<select bind:value={filtreJeu} aria-label="Filtrer par jeu">
					<option value="tous">Tous les jeux</option>
					{#each jeuxUtilises as j (j)}<option value={j}>{j}</option>{/each}
				</select><i class="icon-chevron-down" aria-hidden="true" style="pointer-events:none"></i>
			</div>
			<div class="nh-input" style="width:190px">
				<select bind:value={filtreStatut} aria-label="Filtrer par statut">
					<option value="tous">Tous les statuts</option>
					{#each ORDRE_PARTIE as k (k)}<option value={k}>{ST[k].l}</option>{/each}
				</select><i class="icon-chevron-down" aria-hidden="true" style="pointer-events:none"></i>
			</div>
		</div>
	</header>

	{#if groupes.length === 0}
		<div class="vide">{data.parties.length ? 'Aucune partie ne correspond. Change la recherche ou les filtres.' : 'Aucune partie pour l’instant. Crée la première !'}</div>
	{/if}

	{#each groupes as g (g.nom)}
		<section class="groupe-jeu">
			<div class="g-tete">
				<h2>{g.nom}</h2>
				<span class="meta">{g.meta}</span>
				<div class="nh-bar g-barre">{#each g.barre as b, k (k)}<span style:flex={b.n} style:background={b.c}></span>{/each}</div>
			</div>
			<div class="grille" style:grid-template-columns="repeat({cols},minmax(0,1fr))">
				{#each g.cellules as c (`${c.type}${c.partie.id}`)}
					{@const p = c.partie}
					{#if c.type === 'carte'}
						<div
							class="carte"
							role="button"
							tabindex="0"
							aria-expanded={c.ouverte}
							style:box-shadow="0 0 0 2px {c.ouverte ? 'var(--apricot-300)' : 'transparent'},var(--shadow-1)"
							onclick={() => { ouverte = c.ouverte ? null : p.id; menu = null; }}
							onkeydown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); ouverte = c.ouverte ? null : p.id; } }}
						>
							<div class="c-tete">
								<span class="c-nom">{p.nom}</span>
								<div class="statut">
									<button type="button" class="nh-unset" style:cursor={edition ? 'pointer' : 'default'} aria-haspopup={edition ? 'menu' : undefined} aria-expanded={edition ? menu === p.id : undefined} aria-label="Statut : {ST[p.statut].l}" onclick={(e) => { e.stopPropagation(); if (edition) menu = menu === p.id ? null : p.id; }}>
										<span class="nh-badge nh-badge--{ST[p.statut].ton}"><span class="nh-badge__dot"></span>{ST[p.statut].l}{#if edition}<i class="icon-chevron-down" style="font-size:12px" aria-hidden="true"></i>{/if}</span>
									</button>
									{#if menu === p.id}
										<div class="nh-menu" role="menu" style="top:calc(100% + 6px);right:0;min-width:170px">
											{#each ORDRE_PARTIE as k (k)}
												<button type="button" role="menuitemradio" aria-checked={k === p.statut} aria-current={k === p.statut} onclick={(e) => { e.stopPropagation(); changerStatut(p, k); }}><span class="nh-dot" style:background={ST[k].c}></span>{ST[k].l}</button>
											{/each}
										</div>
									{/if}
								</div>
							</div>
							<div class="c-avancement">{@render avancement(p, false)}</div>
							{#if p.statut === 'terminee' && p.gagnantId}
								<div class="victoire"><i class="icon-trophy" aria-hidden="true"></i>Victoire de {prenom(p.gagnantId)}</div>
							{/if}
							<div class="c-pied">
								<AvatarGroup personnes={personnes(p)} taille={24} />
								<span class="sub">{p.sessions.length ? `Dernière session ${dateCourte(derniereSession(p.sessions))}` : 'Pas encore jouée'}</span>
							</div>
						</div>
					{:else}
						{@const sessions = trierSessions(p.sessions)}
						<div class="panneau">
							<span class="caret" style:left={c.caret}></span>
							<div class="p-tete">
								<span class="p-nom">{p.nom}</span>
								<span class="nh-badge nh-badge--{ST[p.statut].ton}"><span class="nh-badge__dot"></span>{ST[p.statut].l}</span>
								<span class="p-actions">
									{#if edition}<button type="button" class="nh-btn nh-btn--ghost nh-btn--sm" onclick={() => ouvrirEdition(p)}><i class="icon-pencil" aria-hidden="true"></i>Modifier</button>{/if}
									<button type="button" class="nh-btn nh-iconbtn nh-btn--ghost" aria-label="Fermer" onclick={() => (ouverte = null)}><i class="icon-x" aria-hidden="true"></i></button>
								</span>
							</div>
							<div class="p-grille" style:grid-template-columns={cols === 1 ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1.7fr)'}>
								<div class="p-col">
									<div class="bloc">
										<span class="nh-overline">Avancement</span>
										{@render avancement(p, true)}
										<span class="sub" style="white-space:normal">{sessions.length ? `${sessions.length} session${sessions.length > 1 ? 's' : ''} depuis le ${dateCourte(sessions[0].date)}` : 'Partie pas encore commencée'}</span>
									</div>
									<div class="bloc">
										<span class="nh-overline">Joueurs</span>
										<div class="joueurs">
											{#each p.joueurs as id (id)}
												{@const m = membre(id)}
												<div class="joueur">
													<Avatar nom={m?.nom ?? '?'} src={m?.photo} taille={28} />
													<span class="j-nom">{m?.nom ?? 'Ancien membre'}</span>
													{#if p.statut === 'terminee' && p.gagnantId === id}<span class="nh-badge nh-badge--accent"><i class="icon-trophy" style="font-size:12px" aria-hidden="true"></i>Gagnant</span>{/if}
												</div>
											{/each}
										</div>
									</div>
								</div>
								<div class="p-col" style="gap:var(--space-3)">
									<div class="j-tete">
										<span class="nh-overline">Journal des sessions</span>
										{#if edition}<button type="button" class="nh-btn nh-btn--secondary nh-btn--sm" onclick={() => ouvrirSession(p)}><i class="icon-plus" aria-hidden="true"></i>Ajouter une session</button>{/if}
									</div>
									{#if !sessions.length}
										<div class="sub" style="padding:var(--space-6) 0;white-space:normal">Pas encore de session. Ajoute la première après votre prochaine soirée.</div>
									{/if}
									<div>
										{#each journal(p.sessions) as se (se.id)}
											<div class="session">
												<span class="s-date">{dateLongue(se.date)}</span>
												<div class="s-texte">
													<span class="s-plage">{se.plage}</span>
													{#if se.note}<span class="s-note">{se.note}</span>{/if}
												</div>
												<div class="s-fin">
													<span class="nh-badge nh-badge--neutral">{se.gain}</span>
													{#if edition}<button type="button" class="nh-btn nh-iconbtn nh-btn--ghost nh-btn--sm" aria-label="Supprimer la session" title="Supprimer la session" onclick={() => envoyer('?/supprimerSession', { id: se.id, partieId: p.id })}><i class="icon-trash-2" aria-hidden="true"></i></button>{/if}
												</div>
											</div>
										{/each}
									</div>
								</div>
							</div>
						</div>
					{/if}
				{/each}
			</div>
		</section>
	{/each}
</main>

{#if modale === 'nouvelle' || typeof modale === 'number'}
	<Dialog titre={modale === 'nouvelle' ? 'Nouvelle partie' : 'Modifier la partie'} onfermer={() => (modale = null)}>
		<form class="form" onsubmit={(e) => { e.preventDefault(); enregistrer(); }}>
			<div class="defile">
				<div class="nh-field"><label class="nh-field__label" for="p-nom">Nom de la partie</label><div class="nh-input"><input id="p-nom" bind:value={form.nom} placeholder="Pangée à cinq" required /></div></div>
				<div class="nh-field">
					<label class="nh-field__label" for="p-jeu">Jeu</label>
					<div class="nh-input"><input id="p-jeu" bind:value={form.jeu} list="jeux-connus" placeholder="Civilization VI" required /></div>
					<datalist id="jeux-connus">{#each data.nomsJeux as n (n)}<option value={n}></option>{/each}</datalist>
				</div>
				<div class="nh-field">
					<label class="nh-field__label" for="p-max">Limite de tours</label>
					<div class="nh-input"><input id="p-max" type="number" min="1" bind:value={form.toursMax} placeholder="500" /></div>
					<div class="nh-field__hint">Facultatif. Laisse vide s'il n'y en a pas.</div>
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
						{#each ORDRE_PARTIE as k (k)}
							<button type="button" class="nh-tag nh-tag--clickable" class:nh-tag--selected={form.statut === k} aria-pressed={form.statut === k} onclick={() => (form.statut = k)}>{ST[k].l}</button>
						{/each}
					</div>
				</div>
				{#if form.statut === 'terminee' && form.joueurs.length}
					<div class="groupe">
						<span class="nh-field__label">Qui a gagné</span>
						<div class="tags">
							{#each form.joueurs as id (id)}
								{@const on = form.gagnantId === id}
								<button type="button" class="nh-tag nh-tag--clickable" class:nh-tag--selected={on} aria-pressed={on} onclick={() => (form.gagnantId = on ? null : id)}>{#if on}<i class="icon-trophy" aria-hidden="true"></i>{/if}{prenom(id)}</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>
			<div class="pied">
				{#if typeof modale === 'number'}<button type="button" class="nh-btn nh-btn--danger" onclick={supprimer}>Supprimer</button>{/if}
				<span style="margin-left:auto"><button type="button" class="nh-btn nh-btn--ghost" onclick={() => (modale = null)}>Annuler</button></span>
				<button class="nh-btn nh-btn--primary" disabled={!peutEnregistrer}>Enregistrer</button>
			</div>
		</form>
	</Dialog>
{/if}

{#if modale === 'session'}
	<Dialog titre="Ajouter une session" description={partieSession ? `${partieSession.nom} · ${partieSession.jeu} · actuellement au tour ${sform.min - 1}` : ''} onfermer={() => (modale = null)}>
		<form class="form" onsubmit={(e) => { e.preventDefault(); ajouterSession(); }}>
			<div class="deux">
				<div class="nh-field"><label class="nh-field__label" for="s-date">Date</label><div class="nh-input"><input id="s-date" type="date" bind:value={sform.date} required /></div></div>
				<div class="nh-field"><label class="nh-field__label" for="s-tour">Tour atteint</label><div class="nh-input"><input id="s-tour" type="number" min={sform.min} bind:value={sform.tour} placeholder={sform.exemple} required /></div></div>
			</div>
			<div class="nh-field">
				<label class="nh-field__label" for="s-note">Note</label>
				<div class="nh-input"><input id="s-note" bind:value={sform.note} maxlength="500" placeholder="Quelqu'un a déclaré la guerre à tout le monde" /></div>
				<div class="nh-field__hint">Facultatif. Ce qui s'est passé ce soir-là.</div>
			</div>
			<div class="pied">
				<span style="margin-left:auto"><button type="button" class="nh-btn nh-btn--ghost" onclick={() => (modale = null)}>Annuler</button></span>
				<button class="nh-btn nh-btn--primary" disabled={!peutAjouterSession}>Ajouter</button>
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
	.groupe-jeu {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}
	.g-tete {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-3) var(--space-4);
	}
	h2 {
		font: var(--type-h3);
		letter-spacing: var(--tracking-tight);
		color: var(--fg-1);
	}
	.meta {
		font: var(--type-body-sm);
		color: var(--fg-3);
	}
	.g-barre {
		flex: 1;
		min-width: 80px;
		max-width: 200px;
		align-self: center;
	}
	.grille {
		display: grid;
		gap: var(--space-5);
		align-items: stretch;
	}
	.carte {
		cursor: pointer;
		min-width: 0;
		padding: var(--space-5);
		border-radius: var(--radius-lg);
		background: var(--surface-1);
		border: 1px solid var(--border-subtle);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		transition:
			transform var(--dur-base) var(--ease-out),
			background var(--dur-fast) var(--ease-out);
	}
	.carte:hover {
		transform: translateY(-2px);
		background: var(--surface-2);
	}
	.carte:focus-visible {
		outline: 2px solid var(--apricot-300);
		outline-offset: 2px;
	}
	.c-tete {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.c-nom {
		font: var(--type-label);
		font-size: var(--text-md);
		color: var(--fg-1);
		min-width: 0;
	}
	.statut {
		position: relative;
		flex: none;
	}
	.c-avancement {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.tour {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}
	.tour-l {
		font: var(--type-label);
		color: var(--fg-3);
	}
	.tour-n {
		font-weight: var(--weight-bold);
		font-size: var(--text-2xl);
		line-height: 1;
		letter-spacing: var(--tracking-tight);
		color: var(--fg-1);
	}
	.tour-n.grand {
		font-size: var(--text-3xl);
	}
	.tour-max {
		font: var(--type-body-sm);
		color: var(--fg-3);
	}
	.tour-max.grand {
		font: var(--type-body);
	}
	.jauge {
		border-radius: var(--radius-pill);
		background: var(--night-700);
		overflow: hidden;
	}
	.jauge > div {
		height: 100%;
		border-radius: var(--radius-pill);
	}
	.sans-limite {
		font: var(--type-body-sm);
		font-size: 13px;
		line-height: 4px;
		height: 4px;
		display: flex;
		align-items: center;
		color: var(--fg-3);
	}
	.victoire {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font: var(--type-label);
		color: var(--fg-1);
	}
	.victoire i {
		font-size: 16px;
		color: var(--apricot-300);
	}
	.c-pied {
		margin-top: auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.sub {
		font: var(--type-body-sm);
		font-size: 13px;
		color: var(--fg-3);
		white-space: nowrap;
	}
	.panneau {
		grid-column: 1/-1;
		position: relative;
		margin-top: var(--space-1);
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
		gap: var(--space-3) var(--space-4);
		flex-wrap: wrap;
	}
	.p-nom {
		font: var(--type-h4);
		font-weight: var(--weight-bold);
		letter-spacing: var(--tracking-tight);
		color: var(--fg-1);
	}
	.p-actions {
		margin-left: auto;
		display: flex;
		gap: var(--space-2);
	}
	.p-grille {
		display: grid;
		gap: var(--space-8);
	}
	.p-col {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		min-width: 0;
	}
	.bloc {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.joueurs {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.joueur {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.j-nom {
		font: var(--type-label);
		color: var(--fg-1);
	}
	.j-tete {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		min-height: 36px;
	}
	.session {
		display: grid;
		grid-template-columns: 96px minmax(0, 1fr) auto;
		gap: var(--space-4);
		align-items: start;
		padding: var(--space-4) 0;
		border-top: 1px solid var(--border-subtle);
	}
	.s-date {
		font: var(--type-label);
		color: var(--fg-2);
		padding-top: 2px;
	}
	.s-texte {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.s-plage {
		font: var(--type-label);
		color: var(--fg-1);
		padding-top: 2px;
	}
	.s-note {
		font: var(--type-body-sm);
		color: var(--fg-2);
		text-wrap: pretty;
	}
	.s-fin {
		display: flex;
		align-items: center;
		gap: var(--space-2);
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
	.deux {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--space-3);
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
	@media (max-width: 639px) {
		.panneau {
			padding: var(--space-5);
		}
		.session {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		.s-date {
			grid-column: 1 / -1;
		}
	}
</style>
