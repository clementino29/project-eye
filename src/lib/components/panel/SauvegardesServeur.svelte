<script lang="ts">
	// Sauvegardes d'un serveur : liste, création et téléchargement, selon les droits Sakura Panel.
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '$app/forms';
	import { ilYa, octets } from '#lib/libelles.ts';
	import { toasts } from '#lib/toasts.svelte.ts';

	type Serveur = {
		identifiant: string;
		nom: string;
		sauvegardesMax: number;
		permissions: { sauvegardes: { voir: boolean; creer: boolean; telecharger: boolean } };
	};
	type Sauvegarde = { uuid: string; nom: string; reussie: boolean; verrouillee: boolean; octets: number; creeeLe: number; termineeLe: number | null };
	let { serveur }: { serveur: Serveur } = $props();

	let liste = $state<Sauvegarde[]>([]);
	let erreur = $state<string | null>(null);
	let chargement = $state(true);
	let envoi = $state(false);
	let nom = $state('');
	const droits = $derived(serveur.permissions.sauvegardes);
	const enCours = $derived(liste.some((s) => !s.termineeLe));
	const pleine = $derived(serveur.sauvegardesMax > 0 && liste.length >= serveur.sauvegardesMax);

	async function lire() {
		if (!droits.voir) return void (chargement = false);
		try {
			const r = await fetch(`/panel/sauvegardes?serveur=${encodeURIComponent(serveur.identifiant)}`);
			const d = await r.json().catch(() => ({}));
			if (!r.ok) throw new Error(d.message ?? `Erreur ${r.status}`);
			liste = d.sauvegardes;
			erreur = null;
		} catch (e) {
			erreur = e instanceof Error ? e.message : 'Sauvegardes injoignables.';
		} finally {
			chargement = false;
		}
	}

	$effect(() => {
		void lire();
	});
	// Tant qu'une sauvegarde se fait, on relit la liste toutes les 5 s.
	$effect(() => {
		if (!enCours) return;
		const t = setInterval(() => document.visibilityState === 'visible' && lire(), 5000);
		return () => clearInterval(t);
	});

	const creer: SubmitFunction = () => {
		envoi = true;
		return async ({ result }) => {
			envoi = false;
			if (result.type === 'success') {
				nom = '';
				toasts.montrer('success', 'Sauvegarde lancée', 'Elle peut prendre quelques minutes.');
				await lire();
			} else if (result.type === 'failure') {
				toasts.montrer('danger', 'Sauvegarde impossible', (result.data as { erreur?: string })?.erreur ?? '');
			} else if (result.type === 'error') toasts.montrer('danger', 'Erreur', result.error.message);
		};
	};

	const date = (t: number) => new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
	const lien = (s: Sauvegarde) =>
		`/panel/sauvegardes/telecharger?serveur=${encodeURIComponent(serveur.identifiant)}&uuid=${encodeURIComponent(s.uuid)}`;
</script>

<div class="sauvegardes">
	{#if droits.creer}
		<form method="POST" action="?/sauvegarder" class="creer" use:enhance={creer}>
			<input type="hidden" name="serveur" value={serveur.identifiant} />
			<input type="hidden" name="nom" value={serveur.nom} />
			<div class="nh-input">
				<i class="icon-archive" aria-hidden="true"></i>
				<input name="nomSauvegarde" bind:value={nom} maxlength="120" aria-label="Nom de la sauvegarde" placeholder="Nom (facultatif) : avant la mise à jour…" />
			</div>
			<button class="nh-btn nh-btn--primary" disabled={envoi || enCours || pleine}><i class="icon-plus" aria-hidden="true"></i>Sauvegarder</button>
		</form>
		{#if pleine}
			<p class="note attention">Les {serveur.sauvegardesMax} places sont prises : supprime une ancienne sauvegarde dans Sakura Panel pour en faire une nouvelle.</p>
		{:else if enCours}
			<p class="note">Une sauvegarde est en cours. La liste se met à jour toute seule.</p>
		{/if}
	{/if}

	{#if !droits.voir}
		<p class="note">Sakura Panel ne te laisse pas voir les sauvegardes de ce serveur.</p>
	{:else if chargement}
		<p class="note">Chargement des sauvegardes…</p>
	{:else if erreur}
		<p class="note attention"><i class="icon-circle-alert" aria-hidden="true"></i> {erreur}</p>
	{:else if !liste.length}
		<p class="vide">Aucune sauvegarde pour l'instant.</p>
	{:else}
		<div class="tete">
			<span class="nh-overline">{liste.length}{serveur.sauvegardesMax ? ` sur ${serveur.sauvegardesMax}` : ''} sauvegarde{liste.length > 1 ? 's' : ''}</span>
		</div>
		<ul>
			{#each liste as s (s.uuid)}
				<li>
					<span class="ico" class:rate={s.termineeLe && !s.reussie} aria-hidden="true">
						<i class="icon-{!s.termineeLe ? 'loader-circle tourne' : s.reussie ? 'archive' : 'circle-alert'}"></i>
					</span>
					<div class="infos">
						<span class="nom">{s.nom}{#if s.verrouillee}<i class="icon-lock verrou" title="Verrouillée : protégée de la suppression" aria-label="Verrouillée"></i>{/if}</span>
						<span class="detail">
							<time datetime={new Date(s.creeeLe).toISOString()} title={date(s.creeeLe)}>{ilYa(s.creeeLe)}</time>
							{#if !s.termineeLe}· en cours…{:else if !s.reussie}· échouée{:else}· {octets(s.octets)}{/if}
						</span>
					</div>
					{#if droits.telecharger && s.termineeLe && s.reussie}
						<a class="nh-btn nh-btn--outline nh-btn--sm" href={lien(s)} data-sveltekit-reload aria-label="Télécharger {s.nom}"><i class="icon-download" aria-hidden="true"></i><span class="txt">Télécharger</span></a>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.sauvegardes {
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-width: 0;
	}
	.creer {
		display: flex;
		gap: 8px;
	}
	.creer .nh-input {
		flex: 1;
		min-width: 0;
	}
	.note {
		font-size: 13px;
		color: var(--fg-3);
	}
	.attention {
		color: var(--warning-fg);
	}
	.vide {
		padding: 20px 0;
		text-align: center;
		font-size: 14px;
		color: var(--fg-3);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: min(46vh, 380px);
		overflow: auto;
	}
	li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 0;
		border-top: 1px solid var(--border-subtle);
	}
	.ico {
		flex: none;
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 10px;
		background: var(--bg-sunken);
		color: var(--fg-2);
		font-size: 16px;
	}
	.ico.rate {
		color: var(--danger-fg);
	}
	.tourne {
		display: inline-block;
		animation: tourne 1s linear infinite;
	}
	@keyframes tourne {
		to {
			transform: rotate(360deg);
		}
	}
	.infos {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.nom {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 14px;
		font-weight: 500;
		color: var(--fg-1);
		overflow-wrap: anywhere;
	}
	.verrou {
		font-size: 13px;
		color: var(--fg-3);
	}
	.detail {
		font-size: 12px;
		color: var(--fg-3);
	}
	li a:hover {
		text-decoration: none;
	}
	@media (max-width: 480px) {
		.creer {
			flex-direction: column;
		}
		.creer .nh-input {
			flex: none;
		}
		.txt {
			display: none;
		}
	}
</style>
