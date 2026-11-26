import { redirect } from '@sveltejs/kit';

// La Watch list commune arrive avec la prochaine étape ; en attendant, /films mène à Ma watchlist.
export const load = () => {
	redirect(307, '/films/ma-watchlist');
};
