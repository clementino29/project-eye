// Petites notifications en bas à droite (composant Toast du design system).
export type Ton = 'success' | 'danger' | 'info' | 'warning';
interface Notif {
	ton: Ton;
	titre: string;
	message: string;
}

let courant = $state<Notif | null>(null);
let minuteur: ReturnType<typeof setTimeout> | undefined;

export const toasts = {
	get courant() {
		return courant;
	},
	montrer(ton: Ton, titre: string, message = '') {
		clearTimeout(minuteur);
		courant = { ton, titre, message };
		minuteur = setTimeout(() => (courant = null), 4000);
	},
	fermer() {
		clearTimeout(minuteur);
		courant = null;
	}
};
