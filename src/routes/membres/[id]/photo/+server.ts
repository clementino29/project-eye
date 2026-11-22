import { error } from '@sveltejs/kit';
import { membreParId } from '#lib/server/membres.ts';

export const GET = ({ params }) => {
	const m = membreParId(Number(params.id));
	const match = m?.photo?.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
	if (!match) error(404, 'Pas de photo');
	return new Response(Buffer.from(match[2], 'base64'), {
		headers: { 'Content-Type': match[1], 'Cache-Control': 'private, max-age=31536000, immutable' }
	});
};
