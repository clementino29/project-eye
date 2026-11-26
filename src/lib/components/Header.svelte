<script lang="ts">
	// Barre de navigation du prototype : Accueil, Jeux (trois pages), Films & séries (deux pages),
	// Fichiers, Panel, Status, Planning (lien externe) et Compte.
	// Bureau ≥ 820 px, tablette 560–819 px (menu « Plus »), mobile < 560 px (menu burger).
	import Avatar from './Avatar.svelte';
	import type { EtatGlobal } from '#lib/libelles.ts';

	export type Cle =
		| 'accueil'
		| 'jeux-en-cours'
		| 'parties'
		| 'quoi-faire'
		| 'films'
		| 'watchlist'
		| 'fichiers'
		| 'panel'
		| 'status'
		| 'compte'
		| null;
	export interface Rubriques {
		/** Menu Films & séries (pages livrées avec la watchlist). */
		films: boolean;
		fichiers: boolean;
		planningUrl: string | null;
	}
	interface Lien {
		cle: string;
		libelle: string;
		icone: string;
		href: string;
		externe?: boolean;
	}
	let {
		actif,
		membre,
		rubriques,
		etatStatus = null
	}: {
		actif: Cle;
		membre: { nom: string; pseudo: string; photo: string | null } | null;
		rubriques: Rubriques;
		etatStatus?: EtatGlobal | null;
	} = $props();

	const JEUX: Lien[] = [
		{ cle: 'jeux-en-cours', libelle: 'Liste des jeux en cours', icone: 'list', href: '/jeux/liste' },
		{ cle: 'parties', libelle: 'Parties', icone: 'dices', href: '/jeux/parties' },
		{ cle: 'quoi-faire', libelle: 'Quoi faire ?', icone: 'lightbulb', href: '/jeux/quoi-faire' }
	];
	const FILMS: Lien[] = [
		{ cle: 'films', libelle: 'Watch list commune', icone: 'popcorn', href: '/films' },
		{ cle: 'watchlist', libelle: 'Ma watchlist', icone: 'list-video', href: '/films/ma-watchlist' }
	];
	const SECTIONS = $derived<Lien[]>([
		...(rubriques.fichiers ? [{ cle: 'fichiers', libelle: 'Fichiers', icone: 'folder-down', href: '/fichiers' }] : []),
		// Le Panel reste fermé aux visiteurs (mode lecture seule).
		...(membre ? [{ cle: 'panel', libelle: 'Panel', icone: 'layout-dashboard', href: '/panel' }] : []),
		{ cle: 'status', libelle: 'Status', icone: 'activity', href: '/status' },
		...(rubriques.planningUrl
			? [{ cle: 'planning', libelle: 'Planning', icone: 'calendar-days', href: rubriques.planningUrl, externe: true }]
			: [])
	]);
	/** Pastille d'état sur le lien Status (lue dans Uptime Kuma). */
	const PASTILLES: Record<EtatGlobal, { c: string; l: string }> = {
		ok: { c: '#2fe39a', l: 'tout fonctionne' },
		degrade: { c: '#ffb21e', l: 'un service est ralenti' },
		panne: { c: '#ff5468', l: 'panne en cours' }
	};
	const pastille = $derived(etatStatus ? PASTILLES[etatStatus] : null);

	let menu = $state<'jeux' | 'films' | 'plus' | 'compte' | 'burger' | null>(null);
	let racine: HTMLElement | undefined = $state();

	const jeuxActif = $derived(JEUX.some((j) => j.cle === actif));
	const filmsActif = $derived(FILMS.some((j) => j.cle === actif));
	const plusActif = $derived(SECTIONS.some((s) => s.cle === actif));
	const prenom = $derived(membre?.nom.split(' ')[0] ?? '');

	function basculer(nom: NonNullable<typeof menu>) {
		menu = menu === nom ? null : nom;
	}
	function clicDocument(e: PointerEvent) {
		if (menu && racine && !racine.contains(e.target as Node)) menu = null;
	}
	function touche(e: KeyboardEvent) {
		if (e.key === 'Escape') menu = null;
	}
	const fermer = () => (menu = null);
