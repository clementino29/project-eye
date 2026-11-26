<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import Header, { type Cle } from '#lib/components/Header.svelte';
	import Toasts from '#lib/components/Toasts.svelte';

	let { data, children } = $props();

	const actif = $derived.by((): Cle => {
		const p = page.url.pathname;
		if (p === '/') return 'accueil';
		if (p.startsWith('/jeux/liste')) return 'jeux-en-cours';
		if (p.startsWith('/jeux/parties')) return 'parties';
		if (p.startsWith('/jeux/quoi-faire')) return 'quoi-faire';
		if (/^\/films\/(ma-watchlist|les-potes|titre)(\/|$)/.test(p)) return 'watchlist';
		if (p.startsWith('/films')) return 'films';
		if (p.startsWith('/fichiers')) return 'fichiers';
		if (p.startsWith('/panel')) return 'panel';
		if (p.startsWith('/status')) return 'status';
		if (p.startsWith('/compte')) return 'compte';
		return null;
	});
</script>

<div class="relative min-h-screen bg-page text-fg-2">
	<Header {actif} membre={data.moi} rubriques={data.rubriques} etatStatus={data.etatStatus} />
	{#if !data.moi && page.url.pathname !== '/' && !page.url.pathname.startsWith('/connexion')}
		<div class="lecture-seule" role="note">
			<i class="icon-eye" aria-hidden="true"></i>
			<span>Tu consultes le hub en lecture seule.</span>
			<a href="/connexion?retour={encodeURIComponent(page.url.pathname + page.url.search)}">Se connecter</a>
		</div>
	{/if}
	{@render children()}
</div>
<Toasts />

<style>
	.lecture-seule {
		position: relative;
		z-index: 1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 4px 10px;
		padding: 8px 16px;
		font-size: 13px;
		color: var(--fg-2);
		background: rgba(53, 106, 140, 0.22);
		border-bottom: 1px solid var(--border-subtle);
	}
	.lecture-seule i {
		color: var(--apricot-300);
	}
	.lecture-seule a {
		font-weight: 600;
	}
</style>
