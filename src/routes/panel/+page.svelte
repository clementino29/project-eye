<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import type { SubmitFunction } from '$app/forms';
	import Dialog from '#lib/components/Dialog.svelte';
	import { toasts } from '#lib/toasts.svelte.ts';
	import { ilYa, octets } from '#lib/libelles.ts';

	let { data } = $props();

	const ETATS = {
		running: { l: 'En ligne', ton: 'success' },
		offline: { l: 'Arrêté', ton: 'neutral' },
		starting: { l: 'En démarrage', ton: 'warning' },
		stopping: { l: 'En arrêt', ton: 'warning' },
		installation: { l: 'En installation', ton: 'info' },
		suspendu: { l: 'Suspendu', ton: 'danger' },
		inconnu: { l: 'Inconnu', ton: 'neutral' }
	} as const;
	const ACTIONS = { demarrer: 'a démarré', arreter: 'a arrêté', redemarrer: 'a redémarré', commande: 'a lancé une commande sur', sauvegarde: 'a sauvegardé' };
	const SIGNAUX = { start: 'démarre', stop: 's’arrête', restart: 'redémarre' };

	let enCours = $state<string | null>(null);
	type Serveur = (typeof data.serveurs)[number];
	let reglage = $state<Serveur | null>(null);

	// Rafraîchit l'état toutes les 10 s quand la page est visible.
	$effect(() => {
		if (data.etat !== 'ok') return;
		const t = setInterval(() => {
			if (document.visibilityState === 'visible') invalidate('hub:panel');
		}, 10_000);
		return () => clearInterval(t);
	});

	const action =
		(id: string): SubmitFunction =>
		() => {
			enCours = id;
			return async ({ result, update }) => {
				enCours = null;
				if (result.type === 'success') {
					const d = result.data as { signal: keyof typeof SIGNAUX; nom: string; reglages?: boolean };
					if (d.reglages) {
						reglage = null;
						toasts.montrer('success', 'Réglages enregistrés');
					} else toasts.montrer('success', `${d.nom} ${SIGNAUX[d.signal]}`, 'Ça peut prendre quelques secondes.');
				} else if (result.type === 'failure') {
					toasts.montrer('danger', 'Ça n’a pas marché', (result.data as { erreur?: string })?.erreur ?? '');
				} else if (result.type === 'error') toasts.montrer('danger', 'Erreur', result.error.message);
				await update({ reset: false });
			};
		};

	function copier(texte: string) {
		navigator.clipboard?.writeText(texte).then(
			() => toasts.montrer('success', 'Adresse copiée', texte),
			() => toasts.montrer('danger', 'Copie impossible')
		);
	}
	const heure = (t: number) => new Date(t).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
	const enLigne = $derived(data.serveurs.filter((s) => s.etat === 'running').length);
</script>

<svelte:head><title>Panel · nohriancons</title></svelte:head>

