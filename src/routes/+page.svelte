<script lang="ts">
	let { data } = $props();
	const RACCOURCIS = [
		{ href: '/jeux/liste', icone: 'list', titre: 'Liste des jeux en cours', desc: 'Les jeux qu’on a sur le feu, qui y joue et où on en est.', cta: 'Voir la liste' },
		{ href: '/jeux/parties', icone: 'dices', titre: 'Parties', desc: 'Cale la prochaine session et retrouve les anciennes.', cta: 'Voir les parties' },
		{ href: '/jeux/quoi-faire', icone: 'lightbulb', titre: 'Quoi faire ?', desc: 'Pas d’idée ce soir ? Le site te propose un truc.', cta: 'Trouver une idée' }
	];
	const salut = $derived(data.moi ? `Salut ${data.moi.nom.split(' ')[0]}.` : 'Bienvenue sur le hub des nohriancons !');
</script>

<svelte:head><title>nohriancons</title></svelte:head>

<main class="nh-page" style="gap:clamp(48px,5vw,96px)">
	<section class="intro">
		<span class="nh-overline">Le QG de la bande</span>
		<h1>{salut}</h1>
		<p>nohriancons, c'est notre coin à nous : on y suit les jeux en cours, on cale les prochaines parties et on trouve quoi faire quand personne n'a d'idée.</p>
		<div class="actions">
			{#if data.moi}
				<a href="/jeux/parties" class="nh-btn nh-btn--primary"><i class="icon-dices" aria-hidden="true"></i>Voir les parties</a>
			{:else}
				<a href="/connexion" class="nh-btn nh-btn--primary"><i class="icon-log-in" aria-hidden="true"></i>Se connecter</a>
			{/if}
			<a href="/jeux/quoi-faire" class="nh-btn nh-btn--outline"><i class="icon-lightbulb" aria-hidden="true"></i>Quoi faire ce soir ?</a>
		</div>
	</section>

	<section aria-labelledby="raccourcis" class="raccourcis">
		<h2 id="raccourcis">Raccourcis</h2>
		<div class="grille">
			{#each RACCOURCIS as r (r.href)}
				<a href={r.href} class="nh-card nh-card--interactive carte">
					<span class="tuile"><i class="icon-{r.icone}" aria-hidden="true"></i></span>
					<span class="titre">{r.titre}</span>
					<span class="desc">{r.desc}</span>
					<span class="cta">{r.cta}<i class="icon-arrow-right" aria-hidden="true"></i></span>
				</a>
			{/each}
		</div>
	</section>

	<footer class="pied">
		<span>Aussi sur le site</span>
		<a href="/panel"><i class="icon-layout-dashboard" aria-hidden="true"></i>Panel</a>
		<a href="/status"><i class="icon-activity" aria-hidden="true"></i>Status</a>
	</footer>
</main>

<style>
	.intro {
		display: flex;
		flex-direction: column;
		gap: 20px;
		max-width: clamp(680px, 48vw, 880px);
	}
	h1 {
		font-weight: 700;
		font-size: clamp(36px, 3.4vw, 64px);
		line-height: 1.1;
		letter-spacing: -0.02em;
	}
	.intro p {
		font-size: clamp(17px, 1.15vw, 22px);
		line-height: 1.6;
		color: var(--fg-2);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-top: 8px;
	}
	.actions a:hover {
		text-decoration: none;
	}
	.raccourcis {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	h2 {
		font-weight: 700;
		font-size: 22px;
		letter-spacing: -0.02em;
	}
	.grille {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: clamp(16px, 1.4vw, 28px);
	}
	.carte {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 24px;
		min-height: clamp(220px, 13vw, 288px);
		text-decoration: none;
		color: inherit;
	}
	.carte:hover {
		text-decoration: none;
	}
	.tuile {
		width: 44px;
		height: 44px;
		border-radius: 12px;
		background: var(--petrol-500);
		display: grid;
		place-items: center;
		color: var(--apricot-300);
		font-size: 22px;
	}
	.titre {
		font-weight: 700;
		font-size: 18px;
		letter-spacing: -0.01em;
		color: var(--fg-1);
		margin-top: 4px;
	}
	.desc {
		font-size: 15px;
		line-height: 1.55;
		color: var(--fg-2);
	}
	.cta {
		margin-top: auto;
		display: flex;
		align-items: center;
		gap: 6px;
		font-weight: 500;
		font-size: 14px;
		color: var(--apricot-300);
	}
	.pied {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 20px;
		padding-top: 20px;
		border-top: 1px solid var(--border-subtle);
		font-size: 14px;
		color: var(--fg-3);
	}
	.pied a {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--fg-2);
		text-decoration: none;
	}
	.pied a:hover {
		color: var(--fg-1);
	}
</style>
