<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import Header from '#lib/components/Header.svelte';
	import Toasts from '#lib/components/Toasts.svelte';

	let { data, children } = $props();

	const actif = $derived.by(() => {
		const p = page.url.pathname;
		if (p === '/') return 'accueil';
		if (p.startsWith('/jeux/liste')) return 'jeux-en-cours';
		if (p.startsWith('/jeux/parties')) return 'parties';
		if (p.startsWith('/jeux/quoi-faire')) return 'quoi-faire';
		if (p.startsWith('/panel')) return 'panel';
		if (p.startsWith('/status')) return 'status';
		if (p.startsWith('/compte')) return 'compte';
		return null;
	});
</script>

<div class="min-h-screen bg-page text-fg-2">
	<Header {actif} membre={data.moi} />
	{@render children()}
</div>
<Toasts />
