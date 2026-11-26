<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '$app/forms';
	import Avatar from '#lib/components/Avatar.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import { artJeu } from '#lib/design/art.ts';
	import { imageSteam } from '#lib/quoi-faire.ts';
	import { toasts } from '#lib/toasts.svelte.ts';
	import { ilYa } from '#lib/libelles.ts';

	let { data } = $props();

	// --- Photo : choix, recadrage à la main, envoi en JPEG 320 × 320 ---
	const S = 280;
	let champFichier: HTMLInputElement | undefined = $state();
	let menuPhoto = $state(false);
	let zonePhoto: HTMLDivElement | undefined = $state();
	let image: HTMLImageElement | null = null;
	let recadrage = $state<{ src: string; w: number; h: number; base: number; zoom: number; ox: number; oy: number } | null>(null);
	let formPhoto: HTMLFormElement | undefined = $state();
	let champPhoto: HTMLInputElement | undefined = $state();

	function choisirFichier(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const f = input.files?.[0];
		input.value = '';
		if (!f) return;
		if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return toasts.montrer('danger', 'Format non pris en charge', 'Choisis un JPG, PNG ou WebP.');
		if (f.size > 5 * 1024 * 1024) return toasts.montrer('danger', 'Image trop lourde', '5 Mo maximum.');
		const r = new FileReader();
		r.onload = () => {
			const img = new Image();
			img.onload = () => {
				image = img;
				const base = S / Math.min(img.width, img.height);
				recadrage = { src: String(r.result), w: img.width, h: img.height, base, zoom: 1, ox: (S - img.width * base) / 2, oy: (S - img.height * base) / 2 };
			};
			img.src = String(r.result);
		};
		r.readAsDataURL(f);
	}
	function borner<T extends NonNullable<typeof recadrage>>(c: T): T {
		const sc = c.base * c.zoom;
		return { ...c, ox: Math.min(0, Math.max(S - c.w * sc, c.ox)), oy: Math.min(0, Math.max(S - c.h * sc, c.oy)) };
	}
	function zoomer(e: Event) {
		const z = Number((e.currentTarget as HTMLInputElement).value);
		if (!recadrage) return;
		const c = recadrage, k = z / c.zoom, mid = S / 2;
		recadrage = borner({ ...c, zoom: z, ox: mid - (mid - c.ox) * k, oy: mid - (mid - c.oy) * k });
	}
	function glisser(e: PointerEvent) {
		e.preventDefault();
		if (!recadrage) return;
		const sx = e.clientX, sy = e.clientY, ox = recadrage.ox, oy = recadrage.oy;
		const bouger = (ev: PointerEvent) => recadrage && (recadrage = borner({ ...recadrage, ox: ox + ev.clientX - sx, oy: oy + ev.clientY - sy }));
		const lacher = () => {
			window.removeEventListener('pointermove', bouger);
			window.removeEventListener('pointerup', lacher);
		};
		window.addEventListener('pointermove', bouger);
		window.addEventListener('pointerup', lacher);
	}
	function enregistrerRecadrage() {
		const c = recadrage;
		if (!c || !image || !champPhoto || !formPhoto) return;
		const sc = c.base * c.zoom, sortie = 320;
		const cv = document.createElement('canvas');
		cv.width = cv.height = sortie;
		cv.getContext('2d')!.drawImage(image, -c.ox / sc, -c.oy / sc, S / sc, S / sc, 0, 0, sortie, sortie);
		champPhoto.value = cv.toDataURL('image/jpeg', 0.88);
		recadrage = null;
		formPhoto.requestSubmit();
	}
	function cliquerAppareil() {
		if (data.profil.photo) menuPhoto = !menuPhoto;
		else champFichier?.click();
	}

	// --- Retours des actions ---
	type Retour = { action?: string; ok?: string; erreur?: string; etat?: string; total?: number; etaitPrivee?: boolean };
	let erreurSteam = $state('');
	let erreurCle = $state('');
	let liaison = $state(false);
	let testDiscord = $state(false);
	let synchro = $state(false);
	let enregistrementCle = $state(false);
	let edition = $state(false);
	let cleVisible = $state(false);
	let dialogueDelier = $state(false);
	let dialogueCle = $state(false);

	const avecRetour =
		(enCours?: (v: boolean) => void): SubmitFunction =>
		() => {
			enCours?.(true);
			return async ({ result, update }) => {
				enCours?.(false);
				const d = (result.type === 'success' || result.type === 'failure' ? result.data : undefined) as Retour | undefined;
				if (result.type === 'failure') {
					if (d?.action === 'lierSteam') erreurSteam = d.erreur ?? '';
					else if (d?.action === 'enregistrerCle') erreurCle = d.erreur ?? '';
					else toasts.montrer('danger', d?.erreur ?? 'Ça n’a pas marché');
					return;
				}
				if (result.type === 'error') {
					toasts.montrer('danger', 'Erreur', result.error.message);
					return;
				}
				await update({ reset: true });
				if (!d) return;
				if (d.action === 'lierSteam') {
					erreurSteam = '';
					if (d.etat === 'privee') toasts.montrer('warning', 'Steam lié, mais bibliothèque privée');
					else toasts.montrer('success', 'Steam lié', `${d.total} jeux récupérés.`);
				} else if (d.action === 'resynchroniser') {
					if (d.etat === 'privee') toasts.montrer('warning', 'Bibliothèque toujours privée');
					else toasts.montrer('success', d.etaitPrivee ? 'C’est bon, on voit tes jeux' : 'Bibliothèque à jour', `${d.total} jeux.`);
				} else if (d.action === 'enregistrerCle') {
					erreurCle = '';
					edition = false;
					cleVisible = false;
					toasts.montrer('success', d.ok ?? 'Clé enregistrée', 'Tes serveurs sont accessibles depuis le hub.');
				} else if (d.action === 'delierSteam' || d.action === 'supprimerCle' || d.action === 'retirerPhoto') {
					dialogueDelier = false;
					dialogueCle = false;
					menuPhoto = false;
					toasts.montrer('info', d.ok ?? 'C’est fait', d.action === 'retirerPhoto' ? 'Tes initiales la remplacent.' : '');
				} else if (d.ok) {
					toasts.montrer('success', d.ok);
				}
			};
		};

	const lie = $derived(data.steam.etat === 'liee');
	const prive = $derived(data.steam.etat === 'privee');
	const badgeSteam = $derived(lie ? `Steam lié · ${data.steam.total} jeux` : prive ? 'Steam : bibliothèque privée' : 'Steam non lié');
	const tonSteam = $derived(lie ? 'success' : prive ? 'warning' : 'neutral');
	const enEdition = $derived(!data.pelican.cle || edition);

	function clicDocument(e: PointerEvent) {
		if (menuPhoto && zonePhoto && !zonePhoto.contains(e.target as Node)) menuPhoto = false;
	}
	/** Cache une image Steam qui ne charge pas : la jaquette dessinée prend le relais. */
	const masquer = (e: Event) => ((e.currentTarget as HTMLImageElement).style.display = 'none');
