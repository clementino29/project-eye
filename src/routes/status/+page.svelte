<script lang="ts">
	// Page Status : état des services suivis par Uptime Kuma, rafraîchi toutes les 30 secondes.
	import { invalidate } from '$app/navigation';
	import { ilYa } from '#lib/libelles.ts';

	let { data } = $props();

	const ETATS = {
		en_ligne: { l: 'En ligne', ton: 'success', c: 'var(--success-fg)' },
		en_panne: { l: 'En panne', ton: 'danger', c: 'var(--danger-fg)' },
		en_attente: { l: 'En attente', ton: 'warning', c: 'var(--warning-fg)' },
		maintenance: { l: 'Maintenance', ton: 'info', c: 'var(--info-fg)' },
		inconnu: { l: 'Inconnu', ton: 'neutral', c: 'var(--night-600)' }
	} as const;

	let maintenant = $state(Date.now());
	$effect(() => {
		const t = setInterval(() => {
			maintenant = Date.now();
			if (document.visibilityState === 'visible') invalidate('hub:status');
		}, 30_000);
		return () => clearInterval(t);
	});

	const services = $derived(data.statut?.groupes.flatMap((g) => g.services) ?? []);
	const enPanne = $derived(services.filter((s) => s.etat === 'en_panne').length);
	const enAlerte = $derived(services.filter((s) => s.etat === 'en_attente' || s.etat === 'maintenance').length);
	const bandeau = $derived(
		!services.length
			? null
			: enPanne
				? { ton: 'danger', icone: 'circle-x', texte: `${enPanne} service${enPanne > 1 ? 's' : ''} en panne` }
				: enAlerte
					? { ton: 'warning', icone: 'triangle-alert', texte: 'Tout tourne, avec quelques alertes' }
					: { ton: 'success', icone: 'circle-check', texte: 'Tout fonctionne' }
	);
	const pourcent = (v: number | null) =>
		v === null ? '–' : `${(Math.floor(v * 10000) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;
</script>

<svelte:head><title>Status · nohriancons</title></svelte:head>

<main class="nh-page" style="gap:var(--space-8)">
	<header class="entete">
		<div>
			<h1>Status</h1>
			<div class="sous">L'état des serveurs et des services de la bande.</div>
		</div>
		{#if data.statut}
			<div class="maj">
				Mis à jour {ilYa(data.statut.lueLe, maintenant)}
				<a class="nh-btn nh-btn--ghost nh-btn--sm" href={data.statut.urlPage} target="_blank" rel="noopener noreferrer"><i class="icon-external-link" aria-hidden="true"></i>Ouvrir Uptime Kuma</a>
			</div>
		{/if}
	</header>

	{#if data.etat === 'sans_config'}
		<div class="nh-card vide"><i class="icon-activity" aria-hidden="true"></i><div>La page Status n’est pas encore branchée. Il faut renseigner <code>KUMA_URL</code> et <code>KUMA_STATUS_SLUG</code> sur le serveur du hub.</div></div>
	{:else if data.etat === 'injoignable'}
		<div class="nh-card vide"><i class="icon-cloud-off" aria-hidden="true"></i><div>Uptime Kuma ne répond pas pour l’instant. Nouvel essai dans 30 secondes.</div></div>
	{:else if data.statut}
		{#if bandeau}
			<div class="bandeau bandeau--{bandeau.ton}" role="status"><i class="icon-{bandeau.icone}" aria-hidden="true"></i>{bandeau.texte}</div>
		{/if}
		{#if data.statut.incident}
			<div class="nh-card incident"><div class="i-titre"><i class="icon-megaphone" aria-hidden="true"></i>{data.statut.incident.titre}</div>{#if data.statut.incident.contenu}<div class="i-texte">{data.statut.incident.contenu}</div>{/if}</div>
		{/if}
		{#each data.statut.maintenances as m, i (i)}
			<div class="nh-card incident"><div class="i-titre"><i class="icon-wrench" aria-hidden="true"></i>{m.titre}</div>{#if m.description}<div class="i-texte">{m.description}</div>{/if}</div>
		{/each}
		{#if !services.length}<div class="nh-card vide">Aucun service n’est affiché sur cette page de statut.</div>{/if}
		{#each data.statut.groupes as g (g.nom)}
			<section class="groupe">
				<h2>{g.nom}</h2>
				<div class="nh-card liste">
					{#each g.services as s (s.id)}
						{@const e = ETATS[s.etat]}
						<div class="service">
							<div class="s-nom"><span class="nh-dot" style:background={e.c}></span><span>{s.nom}</span></div>
							<div class="battements" aria-label="Derniers contrôles">
								{#each s.historique as h, k (k)}<span style:background={ETATS[h].c} title={ETATS[h].l}></span>{/each}
							</div>
							<div class="chiffres">
								<span title="Disponibilité sur 24 heures"><b>{pourcent(s.dispo24h)}</b> 24 h</span>
								<span title="Disponibilité sur 30 jours"><b>{pourcent(s.dispo30j)}</b> 30 j</span>
								{#if s.ping !== null}<span><b>{s.ping}</b> ms</span>{/if}
							</div>
							<span class="nh-badge nh-badge--{e.ton}"><span class="nh-badge__dot"></span>{e.l}</span>
						</div>
					{/each}
				</div>
			</section>
		{/each}
	{/if}
</main>

<style>
	.entete {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-4);
	}
	h1 {
		font: var(--type-h1);
		letter-spacing: var(--tracking-tight);
		color: var(--fg-1);
	}
	h2 {
		font: var(--type-h3);
		letter-spacing: var(--tracking-tight);
		color: var(--fg-1);
	}
	.sous {
		color: var(--fg-3);
		font-size: 14px;
		margin-top: 4px;
	}
	.maj {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		font-size: 13px;
		color: var(--fg-3);
	}
	.vide {
		padding: 32px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		text-align: center;
		color: var(--fg-3);
	}
	.vide i {
		font-size: 28px;
	}
	.bandeau {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-5);
		border-radius: var(--radius-lg);
		font: var(--type-label);
		font-size: var(--text-md);
	}
	.bandeau i {
		font-size: 20px;
	}
	.bandeau--success {
		background: var(--success-bg);
		color: var(--success-fg);
	}
	.bandeau--warning {
		background: var(--warning-bg);
		color: var(--warning-fg);
	}
	.bandeau--danger {
		background: var(--danger-bg);
		color: var(--danger-fg);
	}
	.incident {
		padding: var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.i-titre {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font: var(--type-label);
		color: var(--fg-1);
	}
	.i-texte {
		font: var(--type-body-sm);
		color: var(--fg-2);
		white-space: pre-line;
	}
	.groupe {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.liste {
		padding: 0 var(--space-5);
	}
	.service {
		display: grid;
		grid-template-columns: minmax(140px, 1fr) minmax(0, 2fr) auto auto;
		gap: var(--space-5);
		align-items: center;
		padding: var(--space-4) 0;
	}
	.service + .service {
		border-top: 1px solid var(--border-subtle);
	}
	.s-nom {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		font: var(--type-label);
		color: var(--fg-1);
		min-width: 0;
	}
	.battements {
		display: flex;
		justify-content: flex-end;
		gap: 3px;
		height: 24px;
		overflow: hidden;
	}
	.battements span {
		flex: 0 0 6px;
		border-radius: 3px;
	}
	.chiffres {
		display: flex;
		gap: var(--space-4);
		font-size: 13px;
		color: var(--fg-3);
		white-space: nowrap;
	}
	.chiffres b {
		color: var(--fg-1);
		font-weight: 600;
	}
	@media (max-width: 719px) {
		.service {
			grid-template-columns: minmax(0, 1fr) auto;
			gap: var(--space-2) var(--space-3);
		}
		.battements {
			grid-column: 1 / -1;
			order: 3;
		}
		.chiffres {
			grid-column: 1 / -1;
			order: 4;
		}
	}
</style>
