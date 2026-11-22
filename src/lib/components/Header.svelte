<script lang="ts">
	// Barre de navigation du prototype : Accueil, Jeux (menu de trois pages), Panel, Status, Compte.
	// Bureau ≥ 820 px, tablette 560–819 px (menu « Plus »), mobile < 560 px (menu burger).
	import Avatar from './Avatar.svelte';

	type Cle = 'accueil' | 'jeux-en-cours' | 'parties' | 'quoi-faire' | 'panel' | 'status' | 'compte' | null;
	let {
		actif,
		membre
	}: { actif: Cle; membre: { nom: string; pseudo: string; photo: string | null } | null } = $props();

	const JEUX = [
		{ cle: 'jeux-en-cours', libelle: 'Liste des jeux en cours', icone: 'list', href: '/jeux/liste' },
		{ cle: 'parties', libelle: 'Parties', icone: 'dices', href: '/jeux/parties' },
		{ cle: 'quoi-faire', libelle: 'Quoi faire ?', icone: 'lightbulb', href: '/jeux/quoi-faire' }
	] as const;
	const SECTIONS = [
		{ cle: 'panel', libelle: 'Panel', icone: 'layout-dashboard', href: '/panel' },
		{ cle: 'status', libelle: 'Status', icone: 'activity', href: '/status' }
	] as const;

	let menu = $state<'jeux' | 'plus' | 'compte' | 'burger' | null>(null);
	let racine: HTMLElement | undefined = $state();

	const jeuxActif = $derived(JEUX.some((j) => j.cle === actif));
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

<header bind:this={racine} class="hdr">
	<div class="barre">
		<a href="/" class="marque" aria-label="nohriancons – Accueil" onclick={fermer}>
			<img src="/favicon.svg" alt="" width="32" height="32" class="logo" />
			<span class="nom">nohriancons<span class="point">.</span></span>
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
			{#each SECTIONS as s (s.cle)}
				<a href={s.href} class="lien seul-bureau" class:actif={actif === s.cle} aria-current={actif === s.cle ? 'page' : undefined}>
					<i class="icon-{s.icone} ico" aria-hidden="true"></i>{s.libelle}
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
					<div id="hdr-plus" role="menu" class="deroulant" style="right:0;width:180px">
						{#each SECTIONS as s (s.cle)}
							<a role="menuitem" href={s.href} class:actif={actif === s.cle} onclick={fermer}>
								<i class="icon-{s.icone} ico" aria-hidden="true"></i>{s.libelle}
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
				{#each SECTIONS as s (s.cle)}
					<a href={s.href} class:actif={actif === s.cle} onclick={fermer}><i class="icon-{s.icone} ico" aria-hidden="true"></i>{s.libelle}</a>
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
		border-radius: 10px;
		flex: none;
	}
	.nom {
		font-weight: 700;
		font-size: 18px;
		letter-spacing: -0.02em;
		color: var(--fg-1);
		white-space: nowrap;
	}
	.point {
		color: var(--apricot-300);
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
