<script lang="ts">
	// Avatar à initiales (ou photo), couleur stable selon le nom, comme dans le design system.
	const TONS = ['var(--petrol-500)', 'var(--petrol-400)', 'var(--apricot-600)', 'var(--night-600)', 'var(--petrol-700)'];
	let { nom = '', src = null, taille = 32 }: { nom?: string; src?: string | null; taille?: number } = $props();
	const initiales = $derived(
		nom
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0].toUpperCase())
			.join('')
	);
	const ton = $derived(TONS[[...nom].reduce((a, c) => a + c.charCodeAt(0), 0) % TONS.length]);
</script>

<span
	class="nh-avatar"
	title={nom}
	style:width="{taille}px"
	style:height="{taille}px"
	style:font-size="{Math.round(taille * 0.4)}px"
	style:background={ton}
>
	{#if src}<img {src} alt={nom} />{:else}{initiales}{/if}
</span>
