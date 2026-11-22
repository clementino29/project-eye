<script lang="ts">
	type Onglet = { valeur: string; libelle: string; icone?: string; compte?: number };
	let {
		onglets,
		valeur,
		onchange,
		variante = 'pill'
	}: { onglets: Onglet[]; valeur: string; onchange: (v: string) => void; variante?: 'pill' | 'underline' } = $props();
</script>

<div role="tablist" class="nh-tabs" class:nh-tabs--underline={variante === 'underline'}>
	{#each onglets as o (o.valeur)}
		<button
			type="button"
			role="tab"
			aria-selected={o.valeur === valeur}
			class="nh-tabs__tab"
			class:nh-tabs__tab--active={o.valeur === valeur}
			onclick={() => onchange(o.valeur)}
		>
			{#if o.icone}<i class="icon-{o.icone}" aria-hidden="true"></i>{/if}
			{o.libelle}
			{#if o.compte != null}<span class="nh-tabs__count">{o.compte}</span>{/if}
		</button>
	{/each}
</div>