</script>

<svelte:head><title>Mon compte · Nohriancons</title></svelte:head>
<svelte:document onpointerdown={clicDocument} />

<input type="file" accept="image/png,image/jpeg,image/webp" bind:this={champFichier} onchange={choisirFichier} hidden />
<form method="POST" action="?/photo" bind:this={formPhoto} use:enhance={avecRetour()} hidden>
	<input type="hidden" name="photo" bind:this={champPhoto} />
</form>

<main class="compte">
	<div class="hero">
		<div class="photo" bind:this={zonePhoto}>
			<span class="grand"><Avatar nom={data.profil.nom} src={data.profil.photo} taille={112} /></span>
			<span class="moyen"><Avatar nom={data.profil.nom} src={data.profil.photo} taille={96} /></span>
			<button
				type="button"
				class="appareil"
				onclick={cliquerAppareil}
				aria-label={data.profil.photo ? 'Photo de profil : changer ou retirer' : 'Ajouter une photo de profil'}
				aria-haspopup={data.profil.photo ? 'menu' : undefined}
				aria-expanded={data.profil.photo ? menuPhoto : undefined}><i class="icon-camera" aria-hidden="true"></i></button
			>
			{#if menuPhoto}
				<div role="menu" class="menu-photo">
					<button type="button" role="menuitem" onclick={() => { menuPhoto = false; champFichier?.click(); }}><i class="icon-upload" aria-hidden="true"></i>Changer la photo</button>
					<form method="POST" action="?/retirerPhoto" use:enhance={avecRetour()}>
						<button type="submit" role="menuitem" class="danger"><i class="icon-trash-2" aria-hidden="true"></i>Retirer la photo</button>
					</form>
				</div>
			{/if}
		</div>
		<div class="identite">
			<h1>{data.profil.nom}</h1>
			<div class="meta"><span>@{data.profil.pseudo}</span>{#if data.profil.email}<span>{data.profil.email}</span>{/if}</div>
			<div class="badges">
				<span class="nh-badge nh-badge--{tonSteam}"><span class="nh-badge__dot"></span>{badgeSteam}</span>
				{#if data.profil.role === 'admin'}<span class="nh-badge nh-badge--accent">Admin</span>{/if}
			</div>
		</div>
		<div class="droite">
			{#if data.urlAuthentik}
				<a href={data.urlAuthentik} target="_blank" rel="noopener" class="nh-btn nh-btn--outline nh-btn--sm">Modifier sur Authentik<i class="icon-external-link" aria-hidden="true"></i></a>
			{/if}
			<span class="aide">Nom, e-mail et pseudo viennent d'Authentik</span>
		</div>
	</div>

	<section aria-labelledby="steam-titre" class="bloc">
		{#if data.steam.etat === 'non_liee'}
			<div class="tete">
				<div class="tuile"><i class="icon-library" aria-hidden="true"></i></div>
				<div class="texte"><h2 id="steam-titre">Bibliothèque Steam</h2><span>Lie ton compte pour que « Quoi faire ? » connaisse tes jeux.</span></div>
			</div>
			<form method="POST" action="?/lierSteam" class="ligne-form" use:enhance={avecRetour((v) => (liaison = v))}>
				<div class="nh-field champ">
					<label class="nh-field__label" for="profil-steam">Profil Steam</label>
					<div class="nh-input" class:nh-input--error={erreurSteam}>
						<i class="icon-link" aria-hidden="true"></i>
						<input id="profil-steam" name="profil" placeholder="URL du profil ou SteamID64" autocomplete="off" oninput={() => (erreurSteam = '')} />
					</div>
					<div class="nh-field__hint" class:nh-field__hint--error={erreurSteam}>{erreurSteam || 'Ex. steamcommunity.com/id/ton-pseudo'}</div>
				</div>
				<div class="bouton-form">
					<button class="nh-btn nh-btn--primary" disabled={liaison}><i class="icon-{liaison ? 'loader' : 'link-2'}" aria-hidden="true"></i>{liaison ? 'Vérification…' : 'Lier'}</button>
				</div>
			</form>
			<span class="aide">Ta bibliothèque doit être publique sur Steam (« Détails des jeux » : public).</span>
		{:else}
			<div class="tete">
				<Avatar nom={data.steam.nom ?? 'Steam'} taille={40} />
				<div class="texte">
					<h2 id="steam-titre">Bibliothèque Steam</h2>
					<span>{data.steam.nom} · {lie ? `${data.steam.total} jeux` : 'jeux non visibles'} · synchro {ilYa(data.steam.derniereSync)}</span>
				</div>
				<div class="actions">
					<form method="POST" action="?/resynchroniser" use:enhance={avecRetour((v) => (synchro = v))}>
						<button class="nh-btn nh-btn--outline nh-btn--sm" disabled={synchro}><i class="icon-refresh-cw" aria-hidden="true"></i>{synchro ? 'Synchro…' : 'Resynchroniser'}</button>
					</form>
					<button type="button" class="nh-btn nh-btn--ghost nh-btn--sm" disabled={synchro} onclick={() => (dialogueDelier = true)}><i class="icon-unlink" aria-hidden="true"></i>Délier</button>
				</div>
			</div>
			{#if prive}
				<div role="status" class="avert">
					<i class="icon-triangle-alert" aria-hidden="true"></i>
					<div>
						<strong>Ta bibliothèque est privée.</strong>
						<span>On voit ton profil mais pas tes jeux. Passe « Détails des jeux » en public dans Steam, puis resynchronise.</span>
						<a href="https://steamcommunity.com/my/edit/settings" target="_blank" rel="noopener">Ouvrir mes paramètres Steam</a>
					</div>
				</div>
			{/if}
			{#if lie}
				<div class="jeux" style:opacity={synchro ? 0.4 : 1}>
					{#each data.steam.apercu as j (j.id)}
						{@const art = artJeu(j.nom)}
						<div class="jaquette" style:background={art.grad} title={j.nom}><i class="icon-{art.icon}" aria-hidden="true"></i><span>{j.nom}</span><img src={imageSteam(j.id)} alt={j.nom} loading="lazy" onerror={masquer} /></div>
					{/each}
					{#if data.steam.total > data.steam.apercu.length}
						<div class="reste">+ {data.steam.total - data.steam.apercu.length} autres</div>
					{/if}
				</div>
				<span class="aide">Utilisée par « Quoi faire ? » pour proposer des jeux que tout le monde a.</span>
			{/if}
		{/if}
	</section>

	<section aria-labelledby="pelican-titre" class="bloc">
		<div class="tete">
			<div class="tuile claire"><img src="/images/sakura-panel.png" alt="" width="32" height="32" /></div>
			<div class="texte">
				<h2 id="pelican-titre">Sakura Panel</h2>
				<span>{data.pelican.cle ? `Clé ajoutée ${ilYa(data.pelican.ajouteeLe)}` : 'Ajoute ta clé API pour voir et lancer tes serveurs de jeu depuis le hub.'}</span>
			</div>
			{#if data.pelican.cle}<span class="nh-badge nh-badge--success"><span class="nh-badge__dot"></span>Clé active</span>{/if}
		</div>

		{#if enEdition}
			<form method="POST" action="?/enregistrerCle" class="ligne-form" use:enhance={avecRetour((v) => (enregistrementCle = v))}>
				<div class="champ cle">
					<div class="nh-field" style="flex:1;min-width:0">
						<label class="nh-field__label" for="pelican-key">Clé API client</label>
						<div class="nh-input" class:nh-input--error={erreurCle}>
							<i class="icon-key-round" aria-hidden="true"></i>
							<input id="pelican-key" name="cle" type={cleVisible ? 'text' : 'password'} autocomplete="off" spellcheck="false" placeholder="Colle ta clé ici" oninput={() => (erreurCle = '')} />
						</div>
						<div class="nh-field__hint" class:nh-field__hint--error={erreurCle}>{erreurCle || 'Une clé client (compte), pas une clé d’application.'}</div>
					</div>
					<div style="padding-top:26px">
						<button type="button" class="nh-btn nh-iconbtn nh-btn--ghost" aria-label={cleVisible ? 'Masquer la clé' : 'Afficher la clé'} aria-pressed={cleVisible} onclick={() => (cleVisible = !cleVisible)}>
							<i class="icon-{cleVisible ? 'eye-off' : 'eye'}" aria-hidden="true"></i>
						</button>
					</div>
				</div>
				<div class="bouton-form">
					{#if data.pelican.cle}
						<button type="button" class="nh-btn nh-btn--ghost" disabled={enregistrementCle} onclick={() => { edition = false; erreurCle = ''; cleVisible = false; }}>Annuler</button>
					{/if}
					<button class="nh-btn nh-btn--primary" disabled={enregistrementCle}><i class="icon-{enregistrementCle ? 'loader' : 'check'}" aria-hidden="true"></i>{enregistrementCle ? 'Vérification…' : 'Enregistrer'}</button>
				</div>
			</form>
			<span class="aide">
				Dans Sakura Panel : ton profil › Clés API › Créer. Elle reste chiffrée chez nous et tu peux la révoquer quand tu veux.
				{#if data.pelican.urlCles}<a href={data.pelican.urlCles} target="_blank" rel="noopener">Ouvrir Sakura Panel</a>{/if}
			</span>
		{:else}
			<div class="cle-enregistree">
				<i class="icon-key-round" aria-hidden="true"></i>
				<code>{data.pelican.cle}</code>
				<div class="actions">
					<button type="button" class="nh-btn nh-btn--outline nh-btn--sm" onclick={() => (edition = true)}><i class="icon-pencil" aria-hidden="true"></i>Remplacer</button>
					<button type="button" class="nh-btn nh-btn--ghost nh-btn--sm" onclick={() => (dialogueCle = true)}><i class="icon-trash-2" aria-hidden="true"></i>Supprimer</button>
				</div>
			</div>
		{/if}
	</section>

	{#if data.membres}
		<section aria-labelledby="membres-titre" class="bloc">
			<div class="tete">
				<div class="tuile"><i class="icon-users" aria-hidden="true"></i></div>
				<div class="texte"><h2 id="membres-titre">Membres du hub</h2><span>Les rôles viennent des groupes Authentik ; les droits serveur, de Sakura Panel.</span></div>
			</div>
			<div class="table">
				{#each data.membres as m (m.id)}
					<div class="rang">
						<Avatar nom={m.nom} src={m.photo} taille={32} />
						<div class="qui"><strong>{m.nom}</strong><span>@{m.pseudo}</span></div>
						<span class="nh-badge nh-badge--{m.role === 'admin' ? 'accent' : 'neutral'}">{m.role === 'admin' ? 'Admin' : 'Membre'}</span>
						<span class="nh-badge nh-badge--{m.etatSteam === 'liee' ? 'success' : m.etatSteam === 'privee' ? 'warning' : 'neutral'}">Steam {m.etatSteam === 'liee' ? 'lié' : m.etatSteam === 'privee' ? 'privé' : 'non lié'}</span>
						<span class="nh-badge nh-badge--{m.clePelican ? 'success' : 'neutral'}">{m.clePelican ? 'Clé Sakura' : 'Sans clé Sakura'}</span>
						<span class="quand">Vu {ilYa(m.derniereConnexion)}</span>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.automatisations}
		{@const a = data.automatisations}
		<section aria-labelledby="auto-titre" class="bloc">
			<div class="tete">
				<div class="tuile"><i class="icon-alarm-clock" aria-hidden="true"></i></div>
				<div class="texte"><h2 id="auto-titre">Automatisations</h2><span>Tâches que le hub lance seul, à l'heure de Paris.</span></div>
			</div>
			<div class="table">
				{#each [{ cle: 'synchro-steam', nom: 'Bibliothèques Steam', quand: `Chaque nuit à ${a.heureSteam} h` }, { cle: 'annonces-demain', nom: 'Annonces de la veille', quand: `Chaque jour à ${a.heureAnnonces} h, sur Discord` }] as t (t.cle)}
					{@const p = a.passages[t.cle]}
					<div class="rang">
						<div class="qui"><strong>{t.nom}</strong><span>{t.quand}</span></div>
						<span class="quand">{p ? `${p.resultat ?? '…'} · ${ilYa(p.quand)}` : 'Pas encore lancée'}</span>
					</div>
				{/each}
				<div class="rang">
					<div class="qui"><strong>Webhook Discord</strong><span>Serveur démarré depuis le Panel, soirée ou session prévue le lendemain.</span></div>
					<span class="nh-badge nh-badge--{a.discord ? 'success' : 'neutral'}">{a.discord ? 'Réglé' : 'Non réglé'}</span>
					{#if a.discord}
						<form method="POST" action="?/testerDiscord" use:enhance={avecRetour((v) => (testDiscord = v))}>
							<button class="nh-btn nh-btn--outline nh-btn--sm" disabled={testDiscord}><i class={testDiscord ? 'icon-loader' : 'icon-send'} aria-hidden="true"></i>Envoyer un test</button>
						</form>
					{/if}
				</div>
			</div>
		</section>
	{/if}
</main>

{#if recadrage}
	{@const c = recadrage}
	<Dialog titre="Recadre ta photo" onfermer={() => (recadrage = null)}>
		<div class="recadrage">
			<div class="cadre" onpointerdown={glisser} role="presentation">
				<div aria-hidden="true" class="image" style:background-image="url({c.src})" style:background-size="{c.w * c.base * c.zoom}px {c.h * c.base * c.zoom}px" style:background-position="{c.ox}px {c.oy}px"></div>
				<div aria-hidden="true" class="masque"></div>
			</div>
			<div class="zoom"><i class="icon-zoom-out" aria-hidden="true"></i><input type="range" min="1" max="3" step="0.01" value={c.zoom} oninput={zoomer} aria-label="Zoom" /><i class="icon-zoom-in" aria-hidden="true"></i></div>
			<span class="aide">Glisse l'image pour la centrer.</span>
			<div class="pied">
				<button type="button" class="nh-btn nh-btn--ghost" onclick={() => (recadrage = null)}>Annuler</button>
				<button type="button" class="nh-btn nh-btn--primary" onclick={enregistrerRecadrage}>Enregistrer</button>
			</div>
		</div>
	</Dialog>
{/if}

{#if dialogueDelier}
	<Dialog titre="Délier ton compte Steam ?" description="« Quoi faire ? » ne tiendra plus compte de tes jeux. Tu pourras le relier quand tu veux." onfermer={() => (dialogueDelier = false)}>
		<form method="POST" action="?/delierSteam" class="pied" use:enhance={avecRetour()}>
			<button type="button" class="nh-btn nh-btn--ghost" onclick={() => (dialogueDelier = false)}>Annuler</button>
			<button class="nh-btn nh-btn--danger"><i class="icon-unlink" aria-hidden="true"></i>Délier</button>
		</form>
	</Dialog>
{/if}

{#if dialogueCle}
	<Dialog titre="Supprimer ta clé Sakura Panel ?" description="Le hub ne pourra plus voir ni piloter tes serveurs. Pense aussi à la révoquer dans Sakura Panel." onfermer={() => (dialogueCle = false)}>
		<form method="POST" action="?/supprimerCle" class="pied" use:enhance={avecRetour()}>
			<button type="button" class="nh-btn nh-btn--ghost" onclick={() => (dialogueCle = false)}>Annuler</button>
			<button class="nh-btn nh-btn--danger"><i class="icon-trash-2" aria-hidden="true"></i>Supprimer</button>
		</form>
	</Dialog>
{/if}

<style>
	.compte {
		width: 100%;
		max-width: 1320px;
		margin: 0 auto;
		padding: 40px 48px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.hero {
		background: var(--surface-1);
		border: 1px solid var(--border-subtle);
		border-radius: 24px;
		padding: 36px 40px;
		display: flex;
		align-items: center;
		gap: 24px;
	}
	.photo {
		position: relative;
		flex: none;
	}
	.moyen {
		display: none;
	}
	.appareil {
		position: absolute;
		right: -4px;
		bottom: -4px;
		width: 36px;
		height: 36px;
		border-radius: 999px;
		border: 3px solid var(--surface-1);
		background: var(--apricot-300);
		color: var(--apricot-ink);
		display: grid;
		place-items: center;
		cursor: pointer;
		font-size: 16px;
		transition: background 120ms var(--ease-out), transform 120ms var(--ease-out);
	}
	.appareil:hover {
		background: var(--apricot-200);
	}
	.appareil:active {
		transform: scale(0.94);
	}
	.menu-photo {
		position: absolute;
		top: calc(100% + 10px);
		left: 0;
		width: 200px;
		padding: 6px;
		background: var(--surface-2);
		border: 1px solid var(--border-default);
		border-radius: 16px;
		box-shadow: var(--shadow-3);
		display: flex;
		flex-direction: column;
		gap: 2px;
		z-index: 20;
	}
	.menu-photo button {
		width: 100%;
		border: none;
		background: transparent;
		cursor: pointer;
		text-align: left;
		padding: 10px 12px;
		border-radius: 10px;
		display: flex;
		align-items: center;
		gap: 10px;
		font-weight: 500;
		font-size: 14px;
		color: var(--fg-2);
	}
	.menu-photo button:hover {
		background: var(--surface-hover);
		color: var(--fg-1);
	}
	.menu-photo .danger {
		color: var(--danger-fg);
	}
	.menu-photo .danger:hover {
		background: var(--danger-bg);
		color: var(--danger-fg);
	}
	.identite {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	h1 {
		font-weight: 700;
		font-size: 36px;
		letter-spacing: -0.02em;
		line-height: 1.15;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 16px;
		font-size: 14px;
		color: var(--fg-2);
	}
	.badges {
		display: flex;
		gap: 8px;
		margin-top: 4px;
	}
	.droite {
		margin-left: auto;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 8px;
	}
	.droite a:hover {
		text-decoration: none;
	}
	.aide {
		font-size: 12px;
		color: var(--fg-3);
		text-wrap: pretty;
	}
	.bloc {
		background: var(--surface-1);
		border: 1px solid var(--border-subtle);
		border-radius: 16px;
		padding: 32px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.tete {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
	}
	.tuile {
		width: 44px;
		height: 44px;
		flex: none;
		border-radius: 12px;
		background: var(--surface-brand);
		display: grid;
		place-items: center;
		color: var(--apricot-300);
		font-size: 22px;
	}
	.tuile.claire {
		background: var(--surface-2);
		border: 1px solid var(--border-subtle);
	}
	.texte {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		flex: 1 1 200px;
	}
	.texte h2 {
		font-weight: 700;
		font-size: 18px;
		line-height: 1.3;
	}
	.texte span {
		font-size: 13px;
		color: var(--fg-3);
		text-wrap: pretty;
	}
	.actions {
		display: flex;
		gap: 8px;
	}
	.ligne-form {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: flex-start;
		max-width: 640px;
	}
	.champ {
		flex: 1 1 280px;
		min-width: 0;
	}
	.champ.cle {
		display: flex;
		gap: 8px;
		align-items: flex-start;
	}
	.bouton-form {
		padding-top: 26px;
		display: flex;
		gap: 8px;
	}
	.avert {
		background: var(--warning-bg);
		border-radius: 12px;
		padding: 14px 16px;
		display: flex;
		gap: 12px;
		align-items: flex-start;
	}
	.avert > i {
		font-size: 18px;
		color: var(--warning-fg);
		margin-top: 1px;
	}
	.avert div {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.avert strong {
		font-weight: 500;
		font-size: 14px;
		color: var(--warning-fg);
	}
	.avert span,
	.avert a {
		font-size: 13px;
	}
	.jeux {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 12px;
		transition: opacity 180ms var(--ease-out);
	}
	.jaquette,
	.reste {
		width: 100%;
		aspect-ratio: 460/215;
		border-radius: 10px;
	}
	/* Jaquette dessinée, sous l'image Steam : elle reste si l'image ne charge pas. */
	.jaquette {
		position: relative;
		overflow: hidden;
		display: flex;
		align-items: flex-end;
		padding: 6px 8px;
		font-weight: 800;
		font-size: 11px;
		line-height: 1.15;
		color: #fff;
		text-shadow: 0 1px 8px rgba(0, 0, 0, 0.4);
	}
	.jaquette span {
		position: relative;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	.jaquette img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.jaquette i {
		position: absolute;
		right: -4px;
		top: 50%;
		transform: translateY(-50%) rotate(-12deg);
		font-size: 44px;
		color: rgba(255, 255, 255, 0.2);
		text-shadow: none;
	}
	.reste {
		border: 1.5px dashed var(--border-strong);
		background: none;
		display: grid;
		place-items: center;
		font-size: 12px;
		color: var(--fg-3);
	}
	.cle-enregistree {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
		background: var(--surface-2);
		border: 1px solid var(--border-subtle);
		border-radius: 12px;
		padding: 12px 16px;
	}
	.cle-enregistree > i {
		font-size: 18px;
		color: var(--fg-3);
	}
	code {
		font-family: var(--font-mono);
		font-size: 14px;
		color: var(--fg-1);
		flex: 1 1 160px;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.table {
		display: flex;
		flex-direction: column;
	}
	.rang {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 12px;
		padding: 12px 0;
		border-top: 1px solid var(--border-subtle);
	}
	.rang .qui {
		display: flex;
		flex-direction: column;
		min-width: 140px;
		flex: 1;
	}
	.rang strong {
		font-weight: 500;
		color: var(--fg-1);
	}
	.rang .qui span,
	.quand {
		font-size: 12px;
		color: var(--fg-3);
	}
	.recadrage {
		display: flex;
		flex-direction: column;
		gap: 16px;
		align-items: center;
	}
	.cadre {
		position: relative;
		width: 280px;
		height: 280px;
		border-radius: 16px;
		overflow: hidden;
		background: var(--surface-3);
		cursor: grab;
		touch-action: none;
		user-select: none;
	}
	.cadre .image {
		position: absolute;
		inset: 0;
		background-repeat: no-repeat;
		pointer-events: none;
	}
	.masque {
		position: absolute;
		inset: 0;
		border-radius: 999px;
		box-shadow: 0 0 0 999px rgba(4, 9, 13, 0.6);
		border: 2px solid var(--fg-1);
		pointer-events: none;
	}
	.zoom {
		width: 280px;
		display: flex;
		align-items: center;
		gap: 12px;
		color: var(--fg-3);
	}
	.zoom input {
		flex: 1;
		accent-color: var(--apricot-300);
	}
	.pied {
		align-self: stretch;
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	@media (max-width: 1099px) {
		.compte {
			padding: 32px;
		}
		.hero {
			padding: 28px 32px;
		}
		.bloc {
			padding: 24px;
		}
		.grand {
			display: none;
		}
		.moyen {
			display: inline;
		}
		h1 {
			font-size: 28px;
		}
	}
	@media (max-width: 679px) {
		.compte {
			padding: 16px;
			gap: 16px;
		}
		.hero {
			padding: 24px 16px;
			flex-direction: column;
			text-align: center;
		}
		.identite {
			align-items: center;
		}
		.meta {
			justify-content: center;
		}
		.droite {
			margin-left: 0;
			align-items: stretch;
			width: 100%;
		}
		.droite a {
			width: 100%;
		}
		.menu-photo {
			left: 50%;
			transform: translateX(-50%);
		}
		.bloc {
			padding: 16px;
		}
		.actions {
			display: grid;
			grid-template-columns: 1fr 1fr;
			width: 100%;
		}
		.actions :global(.nh-btn),
		.actions form,
		.actions form .nh-btn {
			width: 100%;
		}
		.bouton-form {
			padding-top: 0;
			width: 100%;
		}
		.bouton-form .nh-btn {
			flex: 1;
		}
		.jeux {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.jeux .jaquette:nth-child(n + 4) {
			display: none;
		}
	}
</style>
