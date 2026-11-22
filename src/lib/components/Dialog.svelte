<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		titre,
		description,
		onfermer,
		largeur = 440,
		children
	}: { titre: string; description?: string; onfermer: () => void; largeur?: number; children: Snippet } = $props();

	let boite: HTMLDivElement | undefined = $state();
	$effect(() => {
		const avant = document.activeElement as HTMLElement | null;
		boite?.querySelector<HTMLElement>('input, select, textarea, button:not([aria-label="Fermer"])')?.focus();
		return () => avant?.focus?.();
	});
	function touche(e: KeyboardEvent) {
		if (e.key === 'Escape') onfermer();
	}
</script>

<svelte:window onkeydown={touche} />
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="nh-dialog-overlay" onclick={onfermer}>
	<div
		bind:this={boite}
		class="nh-dialog"
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		aria-label={titre}
		style:max-width="{largeur}px"
		onclick={(e) => e.stopPropagation()}
	>
		<div class="nh-dialog__head">
			<div>
				<h3 class="nh-dialog__title">{titre}</h3>
				{#if description}<p class="nh-dialog__desc">{description}</p>{/if}
			</div>
			<button type="button" class="nh-btn nh-btn--ghost nh-iconbtn nh-btn--sm" aria-label="Fermer" onclick={onfermer}>
				<i class="icon-x" aria-hidden="true"></i>
			</button>
		</div>
		{@render children()}
	</div>
</div>