</script>

<svelte:document onpointerdown={clicDocument} onkeydown={touche} />

{#snippet contenu(l: Lien)}
	<i class="icon-{l.icone} ico" aria-hidden="true"></i>{l.libelle}
	{#if l.cle === 'status' && pastille}
		<span class="pastille" style:background={pastille.c} title="Status : {pastille.l}"></span><span class="sr">({pastille.l})</span>
	{/if}
	{#if l.externe}
		<i class="icon-arrow-up-right ext" aria-hidden="true"></i><span class="sr">(s’ouvre dans un nouvel onglet)</span>
	{/if}
{/snippet}

{#snippet menuFilms(position: string)}
	<div class="pos">
		<button
			type="button"
			class="lien"
			class:actif={filmsActif}
			class:ouvert={menu === 'films'}
			aria-haspopup="menu"
			aria-expanded={menu === 'films'}
			aria-controls="hdr-films"
			onclick={() => basculer('films')}
		>
			<i class="icon-clapperboard ico" aria-hidden="true"></i>Films &amp; séries<i
				class="icon-chevron-{menu === 'films' ? 'up' : 'down'} chev"
				aria-hidden="true"
			></i>
		</button>
		{#if menu === 'films'}
			<div id="hdr-films" role="menu" class="deroulant" style="{position}:0;width:240px">
				{#each FILMS as f (f.cle)}
					<a role="menuitem" href={f.href} class:actif={actif === f.cle} aria-current={actif === f.cle ? 'page' : undefined} onclick={fermer}>
						{@render contenu(f)}
					</a>
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

<header bind:this={racine} class="hdr">
	<div class="barre">
		<a href="/" class="marque" aria-label="Nohriancons – Accueil" onclick={fermer}>
			<img src="/images/logo-nhr.png" alt="" width="36" height="42" class="logo" />
			<span class="nom">Nohriancons</span>
		</a>

		<nav aria-label="Rubriques" class="nav-large">
			<a href="/" class="rond" class:actif={actif === 'accueil'} aria-label="Accueil" aria-current={actif === 'accueil' ? 'page' : undefined}>
				<i class="icon-house" aria-hidden="true"></i>
			</a>
			<div class="pos">
				<button
					type="button"
					class="lien"
					class:actif={jeuxActif}
					class:ouvert={menu === 'jeux'}
					aria-haspopup="menu"
					aria-expanded={menu === 'jeux'}
					aria-controls="hdr-jeux"
					onclick={() => basculer('jeux')}
				>
					<i class="icon-gamepad-2 ico" aria-hidden="true"></i>Jeux<i
						class="icon-chevron-{menu === 'jeux' ? 'up' : 'down'} chev"
						aria-hidden="true"
					></i>
				</button>
				{#if menu === 'jeux'}
					<div id="hdr-jeux" role="menu" class="deroulant" style="left:0;width:240px">
						{#each JEUX as j (j.cle)}
							<a role="menuitem" href={j.href} class:actif={actif === j.cle} aria-current={actif === j.cle ? 'page' : undefined} onclick={fermer}>
								<i class="icon-{j.icone} ico" aria-hidden="true"></i>{j.libelle}
							</a>
						{/each}
					</div>
				{/if}
			</div>
			{#if rubriques.films}{@render menuFilms('left')}{/if}
			{#each SECTIONS as s (s.cle)}
				<a
					href={s.href}
					class="lien seul-bureau"
					class:actif={actif === s.cle}
					aria-current={actif === s.cle ? 'page' : undefined}
					target={s.externe ? '_blank' : undefined}
					title={s.externe ? 'S’ouvre dans un nouvel onglet' : undefined}
					rel={s.externe ? 'noopener noreferrer' : undefined}
				>
					{@render contenu(s)}
				</a>
			{/each}
			<div class="pos seul-tablette">
				<button
					type="button"
					class="lien"
					class:actif={plusActif}
					class:ouvert={menu === 'plus'}
					aria-haspopup="menu"
					aria-expanded={menu === 'plus'}
					aria-controls="hdr-plus"
					onclick={() => basculer('plus')}
				>
					<i class="icon-ellipsis ico" aria-hidden="true"></i>Plus<i class="icon-chevron-{menu === 'plus' ? 'up' : 'down'} chev" aria-hidden="true"></i>
				</button>
				{#if menu === 'plus'}
					<div id="hdr-plus" role="menu" class="deroulant" style="right:0;width:200px">
						{#each SECTIONS as s (s.cle)}
							<a
								role="menuitem"
								href={s.href}
								class:actif={actif === s.cle}
								target={s.externe ? '_blank' : undefined}
					title={s.externe ? 'S’ouvre dans un nouvel onglet' : undefined}
								rel={s.externe ? 'noopener noreferrer' : undefined}
								onclick={fermer}
							>
								{@render contenu(s)}
							</a>
						{/each}
					</div>
				{/if}
			</div>
		</nav>

		<div class="separateur nav-large" aria-hidden="true"></div>
		<div class="nav-large">
			{#if membre}
				<div class="pos">
					<button
						type="button"
						class="compte"
						aria-haspopup="menu"
						aria-expanded={menu === 'compte'}
						aria-controls="hdr-compte"
						aria-label="Compte de {membre.nom}"
						onclick={() => basculer('compte')}
					>
						<Avatar nom={membre.nom} src={membre.photo} taille={28} />
						<span class="prenom seul-bureau">{prenom}</span>
						<i class="icon-chevron-{menu === 'compte' ? 'up' : 'down'} chev seul-bureau" aria-hidden="true"></i>
					</button>
					{#if menu === 'compte'}
						<div id="hdr-compte" role="menu" class="deroulant" style="right:0;width:220px">
							<div class="qui"><strong>{membre.nom}</strong><span>Connecté</span></div>
							<a role="menuitem" href="/compte" class:actif={actif === 'compte'} onclick={fermer}>
								<i class="icon-user-round-cog ico" aria-hidden="true"></i>Mon compte
							</a>
							<div class="trait" aria-hidden="true"></div>
							<form method="POST" action="/deconnexion">
								<button type="submit" role="menuitem" class="danger"><i class="icon-log-out" aria-hidden="true"></i>Se déconnecter</button>
							</form>
						</div>
					{/if}
				</div>
			{:else}
				<a href="/connexion" class="nh-btn nh-btn--primary nh-btn--sm"><i class="icon-log-in" aria-hidden="true"></i>Se connecter</a>
			{/if}
		</div>

		<button
			type="button"
			class="burger"
			aria-expanded={menu === 'burger'}
			aria-controls="hdr-mobile"
			aria-label={menu === 'burger' ? 'Fermer le menu' : 'Ouvrir le menu'}
			onclick={() => basculer('burger')}
		>
			<i class="icon-{menu === 'burger' ? 'x' : 'menu'}" aria-hidden="true"></i>
		</button>
	</div>

	{#if menu === 'burger'}
		<div id="hdr-mobile" class="mobile">
			{#if membre}
				<div class="m-qui">
					<Avatar nom={membre.nom} src={membre.photo} taille={40} />
					<div><strong>{membre.nom}</strong><span>Connecté</span></div>
				</div>
			{/if}
			<nav aria-label="Rubriques" class="m-nav">
				<a href="/" class:actif={actif === 'accueil'} onclick={fermer}><i class="icon-house ico" aria-hidden="true"></i>Accueil</a>
				<div class="m-titre" class:actif={jeuxActif}><i class="icon-gamepad-2 ico" aria-hidden="true"></i>Jeux</div>
				<div role="group" aria-label="Jeux" class="m-groupe">
					{#each JEUX as j (j.cle)}
						<a href={j.href} class:actif={actif === j.cle} onclick={fermer}><i class="icon-{j.icone} ico" aria-hidden="true"></i>{j.libelle}</a>
					{/each}
				</div>
				{#if rubriques.films}
					<div class="m-titre" class:actif={filmsActif}><i class="icon-clapperboard ico" aria-hidden="true"></i>Films &amp; séries</div>
					<div role="group" aria-label="Films et séries" class="m-groupe">
						{#each FILMS as f (f.cle)}
							<a href={f.href} class:actif={actif === f.cle} onclick={fermer}>{@render contenu(f)}</a>
						{/each}
					</div>
				{/if}
				{#each SECTIONS as s (s.cle)}
					<a
						href={s.href}
						class:actif={actif === s.cle}
						target={s.externe ? '_blank' : undefined}
					title={s.externe ? 'S’ouvre dans un nouvel onglet' : undefined}
						rel={s.externe ? 'noopener noreferrer' : undefined}
						onclick={fermer}>{@render contenu(s)}</a
					>
				{/each}
			</nav>
			{#if membre}
				<div class="m-nav">
					<a href="/compte" class:actif={actif === 'compte'} onclick={fermer}><i class="icon-user-round-cog ico" aria-hidden="true"></i>Mon compte</a>
					<form method="POST" action="/deconnexion">
						<button type="submit" class="danger"><i class="icon-log-out" aria-hidden="true"></i>Se déconnecter</button>
					</form>
				</div>
			{:else}
				<div style="padding:16px">
					<a href="/connexion" class="nh-btn nh-btn--primary nh-btn--block"><i class="icon-log-in" aria-hidden="true"></i>Se connecter</a>
				</div>
			{/if}
		</div>
	{/if}
</header>

<style>
	.hdr {
		position: sticky;
		top: 0;
		z-index: 50;
		width: 100%;
	}
	.barre {
		height: 64px;
		padding: 0 24px;
		display: flex;
		align-items: center;
		gap: 8px;
		background: var(--glass-bg);
		backdrop-filter: var(--blur-glass);
		-webkit-backdrop-filter: var(--blur-glass);
		border-bottom: 1px solid var(--border-subtle);
	}
	.marque {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-right: auto;
		text-decoration: none;
		min-width: 0;
	}
	.logo {
		width: 36px;
		height: 42px;
		flex: none;
		object-fit: contain;
		filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.45));
	}
	.nom {
		font-weight: 400;
		font-size: 20px;
		letter-spacing: -0.01em;
		color: var(--fg-1);
		white-space: nowrap;
	}
	.pastille {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex: none;
		margin-left: -2px;
		box-shadow: 0 0 0 2px var(--bg-page);
	}
	.ext {
		font-size: 14px;
		color: var(--fg-3);
		margin-left: -2px;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	nav.nav-large {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.pos {
		position: relative;
	}
	.rond {
		width: 36px;
		height: 36px;
		border-radius: 999px;
		display: grid;
		place-items: center;
		color: var(--fg-2);
		text-decoration: none;
		font-size: 18px;
		transition: background 120ms var(--ease-out);
	}
	.rond:hover {
		background: var(--surface-2);
		text-decoration: none;
	}
	.rond.actif {
		background: var(--surface-accent-soft);
		color: var(--apricot-300);
	}
	.lien {
		border: none;
		cursor: pointer;
		padding: 9px 14px;
		border-radius: 999px;
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 500;
		font-size: 14px;
		color: var(--fg-2);
		background: transparent;
		text-decoration: none;
		transition: background 120ms var(--ease-out);
	}
	button.lien {
		padding: 9px 12px 9px 14px;
	}
	.lien:hover {
		background: var(--surface-2);
		color: var(--fg-1);
		text-decoration: none;
	}
	.lien.ouvert {
		background: var(--surface-2);
		color: var(--fg-1);
	}
	.lien.actif {
		background: var(--surface-accent-soft);
		color: var(--fg-1);
	}
	.ico {
		font-size: 17px;
		color: var(--fg-3);
	}
	.actif .ico,
	.actif > .ico {
		color: var(--apricot-300);
	}
	.chev {
		font-size: 14px;
		color: var(--fg-3);
	}
	.deroulant {
		position: absolute;
		top: calc(100% + 10px);
		padding: 6px;
		background: var(--surface-2);
		border: 1px solid var(--border-default);
		border-radius: 16px;
		box-shadow: var(--shadow-3);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.deroulant a,
	.deroulant button {
		padding: 10px 12px;
		border-radius: 10px;
		display: flex;
		align-items: center;
		gap: 10px;
		font-weight: 500;
		font-size: 14px;
		color: var(--fg-2);
		text-decoration: none;
		border: none;
		background: transparent;
		cursor: pointer;
		width: 100%;
		text-align: left;
	}
	.deroulant a:hover {
		background: var(--surface-hover);
		color: var(--fg-1);
		text-decoration: none;
	}
	.deroulant a.actif {
		background: var(--surface-accent-soft);
		color: var(--fg-1);
	}
	.deroulant .ico {
		font-size: 16px;
	}
	.qui {
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		border-bottom: 1px solid var(--border-subtle);
		margin-bottom: 4px;
	}
	.qui strong,
	.m-qui strong {
		font-weight: 700;
		font-size: 14px;
		color: var(--fg-1);
	}
	.qui span,
	.m-qui span {
		font-size: 12px;
		color: var(--fg-3);
	}
	.trait {
		height: 1px;
		background: var(--border-subtle);
		margin: 4px 0;
	}
	.danger {
		color: var(--danger-fg) !important;
	}
	.danger:hover {
		background: var(--danger-bg) !important;
	}
	.separateur {
		width: 1px;
		height: 24px;
		background: var(--border-default);
		margin: 0 12px;
	}
	.compte {
		border: 1px solid var(--border-default);
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 10px 4px 4px;
		border-radius: 999px;
		background: var(--surface-2);
		transition: background 120ms var(--ease-out);
	}
	.compte:hover {
		background: var(--surface-hover);
		border-color: var(--border-strong);
	}
	.prenom {
		font-weight: 500;
		font-size: 14px;
		color: var(--fg-1);
	}
	.burger {
		display: none;
		border: none;
		background: transparent;
		cursor: pointer;
		width: 44px;
		height: 44px;
		border-radius: 999px;
		place-items: center;
		color: var(--fg-1);
		font-size: 22px;
	}
	.burger:hover {
		background: var(--surface-2);
	}
	.seul-tablette {
		display: none;
	}
	.mobile {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		max-height: calc(100vh - 56px);
		overflow: auto;
		background: var(--bg-page);
		border-bottom: 1px solid var(--border-subtle);
		box-shadow: var(--shadow-3);
	}
	.m-qui {
		padding: 16px;
		display: flex;
		align-items: center;
		gap: 12px;
		border-bottom: 1px solid var(--border-subtle);
	}
	.m-qui div {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.m-nav {
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		border-bottom: 1px solid var(--border-subtle);
	}
	.m-nav a,
	.m-nav button {
		height: 48px;
		padding: 0 14px;
		border-radius: 12px;
		display: flex;
		align-items: center;
		gap: 12px;
		font-weight: 500;
		font-size: 15px;
		color: var(--fg-2);
		text-decoration: none;
		border: none;
		background: transparent;
		width: 100%;
		cursor: pointer;
	}
	.m-nav a:hover {
		background: var(--surface-1);
		text-decoration: none;
	}
	.m-nav a.actif {
		background: var(--surface-accent-soft);
		color: var(--fg-1);
	}
	.m-nav .ico {
		font-size: 18px;
	}
	.m-titre {
		height: 40px;
		padding: 0 14px;
		display: flex;
		align-items: center;
		gap: 12px;
		font-weight: 500;
		font-size: 15px;
		color: var(--fg-2);
	}
	.m-titre.actif {
		color: var(--fg-1);
	}
	.m-groupe {
		margin-left: 22px;
		padding-left: 8px;
		border-left: 1px solid var(--border-subtle);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.m-groupe .ico {
		font-size: 16px;
	}

	@media (max-width: 819px) {
		.barre {
			padding: 0 16px;
		}
		.seul-bureau {
			display: none;
		}
		.seul-tablette {
			display: block;
		}
		.separateur {
			margin: 0 6px;
		}
		.compte {
			padding: 4px;
		}
		button.lien {
			padding: 9px 10px;
		}
	}
	@media (max-width: 559px) {
		.barre {
			height: 56px;
		}
		.nav-large {
			display: none !important;
		}
		.burger {
			display: grid;
		}
	}
</style>