<main class="nh-page" style="gap:var(--space-8)">
	<header class="entete">
		<div>
			<h1>Panel</h1>
			<p class="sous">
				{#if data.etat === 'ok'}
					{data.serveurs.length} serveur{data.serveurs.length > 1 ? 's' : ''} · {enLigne} en ligne
				{:else}
					Les serveurs de jeu du groupe, gérés par Sakura Panel.
				{/if}
			</p>
		</div>
	</header>

	{#if data.etat === 'sans_cle' || data.etat === 'cle_illisible' || data.etat === 'cle_refusee'}
		<div class="nh-card vide">
			<img src="/images/sakura-panel.png" alt="" width="40" height="40" />
			<div>
				<h2>{data.etat === 'sans_cle' ? 'Ajoute ta clé Sakura Panel' : 'Ta clé Sakura Panel ne marche plus'}</h2>
				<p>
					{data.etat === 'sans_cle'
						? 'Le hub utilise ta clé API pour voir et lancer les serveurs auxquels tu as accès.'
						: 'Sakura Panel la refuse (révoquée ou expirée). Remplace-la dans ton compte.'}
				</p>
			</div>
			<a href="/compte" class="nh-btn nh-btn--primary"><i class="icon-key-round" aria-hidden="true"></i>Aller à mon compte</a>
		</div>
	{:else if data.etat === 'injoignable'}
		<div class="nh-card vide">
			<i class="icon-cloud-off gros" aria-hidden="true"></i>
			<div><h2>Sakura Panel ne répond pas</h2><p>{data.message} Réessaie dans un moment ou regarde la page Status.</p></div>
			<a href="/status" class="nh-btn nh-btn--outline"><i class="icon-activity" aria-hidden="true"></i>Voir le statut</a>
		</div>
	{:else if data.serveurs.length === 0}
		<div class="nh-card vide">
			<i class="icon-server gros" aria-hidden="true"></i>
			<div><h2>Aucun serveur pour toi</h2><p>Un admin ne t'a pas encore donné accès aux serveurs du groupe dans Sakura Panel.</p></div>
		</div>
	{:else}
		<div class="grille">
			{#each data.serveurs as s (s.identifiant)}
				{@const e = ETATS[s.etat]}
				{@const occupe = enCours === s.identifiant}
				<article class="nh-card serveur" aria-labelledby="srv-{s.identifiant}">
					<div class="haut">
						<div class="titre">
							<h2 id="srv-{s.identifiant}">{s.nom}</h2>
							<span class="jeu">{s.jeu ?? s.description ?? ''}</span>
						</div>
						<span class="nh-badge nh-badge--{e.ton}"><span class="nh-badge__dot"></span>{e.l}</span>
					</div>

					<dl class="infos">
						<div>
							<dt>Adresse</dt>
							<dd>
								{#if s.adresse}
									<code>{s.adresse}</code>
									<button type="button" class="nh-btn nh-iconbtn nh-btn--ghost nh-btn--sm" aria-label="Copier l'adresse" title="Copier l'adresse" onclick={() => copier(s.adresse!)}><i class="icon-copy" aria-hidden="true"></i></button>
								{:else}—{/if}
							</dd>
						</div>
						<div>
							<dt>Joueurs</dt>
							<dd>
								{#if s.joueurs}
									<span title={s.joueurs.noms.join(', ')}>{s.joueurs.connectes}{s.joueurs.max ? ` / ${s.joueurs.max}` : ''} connecté{s.joueurs.connectes > 1 ? 's' : ''}</span>
								{:else if s.etat === 'running'}—{:else}0{/if}
							</dd>
						</div>
						<div>
							<dt>Processeur</dt>
							<dd>{s.ressources && s.etat === 'running' ? `${Math.round(s.ressources.cpuPourcent)} %` : '—'}</dd>
						</div>
						<div>
							<dt>Mémoire</dt>
							<dd>
								{#if s.ressources && s.etat === 'running'}
									{octets(s.ressources.memoireOctets)}{s.limites.memoireMo ? ` / ${octets(s.limites.memoireMo * 1024 ** 2)}` : ''}
								{:else}—{/if}
							</dd>
						</div>
					</dl>

					<div class="boutons">
						<form method="POST" action="?/alimentation" use:enhance={action(s.identifiant)}>
							<input type="hidden" name="serveur" value={s.identifiant} />
							<input type="hidden" name="nom" value={s.nom} />
							{#if s.permissions.demarrer && (s.etat === 'offline' || s.etat === 'inconnu')}
								<button name="signal" value="start" class="nh-btn nh-btn--primary nh-btn--sm" disabled={occupe}><i class="icon-play" aria-hidden="true"></i>Démarrer</button>
							{/if}
							{#if s.permissions.redemarrer && (s.etat === 'running' || s.etat === 'starting')}
								<button name="signal" value="restart" class="nh-btn nh-btn--secondary nh-btn--sm" disabled={occupe}><i class="icon-rotate-ccw" aria-hidden="true"></i>Redémarrer</button>
							{/if}
							{#if s.permissions.arreter && (s.etat === 'running' || s.etat === 'starting')}
								<button name="signal" value="stop" class="nh-btn nh-btn--danger nh-btn--sm" disabled={occupe}><i class="icon-square" aria-hidden="true"></i>Arrêter</button>
							{/if}
						</form>
						<span class="espace"></span>
						{#if data.moi?.role === 'admin'}
							<button type="button" class="nh-btn nh-iconbtn nh-btn--ghost nh-btn--sm" aria-label="Réglages du serveur" title="Réglages du serveur" onclick={() => (reglage = s)}><i class="icon-settings-2" aria-hidden="true"></i></button>
						{/if}
						{#if s.urlPelican}
							<a href={s.urlPelican} target="_blank" rel="noopener" class="nh-btn nh-btn--outline nh-btn--sm">Ouvrir dans Pelican<i class="icon-external-link" aria-hidden="true"></i></a>
						{/if}
					</div>
					{#if !s.permissions.demarrer && !s.permissions.arreter && !s.permissions.redemarrer}
						<span class="note">Tu peux voir ce serveur, mais pas le piloter. Demande à un admin si besoin.</span>
					{/if}
				</article>
			{/each}
		</div>
		<p class="note">Console, fichiers, sauvegardes et tâches planifiées : bouton « Ouvrir dans Pelican ».</p>
	{/if}

	<section aria-labelledby="journal" class="journal">
		<h2 id="journal" class="nh-overline">Journal des actions</h2>
		{#if data.journal.length === 0}
			<p class="note">Aucune action depuis le hub pour l'instant.</p>
		{:else}
			<ul>
				{#each data.journal as a (a.id)}
					<li>
						<i class="icon-{a.resultat === 'ok' ? 'circle-check' : 'circle-alert'} {a.resultat}" aria-hidden="true"></i>
						<span><strong>{a.qui ?? 'Un ancien membre'}</strong> {ACTIONS[a.action]} <strong>{a.serveur}</strong>{#if a.resultat === 'erreur'}<span class="erreur"> · échec{a.message ? ` : ${a.message}` : ''}</span>{/if}</span>
						<time datetime={new Date(a.date).toISOString()} title={heure(a.date)}>{ilYa(a.date)}</time>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>

{#if reglage}
	<Dialog titre="Réglages de {reglage.nom}" description="Affichage dans le hub seulement : les droits restent ceux de Sakura Panel." onfermer={() => (reglage = null)}>
		<form method="POST" action="?/reglages" class="form" use:enhance={action(reglage.identifiant)}>
			<input type="hidden" name="serveur" value={reglage.identifiant} />
			<div class="nh-field">
				<label class="nh-field__label" for="r-nom">Nom affiché</label>
				<div class="nh-input"><input id="r-nom" name="nom" value={reglage.nomLocal ?? ''} placeholder={reglage.nom} /></div>
			</div>
			<div class="nh-field">
				<label class="nh-field__label" for="r-jeu">Jeu</label>
				<div class="nh-input">
					<select id="r-jeu" name="jeuId" value={reglage.jeuId ?? ''}>
						<option value="">Aucun</option>
						{#each data.jeux as j (j.id)}<option value={j.id}>{j.titre}</option>{/each}
					</select>
					<i class="icon-chevron-down" aria-hidden="true" style="pointer-events:none"></i>
				</div>
			</div>
			<div class="nh-field">
				<label class="nh-field__label" for="r-adresse">Adresse de connexion</label>
				<div class="nh-input"><input id="r-adresse" name="adresse" value={reglage.adresse === reglage.adresseDefaut ? '' : (reglage.adresse ?? '')} placeholder={reglage.adresseDefaut ?? 'jeu.exemple.fr:25565'} /></div>
				<div class="nh-field__hint">Facultatif. Par défaut, l'adresse donnée par Sakura Panel.</div>
			</div>
			<div class="nh-field">
				<label class="nh-field__label" for="r-gd">Type GameDig</label>
				<div class="nh-input"><input id="r-gd" name="gamedigType" value={reglage.gamedigType ?? ''} placeholder="minecraft, valheim, terraria…" /></div>
				<div class="nh-field__hint">Facultatif. Sert à compter les joueurs connectés (liste sur github.com/gamedig/node-gamedig).</div>
			</div>
			<div class="pied">
				<button type="button" class="nh-btn nh-btn--ghost" onclick={() => (reglage = null)}>Annuler</button>
				<button class="nh-btn nh-btn--primary">Enregistrer</button>
			</div>
		</form>
	</Dialog>
{/if}

<style>
	h1 {
		font: var(--type-h1);
		letter-spacing: var(--tracking-tight);
	}
	.sous {
		margin-top: 8px;
		font: var(--type-body-sm);
		color: var(--fg-3);
	}
	.vide {
		padding: 24px;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 16px 20px;
	}
	.vide > div {
		flex: 1 1 280px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.vide h2 {
		font-weight: 700;
		font-size: 18px;
	}
	.vide p {
		font-size: 14px;
		color: var(--fg-3);
	}
	.vide a:hover {
		text-decoration: none;
	}
	.gros {
		font-size: 32px;
		color: var(--fg-3);
	}
	.grille {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
		gap: var(--space-5);
	}
	.serveur {
		padding: var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.haut {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}
	.titre {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.titre h2 {
		font-weight: 700;
		font-size: 18px;
		letter-spacing: -0.01em;
	}
	.jeu {
		font-size: 13px;
		color: var(--fg-3);
	}
	.infos {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px 16px;
		margin: 0;
	}
	.infos div {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	dt {
		font: var(--type-overline);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 11px;
		color: var(--fg-3);
	}
	dd {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 14px;
		color: var(--fg-1);
		min-height: 32px;
	}
	code {
		font-family: var(--font-mono);
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.boutons {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		padding-top: var(--space-4);
		border-top: 1px solid var(--border-subtle);
	}
	.boutons form {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.boutons a:hover {
		text-decoration: none;
	}
	.espace {
		flex: 1;
	}
	.note {
		font-size: 13px;
		color: var(--fg-3);
	}
	.journal {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.journal ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.journal li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 0;
		border-top: 1px solid var(--border-subtle);
		font-size: 14px;
	}
	.journal li > span {
		flex: 1;
		min-width: 0;
	}
	.journal strong {
		font-weight: 500;
		color: var(--fg-1);
	}
	.journal i.ok {
		color: var(--success-fg);
	}
	.journal i.erreur,
	.journal .erreur {
		color: var(--danger-fg);
	}
	time {
		font-size: 12px;
		color: var(--fg-3);
		white-space: nowrap;
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.pied {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
	@media (max-width: 420px) {
		.grille {
			grid-template-columns: 1fr;
		}
	}
</style>
