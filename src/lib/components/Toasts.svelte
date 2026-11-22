<script lang="ts">
	import { toasts } from '../toasts.svelte.ts';
	const ICONES = { success: 'circle-check', danger: 'circle-alert', info: 'sparkles', warning: 'triangle-alert' };
</script>

<div class="zone" aria-live="polite">
	{#if toasts.courant}
		{@const t = toasts.courant}
		<div class="nh-toast nh-toast--{t.ton}" role="status">
			<i class="nh-toast__icon icon-{ICONES[t.ton]}" aria-hidden="true"></i>
			<div class="nh-toast__body">
				<div class="nh-toast__title">{t.titre}</div>
				{#if t.message}<div class="nh-toast__msg">{t.message}</div>{/if}
			</div>
			<button type="button" class="nh-btn nh-btn--ghost nh-iconbtn nh-btn--sm" aria-label="Fermer" onclick={toasts.fermer}>
				<i class="icon-x" aria-hidden="true"></i>
			</button>
		</div>
	{/if}
</div>

<style>
	.zone {
		position: fixed;
		right: 24px;
		bottom: 24px;
		z-index: 200;
		max-width: 380px;
	}
	@media (max-width: 679px) {
		.zone {
			left: 16px;
			right: 16px;
		}
		.zone :global(.nh-toast) {
			width: 100%;
		}
	}
</style>
