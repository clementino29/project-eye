<script lang="ts">
	// Onglets « Ma watchlist / Les potes » en haut des deux pages.
	let { actif }: { actif: 'moi' | 'potes' } = $props();
</script>

<nav aria-label="Sections de la watchlist" class="nh-tabs nh-tabs--underline onglets">
	<a class="nh-tabs__tab" class:nh-tabs__tab--active={actif === 'moi'} href="/films/ma-watchlist" aria-current={actif === 'moi' ? 'page' : undefined}>Ma watchlist</a>
	<a class="nh-tabs__tab" class:nh-tabs__tab--active={actif === 'potes'} href="/films/les-potes" aria-current={actif === 'potes' ? 'page' : undefined}>Les potes</a>
</nav>

<style>
	.onglets {
		display: flex;
	}
	.onglets a:hover {
		text-decoration: none;
	}
</style>
