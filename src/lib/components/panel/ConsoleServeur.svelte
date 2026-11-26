<script lang="ts">
	// Console d'un serveur : dernières lignes (relues toutes les 4 s) et envoi de commandes,
	// selon les permissions Sakura Panel du membre.
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import type { SubmitFunction } from '$app/forms';
	import { toasts } from '#lib/toasts.svelte.ts';

	type Serveur = { identifiant: string; nom: string; etat: string; permissions: { console: boolean; commande: boolean } };
	let { serveur }: { serveur: Serveur } = $props();

	let lignes = $state<string[]>([]);
	let erreur = $state<string | null>(null);
	let chargement = $state(true);
	let le = $state<number | null>(null);
	let envoi = $state(false);
	let commande = $state('');
	let zone: HTMLPreElement | undefined = $state();
	const historique: string[] = [];
	let position = -1;

	async function lire() {
		if (!serveur.permissions.console) return;
		// On ne colle au bas que si la personne n'est pas remontée lire plus haut.
		const enBas = !zone || zone.scrollHeight - zone.scrollTop - zone.clientHeight < 40;
		try {
			const r = await fetch(`/panel/console?serveur=${encodeURIComponent(serveur.identifiant)}`);
			const d = await r.json().catch(() => ({}));
			if (!r.ok) throw new Error(d.message ?? `Erreur ${r.status}`);
			lignes = d.lignes;
			le = d.le;
			erreur = null;
		} catch (e) {
			erreur = e instanceof Error ? e.message : 'Console injoignable.';
		} finally {
			chargement = false;
		}
		await tick();
		if (enBas && zone) zone.scrollTop = zone.scrollHeight;
	}

	$effect(() => {
		void lire();
		const t = setInterval(() => {
			if (document.visibilityState === 'visible') void lire();
		}, 4000);
		return () => clearInterval(t);
	});

	const envoyer: SubmitFunction = () => {
		envoi = true;
		const c = commande.trim();
		return async ({ result }) => {
			envoi = false;
			if (result.type === 'success') {
				if (c && historique[0] !== c) historique.unshift(c);
				historique.length = Math.min(historique.length, 20);
				position = -1;
				commande = '';
				setTimeout(lire, 700);
			} else if (result.type === 'failure') {
				toasts.montrer('danger', 'Commande refusée', (result.data as { erreur?: string })?.erreur ?? '');
			} else if (result.type === 'error') toasts.montrer('danger', 'Erreur', result.error.message);
		};
	};

	// Flèches haut et bas : commandes déjà envoyées.
	function touche(e: KeyboardEvent) {
		if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
		if (!historique.length) return;
		e.preventDefault();
		position = e.key === 'ArrowUp' ? Math.min(position + 1, historique.length - 1) : Math.max(position - 1, -1);
		commande = position < 0 ? '' : historique[position];
	}

	const heure = (t: number) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
</script>

<div class="console">
	{#if serveur.permissions.console}
		<!-- Zone qui défile : focusable pour la lire au clavier. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<pre bind:this={zone} class="ecran" aria-label="Console de {serveur.nom}" aria-live="off" tabindex="0">{#if chargement}<span class="gris">Connexion à la console…</span>{:else if erreur && !lignes.length}<span class="rouge">{erreur}</span>{:else if !lignes.length}<span class="gris">{serveur.etat === 'running' ? 'Rien dans la console pour l’instant.' : 'Le serveur est arrêté : la console se remplit au démarrage.'}</span>{:else}{lignes.join('\n')}{/if}</pre>
		<div class="etat">
			{#if erreur && lignes.length}<span class="rouge"><i class="icon-circle-alert" aria-hidden="true"></i>{erreur}</span>
			{:else if le}<span><i class="icon-refresh-cw" aria-hidden="true"></i>Relue à {heure(le)}, toutes les 4 secondes</span>{/if}
		</div>
	{:else}
		<p class="note">Tu peux envoyer des commandes, mais pas lire la console : Sakura Panel ne te donne pas ce droit.</p>
	{/if}

	{#if serveur.permissions.commande}
		<form method="POST" action="?/commande" class="envoi" use:enhance={envoyer}>
			<input type="hidden" name="serveur" value={serveur.identifiant} />
			<input type="hidden" name="nom" value={serveur.nom} />
			<div class="nh-input">
				<span class="invite" aria-hidden="true">›</span>
				<input
					name="commande"
					bind:value={commande}
					onkeydown={touche}
					maxlength="500"
					autocomplete="off"
					spellcheck="false"
					aria-label="Commande"
					placeholder={serveur.etat === 'running' ? 'say Bonsoir à tous' : 'Démarre le serveur pour envoyer une commande'}
					disabled={serveur.etat !== 'running'}
				/>
			</div>
			<button class="nh-btn nh-btn--primary" disabled={envoi || !commande.trim() || serveur.etat !== 'running'}><i class="icon-send" aria-hidden="true"></i>Envoyer</button>
		</form>
		<p class="note">Chaque commande est notée dans le journal des actions, avec ton nom.</p>
	{/if}
</div>

<style>
	.console {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}
	.ecran {
		margin: 0;
		height: min(52vh, 420px);
		overflow: auto;
		padding: 12px 14px;
		border-radius: var(--radius-md, 10px);
		background: #0b151c;
		color: #d8e3ea;
		border: 1px solid var(--border-subtle);
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 12.5px;
		line-height: 1.5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.gris {
		color: #8aa0ad;
	}
	.rouge {
		color: var(--danger-fg);
	}
	.ecran .rouge {
		color: #ff9b8f;
	}
	.etat {
		min-height: 18px;
		font-size: 12px;
		color: var(--fg-3);
	}
	.etat span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.envoi {
		display: flex;
		gap: 8px;
	}
	.envoi .nh-input {
		flex: 1;
		min-width: 0;
	}
	.envoi input {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 14px;
	}
	.invite {
		color: var(--fg-3);
		font-weight: 700;
	}
	.note {
		font-size: 12px;
		color: var(--fg-3);
	}
	@media (max-width: 480px) {
		.envoi {
			flex-direction: column;
		}
		.envoi .nh-input {
			flex: none;
		}
		.ecran {
			font-size: 11.5px;
			padding: 10px;
		}
	}
</style>
