<script lang="ts">
	// Charge du VPS qui héberge le hub et les serveurs de jeu : processeur, mémoire, disque.
	import { octets } from '#lib/libelles.ts';

	type Charge = {
		cpuPourcent: number | null;
		coeurs: number;
		charge1: number;
		memoire: { totale: number; utilisee: number };
		disque: { total: number; utilise: number } | null;
	};
	let { charge }: { charge: Charge } = $props();

	const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
	const jauges = $derived(
		[
			{
				icone: 'cpu',
				libelle: 'Processeur',
				pct: charge.cpuPourcent === null ? null : Math.round(charge.cpuPourcent),
				detail: `${charge.coeurs} cœurs · charge ${charge.charge1.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}`
			},
			{
				icone: 'memory-stick',
				libelle: 'Mémoire',
				pct: pct(charge.memoire.utilisee, charge.memoire.totale),
				detail: `${octets(charge.memoire.utilisee)} / ${octets(charge.memoire.totale)}`
			},
			charge.disque && {
				icone: 'hard-drive',
				libelle: 'Disque',
				pct: pct(charge.disque.utilise, charge.disque.total),
				detail: `${octets(charge.disque.utilise)} / ${octets(charge.disque.total)}`
			}
		].filter((j) => !!j)
	);
	const niveau = (p: number | null) => (p === null ? '' : p >= 90 ? 'critique' : p >= 75 ? 'haut' : '');
</script>

<section class="nh-card machine" aria-labelledby="machine-titre">
	<h2 id="machine-titre" class="nh-overline">La machine</h2>
	<div class="jauges">
		{#each jauges as j (j.icone)}
			<div class="jauge {niveau(j.pct)}">
				<span class="ico" aria-hidden="true"><i class="icon-{j.icone}"></i></span>
				<div class="corps">
					<div class="ligne">
						<span class="lib">{j.libelle}</span>
						<span class="val">{j.pct === null ? '—' : `${j.pct} %`}</span>
					</div>
					<div
						class="barre"
						role="progressbar"
						aria-label={j.libelle}
						aria-valuemin="0"
						aria-valuemax="100"
						aria-valuenow={j.pct ?? undefined}
					>
						<span style:width="{j.pct ?? 0}%"></span>
					</div>
					<span class="detail">{j.detail}</span>
				</div>
			</div>
		{/each}
	</div>
</section>

<style>
	.machine {
		padding: 16px 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.jauges {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 12px 24px;
	}
	.jauge {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.ico {
		flex: none;
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 10px;
		background: var(--petrol-500);
		color: var(--apricot-300);
		font-size: 18px;
	}
	.corps {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.ligne {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}
	.lib {
		font-size: 13px;
		font-weight: 500;
		color: var(--fg-3);
	}
	.val {
		font-weight: 700;
		font-size: 16px;
		color: var(--fg-1);
		font-variant-numeric: tabular-nums;
	}
	.barre {
		display: flex;
		height: 6px;
		border-radius: 999px;
		overflow: hidden;
		background: var(--bg-sunken);
	}
	.barre span {
		background: var(--petrol-300);
		transition: width 0.4s ease;
	}
	.haut .barre span {
		background: var(--warning-fg);
	}
	.critique .barre span {
		background: var(--danger-fg);
	}
	.critique .val {
		color: var(--danger-fg);
	}
	.detail {
		font-size: 12px;
		color: var(--fg-3);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
