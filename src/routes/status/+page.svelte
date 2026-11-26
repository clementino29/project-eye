<script lang="ts">
	// Page Status : état des services suivis par Uptime Kuma, rafraîchi toutes les 30 secondes.
	import { invalidate } from '$app/navigation';
	import Lueur from '#lib/components/Lueur.svelte';
	import Pilule from '#lib/components/Pilule.svelte';
	import { ilYa, VUES_SERVICE, vueService, type EtatGlobal } from '#lib/libelles.ts';

	let { data } = $props();

	let maintenant = $state(Date.now());
	let actualisation = $state(false);
	$effect(() => {
		const t = setInterval(() => {
			maintenant = Date.now();
			if (document.visibilityState === 'visible') invalidate('hub:status');
		}, 30_000);
		return () => clearInterval(t);
	});
	async function actualiser() {
		actualisation = true;
		await invalidate('hub:status');
		maintenant = Date.now();
		actualisation = false;
	}

	/** Icône d'un service, devinée d'après son nom. */
	function iconeDe(nom: string) {
		const n = nom.toLowerCase();
		if (/authentik|auth|sso/.test(n)) return 'key-round';
		if (/panel|pelican|ptero/.test(n)) return 'layout-dashboard';
		if (/hub|nohrian|site/.test(n)) return 'house';
		if (/kuma|uptime|status/.test(n)) return 'activity';
		if (/calend|planning|agenda/.test(n)) return 'calendar-days';
		if (/craft|minecraft/.test(n)) return 'pickaxe';
		return 'server';
	}

	const services = $derived(
		(data.statut?.groupes.flatMap((g) => g.services) ?? []).map((s) => ({ ...s, vue: vueService(s.etat, s.ping) }))
	);
	const compter = (e: EtatGlobal) => services.filter((s) => VUES_SERVICE[s.vue].global === e).length;
	const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

	const BANDEAUX = {
		ok: { icone: 'circle-check', c: '#2fe39a', encre: '#04241a', ombre: 'rgba(47,227,154,.2)', a: 'rgba(47,227,154,.26)', b: 'rgba(47,227,154,.08)' },
		degrade: { icone: 'triangle-alert', c: '#ffb21e', encre: '#2a1a00', ombre: 'rgba(255,178,30,.22)', a: 'rgba(255,178,30,.32)', b: 'rgba(255,178,30,.10)' },
		panne: { icone: 'circle-x', c: '#ff5468', encre: '#2a0509', ombre: 'rgba(255,84,104,.25)', a: 'rgba(255,84,104,.38)', b: 'rgba(255,84,104,.12)' }
	} as const;

	const bandeau = $derived.by(() => {
		if (!services.length) return null;
		const enPanne = compter('panne');
		const alertes = compter('degrade');
		if (enPanne) return { ...BANDEAUX.panne, texte: 'Panne en cours', sous: `${pluriel(enPanne, 'service')} hors ligne` };
		if (alertes) {
			const lents = services.filter((s) => s.vue === 'lent').length;
			return {
				...BANDEAUX.degrade,
				texte: alertes > 1 ? 'Des services sont ralentis' : 'Un service est ralenti',
				sous:
					lents === alertes
						? `${pluriel(lents, 'service')} répond${lents > 1 ? 'ent' : ''} lentement`
						: `${pluriel(alertes, 'service')} en attente, en maintenance ou lent${alertes > 1 ? 's' : ''}`
			};
		}
		return {
			...BANDEAUX.ok,
			texte: 'Tout fonctionne',
			sous: services.length > 1 ? `Les ${services.length} services répondent normalement` : 'Le service répond normalement'
		};
	});
	const lueur = $derived.by(() => {
		const b = bandeau ?? { a: 'rgba(53,106,140,.55)', b: 'rgba(53,106,140,.18)' };
		return `radial-gradient(60% 80% at 12% 0%, ${b.a} 0%, ${b.b} 45%, rgba(11,21,28,0) 80%), radial-gradient(45% 60% at 88% 16%, rgba(53,106,140,.45) 0%, rgba(53,106,140,.12) 45%, rgba(11,21,28,0) 75%)`;
	});
	const pourcent = (v: number | null) =>
		v === null ? '–' : `${(Math.floor(v * 10000) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;
</script>

<svelte:head><title>Status · Nohriancons</title></svelte:head>

<Lueur fond={lueur} />

<main class="nh-page" style="gap:var(--space-8)">
	<header class="entete">
		<div>
			<h1>Status</h1>
			<div class="sous">L'état des serveurs et des services de la bande.</div>
		</div>
		{#if data.statut}
			<div class="maj">
				<span aria-live="polite">Mis à jour {ilYa(data.statut.lueLe, maintenant)}</span>
				<button type="button" class="nh-btn nh-iconbtn nh-btn--ghost nh-btn--sm" aria-label="Actualiser" title="Actualiser" disabled={actualisation} onclick={actualiser}><i class="icon-refresh-cw" class:tourne={actualisation} aria-hidden="true"></i></button>
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
			<div class="bandeau" role="status" style:background={bandeau.c} style:color={bandeau.encre} style:box-shadow="0 8px 32px {bandeau.ombre}">
				<span class="b-icone"><i class="icon-{bandeau.icone}" aria-hidden="true"></i></span>
				<div class="b-textes"><span class="b-titre">{bandeau.texte}</span><span class="b-sous">{bandeau.sous}</span></div>
			</div>
		{/if}
		{#if data.statut.incident}
			<div class="nh-card incident"><div class="i-titre"><i class="icon-megaphone" aria-hidden="true"></i>{data.statut.incident.titre}</div>{#if data.statut.incident.contenu}<div class="i-texte">{data.statut.incident.contenu}</div>{/if}</div>
		{/if}
		{#each data.statut.maintenances as m, i (i)}
			<div class="nh-card incident"><div class="i-titre"><i class="icon-wrench" aria-hidden="true"></i>{m.titre}</div>{#if m.description}<div class="i-texte">{m.description}</div>{/if}</div>
		{/each}
		{#if !services.length}<div class="nh-card vide">Aucun service n’est affiché sur cette page de statut.</div>{/if}
		{#each data.statut.groupes as g, gi (g.nom)}
			<section class="groupe" aria-labelledby="grp-{gi}">
				<h2 id="grp-{gi}">{g.nom}</h2>
				<div class="nh-card liste">
					{#each g.services as s (s.id)}
						{@const v = VUES_SERVICE[vueService(s.etat, s.ping)]}
						{@const enLigne = s.historique.filter((h) => h === 'en_ligne').length}
						<div class="service">
							<div class="s-nom">
								<span class="tuile" aria-hidden="true"><i class="icon-{iconeDe(s.nom)}"></i></span>
								<span class="texte">{s.nom}</span>
							</div>
							<div class="battements" role="img" aria-label="Derniers contrôles : {enLigne} sur {s.historique.length} en ligne">
								{#each s.historique as h, k (k)}
									{@const vh = VUES_SERVICE[vueService(h)]}
									<span style:background={vh.c} title={vh.l}></span>
								{/each}
							</div>
							<div class="chiffres">
								<span title="Disponibilité sur 24 heures"><b>{pourcent(s.dispo24h)}</b> 24 h</span>
								<span title="Disponibilité sur 30 jours"><b>{pourcent(s.dispo30j)}</b> 30 j</span>
								<span title="Temps de réponse"><b>{s.ping ?? '–'}</b> ms</span>
							</div>
							<span class="etat"><Pilule couleur={v.c} encre={v.encre} icone={v.icone} libelle={v.l} /></span>
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
		font: var(--type-h4);
		font-weight: var(--weight-bold);
		letter-spacing: var(--tracking-tight);
		color: var(--fg-1);
	}
	.sous {
		font: var(--type-body);
		color: var(--fg-2);
		margin-top: var(--space-2);
	}
	.maj {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		font-size: 13px;
		color: var(--fg-2);
	}
	.maj a:hover {
		text-decoration: none;
	}
	.tourne {
		animation: tourne 0.8s linear infinite;
	}
	@keyframes tourne {
		to {
			transform: rotate(360deg);
		}
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
		gap: var(--space-4);
		padding: var(--space-4) var(--space-5);
		border-radius: var(--radius-lg);
		transition: background 0.4s var(--ease-out);
	}
	.b-icone {
		flex: none;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.14);
		font-size: 22px;
	}
	.b-textes {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.b-titre {
		font-weight: var(--weight-bold);
		font-size: var(--text-lg);
		line-height: 1.2;
	}
	.b-sous {
		font-size: 14px;
		font-weight: 500;
		opacity: 0.85;
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
		gap: var(--space-3);
	}
	.liste {
		display: flex;
		flex-direction: column;
	}
	.service {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3) var(--space-5);
		padding: var(--space-4) var(--space-5);
	}
	.service + .service {
		border-top: 1px solid var(--border-subtle);
	}
	.s-nom {
		flex: 0 0 220px;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		font: var(--type-label);
		font-size: var(--text-md);
		color: var(--fg-1);
	}
	.tuile {
		flex: none;
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 10px;
		background: var(--petrol-500);
		color: var(--apricot-300);
		font-size: 18px;
	}
	.texte {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.battements {
		flex: 1 1 260px;
		min-width: 0;
		display: flex;
		gap: 3px;
		height: 28px;
	}
	.battements span {
		flex: 1 1 0;
		min-width: 2px;
		border-radius: 3px;
	}
	.chiffres {
		flex: none;
		display: flex;
		gap: var(--space-4);
		font: var(--type-body-sm);
		font-size: 13px;
		color: var(--fg-3);
		white-space: nowrap;
	}
	.chiffres b {
		color: var(--fg-1);
		font-weight: var(--weight-demi);
	}
	.etat {
		flex: none;
		width: 112px;
		display: flex;
		justify-content: flex-end;
	}
	@media (max-width: 559px) {
		.s-nom {
			flex: 1 1 0;
		}
		.etat {
			width: auto;
		}
		.battements {
			order: 3;
			flex-basis: 100%;
		}
		.chiffres {
			order: 4;
		}
	}
</style>
