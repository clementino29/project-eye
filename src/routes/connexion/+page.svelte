<script lang="ts">
	let { data, form } = $props();
	const erreur = $derived(form?.erreur ?? data.erreur);
</script>

<svelte:head><title>Connexion · Nohriancons</title></svelte:head>

<main class="connexion">
	<div class="lueur" aria-hidden="true"></div>
	<div class="nh-card nh-card--raised boite">
		<span class="nh-overline">Le QG de la bande</span>
		<h1>Salut, c'est qui ?</h1>
		<p>Connecte-toi avec ton compte Authentik, le même que pour Sakura Panel.</p>
		{#if erreur}
			<div class="alerte" role="alert"><i class="icon-circle-alert" aria-hidden="true"></i>{erreur}</div>
		{/if}
		<form method="POST" action="?/authentik">
			<input type="hidden" name="retour" value={data.retour} />
			<button class="nh-btn nh-btn--primary nh-btn--lg nh-btn--block" disabled={!data.authentikPret}>
				<i class="icon-log-in" aria-hidden="true"></i>Se connecter avec Authentik
			</button>
		</form>
		{#if !data.authentikPret}
			<p class="note">Authentik n'est pas encore configuré (voir le README).</p>
		{/if}
		{#if data.connexionDev}
			<form method="POST" action="?/dev" class="dev">
				<span class="nh-overline">Connexion de test (dev)</span>
				<input type="hidden" name="retour" value={data.retour} />
				<div class="nh-input"><input name="pseudo" placeholder="pseudo" aria-label="Pseudo de test" /></div>
				<label class="nh-check"><input type="checkbox" name="admin" /><span class="nh-check__box"><i class="icon-check" aria-hidden="true"></i></span>Admin</label>
				<button class="nh-btn nh-btn--outline">Entrer</button>
			</form>
		{/if}
	</div>
</main>

<style>
	.connexion {
		position: relative;
		min-height: calc(100vh - 64px);
		display: grid;
		place-items: center;
		padding: 32px 16px;
		overflow: hidden;
	}
	.lueur {
		position: absolute;
		top: -240px;
		left: 50%;
		width: 900px;
		height: 600px;
		transform: translateX(-50%);
		background: radial-gradient(closest-side, rgba(35, 76, 103, 0.55), transparent);
		pointer-events: none;
	}
	.boite {
		position: relative;
		width: 100%;
		max-width: 440px;
		padding: 32px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		border-radius: var(--radius-xl);
	}
	h1 {
		font: var(--type-h2);
		letter-spacing: var(--tracking-tight);
	}
	p {
		color: var(--fg-2);
	}
	.note {
		font-size: 13px;
		color: var(--fg-3);
	}
	.alerte {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		padding: 12px 14px;
		border-radius: 12px;
		background: var(--danger-bg);
		color: var(--danger-fg);
		font-size: 14px;
	}
	.dev {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-top: 16px;
		border-top: 1px dashed var(--border-default);
	}
</style>
