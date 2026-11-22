<script lang="ts">
	import Avatar from './Avatar.svelte';
	type Personne = { nom: string; photo?: string | null };
	let { personnes = [], taille = 28, max = 4 }: { personnes?: Personne[]; taille?: number; max?: number } = $props();
	const affichees = $derived(personnes.slice(0, max));
	const reste = $derived(personnes.length - affichees.length);
</script>

<span class="nh-avatar-group">
	{#each affichees as p (p.nom)}<Avatar nom={p.nom} src={p.photo} {taille} />{/each}
	{#if reste > 0}
		<span
			class="nh-avatar"
			style:width="{taille}px"
			style:height="{taille}px"
			style:font-size="{Math.round(taille * 0.36)}px"
			style="background:var(--surface-3);color:var(--fg-2)">+{reste}</span
		>
	{/if}
</span>
